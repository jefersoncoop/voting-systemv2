import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/session'
import { syncAssemblyStatus } from '@/lib/assembly'

const manageableStatuses = ['DRAFT', 'SCHEDULED', 'OPEN']
const removableStatuses = ['DRAFT', 'SCHEDULED']

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        if (!auth.user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const assemblyData = await prisma.assembly.findUnique({
            where: { id }, select: { id: true, status: true, startTime: true, endTime: true }
        })
        if (!assemblyData) return NextResponse.json({ error: 'Assembleia não encontrada' }, { status: 404 })
        const assembly = await syncAssemblyStatus(assemblyData)

        const users = await prisma.user.findMany({
            where: { isAdmin: false },
            orderBy: { name: 'asc' },
            select: {
                id: true, name: true, cpf: true, birthDate: true, phone: true, hasRestrictions: true,
                assemblyMemberships: { where: { assemblyId: id }, select: { id: true } }
            }
        })

        return NextResponse.json({
            editable: manageableStatuses.includes(assembly.status),
            removable: removableStatuses.includes(assembly.status),
            electors: users.filter(user => user.assemblyMemberships.length > 0).map(user => ({
                id: user.id, name: user.name, cpf: user.cpf, birthDate: user.birthDate,
                phone: user.phone, hasRestrictions: user.hasRestrictions
            })),
            availableUsers: users.filter(user => user.assemblyMemberships.length === 0).map(user => ({
                id: user.id, name: user.name, cpf: user.cpf, birthDate: user.birthDate,
                phone: user.phone, hasRestrictions: user.hasRestrictions
            }))
        })
    } catch (error) {
        console.error('Erro ao listar eleitores da assembleia:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        if (!auth.user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const body = await request.json()
        const rawUserIds: unknown[] = Array.isArray(body.userIds) ? body.userIds : []
        const userIds: string[] = [...new Set(rawUserIds.filter((value): value is string => typeof value === 'string'))]
        if (userIds.length === 0) return NextResponse.json({ error: 'Selecione ao menos um eleitor' }, { status: 400 })

        const assemblyData = await prisma.assembly.findUnique({
            where: { id }, select: { id: true, status: true, startTime: true, endTime: true }
        })
        if (!assemblyData) return NextResponse.json({ error: 'Assembleia não encontrada' }, { status: 404 })
        const assembly = await syncAssemblyStatus(assemblyData)
        if (!manageableStatuses.includes(assembly.status)) {
            return NextResponse.json({ error: 'A lista de eleitores está bloqueada após o encerramento da assembleia' }, { status: 409 })
        }

        const eligibleUsers = await prisma.user.findMany({
            where: { id: { in: userIds }, isAdmin: false }, select: { id: true }
        })
        if (eligibleUsers.length !== userIds.length) return NextResponse.json({ error: 'Um ou mais eleitores são inválidos' }, { status: 400 })

        await prisma.$transaction(async tx => {
            for (const user of eligibleUsers) {
                await tx.assemblyElector.upsert({
                    where: { assemblyId_userId: { assemblyId: id, userId: user.id } },
                    create: { assemblyId: id, userId: user.id },
                    update: {}
                })
                await tx.auditEvent.create({
                    data: { type: 'ASSEMBLY_ELECTOR_ADDED', actorUserId: auth.user.id, assemblyId: id, targetId: user.id }
                })
            }
        })
        return NextResponse.json({ success: true, added: eligibleUsers.length })
    } catch (error) {
        console.error('Erro ao adicionar eleitores à assembleia:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        if (!auth.user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const userId = request.nextUrl.searchParams.get('userId')
        if (!userId) return NextResponse.json({ error: 'Eleitor obrigatório' }, { status: 400 })

        const assemblyData = await prisma.assembly.findUnique({
            where: { id }, select: { id: true, status: true, startTime: true, endTime: true }
        })
        if (!assemblyData) return NextResponse.json({ error: 'Assembleia não encontrada' }, { status: 404 })
        const assembly = await syncAssemblyStatus(assemblyData)
        if (!removableStatuses.includes(assembly.status)) {
            return NextResponse.json({ error: 'Eleitores não podem ser removidos após o início da assembleia' }, { status: 409 })
        }

        const [votes, participation] = await Promise.all([
            prisma.vote.count({ where: { userId, agendaItem: { assemblyId: id } } }),
            prisma.participation.count({ where: { userId, assemblyId: id } })
        ])
        if (votes > 0 || participation > 0) {
            return NextResponse.json({ error: 'Eleitor com participação registrada não pode ser removido' }, { status: 409 })
        }

        const removed = await prisma.assemblyElector.deleteMany({ where: { assemblyId: id, userId } })
        if (removed.count === 0) return NextResponse.json({ error: 'Eleitor não pertence à assembleia' }, { status: 404 })
        await prisma.auditEvent.create({
            data: { type: 'ASSEMBLY_ELECTOR_REMOVED', actorUserId: auth.user.id, assemblyId: id, targetId: userId }
        })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Erro ao remover eleitor da assembleia:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
