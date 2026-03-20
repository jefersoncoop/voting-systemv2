import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
    // Get assemblyId from query params
    const { searchParams } = new URL(request.url)
    const assemblyId = searchParams.get('assemblyId')

    try {
        // Build where clause
        const whereInput: any = {
            assembly: {
                status: {
                    in: ['OPEN', 'CLOSED']
                }
            }
        }

        if (assemblyId) {
            whereInput.assemblyId = assemblyId
        }

        // Get items specific to assembly or all active
        const items = await prisma.agendaItem.findMany({
            where: whereInput,
            orderBy: { createdAt: 'desc' },
            include: {
                votes: {
                    select: {
                        choice: true
                    }
                },
                assembly: {
                    select: {
                        title: true,
                        status: true
                    }
                },
                _count: {
                    select: { votes: true }
                }
            }
        })

        // Calculate vote counts for each item
        const results = items.map(item => {
            const voteCounts = {
                APPROVE: 0,
                REJECT: 0,
                ABSTAIN: 0
            }

            item.votes.forEach(vote => {
                // Type safety check
                if (vote.choice in voteCounts) {
                    voteCounts[vote.choice as keyof typeof voteCounts]++
                }
            })

            return {
                id: item.id,
                title: item.title,
                description: item.description,
                status: item.assembly.status, // Uses Assembly Status
                totalVotes: item._count.votes,
                approve: voteCounts.APPROVE,
                reject: voteCounts.REJECT,
                abstain: voteCounts.ABSTAIN,
                assemblyTitle: item.assembly.title
            }
        })

        // Get total registered users for quorum
        const totalUsers = await prisma.user.count({
            where: { isAdmin: false }
        })

        return NextResponse.json({ results, totalUsers })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
