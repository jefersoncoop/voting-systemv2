import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { sanitizeCpf } from '@/lib/auth'
import { getAuthContext } from '@/lib/session'
import { recordAuditEvent } from '@/lib/audit'
import { isValidCpf, normalizePhone } from '@/lib/identity'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        if (!auth.user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
        if (auth.user.id === id) return NextResponse.json({ error: 'Você não pode excluir sua própria conta' }, { status: 409 })

        const user = await prisma.user.findUnique({
            where: { id }, select: { id: true, _count: { select: { votes: true, participations: true, assemblyMemberships: true } } }
        })
        if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
        if (user._count.votes > 0 || user._count.participations > 0 || user._count.assemblyMemberships > 0) {
            return NextResponse.json({ error: 'Remova o eleitor das assembleias antes de excluir seu cadastro' }, { status: 409 })
        }

        await recordAuditEvent({ type: 'USER_DELETED', request, actorUserId: auth.user.id, targetId: id })
        await prisma.user.delete({ where: { id } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Erro ao excluir usuário:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        if (!auth.user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const body = await request.json()
        const data: Prisma.UserUpdateInput = {}
        if (body.name !== undefined) {
            const name = typeof body.name === 'string' ? body.name.trim() : ''
            if (!name) return NextResponse.json({ error: 'Nome inválido' }, { status: 400 })
            data.name = name
        }
        if (body.cpf !== undefined) {
            const cleanCpf = sanitizeCpf(String(body.cpf))
            if (!isValidCpf(cleanCpf)) return NextResponse.json({ error: 'CPF inválido' }, { status: 400 })
            const existing = await prisma.user.findUnique({ where: { cpf: cleanCpf } })
            if (existing && existing.id !== id) return NextResponse.json({ error: 'CPF já cadastrado' }, { status: 409 })
            data.cpf = cleanCpf
        }
        if (body.birthDate !== undefined) {
            const birthDate = new Date(body.birthDate)
            if (Number.isNaN(birthDate.getTime())) return NextResponse.json({ error: 'Data de nascimento inválida' }, { status: 400 })
            data.birthDate = birthDate
        }
        if (body.phone !== undefined) {
            const phone = normalizePhone(body.phone)
            if (phone === undefined) return NextResponse.json({ error: 'WhatsApp inválido. Use código do país e DDD.' }, { status: 400 })
            data.phone = phone
        }
        if (body.hasRestrictions !== undefined) {
            if (typeof body.hasRestrictions !== 'boolean') return NextResponse.json({ error: 'Restrição inválida' }, { status: 400 })
            data.hasRestrictions = body.hasRestrictions
        }

        const user = await prisma.$transaction(async tx => {
            const updated = await tx.user.update({
                where: { id }, data,
                select: { id: true, name: true, cpf: true, birthDate: true, phone: true, hasRestrictions: true, isAdmin: true }
            })
            await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } })
            await tx.auditEvent.create({
                data: {
                    type: 'USER_UPDATED', actorUserId: auth.user.id, targetId: id,
                    metadata: JSON.stringify({ fields: Object.keys(data) })
                }
            })
            return updated
        })
        return NextResponse.json({ user })
    } catch (error) {
        console.error('Erro ao atualizar usuário:', error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
