import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyTwoFactorChallenge } from '@/lib/two-factor'
import { createSession, setSessionCookie } from '@/lib/session'
import { recordAuditEvent } from '@/lib/audit'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const challenge = typeof body.challenge === 'string' ? body.challenge : ''
        const code = typeof body.code === 'string' ? body.code : ''
        if (!challenge || !/^\d{6}$/.test(code)) {
            return NextResponse.json({ error: 'Dados de verificação inválidos' }, { status: 400 })
        }

        const userId = await verifyTwoFactorChallenge(challenge, code)
        if (!userId) {
            await recordAuditEvent({ type: 'TWO_FACTOR_REJECTED', request })
            return NextResponse.json({ error: 'Código inválido ou expirado' }, { status: 401 })
        }

        const user = await prisma.user.findUnique({ where: { id: userId } })
        if (!user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

        const { token } = await createSession(user, request)
        const response = NextResponse.json({
            success: true,
            user: { name: user.name, isAdmin: user.isAdmin, hasRestrictions: user.hasRestrictions }
        })
        setSessionCookie(response, token)
        await recordAuditEvent({ type: 'LOGIN_SUCCEEDED', request, actorUserId: user.id, metadata: { twoFactor: true } })
        return response
    } catch (error) {
        console.error('Erro no segundo passo do login:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
