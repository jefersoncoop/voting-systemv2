import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt, encrypt } from '@/lib/auth'
import { cookies } from 'next/headers'

// Force rebuild 2026-01-26
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { challenge, code } = body

        if (!challenge || !code) {
            return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
        }

        // Decrypt challenge
        const payload = await decrypt(challenge)

        if (!payload || payload.step !== '2fa_verification') {
            return NextResponse.json({ error: 'Sessão inválida ou expirada' }, { status: 401 })
        }

        if (payload.code !== code) {
            return NextResponse.json({ error: 'Código inválido' }, { status: 401 })
        }

        // Code matches! Create final session
        const user = await prisma.user.findUnique({ where: { id: payload.userId } })
        if (!user) return NextResponse.json({ error: 'Usuário não existe' }, { status: 401 })

        // Create Session Token
        const sessionToken = await encrypt({
            userId: user.id,
            isAdmin: user.isAdmin,
            name: user.name,
            hasRestrictions: user.hasRestrictions
        })

        // Set Cookie
        const cookieStore = await cookies()
        cookieStore.set('session', sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 4 // 4 hours
        })

        return NextResponse.json({
            success: true,
            user: {
                name: user.name,
                isAdmin: user.isAdmin,
                hasRestrictions: user.hasRestrictions
            }
        })

    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
