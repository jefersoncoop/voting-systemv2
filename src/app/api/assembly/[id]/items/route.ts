import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/session'
import { recordAuditEvent } from '@/lib/audit'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        if (!auth.user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const body = await request.json()
        const title = typeof body.title === 'string' ? body.title.trim() : ''
        if (!title) return NextResponse.json({ error: 'Título obrigatório' }, { status: 400 })

        const assembly = await prisma.assembly.findUnique({ where: { id }, select: { status: true } })
        if (!assembly) return NextResponse.json({ error: 'Assembleia não encontrada' }, { status: 404 })
        if (!['DRAFT', 'SCHEDULED'].includes(assembly.status)) {
            return NextResponse.json({ error: 'Não é possível alterar pautas após o início da assembleia' }, { status: 409 })
        }

        const count = await prisma.agendaItem.count({ where: { assemblyId: id } })
        const item = await prisma.agendaItem.create({
            data: {
                title,
                description: typeof body.description === 'string' ? body.description.trim() : null,
                order: count + 1,
                assemblyId: id,
                excludesRestricted: body.excludesRestricted === true
            }
        })
        await recordAuditEvent({
            type: 'AGENDA_ITEM_CREATED', request, actorUserId: auth.user.id,
            assemblyId: id, targetId: item.id
        })
        return NextResponse.json({ item }, { status: 201 })
    } catch (error) {
        console.error('Erro ao criar pauta:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
