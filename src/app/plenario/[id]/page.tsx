'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import '../plenario.css'

interface Result {
    id: string
    title: string
    status: string
    totalVotes: number
    approve: number
    reject: number
    abstain: number
    assemblyTitle: string
}

export default function AssemblyResultsPage() {
    const params = useParams()
    const id = params?.id as string

    const [results, setResults] = useState<Result[]>([])
    const [assemblyTitle, setAssemblyTitle] = useState('')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadResults()
        const interval = setInterval(loadResults, 3000) // Fast refresh for realtime feel
        return () => clearInterval(interval)
    }, [id])

    const loadResults = async () => {
        try {
            const res = await fetch(`/api/results?assemblyId=${id}`)
            if (res.ok) {
                const data = await res.json()
                setResults(data.results)
                if (data.results.length > 0) {
                    setAssemblyTitle(data.results[0].assemblyTitle)
                }
            }
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    const getPercentage = (count: number, total: number) => {
        if (total === 0) return 0
        return Math.round((count / total) * 100)
    }

    // CSS Conic Gradient for Pie Chart
    const getPieStyle = (approve: number, reject: number, abstain: number, total: number) => {
        if (total === 0) return { background: '#333' }

        const pApprove = (approve / total) * 100
        const pReject = (reject / total) * 100
        const pAbstain = (abstain / total) * 100

        // Format: conic-gradient(green 0% 30%, red 30% 70%, gray 70% 100%)
        return {
            background: `conic-gradient(
                #10b981 0% ${pApprove}%, 
                #ef4444 ${pApprove}% ${pApprove + pReject}%, 
                #6b7280 ${pApprove + pReject}% 100%
            )`
        }
    }

    if (loading) return <div className="loading-screen"><div className="spinner"></div></div>

    return (
        <div className="plenario-container compact-mode">
            <header className="dashboard-header">
                <Link href="/plenario" className="back-link">← Voltar</Link>
                <h1>{assemblyTitle || 'Apuração'}</h1>
                <div className="live-badge">🔴 Ao Vivo</div>
            </header>

            <div className="compact-grid">
                {results.map(r => (
                    <div key={r.id} className="compact-card">
                        <div className="chart-area">
                            <div className="pie-chart" style={getPieStyle(r.approve, r.reject, r.abstain, r.totalVotes)}>
                                <div className="pie-hole">
                                    <span className="total-votes-center">{r.totalVotes}</span>
                                    <span className="votes-label">Votos</span>
                                </div>
                            </div>
                        </div>
                        <div className="card-info">
                            <h3>{r.title}</h3>
                            <div className="legend">
                                <div className="legend-item">
                                    <span className="dot approve"></span>
                                    <span>{r.approve} ({getPercentage(r.approve, r.totalVotes)}%)</span>
                                </div>
                                <div className="legend-item">
                                    <span className="dot reject"></span>
                                    <span>{r.reject} ({getPercentage(r.reject, r.totalVotes)}%)</span>
                                </div>
                                <div className="legend-item">
                                    <span className="dot abstain"></span>
                                    <span>{r.abstain} ({getPercentage(r.abstain, r.totalVotes)}%)</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
