import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/auth'

export async function GET(request: NextRequest) {
    try {
        const session = request.cookies.get('session')?.value
        if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const payload = await decrypt(session)
        if (!payload) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

        // Garantir que hasRestrictions seja tratado como boolean
        const hasRestrictions = payload.hasRestrictions === true || payload.hasRestrictions === 'true'

        // Allow read access for all authenticated users (voters and admins)

        const assembliesData = await prisma.assembly.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                items: {
                    select: { id: true }
                },
                _count: {
                    select: { items: true }
                }
            }
        })

        // Check voting status for each assembly for the current user
        const assemblies = await Promise.all(assembliesData.map(async (assembly) => {
            // Contar apenas os itens que o usuário pode votar (considerando restrições)
            let itemsWhereClause: any = {
                assemblyId: assembly.id
            }
            
            if (hasRestrictions) {
                // Usuários com restrições só podem votar em itens onde excludesRestricted = false
                itemsWhereClause.excludesRestricted = false
            }
            
            const votableItemsCount = await prisma.agendaItem.count({
                where: itemsWhereClause
            })

            const userVotesCount = await prisma.vote.count({
                where: {
                    userId: payload.userId,
                    agendaItem: {
                        assemblyId: assembly.id
                    }
                }
            })

            // Comparar com o número de itens que o usuário pode votar, não o total
            const hasCompletedVoting = votableItemsCount > 0 && userVotesCount === votableItemsCount

            return {
                ...assembly,
                items: undefined, // Don't send items list to list page
                hasCompletedVoting
            }
        }))

        return NextResponse.json({ assemblies })
    } catch (error) {
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = request.cookies.get('session')?.value
        if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const payload = await decrypt(session)
        if (!payload || !payload.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const body = await request.json()
        const { title, description, startTime, endTime } = body

        if (!title || !startTime || !endTime) {
            return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
        }

        const assembly = await prisma.assembly.create({
            data: {
                title,
                description,
                startTime: new Date(startTime),
                endTime: new Date(endTime),
                status: 'PENDING'
            }
        })

        return NextResponse.json({ assembly })
    } catch (error) {
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
