import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getClientIp } from '@/lib/session'

export async function recordAuditEvent(input: {
    type: string
    request?: NextRequest
    actorUserId?: string
    assemblyId?: string
    targetId?: string
    metadata?: Record<string, unknown>
}) {
    await prisma.auditEvent.create({
        data: {
            type: input.type,
            actorUserId: input.actorUserId,
            assemblyId: input.assemblyId,
            targetId: input.targetId,
            metadata: input.metadata ? JSON.stringify(input.metadata) : null,
            ipAddress: input.request ? getClientIp(input.request) : null
        }
    })
}
