import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sanitizeCpf } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { cpf, birthDate } = body

    if (!cpf || !birthDate) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
    }

    const cleanCpf = sanitizeCpf(cpf)
    
    // Normalize date to start of day for comparison if needed, 
    // but Prisma/SQLite usually handles ISO strings. 
    // Let's assume the frontend sends YYYY-MM-DD
    
    const user = await prisma.user.findUnique({
      where: { cpf: cleanCpf },
    })

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    // Simple date comparison - ensuring dates match (ignoring time if possible, but simplest is ISO check)
    const userBirth = new Date(user.birthDate).toISOString().split('T')[0]
    const inputBirth = new Date(birthDate).toISOString().split('T')[0]

    if (userBirth !== inputBirth) {
       return NextResponse.json({ error: 'Dados não conferem' }, { status: 401 })
    }

    // Check if 2FA is required
    let require2FA = true
    const settings = await prisma.systemSettings.findUnique({ where: { id: 'global' } })
    if (settings) require2FA = settings.require2FA

    if (!require2FA) {
        // Skip 2FA sequence, create real session Token
        const { encrypt } = await import('@/lib/auth')
        const sessionToken = await encrypt({
            userId: user.id,
            isAdmin: user.isAdmin,
            name: user.name,
            hasRestrictions: user.hasRestrictions
        })

        const { cookies } = await import('next/headers')
        const cookieStore = await cookies()
        cookieStore.set('session', sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 4 // 4 hours
        })

        return NextResponse.json({
            success: true,
            skip2FA: true,
            user: {
                name: user.name,
                isAdmin: user.isAdmin,
                hasRestrictions: user.hasRestrictions
            }
        })
    }

    // Success Step 1
    // Generate a numeric 2FA token (Mocked for now)
    const token = Math.floor(100000 + Math.random() * 900000).toString()
    
    console.log(`[MOCK 2FA] Token para CPF ${cpf}: ${token}`)

    // In a real app, we would save this token in Redis/DB with expiration
    // For this stateless MVP (without external redis), we can sign a temporary "Pre-Auth" JWT 
    // that contains the correct 2FA code, and send it to the client (encrypted).
    // The client sends it back with the code they typed.
    // OR we just assume the code is valid implementation for now.
    
    // Better approach for MVP: Return a signed JWT that contains the "expected" code 
    // and userId. The client doesn't see it (it's httpOnly cookie preferably, or just returned payload).
    // Let's return a "challenge" token.
    
    const { encrypt } = await import('@/lib/auth')
    const challengeToken = await encrypt({ 
        userId: user.id, 
        code: token, 
        step: '2fa_verification' 
    })

    return NextResponse.json({ 
      success: true, 
      challenge: challengeToken,
      // For dev convenience, we return the code in the response body during dev mode only?
      // No, let's keep it clean. It's in the console (server-side).
    })

  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
