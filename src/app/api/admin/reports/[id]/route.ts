import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/session'

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
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        if (!auth.user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

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

        const participations = await prisma.participation.findMany({
            where: { assemblyId: id },
            include: {
                user: {
                    select: {
                        name: true,
                        cpf: true
                    }
                }
            },
            orderBy: { createdAt: 'asc' }
        })

        const voters = participations.map(participation => ({
            name: participation.user.name,
            cpf: maskCPF(participation.user.cpf),
            timestamp: participation.createdAt,
            protocol: participation.protocol
        }))

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

        const eligibleElectors = await prisma.assemblyElector.count({ where: { assemblyId: id } })

        return NextResponse.json({
            assembly: {
                title: assembly.title,
                date: assembly.startTime,
                status: assembly.status
            },
            voters,
            eligibleElectors,
            itemSummaries
        })

    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
