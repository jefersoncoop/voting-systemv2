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
        const agendaItemId = typeof body.agendaItemId === 'string' ? body.agendaItemId : ''
        const choice = typeof body.choice === 'string' ? body.choice : ''
        if (!agendaItemId || !['APPROVE', 'REJECT', 'ABSTAIN'].includes(choice)) {
            return NextResponse.json({ error: 'Dados de voto inválidos' }, { status: 400 })
        }

        const item = await prisma.agendaItem.findUnique({ where: { id: agendaItemId }, include: { assembly: true } })
        if (!item) return NextResponse.json({ error: 'Pauta não encontrada' }, { status: 404 })
        const membership = await prisma.assemblyElector.findUnique({
            where: { assemblyId_userId: { assemblyId: item.assemblyId, userId: auth.user.id } },
            select: { id: true }
        })
        if (!membership) return NextResponse.json({ error: 'Você não é eleitor desta assembleia' }, { status: 403 })
        const assembly = await syncAssemblyStatus(item.assembly)
        if (!isVotingWindowOpen(assembly)) {
            return NextResponse.json({ error: 'A assembleia não está aberta para votação' }, { status: 409 })
        }
        if (item.excludesRestricted && auth.user.hasRestrictions) {
            return NextResponse.json({ error: 'Eleitor impedido de votar nesta pauta' }, { status: 403 })
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
            const vote = await tx.vote.create({
                data: {
                    userId: auth.user.id,
                    agendaItemId,
                    choice,
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
                    metadata: JSON.stringify({ agendaItemId })
                }
            })
            return { vote, participation }
        })

        return NextResponse.json({
            success: true,
            protocol: result.participation.protocol,
            recordedAt: result.vote.timestamp
        }, { status: 201 })
    } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            return NextResponse.json({ error: 'Você já votou nesta pauta' }, { status: 409 })
        }
        console.error('Erro ao registrar voto:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
