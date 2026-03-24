import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt, sanitizeCpf } from '@/lib/auth'

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const session = request.cookies.get('session')?.value
        if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const payload = await decrypt(session)
        if (!payload || !payload.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        await prisma.vote.deleteMany({ where: { userId: id } })
        await prisma.user.delete({ where: { id } })

        return NextResponse.json({ success: true })
    } catch (error) {
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const session = request.cookies.get('session')?.value
        if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const payload = await decrypt(session)
        if (!payload || !payload.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const body = await request.json()
        const { name, cpf, birthDate, hasRestrictions } = body

        const data: any = {}
        if (name) data.name = name
        if (cpf) {
            const cleanCpf = sanitizeCpf(cpf)
            if (cleanCpf.length !== 11) return NextResponse.json({ error: 'CPF inválido' }, { status: 400 })
            // Check uniqueness
            const existing = await prisma.user.findUnique({ where: { cpf: cleanCpf } })
            if (existing && existing.id !== id) {
                return NextResponse.json({ error: 'CPF já cadastrado' }, { status: 400 })
            }
            data.cpf = cleanCpf
        }
        if (birthDate) {
            data.birthDate = new Date(birthDate)
        }
        if (hasRestrictions !== undefined) {
            data.hasRestrictions = hasRestrictions
        }

        const user = await prisma.user.update({
            where: { id },
            data,
            select: { id: true, name: true, cpf: true, birthDate: true, hasRestrictions: true, isAdmin: true }
        })

        return NextResponse.json({ user })
    } catch (error) {
        return NextResponse.json({ error: 'Erro ao analisar ou o usuário não existe' }, { status: 500 })
    }
}
