import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/session'
import {
    canTransitionAssembly,
    isAssemblyStatus,
    syncAssemblyStatus,
    validateAssemblyDates,
    type AssemblyStatus
} from '@/lib/assembly'
import { recordAuditEvent } from '@/lib/audit'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const auth = await getAuthContext(request)

        if (!auth) {
            const assembly = await prisma.assembly.findUnique({
                where: { id }, select: { id: true, title: true, status: true, startTime: true, endTime: true }
            })
            if (!assembly) return NextResponse.json({ error: 'Assembleia não encontrada' }, { status: 404 })
            const synchronized = await syncAssemblyStatus(assembly)
            return NextResponse.json({ assembly: synchronized, protocol: null })
        }

        if (!auth.user.isAdmin) {
            const membership = await prisma.assemblyElector.findUnique({
                where: { assemblyId_userId: { assemblyId: id, userId: auth.user.id } },
                select: { id: true }
            })
            if (!membership) return NextResponse.json({ error: 'Você não é eleitor desta assembleia' }, { status: 403 })
        }

        const itemWhere: Prisma.AgendaItemWhereInput = {}
        if (auth.user.hasRestrictions) itemWhere.excludesRestricted = false

        const assemblyData = await prisma.assembly.findUnique({
            where: { id },
            include: {
                items: {
                    where: itemWhere,
                    orderBy: { order: 'asc' },
                    include: {
                        _count: { select: { votes: true } },
                        votes: { where: { userId: auth.user.id }, select: { choice: true } }
                    }
                }
            }
        })
        if (!assemblyData) return NextResponse.json({ error: 'Assembleia não encontrada' }, { status: 404 })

        const assembly = await syncAssemblyStatus(assemblyData)
        const participation = await prisma.participation.findUnique({
            where: { userId_assemblyId: { userId: auth.user.id, assemblyId: id } },
            select: { protocol: true }
        })
        return NextResponse.json({ assembly, protocol: participation?.protocol ?? null })
    } catch (error) {
        console.error('Erro ao carregar assembleia:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        if (!auth.user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const existingData = await prisma.assembly.findUnique({
            where: { id }, include: { _count: { select: { items: true, electors: true, participations: true } } }
        })
        if (!existingData) return NextResponse.json({ error: 'Assembleia não encontrada' }, { status: 404 })
        const existing = await syncAssemblyStatus(existingData)
        const body = await request.json()
        const data: Prisma.AssemblyUpdateInput = {}

        if (body.status !== undefined) {
            if (!isAssemblyStatus(body.status) || !isAssemblyStatus(existing.status)) {
                return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
            }
            if (!canTransitionAssembly(existing.status as AssemblyStatus, body.status)) {
                return NextResponse.json({ error: `Transição ${existing.status} → ${body.status} não permitida` }, { status: 409 })
            }
            const now = new Date()
            if (body.status === 'OPEN' && (existing.startTime > now || existing.endTime <= now)) {
                return NextResponse.json({ error: 'A assembleia está fora da janela de votação' }, { status: 409 })
            }
            if (body.status === 'OPEN' && (existing._count.items === 0 || existing._count.electors === 0)) {
                return NextResponse.json({ error: 'Adicione ao menos uma pauta e um eleitor antes de abrir a assembleia' }, { status: 409 })
            }
            data.status = body.status
        }

        const changesDefinition = body.title !== undefined || body.description !== undefined || body.startTime !== undefined || body.endTime !== undefined
        if (changesDefinition) {
            if (!['DRAFT', 'SCHEDULED'].includes(existing.status) || existing._count.participations > 0) {
                return NextResponse.json({ error: 'Assembleia iniciada não pode ter sua definição alterada' }, { status: 409 })
            }
            const startTime = body.startTime ? new Date(body.startTime) : existing.startTime
            const endTime = body.endTime ? new Date(body.endTime) : existing.endTime
            if (!validateAssemblyDates(startTime, endTime)) {
                return NextResponse.json({ error: 'Período da assembleia inválido' }, { status: 400 })
            }
            if (body.title !== undefined) {
                const title = typeof body.title === 'string' ? body.title.trim() : ''
                if (!title) return NextResponse.json({ error: 'Título inválido' }, { status: 400 })
                data.title = title
            }
            if (body.description !== undefined) data.description = typeof body.description === 'string' ? body.description.trim() : null
            if (body.startTime !== undefined) data.startTime = startTime
            if (body.endTime !== undefined) data.endTime = endTime
        }

        if (body.showLiveResults !== undefined) {
            if (typeof body.showLiveResults !== 'boolean') return NextResponse.json({ error: 'Configuração de resultados inválida' }, { status: 400 })
            data.showLiveResults = body.showLiveResults
        }

        const assembly = await prisma.assembly.update({ where: { id }, data })
        await recordAuditEvent({
            type: body.status === 'OPEN'
                ? 'ASSEMBLY_STARTED'
                : body.status === 'CLOSED'
                    ? 'ASSEMBLY_CLOSED'
                    : 'ASSEMBLY_UPDATED',
            request, actorUserId: auth.user.id,
            assemblyId: id, targetId: id, metadata: { fields: Object.keys(data), previousStatus: existing.status, nextStatus: assembly.status }
        })
        return NextResponse.json({ assembly })
    } catch (error) {
        console.error('Erro ao atualizar assembleia:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        if (!auth.user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const assembly = await prisma.assembly.findUnique({
            where: { id },
            include: { _count: { select: { participations: true } }, items: { select: { _count: { select: { votes: true } } } } }
        })
        if (!assembly) return NextResponse.json({ error: 'Assembleia não encontrada' }, { status: 404 })
        const hasVotes = assembly.items.some(item => item._count.votes > 0)
        if (hasVotes || assembly._count.participations > 0 || !['DRAFT', 'SCHEDULED'].includes(assembly.status)) {
            return NextResponse.json({ error: 'Assembleias iniciadas ou com votos não podem ser excluídas' }, { status: 409 })
        }

        await recordAuditEvent({ type: 'ASSEMBLY_DELETED', request, actorUserId: auth.user.id, assemblyId: id, targetId: id })
        await prisma.assembly.delete({ where: { id } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Erro ao excluir assembleia:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
