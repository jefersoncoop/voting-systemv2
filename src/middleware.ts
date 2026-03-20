import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decrypt } from '@/lib/auth'

export async function middleware(request: NextRequest) {
    const session = request.cookies.get('session')?.value

    // Protected routes
    const isProtectedRoute = request.nextUrl.pathname.startsWith('/admin') ||
        request.nextUrl.pathname.startsWith('/votar') ||
        request.nextUrl.pathname.startsWith('/plenario')

    if (isProtectedRoute && !session) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    if (session) {
        const payload = await decrypt(session)

        if (!payload) {
            // Invalid session
            const response = NextResponse.redirect(new URL('/login', request.url))
            response.cookies.delete('session')
            return response
        }

        // Admin-only routes
        if (request.nextUrl.pathname.startsWith('/admin') && !payload.isAdmin) {
            return NextResponse.redirect(new URL('/votar', request.url))
        }
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/admin/:path*', '/votar/:path*', '/plenario/:path*']
}
