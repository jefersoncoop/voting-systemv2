import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sanitizeCpf } from '@/lib/auth'
import { Prisma } from '@prisma/client'
import { getAuthContext } from '@/lib/session'
import { recordAuditEvent } from '@/lib/audit'
import { isValidCpf, normalizePhone } from '@/lib/identity'

export async function GET(request: NextRequest) {
    try {
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        if (!auth.user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const users = await prisma.user.findMany({
            where: { isAdmin: false },
            orderBy: { name: 'asc' }
        })

        return NextResponse.json({ users })
    } catch {
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        if (!auth.user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const body = await request.json()
        const { name, cpf, birthDate, phone, hasRestrictions } = body

        if (!name || !cpf || !birthDate) {
            return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
        }

        const cleanCpf = sanitizeCpf(cpf)

        if (!isValidCpf(cleanCpf)) {
            return NextResponse.json({ error: 'CPF inválido' }, { status: 400 })
        }
        const normalizedPhone = normalizePhone(phone)
        if (normalizedPhone === undefined) return NextResponse.json({ error: 'WhatsApp inválido. Use código do país e DDD.' }, { status: 400 })

        // Validar data de nascimento
        const birthDateObj = new Date(birthDate)
        if (isNaN(birthDateObj.getTime())) {
            return NextResponse.json({ error: 'Data de nascimento inválida' }, { status: 400 })
        }

        // Verificar se CPF já existe
        const existingUser = await prisma.user.findUnique({
            where: { cpf: cleanCpf }
        })

        if (existingUser) {
            return NextResponse.json({ error: 'CPF já cadastrado' }, { status: 400 })
        }

        const user = await prisma.user.create({
            data: {
                name,
                cpf: cleanCpf,
                birthDate: birthDateObj,
                phone: normalizedPhone,
                isAdmin: false,
                hasRestrictions: !!hasRestrictions
            }
        })

        await recordAuditEvent({ type: 'USER_CREATED', request, actorUserId: auth.user.id, targetId: user.id })

        return NextResponse.json({ user })
    } catch (error: unknown) {
        console.error('Erro ao criar usuário:', error)
        
        // Tratar erros específicos do Prisma
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            const target = Array.isArray(error.meta?.target) ? error.meta.target : []
            const field = target[0] || 'campo'
            return NextResponse.json({ 
                error: `Já existe um usuário com este ${field === 'cpf' ? 'CPF' : field}` 
            }, { status: 400 })
        }

        // Retornar mensagem de erro mais específica se disponível
        if (error instanceof Error && error.message) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ error: 'Erro interno ao criar usuário' }, { status: 500 })
    }
}
