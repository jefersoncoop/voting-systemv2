import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'

export function hashRateLimitKey(value: string) {
    return createHash('sha256').update(value).digest('hex')
}

export async function consumeRateLimit(input: {
    action: string
    key: string
    limit: number
    windowMs: number
}) {
    const now = new Date()
    const keyHash = hashRateLimitKey(input.key)
    const current = await prisma.rateLimitBucket.findUnique({
        where: { action_keyHash: { action: input.action, keyHash } }
    })

    if (!current || now.getTime() - current.windowStartedAt.getTime() >= input.windowMs) {
        await prisma.rateLimitBucket.upsert({
            where: { action_keyHash: { action: input.action, keyHash } },
            create: { action: input.action, keyHash, count: 1, windowStartedAt: now },
            update: { count: 1, windowStartedAt: now, blockedUntil: null }
        })
        return { allowed: true, retryAfterSeconds: 0 }
    }

    const nextCount = current.count + 1
    const blockedUntil = nextCount > input.limit
        ? new Date(current.windowStartedAt.getTime() + input.windowMs)
        : current.blockedUntil

    await prisma.rateLimitBucket.update({
        where: { id: current.id },
        data: { count: nextCount, blockedUntil }
    })

    const allowed = nextCount <= input.limit && (!current.blockedUntil || current.blockedUntil <= now)
    return {
        allowed,
        retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil(((blockedUntil ?? current.blockedUntil ?? now).getTime() - now.getTime()) / 1000))
    }
}
