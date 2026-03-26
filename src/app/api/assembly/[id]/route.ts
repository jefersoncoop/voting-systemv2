import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/auth'

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const session = request.cookies.get('session')?.value
        if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const payload = await decrypt(session)
        if (!payload) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

        // Buscar informações de restrição do usuário diretamente do banco para garantir dados atualizados
        const user = await prisma.user.findUnique({
            where: { id: payload.userId },
            select: { hasRestrictions: true }
        })
        const hasRestrictions = user?.hasRestrictions || false

        let itemWhereClause: any = {}
        if (hasRestrictions) {
            itemWhereClause.excludesRestricted = false
        }

        const assembly = await prisma.assembly.findUnique({
            where: { id },
            include: {
                items: {
                    where: itemWhereClause,
                    orderBy: { order: 'asc' },
                    include: {
                        _count: {
                            select: { votes: true }
                        },
                        votes: {
                            where: { userId: payload.userId }
                        }
                    }
                }
            }
        })

        if (!assembly) return NextResponse.json({ error: 'Assembleia não encontrada' }, { status: 404 })
        
        // Buscar se o usuário já tem algum voto nesta assembleia para recuperar o protocolo
        const firstVote = await prisma.vote.findFirst({
            where: {
                userId: payload.userId,
                agendaItem: {
                    assemblyId: id
                }
            },
            select: { protocol: true }
        })

        return NextResponse.json({ assembly, protocol: firstVote?.protocol || null })
    } catch (error) {
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}

export async function PATCH(
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
        const { status, title, description, startTime, endTime } = body

        const data: any = {}
        if (status) data.status = status
        if (title) data.title = title
        if (description) data.description = description
        if (startTime) data.startTime = new Date(startTime)
        if (endTime) data.endTime = new Date(endTime)

        const assembly = await prisma.assembly.update({
            where: { id },
            data
        })

        return NextResponse.json({ assembly })
    } catch (error) {
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const session = request.cookies.get('session')?.value
        if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const payload = await decrypt(session)
        if (!payload || !payload.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        await prisma.assembly.delete({
            where: { id }
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
