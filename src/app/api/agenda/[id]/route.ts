import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/auth'


export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const session = request.cookies.get('session')?.value
        if (!session) {
            return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        }

        const payload = await decrypt(session)
        if (!payload || !payload.isAdmin) {
            return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
        }

        // Delete votes first (cascade)
        await prisma.vote.deleteMany({
            where: { agendaItemId: id }
        })

        await prisma.agendaItem.delete({
            where: { id }
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
