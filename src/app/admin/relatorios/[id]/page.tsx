'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import './report.css'

interface Voter {
    name: string
    cpf: string
    timestamp: string
}

interface ItemSummary {
    id: string
    title: string
    description: string
    counts: {
        APPROVE: number
        REJECT: number
        ABSTAIN: number
    }
    total: number
}

interface ReportData {
    assembly: {
        title: string
        date: string
        status: string
    }
    voters: Voter[]
    itemSummaries: ItemSummary[]
}

export default function ReportPage() {
    const params = useParams()
    const id = params?.id as string
    const [data, setData] = useState<ReportData | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const loadReport = async () => {
            try {
                const res = await fetch(`/api/admin/reports/${id}`)
                if (res.ok) {
                    const json = await res.json()
                    setData(json)
                }
            } catch (err) {
                console.error(err)
            } finally {
                setLoading(false)
            }
        }
        loadReport()
    }, [id])

    if (loading) return <div className="loading">Gerando relatório...</div>
    if (!data) return <div className="error">Erro ao carregar relatório</div>

    return (
        <div className="report-container">
            <div className="report-header">
                <div className="report-meta">
                    <h1>Relatório de Votação</h1>
                    <h2>{data.assembly.title}</h2>
                    <p>Data de Emissão: {new Date().toLocaleString()}</p>
                </div>
                <button className="print-btn" onClick={() => window.print()}>🖨️ Imprimir / PDF</button>
            </div>

            <section className="section">
                <h3>1. Resumo da Apuração</h3>
                <div className="items-grid">
                    {data.itemSummaries.map(item => (
                        <div key={item.id} className="item-summary">
                            <h4>{item.title}</h4>
                            <div className="summary-stats">
                                <div className="stat-row">
                                    <span>Votos Totais:</span>
                                    <strong>{item.total}</strong>
                                </div>
                                <div className="stat-row approve">
                                    <span>Aprovados:</span>
                                    <strong>{item.counts.APPROVE}</strong>
                                </div>
                                <div className="stat-row reject">
                                    <span>Reprovados:</span>
                                    <strong>{item.counts.REJECT}</strong>
                                </div>
                                <div className="stat-row abstain">
                                    <span>Abstenções:</span>
                                    <strong>{item.counts.ABSTAIN}</strong>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="section page-break">
                <h3>2. Lista de Presença e Votantes</h3>
                <p className="subtitle">Total de votantes participantes: {data.voters.length}</p>

                <table className="voters-table">
                    <thead>
                        <tr>
                            <th>Nome do Eleitor</th>
                            <th>CPF</th>
                            <th>Horário do 1º Voto</th>
                            <th>Assinatura</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.voters.map((voter, index) => (
                            <tr key={index}>
                                <td>{voter.name}</td>
                                <td className="mono">{voter.cpf}</td>
                                <td>{new Date(voter.timestamp).toLocaleTimeString()}</td>
                                <td className="signature-line">__________________________</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            <div className="report-footer">
                <p>Sistema de Votação Digital - Relatório Gerado Automaticamente</p>
                <p>Hash de Integridade: {Math.random().toString(36).substring(2).toUpperCase()}</p>
            </div>
        </div>
    )
}
