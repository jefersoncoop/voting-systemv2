import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/session'
import { syncAssemblyStatus, validateAssemblyDates } from '@/lib/assembly'
import { recordAuditEvent } from '@/lib/audit'

export async function GET(request: NextRequest) {
    try {
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const assembliesData = await prisma.assembly.findMany({
            where: auth.user.isAdmin ? {} : { electors: { some: { userId: auth.user.id } } },
            orderBy: { createdAt: 'desc' },
            include: { _count: { select: { items: true, electors: true } } }
        })
        const synchronized = await Promise.all(assembliesData.map(syncAssemblyStatus))

        const assemblies = await Promise.all(synchronized.map(async assembly => {
            if (auth.user.isAdmin) return { ...assembly, hasCompletedVoting: false }
            const itemsWhere: Prisma.AgendaItemWhereInput = { assemblyId: assembly.id }
            if (auth.user.hasRestrictions) itemsWhere.excludesRestricted = false

            const [votableItemsCount, userVotesCount] = await Promise.all([
                prisma.agendaItem.count({ where: itemsWhere }),
                prisma.vote.count({
                    where: { userId: auth.user.id, agendaItem: { assemblyId: assembly.id } }
                })
            ])

            return {
                ...assembly,
                hasCompletedVoting: votableItemsCount > 0 && userVotesCount === votableItemsCount
            }
        }))

        return NextResponse.json({ assemblies })
    } catch (error) {
        console.error('Erro ao listar assembleias:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        if (!auth.user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const body = await request.json()
        const title = typeof body.title === 'string' ? body.title.trim() : ''
        const description = typeof body.description === 'string' ? body.description.trim() : null
        const startTime = new Date(body.startTime)
        const endTime = new Date(body.endTime)
        if (!title || !validateAssemblyDates(startTime, endTime)) {
            return NextResponse.json({ error: 'Título ou período da assembleia inválido' }, { status: 400 })
        }

        const assembly = await prisma.assembly.create({
            data: { title, description, startTime, endTime, status: 'SCHEDULED' }
        })
        await recordAuditEvent({
            type: 'ASSEMBLY_CREATED', request, actorUserId: auth.user.id,
            assemblyId: assembly.id, targetId: assembly.id
        })
        return NextResponse.json({ assembly }, { status: 201 })
    } catch (error) {
        console.error('Erro ao criar assembleia:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
