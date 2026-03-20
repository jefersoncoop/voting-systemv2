import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt, sanitizeCpf } from '@/lib/auth'

export async function GET(request: NextRequest) {
    try {
        const session = request.cookies.get('session')?.value
        if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const payload = await decrypt(session)
        if (!payload || !payload.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const users = await prisma.user.findMany({
            where: { isAdmin: false },
            orderBy: { name: 'asc' }
        })

        return NextResponse.json({ users })
    } catch (error) {
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = request.cookies.get('session')?.value
        if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const payload = await decrypt(session)
        if (!payload || !payload.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const body = await request.json()
        const { name, cpf, birthDate, hasRestrictions } = body

        if (!name || !cpf || !birthDate) {
            return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
        }

        const cleanCpf = sanitizeCpf(cpf)

        // Validar CPF (deve ter 11 dígitos)
        if (cleanCpf.length !== 11) {
            return NextResponse.json({ error: 'CPF inválido. Deve conter 11 dígitos.' }, { status: 400 })
        }

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
                isAdmin: false,
                hasRestrictions: !!hasRestrictions
            }
        })

        return NextResponse.json({ user })
    } catch (error: any) {
        console.error('Erro ao criar usuário:', error)
        
        // Tratar erros específicos do Prisma
        if (error.code === 'P2002') {
            const field = error.meta?.target?.[0] || 'campo'
            return NextResponse.json({ 
                error: `Já existe um usuário com este ${field === 'cpf' ? 'CPF' : field}` 
            }, { status: 400 })
        }

        // Retornar mensagem de erro mais específica se disponível
        if (error.message) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ error: 'Erro interno ao criar usuário' }, { status: 500 })
    }
}
