import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/session'
import { syncAssemblyStatus } from '@/lib/assembly'

export async function GET(request: NextRequest) {
    try {
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const assemblyId = request.nextUrl.searchParams.get('assemblyId')
        if (!assemblyId) return NextResponse.json({ error: 'Assembleia obrigatória' }, { status: 400 })

        const assemblyData = await prisma.assembly.findUnique({
            where: { id: assemblyId },
            include: {
                items: {
                    orderBy: { order: 'asc' },
                    include: { votes: { select: { choice: true } }, _count: { select: { votes: true } } }
                }
            }
        })
        if (!assemblyData) return NextResponse.json({ error: 'Assembleia não encontrada' }, { status: 404 })
        const assembly = await syncAssemblyStatus(assemblyData)

        if (!auth.user.isAdmin) {
            const membership = await prisma.assemblyElector.findUnique({
                where: { assemblyId_userId: { assemblyId, userId: auth.user.id } },
                select: { id: true }
            })
            if (!membership) return NextResponse.json({ error: 'Você não é eleitor desta assembleia' }, { status: 403 })
        }

        const mayViewResults = auth.user.isAdmin || assembly.status === 'CLOSED' || assembly.status === 'ARCHIVED' || assembly.showLiveResults
        if (!mayViewResults) {
            return NextResponse.json({ error: 'Resultados disponíveis somente após o encerramento' }, { status: 403 })
        }

        const results = assembly.items.map(item => {
            const counts = { APPROVE: 0, REJECT: 0, ABSTAIN: 0 }
            for (const vote of item.votes) {
                if (vote.choice in counts) counts[vote.choice as keyof typeof counts]++
            }
            return {
                id: item.id,
                title: item.title,
                description: item.description,
                status: assembly.status,
                totalVotes: item._count.votes,
                approve: counts.APPROVE,
                reject: counts.REJECT,
                abstain: counts.ABSTAIN,
                assemblyTitle: assembly.title
            }
        })
        const totalUsers = await prisma.assemblyElector.count({ where: { assemblyId } })
        return NextResponse.json({ results, totalUsers })
    } catch (error) {
        console.error('Erro ao consultar resultados:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
