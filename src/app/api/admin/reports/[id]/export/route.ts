import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/auth'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = request.cookies.get('session')?.value
        if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

        const payload = await decrypt(session)
        if (!payload || !payload.isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })

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

        const votes = await prisma.vote.findMany({
            where: {
                agendaItem: {
                    assemblyId: id
                }
            },
            include: {
                user: {
                    select: {
                        name: true,
                        cpf: true
                    }
                }
            },
            orderBy: { timestamp: 'asc' }
        })

        // CSV Generation
        const SEP = ';'
        let csv = '\uFEFF' // UTF-8 BOM for Excel

        // Header
        csv += `RELATÓRIO DE VOTAÇÃO: ${assembly.title}\n`
        csv += `Data de Exportação: ${new Date().toLocaleString()}\n\n`

        // Section 1: Summary
        csv += `1. RESUMO DA APURAÇÃO\n`
        csv += `Pauta${SEP}Aprovados${SEP}Reprovados${SEP}Abstenções${SEP}Total\n`
        
        assembly.items.forEach(item => {
            const counts = { APPROVE: 0, REJECT: 0, ABSTAIN: 0 }
            item.votes.forEach(v => {
                if (v.choice in counts) counts[v.choice as keyof typeof counts]++
            })
            csv += `"${item.title.replace(/"/g, '""')}"${SEP}${counts.APPROVE}${SEP}${counts.REJECT}${SEP}${counts.ABSTAIN}${SEP}${item.votes.length}\n`
        })

        csv += `\n\n`

        // Section 2: Voters
        csv += `2. LISTA DE VOTANTES\n`
        csv += `Nome${SEP}CPF${SEP}Horário${SEP}Protocolo${SEP}Hash do Dispositivo\n`

        // Deduplicate voters for the list
        const voterMap = new Map<string, any>()
        votes.forEach(v => {
            if (!voterMap.has(v.userId)) {
                voterMap.set(v.userId, {
                    name: v.user.name,
                    cpf: v.user.cpf,
                    timestamp: v.timestamp,
                    protocol: v.protocol,
                    deviceHash: v.deviceHash
                })
            }
        })

        Array.from(voterMap.values()).forEach(v => {
            csv += `"${v.name.replace(/"/g, '""')}"${SEP}${v.cpf}${SEP}${new Date(v.timestamp).toLocaleString()}${SEP}${v.protocol || ''}${SEP}${v.deviceHash || ''}\n`
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
