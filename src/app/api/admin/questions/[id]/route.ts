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

        const questions = await prisma.question.findMany({
            where: { assemblyId: id },
            orderBy: { createdAt: 'desc' }
        })

        return NextResponse.json({ questions })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
