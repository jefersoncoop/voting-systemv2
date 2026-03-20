import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/auth'

export async function GET(request: NextRequest) {
    try {
        const session = request.cookies.get('session')?.value
        if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const payload = await decrypt(session)
        if (!payload) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

        // Buscar informações do usuário do banco para garantir dados atualizados
        const user = await prisma.user.findUnique({
            where: { id: payload.userId },
            select: {
                id: true,
                name: true,
                isAdmin: true,
                hasRestrictions: true
            }
        })

        if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

        return NextResponse.json({ user })
    } catch (error) {
        console.error('Erro ao buscar usuário:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
