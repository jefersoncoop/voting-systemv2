import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt, sanitizeCpf } from '@/lib/auth'

export async function POST(request: NextRequest) {
    try {
        const session = request.cookies.get('session')?.value
        if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const payload = await decrypt(session)
        if (!payload || !payload.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const body = await request.json()
        const { users } = body // Expecting array of { name, cpf, birthDate, phone }

        if (!Array.isArray(users)) {
            return NextResponse.json({ error: 'Formato inválido' }, { status: 400 })
        }

        let createdCount = 0
        let errors = []

        for (const user of users) {
            // Basic Validation
            if (!user.name || !user.cpf || !user.birthDate) {
                errors.push({ cpf: user.cpf, error: 'Dados incompletos' })
                continue
            }

            const cleanCpf = sanitizeCpf(user.cpf)
            if (cleanCpf.length !== 11) {
                errors.push({ cpf: user.cpf, error: 'CPF inválido' })
                continue
            }

            try {
                // Check duplicate
                const existing = await prisma.user.findUnique({ where: { cpf: cleanCpf } })
                if (existing) {
                    // Optional: Update? For now, skip
                    errors.push({ cpf: user.cpf, error: 'Já cadastrado' })
                    continue
                }

                await prisma.user.create({
                    data: {
                        name: user.name,
                        cpf: cleanCpf,
                        birthDate: new Date(user.birthDate), // Expecting YYYY-MM-DD or parseable string
                        phone: user.phone || null,
                        isAdmin: false,
                        hasRestrictions: !!user.hasRestrictions
                    }
                })
                createdCount++
            } catch (err) {
                errors.push({ cpf: user.cpf, error: 'Erro ao salvar' })
            }
        }

        return NextResponse.json({
            success: true,
            created: createdCount,
            errors,
            totalProcessed: users.length
        })

    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
