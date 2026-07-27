import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/session'
import { consumeRateLimit } from '@/lib/rate-limit'
import { syncAssemblyStatus } from '@/lib/assembly'
import { recordAuditEvent } from '@/lib/audit'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Faça login para enviar uma pergunta' }, { status: 401 })

        const limit = await consumeRateLimit({ action: 'QUESTION_USER', key: auth.user.id, limit: 5, windowMs: 10 * 60 * 1000 })
        if (!limit.allowed) {
            return NextResponse.json(
                { error: 'Limite de perguntas atingido. Tente novamente mais tarde.' },
                { status: 429, headers: { 'Retry-After': limit.retryAfterSeconds.toString() } }
            )
        }

        const body = await request.json()
        const municipality = typeof body.municipality === 'string' ? body.municipality.trim() : ''
        const content = typeof body.content === 'string' ? body.content.trim() : ''
        if (!municipality || !content || content.length > 2000) {
            return NextResponse.json({ error: 'Município ou pergunta inválidos' }, { status: 400 })
        }

        const assemblyData = await prisma.assembly.findUnique({ where: { id } })
        if (!assemblyData) return NextResponse.json({ error: 'Assembleia não encontrada' }, { status: 404 })
        const membership = await prisma.assemblyElector.findUnique({
            where: { assemblyId_userId: { assemblyId: id, userId: auth.user.id } },
            select: { id: true }
        })
        if (!membership) return NextResponse.json({ error: 'Você não é eleitor desta assembleia' }, { status: 403 })
        const assembly = await syncAssemblyStatus(assemblyData)
        if (!['SCHEDULED', 'OPEN'].includes(assembly.status) || assembly.endTime <= new Date()) {
            return NextResponse.json({ error: 'O período para perguntas está encerrado' }, { status: 409 })
        }

        const question = await prisma.question.create({
            data: {
                content,
                voterCpf: auth.user.cpf,
                voterName: auth.user.name,
                voterMunicipality: municipality,
                assemblyId: id
            }
        })
        await recordAuditEvent({
            type: 'QUESTION_SUBMITTED', request, actorUserId: auth.user.id,
            assemblyId: id, targetId: question.id
        })
        return NextResponse.json({ success: true, question: { id: question.id, createdAt: question.createdAt } }, { status: 201 })
    } catch (error) {
        console.error('Erro ao enviar pergunta:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
