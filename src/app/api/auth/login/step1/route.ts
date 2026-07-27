import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sanitizeCpf } from '@/lib/auth'
import { consumeRateLimit } from '@/lib/rate-limit'
import { createSession, getClientIp, setSessionCookie } from '@/lib/session'
import { createTwoFactorChallenge } from '@/lib/two-factor'
import { recordAuditEvent } from '@/lib/audit'
import { isValidCpf } from '@/lib/identity'

const INVALID_CREDENTIALS = 'CPF ou data de nascimento inválidos'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const cpf = typeof body.cpf === 'string' ? body.cpf : ''
        const birthDate = typeof body.birthDate === 'string' ? body.birthDate : ''
        if (!cpf || !birthDate) return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })

        const cleanCpf = sanitizeCpf(cpf)
        if (process.env.NODE_ENV === 'production' && !isValidCpf(cleanCpf)) {
            return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 })
        }
        const ip = getClientIp(request)
        const [ipLimit, cpfLimit] = await Promise.all([
            consumeRateLimit({ action: 'LOGIN_IP', key: ip, limit: 20, windowMs: 15 * 60 * 1000 }),
            consumeRateLimit({ action: 'LOGIN_CPF', key: cleanCpf, limit: 5, windowMs: 15 * 60 * 1000 })
        ])
        if (!ipLimit.allowed || !cpfLimit.allowed) {
            const retryAfter = Math.max(ipLimit.retryAfterSeconds, cpfLimit.retryAfterSeconds)
            return NextResponse.json(
                { error: 'Muitas tentativas. Aguarde antes de tentar novamente.' },
                { status: 429, headers: { 'Retry-After': retryAfter.toString() } }
            )
        }

        const user = await prisma.user.findUnique({ where: { cpf: cleanCpf } })
        const inputDate = new Date(birthDate)
        const birthMatches = user && !Number.isNaN(inputDate.getTime())
            && user.birthDate.toISOString().split('T')[0] === inputDate.toISOString().split('T')[0]

        if (!user || !birthMatches) {
            await recordAuditEvent({ type: 'LOGIN_REJECTED', request, metadata: { reason: 'INVALID_CREDENTIALS' } })
            return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 })
        }

        const settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } })
        if (settings?.require2FA === false) {
            const { token } = await createSession(user, request)
            const response = NextResponse.json({
                success: true,
                skip2FA: true,
                user: { name: user.name, isAdmin: user.isAdmin, hasRestrictions: user.hasRestrictions }
            })
            setSessionCookie(response, token)
            await recordAuditEvent({ type: 'LOGIN_SUCCEEDED', request, actorUserId: user.id, metadata: { twoFactor: false } })
            return response
        }

        const challenge = await createTwoFactorChallenge(user)
        await recordAuditEvent({ type: 'TWO_FACTOR_SENT', request, actorUserId: user.id, metadata: { channel: challenge.channel } })
        return NextResponse.json({
            success: true,
            challenge: challenge.token,
            channel: challenge.channel,
            developmentCode: challenge.developmentCode
        })
    } catch (error) {
        console.error('Erro no primeiro passo do login:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
