import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthContext } from '@/lib/session'

function csvCell(value: unknown) {
    let text = String(value ?? '')
    if (/^[=+\-@]/.test(text)) text = `'${text}`
    return `"${text.replace(/"/g, '""')}"`
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const auth = await getAuthContext(request)
        if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
        if (!auth.user.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

        const { id } = await params

        // Get Assembly details with Items
        const assembly = await prisma.assembly.findUnique({
            where: { id },
            include: {
                items: {
                    include: {
                        votes: true
                    },
                    orderBy: { order: 'asc' }
                }
            }
        })

        if (!assembly) return NextResponse.json({ error: 'Assembleia não encontrada' }, { status: 404 })

        const eligibleElectors = await prisma.assemblyElector.count({ where: { assemblyId: id } })

        const participations = await prisma.participation.findMany({
            where: { assemblyId: id },
            include: {
                user: {
                    select: {
                        name: true,
                        cpf: true
                    }
                }
            },
            orderBy: { createdAt: 'asc' }
        })

        // CSV Generation
        const SEP = ';'
        let csv = '\uFEFF' // UTF-8 BOM for Excel

        // Header
        csv += `RELATÓRIO DE VOTAÇÃO: ${csvCell(assembly.title)}\n`
        csv += `Data de Exportação: ${new Date().toLocaleString()}\n\n`
        csv += `Eleitores habilitados: ${eligibleElectors}\n\n`

        // Section 1: Summary
        csv += `1. RESUMO DA APURAÇÃO\n`
        csv += `Pauta${SEP}Aprovados${SEP}Reprovados${SEP}Abstenções${SEP}Total\n`
        
        assembly.items.forEach(item => {
            const counts = { APPROVE: 0, REJECT: 0, ABSTAIN: 0 }
            item.votes.forEach(v => {
                if (v.choice in counts) counts[v.choice as keyof typeof counts]++
            })
            csv += `${csvCell(item.title)}${SEP}${counts.APPROVE}${SEP}${counts.REJECT}${SEP}${counts.ABSTAIN}${SEP}${item.votes.length}\n`
        })

        csv += `\n\n`

        // Section 2: Voters
        csv += `2. LISTA DE VOTANTES\n`
        csv += `Nome${SEP}CPF${SEP}Horário${SEP}Protocolo\n`

        participations.forEach(participation => {
            csv += `${csvCell(participation.user.name)}${SEP}${csvCell(participation.user.cpf)}${SEP}${csvCell(participation.createdAt.toLocaleString())}${SEP}${csvCell(participation.protocol)}\n`
        })

        const filename = `relatorio-votação-${assembly.title.replace(/\s+/g, '-').toLowerCase()}.csv`

        return new NextResponse(csv, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`
            }
        })

    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
}
