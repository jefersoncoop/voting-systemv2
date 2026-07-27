import { NextRequest, NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/session'

export async function GET(request: NextRequest) {
    try {
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        return NextResponse.json({
            user: {
                id: auth.user.id,
                name: auth.user.name,
                isAdmin: auth.user.isAdmin,
                hasRestrictions: auth.user.hasRestrictions
            }
        })
    } catch (error) {
        console.error('Erro ao buscar usuário:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
