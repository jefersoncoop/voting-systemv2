import { SignJWT, jwtVerify } from 'jose'

const SECRET_KEY = process.env.JWT_SECRET || 'development_secret_key_change_in_production'
const key = new TextEncoder().encode(SECRET_KEY)

export async function encrypt(payload: any) {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('4h') // Assembleias usually don't last longer than this
        .sign(key)
}

export async function decrypt(input: string): Promise<any> {
    try {
        const { payload } = await jwtVerify(input, key, {
            algorithms: ['HS256'],
        })
        return payload
    } catch (err) {
        return null
    }
}

export function sanitizeCpf(cpf: string) {
    return cpf.replace(/\D/g, '')
}
