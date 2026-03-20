'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import './plenario.css'

interface Assembly {
    id: string
    title: string
    description: string | null
    status: string
    startTime: string
}

export default function PlenarioListPage() {
    const [assemblies, setAssemblies] = useState<Assembly[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchAssemblies = async () => {
            try {
                // Reusing the public assembly list, but specifically looking for open/closed ones
                const res = await fetch('/api/assembly')
                if (res.ok) {
                    const data = await res.json()
                    // Show all assemblies that are not pending (so we can see past results too)
                    setAssemblies(data.assemblies.filter((a: Assembly) => a.status !== 'PENDING'))
                }
            } catch (error) {
                console.error(error)
            } finally {
                setLoading(false)
            }
        }
        fetchAssemblies()
    }, [])

    if (loading) return <div className="loading-screen"><div className="spinner"></div></div>

    return (
        <div className="plenario-container">
            <div className="plenario-header">
                <h1>📊 Painel de Apuração</h1>
                <p>Selecione uma assembleia para visualizar os resultados em tempo real</p>
            </div>

            <div className="assemblies-grid">
                {assemblies.length === 0 ? (
                    <div className="empty-dashboard">
                        <h2>Nenhuma assembleia com apuração disponível</h2>
                    </div>
                ) : (
                    assemblies.map(assembly => (
                        <div key={assembly.id} className="result-card assembly-selection-card">
                            <div className="result-header">
                                <h2>{assembly.title}</h2>
                                <span className={`status-indicator ${assembly.status.toLowerCase()}`}>
                                    {assembly.status === 'OPEN' ? 'Em Andamento' : 'Encerrada'}
                                </span>
                            </div>
                            <p className="result-description">{assembly.description || 'Sem descrição'}</p>
                            <div className="meta-info mb-4">
                                📅 {new Date(assembly.startTime).toLocaleDateString()}
                            </div>
                            <Link href={`/plenario/${assembly.id}`} className="action-btn">
                                📈 Acompanhar Apuração
                            </Link>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}
