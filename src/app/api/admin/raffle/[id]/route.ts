import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/auth'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = request.cookies.get('session')?.value
        if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const payload = await decrypt(session)
        if (!payload || !payload.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

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
