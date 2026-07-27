import { prisma } from '@/lib/prisma'
import { recordAuditEvent } from '@/lib/audit'

export const ASSEMBLY_STATUSES = ['DRAFT', 'SCHEDULED', 'OPEN', 'CLOSED', 'ARCHIVED'] as const
export type AssemblyStatus = typeof ASSEMBLY_STATUSES[number]

const transitions: Record<AssemblyStatus, AssemblyStatus[]> = {
    DRAFT: ['SCHEDULED'],
    SCHEDULED: ['OPEN'],
    OPEN: ['CLOSED'],
    CLOSED: ['ARCHIVED'],
    ARCHIVED: []
}

export function isAssemblyStatus(value: unknown): value is AssemblyStatus {
    return typeof value === 'string' && ASSEMBLY_STATUSES.includes(value as AssemblyStatus)
}

export function canTransitionAssembly(from: AssemblyStatus, to: AssemblyStatus) {
    return transitions[from].includes(to)
}

export function validateAssemblyDates(startTime: Date, endTime: Date) {
    return !Number.isNaN(startTime.getTime()) && !Number.isNaN(endTime.getTime()) && startTime < endTime
}

export async function syncAssemblyStatus<T extends {
    id: string
    status: string
    startTime: Date
    endTime: Date
}>(assembly: T): Promise<T> {
    const now = new Date()
    let nextStatus: AssemblyStatus | null = null

    if (assembly.status === 'OPEN' && assembly.endTime <= now) {
        nextStatus = 'CLOSED'
    }

    if (!nextStatus) return assembly

    const updated = await prisma.assembly.update({
        where: { id: assembly.id },
        data: { status: nextStatus }
    })
    await recordAuditEvent({
        type: `ASSEMBLY_AUTO_${nextStatus}`,
        assemblyId: assembly.id,
        targetId: assembly.id
    })
    return { ...assembly, ...updated }
}

export function isVotingWindowOpen(assembly: { status: string, startTime: Date, endTime: Date }, now = new Date()) {
    return assembly.status === 'OPEN' && assembly.startTime <= now && assembly.endTime > now
}
