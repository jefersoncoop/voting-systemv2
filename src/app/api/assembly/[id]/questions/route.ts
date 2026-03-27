import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const body = await request.json()
        const { cpf, name, municipality, content } = body

        if (!cpf || !name || !municipality || !content) {
            return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
        }

        // Sanitizar CPF
        const cleanCpf = cpf.replace(/\D/g, '')
        
        // Verificar se a assembleia existe
        const assembly = await prisma.assembly.findUnique({
            where: { id }
        })
        if (!assembly) {
            return NextResponse.json({ error: 'Assembleia não encontrada' }, { status: 404 })
        }

        // Verificar se o CPF existe na base de usuários
        const user = await prisma.user.findUnique({
            where: { cpf: cleanCpf }
        })

        if (!user) {
            return NextResponse.json({ 
                error: 'CPF não encontrado na base de eleitores. Apenas eleitores cadastrados podem enviar perguntas.' 
            }, { status: 403 })
        }

        // Criar a pergunta
        const question = await prisma.question.create({
            data: {
                content,
                voterCpf: cleanCpf,
                voterName: name,
                voterMunicipality: municipality,
                assemblyId: id
            }
        })

        return NextResponse.json({ success: true, question })
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    // Only accessible if needed privately, but admin might need its own route with auth
    // Let's keep it simple for now or restrict it
    return NextResponse.json({ error: 'Not implemented' }, { status: 501 })
}
