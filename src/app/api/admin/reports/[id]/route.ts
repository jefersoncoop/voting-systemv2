import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/auth'

function maskCPF(cpf: string) {
    // Keeps middle digits visible or similar standard
    // Example: 123.456.789-00 -> ***.456.789-**
    if (!cpf) return '***'
    const clean = cpf.replace(/\D/g, '')
    if (clean.length !== 11) return '***'
    return `***.${clean.substring(3, 6)}.${clean.substring(6, 9)}-**`
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = request.cookies.get('session')?.value
        if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const payload = await decrypt(session)
        if (!payload || !payload.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const { id } = await params

        // Get Assembly details with Items
        const assembly = await prisma.assembly.findUnique({
            where: { id },
            include: {
                items: {
                    include: {
                        votes: true
                    },
                    orderBy: { order: 'asc' }
                }
            }
        })

        if (!assembly) return NextResponse.json({ error: 'Assembleia não encontrada' }, { status: 404 })

        // Get Unique Voters for this Assembly
        // Since votes are per item, we need to aggregate unique users who voted in ANY item of this assembly
        const votes = await prisma.vote.findMany({
            where: {
                agendaItem: {
                    assemblyId: id
                }
            },
            include: {
                user: {
                    select: {
                        name: true,
                        cpf: true
                    }
                }
            },
            orderBy: { timestamp: 'asc' }
        })

        // Deduplicate voters — keep entry of first vote only
        const voterMap = new Map<string, { name: string, cpf: string, timestamp: Date, deviceHash: string | null, protocol: string | null }>()

        votes.forEach(vote => {
            if (!voterMap.has(vote.userId)) {
                voterMap.set(vote.userId, {
                    name: vote.user.name,
                    cpf: maskCPF(vote.user.cpf),
                    timestamp: vote.timestamp,
                    deviceHash: vote.deviceHash ?? null,
                    protocol: vote.protocol ?? null
                })
            }
        })

        const voters = Array.from(voterMap.values())

        // Calculate Summaries per Item
        const itemSummaries = assembly.items.map(item => {
            const counts = { APPROVE: 0, REJECT: 0, ABSTAIN: 0 }
            item.votes.forEach(v => {
                if (v.choice in counts) counts[v.choice as keyof typeof counts]++
            })
            return {
                id: item.id,
                title: item.title,
                description: item.description,
                counts,
                total: item.votes.length
            }
        })

        return NextResponse.json({
            assembly: {
                title: assembly.title,
                date: assembly.startTime,
                status: assembly.status
            },
            voters,
            itemSummaries
        })

    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
