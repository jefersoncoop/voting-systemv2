import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookie, getAuthContext, revokeRequestSession } from '@/lib/session'
import { recordAuditEvent } from '@/lib/audit'

export async function POST(request: NextRequest) {
    const auth = await getAuthContext(request)
    await revokeRequestSession(request)
    if (auth) await recordAuditEvent({ type: 'LOGOUT', request, actorUserId: auth.user.id })

    const response = NextResponse.json({ success: true })
    clearSessionCookie(response)
    return response
}
