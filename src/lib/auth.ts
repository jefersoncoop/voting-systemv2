import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

const configuredSecret = process.env.JWT_SECRET

if (process.env.NODE_ENV === 'production' && (!configuredSecret || configuredSecret.length < 32)) {
    throw new Error('JWT_SECRET deve existir e possuir pelo menos 32 caracteres em produção')
}

const SECRET_KEY = configuredSecret || 'development-only-secret-change-before-production'
const key = new TextEncoder().encode(SECRET_KEY)

export interface AuthPayload extends JWTPayload {
    userId: string
    tokenType: 'session' | '2fa'
    sessionId?: string
    challengeId?: string
    isAdmin?: boolean
    name?: string
    hasRestrictions?: boolean
}

export async function encrypt(payload: AuthPayload, expiresIn: string | number = '4h') {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(expiresIn)
        .sign(key)
}

export async function decrypt(input: string): Promise<AuthPayload | null> {
    try {
        const { payload } = await jwtVerify(input, key, {
            algorithms: ['HS256'],
        })
        if (typeof payload.userId !== 'string') return null
        return payload as AuthPayload
    } catch {
        return null
    }
}

export function sanitizeCpf(cpf: string) {
    return cpf.replace(/\D/g, '')
}

export function getAuthSecret() {
    return SECRET_KEY
}
