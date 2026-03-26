import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/auth'
import { createHash } from 'crypto'

export async function GET(request: NextRequest) {
    try {
        const session = request.cookies.get('session')?.value
        if (!session) {
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        }

        const payload = await decrypt(session)
        if (!payload) {
            return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })
        }

        // Buscar últimas restrições do usuário do banco
        const user = await prisma.user.findUnique({
            where: { id: payload.userId },
            select: { hasRestrictions: true }
        })
        const hasRestrictions = user?.hasRestrictions || false

        // Get only OPEN items, filtering out restricted items if user has restrictions
        let itemsWhereClause: any = { 
            assembly: { status: 'OPEN' }
        }

        if (hasRestrictions) {
            itemsWhereClause.excludesRestricted = false
        }

        const items = await prisma.agendaItem.findMany({
            where: itemsWhereClause,
            orderBy: { createdAt: 'desc' },
            include: {
                votes: {
                    where: { userId: payload.userId }
                }
            }
        })

        // Transform to include user's vote status
        const itemsWithVoteStatus = items.map(item => ({
            id: item.id,
            title: item.title,
            description: item.description,
            hasVoted: item.votes.length > 0,
            userVote: item.votes[0]?.choice || null
        }))

        return NextResponse.json({ items: itemsWithVoteStatus })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = request.cookies.get('session')?.value
        if (!session) {
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        }

        const payload = await decrypt(session)
        if (!payload) {
            return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })
        }

        const body = await request.json()
        const { agendaItemId, choice, userAgent } = body

        if (!agendaItemId || !choice) {
            return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
        }

        if (!['APPROVE', 'REJECT', 'ABSTAIN'].includes(choice)) {
            return NextResponse.json({ error: 'Escolha inválida' }, { status: 400 })
        }

        // Check if agenda item belongs to an OPEN assembly
        const item = await prisma.agendaItem.findUnique({
            where: { id: agendaItemId },
            include: { assembly: true }
        })

        if (!item) {
            return NextResponse.json({ error: 'Pauta não encontrada' }, { status: 404 })
        }

        if (item.assembly.status !== 'OPEN') {
            return NextResponse.json({ error: 'A assembleia não está aberta para votação' }, { status: 400 })
        }

        // Check Restrictions from DB to ensure they are up to date
        const user = await prisma.user.findUnique({
            where: { id: payload.userId },
            select: { hasRestrictions: true }
        })
        const hasRestrictions = user?.hasRestrictions || false

        if (item.excludesRestricted && hasRestrictions) {
            return NextResponse.json({
                error: 'Usuário com restrição (Diretoria) impedido de votar nesta pauta'
            }, { status: 403 })
        }

        // Get client IP for audit
        const ip = request.headers.get('x-forwarded-for') ||
            request.headers.get('x-real-ip') ||
            'unknown'

        // Get User-Agent from body (sent by client) or header as fallback
        const ua = userAgent || request.headers.get('user-agent') || 'unknown'

        // Generate unique device hash: SHA-256(ip + ua + userId + assemblyId + timestamp)
        const now = new Date()
        const rawData = `${ip}|${ua}|${payload.userId}|${item.assemblyId}|${now.toISOString()}`
        const deviceHash = createHash('sha256').update(rawData).digest('hex')

        // Build a human-readable protocol code: first 16 hex chars split in groups of 4
        const hashShort = deviceHash.substring(0, 16).toUpperCase()
        const protocol = `${hashShort.substring(0, 4)}-${hashShort.substring(4, 8)}-${hashShort.substring(8, 12)}-${hashShort.substring(12, 16)}`

        // Try to create vote (will fail if already voted due to unique constraint)
        try {
            const vote = await prisma.vote.create({
                data: {
                    userId: payload.userId,
                    agendaItemId,
                    choice,
                    ipAddress: ip,
                    deviceHash,
                    protocol,
                    timestamp: now
                }
            })

            return NextResponse.json({ vote, deviceHash, protocol })
        } catch (err: any) {
            if (err.code === 'P2002') {
                return NextResponse.json({ error: 'Você já votou nesta pauta' }, { status: 400 })
            }
            throw err
        }
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
