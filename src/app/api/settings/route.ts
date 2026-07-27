import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/session'
import { recordAuditEvent } from '@/lib/audit'

export async function GET(request: NextRequest) {
    try {
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        if (!auth.user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

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
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        if (!auth.user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

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

        await recordAuditEvent({
            type: 'SETTINGS_UPDATED', request, actorUserId: auth.user.id,
            targetId: 'global', metadata: { require2FA }
        })

        return NextResponse.json({ settings })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
