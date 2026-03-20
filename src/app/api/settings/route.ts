import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/auth'

export async function GET(request: NextRequest) {
    try {
        const session = request.cookies.get('session')?.value
        if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const payload = await decrypt(session)
        if (!payload || !payload.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        let settings = await prisma.systemSettings.findUnique({
            where: { id: 'global' }
        })

        if (!settings) {
            settings = await prisma.systemSettings.create({
                data: { id: 'global', require2FA: true }
            })
        }

        return NextResponse.json({ settings })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const session = request.cookies.get('session')?.value
        if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const payload = await decrypt(session)
        if (!payload || !payload.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const body = await request.json()
        const { require2FA } = body

        if (typeof require2FA !== 'boolean') {
            return NextResponse.json({ error: 'Valor inválido' }, { status: 400 })
        }

        const settings = await prisma.systemSettings.upsert({
            where: { id: 'global' },
            create: { id: 'global', require2FA },
            update: { require2FA }
        })

        return NextResponse.json({ settings })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
