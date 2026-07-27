import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sanitizeCpf } from '@/lib/auth'
import { getAuthContext } from '@/lib/session'
import { recordAuditEvent } from '@/lib/audit'
import { isValidCpf, normalizePhone, parseDateOnly } from '@/lib/identity'
import { syncAssemblyStatus } from '@/lib/assembly'

interface ImportError {
    cpf?: string
    error: string
}

export async function POST(request: NextRequest) {
    try {
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        if (!auth.user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const body = await request.json()
        const users: unknown[] = Array.isArray(body.users) ? body.users : []
        const assemblyId = typeof body.assemblyId === 'string' ? body.assemblyId : null
        if (users.length === 0) return NextResponse.json({ error: 'Nenhum eleitor informado' }, { status: 400 })

        if (assemblyId) {
            const assemblyData = await prisma.assembly.findUnique({
                where: { id: assemblyId }, select: { id: true, status: true, startTime: true, endTime: true }
            })
            if (!assemblyData) return NextResponse.json({ error: 'Assembleia não encontrada' }, { status: 404 })
            const assembly = await syncAssemblyStatus(assemblyData)
            if (!['DRAFT', 'SCHEDULED', 'OPEN'].includes(assembly.status)) {
                return NextResponse.json({ error: 'A lista de eleitores está bloqueada após o encerramento da assembleia' }, { status: 409 })
            }
        }

        let createdCount = 0
        let updatedCount = 0
        let assignedCount = 0
        let alreadyAssignedCount = 0
        const errors: ImportError[] = []
        const processedCpfs = new Set<string>()

        for (const entry of users) {
            if (!entry || typeof entry !== 'object') {
                errors.push({ error: 'Linha inválida' })
                continue
            }
            const user = entry as Record<string, unknown>
            const name = typeof user.name === 'string' ? user.name.trim() : ''
            const rawCpf = typeof user.cpf === 'string' ? user.cpf : ''
            const birthDate = parseDateOnly(user.birthDate)
            if (!name || !rawCpf || !birthDate) {
                errors.push({ cpf: rawCpf || undefined, error: 'Dados incompletos ou data inválida' })
                continue
            }

            const cleanCpf = sanitizeCpf(rawCpf)
            if (!isValidCpf(cleanCpf)) {
                errors.push({ cpf: rawCpf, error: 'CPF inválido' })
                continue
            }
            if (processedCpfs.has(cleanCpf)) {
                errors.push({ cpf: rawCpf, error: 'CPF repetido no arquivo' })
                continue
            }
            processedCpfs.add(cleanCpf)

            const phone = normalizePhone(user.phone)
            if (phone === undefined) {
                errors.push({ cpf: rawCpf, error: 'WhatsApp inválido' })
                continue
            }

            try {
                const existing = await prisma.user.findUnique({ where: { cpf: cleanCpf } })
                if (existing?.isAdmin) {
                    errors.push({ cpf: rawCpf, error: 'Usuário administrativo não pode ser eleitor' })
                    continue
                }

                if (existing) {
                    let wasAssigned = false
                    let wasAlreadyAssigned = false
                    await prisma.$transaction(async tx => {
                        await tx.user.update({
                            where: { id: existing.id },
                            data: {
                                name,
                                birthDate,
                                ...(typeof user.phone === 'string' && user.phone.trim() ? { phone } : {}),
                                ...(typeof user.hasRestrictions === 'boolean'
                                    ? { hasRestrictions: user.hasRestrictions }
                                    : {})
                            }
                        })
                        await tx.session.updateMany({
                            where: { userId: existing.id, revokedAt: null },
                            data: { revokedAt: new Date() }
                        })

                        if (assemblyId) {
                            const membership = await tx.assemblyElector.findUnique({
                                where: { assemblyId_userId: { assemblyId, userId: existing.id } }
                            })
                            if (membership) {
                                wasAlreadyAssigned = true
                            } else {
                                await tx.assemblyElector.create({ data: { assemblyId, userId: existing.id } })
                                wasAssigned = true
                            }
                        }
                    })
                    updatedCount++
                    if (wasAssigned) assignedCount++
                    if (wasAlreadyAssigned) alreadyAssignedCount++
                    continue
                }

                await prisma.$transaction(async tx => {
                    const created = await tx.user.create({
                        data: {
                            name,
                            cpf: cleanCpf,
                            birthDate,
                            phone,
                            isAdmin: false,
                            hasRestrictions: user.hasRestrictions === true
                        }
                    })
                    if (assemblyId) {
                        await tx.assemblyElector.create({ data: { assemblyId, userId: created.id } })
                    }
                })
                createdCount++
                if (assemblyId) assignedCount++
            } catch {
                errors.push({ cpf: rawCpf, error: 'Erro ao salvar' })
            }
        }

        await recordAuditEvent({
            type: assemblyId ? 'ASSEMBLY_ELECTORS_IMPORTED' : 'USERS_IMPORTED',
            request,
            actorUserId: auth.user.id,
            assemblyId: assemblyId ?? undefined,
            targetId: assemblyId ?? undefined,
            metadata: {
                created: createdCount,
                updated: updatedCount,
                assigned: assignedCount,
                alreadyAssigned: alreadyAssignedCount,
                errors: errors.length,
                total: users.length
            }
        })

        return NextResponse.json({
            success: true,
            created: createdCount,
            updated: updatedCount,
            assigned: assignedCount,
            alreadyAssigned: alreadyAssignedCount,
            errors,
            totalProcessed: users.length
        })
    } catch (error) {
        console.error('Erro ao importar eleitores:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
