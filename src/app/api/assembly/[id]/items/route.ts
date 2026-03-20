import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/auth'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const session = request.cookies.get('session')?.value
        if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const payload = await decrypt(session)
        if (!payload || !payload.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const body = await request.json()
        const { title, description } = body

        if (!title) {
            return NextResponse.json({ error: 'Título obrigatório' }, { status: 400 })
        }

        // Get current items count to determine order
        const count = await prisma.agendaItem.count({
            where: { assemblyId: id }
        })

        const item = await prisma.agendaItem.create({
            data: {
                title,
                description,
                order: count + 1,
                assemblyId: id
            }
        })

        return NextResponse.json({ item })
    } catch (error) {
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
