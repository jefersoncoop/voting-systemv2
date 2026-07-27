import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/session'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        if (!auth.user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const { id } = await params

        // Buscar todos os usuários que votaram em pelo menos um item desta assembleia
        const voters = await prisma.user.findMany({
            where: {
                votes: {
                    some: {
                        agendaItem: {
                            assemblyId: id
                        }
                    }
                }
            },
            select: {
                id: true,
                name: true,
                cpf: true
            }
        })

        return NextResponse.json({ voters })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
