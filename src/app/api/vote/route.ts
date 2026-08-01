import { createHmac, randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getAuthSecret } from '@/lib/auth'
import { getAuthContext, getClientIp } from '@/lib/session'
import { consumeRateLimit } from '@/lib/rate-limit'
import { isVotingWindowOpen, syncAssemblyStatus } from '@/lib/assembly'

function generateProtocol() {
    return randomBytes(8).toString('hex').toUpperCase().match(/.{1,4}/g)?.join('-') ?? randomBytes(8).toString('hex').toUpperCase()
}

export async function GET(request: NextRequest) {
    try {
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const itemsWhere: Prisma.AgendaItemWhereInput = {
            assembly: { status: 'OPEN', electors: { some: { userId: auth.user.id } } }
        }
        if (auth.user.hasRestrictions) itemsWhere.excludesRestricted = false

        const items = await prisma.agendaItem.findMany({
            where: itemsWhere,
            orderBy: [{ assemblyId: 'asc' }, { order: 'asc' }],
            include: { votes: { where: { userId: auth.user.id }, select: { choice: true } } }
        })
        return NextResponse.json({
            items: items.map(item => ({
                id: item.id,
                title: item.title,
                description: item.description,
                hasVoted: item.votes.length > 0,
                userVote: item.votes[0]?.choice ?? null
            }))
        })
    } catch (error) {
        console.error('Erro ao listar pautas disponíveis:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const limit = await consumeRateLimit({ action: 'VOTE_USER', key: auth.user.id, limit: 60, windowMs: 60 * 1000 })
        if (!limit.allowed) {
            return NextResponse.json(
                { error: 'Muitas tentativas de voto. Aguarde um momento.' },
                { status: 429, headers: { 'Retry-After': limit.retryAfterSeconds.toString() } }
            )
        }

        const body = await request.json()
        const assemblyId = typeof body.assemblyId === 'string' ? body.assemblyId : ''
        const submittedVotes: Array<{ agendaItemId: string, choice: string } | null> = Array.isArray(body.votes)
            ? body.votes.map((vote: unknown) => {
                if (!vote || typeof vote !== 'object') return null
                const candidate = vote as { agendaItemId?: unknown, choice?: unknown }
                if (typeof candidate.agendaItemId !== 'string' || typeof candidate.choice !== 'string') return null
                return { agendaItemId: candidate.agendaItemId, choice: candidate.choice }
            })
            : []

        if (
            !assemblyId ||
            submittedVotes.length === 0 ||
            submittedVotes.some(vote => !vote || !['APPROVE', 'REJECT', 'ABSTAIN'].includes(vote.choice))
        ) {
            return NextResponse.json({ error: 'Dados de voto inválidos' }, { status: 400 })
        }

        const votes = submittedVotes as { agendaItemId: string, choice: string }[]
        const submittedItemIds = new Set(votes.map(vote => vote.agendaItemId))
        if (submittedItemIds.size !== votes.length) {
            return NextResponse.json({ error: 'A cédula contém pautas duplicadas' }, { status: 400 })
        }

        const assemblyData = await prisma.assembly.findUnique({
            where: { id: assemblyId },
            include: { items: { orderBy: { order: 'asc' } } }
        })
        if (!assemblyData) return NextResponse.json({ error: 'Assembleia não encontrada' }, { status: 404 })

        const membership = await prisma.assemblyElector.findUnique({
            where: { assemblyId_userId: { assemblyId, userId: auth.user.id } },
            select: { id: true }
        })
        if (!membership) return NextResponse.json({ error: 'Você não é eleitor desta assembleia' }, { status: 403 })
        const assembly = await syncAssemblyStatus(assemblyData)
        if (!isVotingWindowOpen(assembly)) {
            return NextResponse.json({ error: 'A assembleia não está aberta para votação' }, { status: 409 })
        }

        const availableItems = assembly.items.filter(item => !(item.excludesRestricted && auth.user.hasRestrictions))
        const availableItemIds = new Set(availableItems.map(item => item.id))
        const hasExactItemSet = votes.length === availableItems.length
            && votes.every(vote => availableItemIds.has(vote.agendaItemId))
        if (!hasExactItemSet) {
            return NextResponse.json(
                { error: 'Selecione uma opção para todas as pautas disponíveis antes de confirmar' },
                { status: 400 }
            )
        }

        const existingVotes = await prisma.vote.findMany({
            where: { userId: auth.user.id, agendaItemId: { in: [...availableItemIds] } },
            select: { agendaItemId: true, choice: true }
        })
        const existingByItem = new Map(existingVotes.map(vote => [vote.agendaItemId, vote.choice]))
        if (existingVotes.length === availableItems.length) {
            return NextResponse.json({ error: 'Você já concluiu esta votação' }, { status: 409 })
        }
        if (votes.some(vote => existingByItem.has(vote.agendaItemId) && existingByItem.get(vote.agendaItemId) !== vote.choice)) {
            return NextResponse.json({ error: 'Um voto já registrado não pode ser alterado' }, { status: 409 })
        }

        const ip = getClientIp(request)
        const userAgent = request.headers.get('user-agent') || 'unknown'
        const deviceHash = createHmac('sha256', getAuthSecret())
            .update(`${ip}|${userAgent}|${auth.user.id}|${assembly.id}`)
            .digest('hex')
        const now = new Date()

        const result = await prisma.$transaction(async tx => {
            const participation = await tx.participation.upsert({
                where: { userId_assemblyId: { userId: auth.user.id, assemblyId: assembly.id } },
                create: { userId: auth.user.id, assemblyId: assembly.id, protocol: generateProtocol() },
                update: {}
            })
            const newVotes = []
            for (const submittedVote of votes) {
                if (existingByItem.has(submittedVote.agendaItemId)) continue

                const vote = await tx.vote.create({
                    data: {
                        userId: auth.user.id,
                        agendaItemId: submittedVote.agendaItemId,
                        choice: submittedVote.choice,
                        ipAddress: ip,
                        deviceHash,
                        protocol: participation.protocol,
                        timestamp: now
                    },
                    select: { id: true, timestamp: true }
                })
                await tx.auditEvent.create({
                    data: {
                        type: 'VOTE_RECORDED',
                        actorUserId: auth.user.id,
                        assemblyId: assembly.id,
                        targetId: vote.id,
                        ipAddress: ip,
                        metadata: JSON.stringify({ agendaItemId: submittedVote.agendaItemId })
                    }
                })
                newVotes.push(vote)
            }
            return { newVotes, participation }
        })

        return NextResponse.json({
            success: true,
            protocol: result.participation.protocol,
            recordedAt: result.newVotes[0]?.timestamp ?? now,
            recordedVotes: result.newVotes.length
        }, { status: 201 })
    } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return NextResponse.json({ error: 'Esta votação já foi registrada' }, { status: 409 })
        }
        console.error('Erro ao registrar voto:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
