import { createHmac, randomInt, timingSafeEqual } from 'crypto'
import type { User } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { decrypt, encrypt, getAuthSecret } from '@/lib/auth'

const CHALLENGE_DURATION_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 5

function hashCode(challengeId: string, code: string) {
    return createHmac('sha256', getAuthSecret()).update(`${challengeId}:${code}`).digest('hex')
}

async function sendWhatsAppCode(user: User, code: string) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const from = process.env.TWILIO_WHATSAPP_FROM

    if (!accountSid || !authToken || !from || !user.phone) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Provedor 2FA ou telefone do eleitor não configurado')
        }
        console.info(`[DEV 2FA] Código: ${code}`)
        return 'development' as const
    }

    const body = new URLSearchParams({
        From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
        To: user.phone.startsWith('whatsapp:') ? user.phone : `whatsapp:${user.phone}`,
        Body: `Seu código de acesso é ${code}. Ele expira em 5 minutos.`
    })
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
    })

    if (!response.ok) throw new Error('Falha ao enviar o código de verificação')
    return 'whatsapp' as const
}

export async function createTwoFactorChallenge(user: User) {
    const code = randomInt(100000, 1000000).toString()
    const expiresAt = new Date(Date.now() + CHALLENGE_DURATION_MS)
    const draft = await prisma.twoFactorChallenge.create({
        data: { userId: user.id, codeHash: 'pending', expiresAt }
    })

    await prisma.twoFactorChallenge.update({
        where: { id: draft.id },
        data: { codeHash: hashCode(draft.id, code) }
    })

    try {
        const channel = await sendWhatsAppCode(user, code)
        const token = await encrypt({
            tokenType: '2fa',
            challengeId: draft.id,
            userId: user.id
        }, '5m')
        return { token, channel, developmentCode: channel === 'development' ? code : undefined }
    } catch (error) {
        await prisma.twoFactorChallenge.delete({ where: { id: draft.id } })
        throw error
    }
}

export async function verifyTwoFactorChallenge(token: string, code: string) {
    const payload = await decrypt(token)
    if (!payload || payload.tokenType !== '2fa' || !payload.challengeId) return null

    const challenge = await prisma.twoFactorChallenge.findUnique({ where: { id: payload.challengeId } })
    if (!challenge || challenge.userId !== payload.userId || challenge.consumedAt || challenge.expiresAt <= new Date() || challenge.attempts >= MAX_ATTEMPTS) {
        return null
    }

    const expected = Buffer.from(challenge.codeHash, 'hex')
    const received = Buffer.from(hashCode(challenge.id, code), 'hex')
    const matches = expected.length === received.length && timingSafeEqual(expected, received)

    if (!matches) {
        await prisma.twoFactorChallenge.update({
            where: { id: challenge.id },
            data: { attempts: { increment: 1 } }
        })
        return null
    }

    const consumed = await prisma.twoFactorChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null, attempts: { lt: MAX_ATTEMPTS } },
        data: { consumedAt: new Date() }
    })
    return consumed.count === 1 ? payload.userId : null
}
