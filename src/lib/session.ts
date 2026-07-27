import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt, encrypt } from '@/lib/auth'

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 4

export function getClientIp(request: NextRequest) {
    const forwarded = request.headers.get('x-forwarded-for')
    return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
}

export async function createSession(user: {
    id: string
    isAdmin: boolean
    name: string
    hasRestrictions: boolean
}, request: NextRequest) {
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)
    const session = await prisma.session.create({
        data: {
            userId: user.id,
            expiresAt,
            ipAddress: getClientIp(request),
            userAgent: request.headers.get('user-agent')
        }
    })

    const token = await encrypt({
        tokenType: 'session',
        sessionId: session.id,
        userId: user.id,
        isAdmin: user.isAdmin,
        name: user.name,
        hasRestrictions: user.hasRestrictions
    })

    return { token, expiresAt }
}

export function setSessionCookie(response: NextResponse, token: string) {
    response.cookies.set('session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE_SECONDS,
        path: '/'
    })
}

export function clearSessionCookie(response: NextResponse) {
    response.cookies.set('session', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/'
    })
}

export async function getAuthContext(request: NextRequest) {
    const token = request.cookies.get('session')?.value
    if (!token) return null

    const payload = await decrypt(token)
    if (!payload || payload.tokenType !== 'session' || !payload.sessionId) return null

    const session = await prisma.session.findUnique({
        where: { id: payload.sessionId },
        include: {
            user: {
                select: {
                    id: true,
                    name: true,
                    cpf: true,
                    isAdmin: true,
                    hasRestrictions: true
                }
            }
        }
    })

    if (!session || session.userId !== payload.userId || session.revokedAt || session.expiresAt <= new Date()) {
        return null
    }

    return { session, user: session.user }
}

export async function revokeRequestSession(request: NextRequest) {
    const token = request.cookies.get('session')?.value
    if (!token) return
    const payload = await decrypt(token)
    if (!payload?.sessionId) return

    await prisma.session.updateMany({
        where: { id: payload.sessionId, revokedAt: null },
        data: { revokedAt: new Date() }
    })
}
