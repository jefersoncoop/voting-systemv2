import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/session'
import { recordAuditEvent } from '@/lib/audit'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        if (!auth.user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const item = await prisma.agendaItem.findUnique({
            where: { id },
            include: { assembly: { select: { id: true, status: true } }, _count: { select: { votes: true } } }
        })
        if (!item) return NextResponse.json({ error: 'Pauta não encontrada' }, { status: 404 })
        if (item._count.votes > 0 || !['DRAFT', 'SCHEDULED'].includes(item.assembly.status)) {
            return NextResponse.json({ error: 'Pautas iniciadas ou com votos não podem ser excluídas' }, { status: 409 })
        }

        await recordAuditEvent({
            type: 'AGENDA_ITEM_DELETED', request, actorUserId: auth.user.id,
            assemblyId: item.assembly.id, targetId: item.id
        })
        await prisma.agendaItem.delete({ where: { id } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Erro ao excluir pauta:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
