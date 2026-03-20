import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
    try {
        const cookieStore = await cookies()
        
        // Criar resposta de sucesso
        const response = NextResponse.json({ success: true, message: 'Logout realizado com sucesso' })
        
        // Deletar cookie tanto no cookieStore quanto na resposta
        cookieStore.delete('session')
        response.cookies.delete('session')
        
        // Garantir que o cookie seja deletado definindo valores vazios
        response.cookies.set('session', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 0,
            path: '/'
        })

        return response
    } catch (error) {
        console.error('Erro ao fazer logout:', error)
        const response = NextResponse.json({ error: 'Erro ao fazer logout' }, { status: 500 })
        response.cookies.delete('session')
        response.cookies.set('session', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 0,
            path: '/'
        })
        return response
    }
}

export async function GET(request: NextRequest) {
    try {
        const cookieStore = await cookies()
        
        // Redirecionar para a página de login
        const response = NextResponse.redirect(new URL('/login', request.url))
        
        // Deletar cookie tanto no cookieStore quanto na resposta
        cookieStore.delete('session')
        response.cookies.delete('session')
        
        // Garantir que o cookie seja deletado definindo valores vazios
        response.cookies.set('session', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 0,
            path: '/'
        })
        
        return response
    } catch (error) {
        console.error('Erro ao fazer logout:', error)
        const response = NextResponse.redirect(new URL('/login', request.url))
        response.cookies.delete('session')
        response.cookies.set('session', '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 0,
            path: '/'
        })
        return response
    }
}
