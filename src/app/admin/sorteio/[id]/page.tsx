'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import '../sorteio.css'
import '../../admin.css'

interface Voter {
    id: string
    name: string
    cpf: string
}

export default function AdminRafflePage() {
    const params = useParams()
    const id = params?.id as string

    const [voters, setVoters] = useState<Voter[]>([])
    const [loading, setLoading] = useState(true)
    const [spinning, setSpinning] = useState(false)
    const [winner, setWinner] = useState<Voter | null>(null)
    const [previousWinners, setPreviousWinners] = useState<Voter[]>([])
    const [assemblyTitle, setAssemblyTitle] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
        if (id) {
            loadData()
        }
    }, [id])

    const loadData = async () => {
        try {
            const [vRes, aRes] = await Promise.all([
                fetch(`/api/admin/raffle/${id}`),
                fetch(`/api/assembly/${id}`)
            ])

            if (vRes.ok) {
                const vData = await vRes.json()
                setVoters(vData.voters)
            } else {
                setError('Erro ao carregar lista de eleitores aptos.')
            }

            if (aRes.ok) {
                const aData = await aRes.json()
                setAssemblyTitle(aData.assembly.title)
            }
        } catch (err) {
            setError('Erro de conexão ao carregar dados.')
        } finally {
            setLoading(false)
        }
    }

    const startRaffle = () => {
        const eligibleVoters = voters.filter(v => !previousWinners.some(pw => pw.id === v.id))
        
        if (eligibleVoters.length === 0) {
            setError('Todos os eleitores aptos já foram sorteados!')
            return
        }
        
        setWinner(null)
        setSpinning(true)
        setError('')

        // Simulation of spinning for 3 seconds
        setTimeout(() => {
            const randomIndex = Math.floor(Math.random() * eligibleVoters.length)
            const chosen = eligibleVoters[randomIndex]
            setWinner(chosen)
            setPreviousWinners(prev => [chosen, ...prev])
            setSpinning(false)
        }, 3000)
    }

    const maskCPF = (cpf: string) => {
        return `***.${cpf.substring(3, 6)}.$***-**`
    }

    if (loading) return <div className="loading">Carregando mídulos de sorteio...</div>

    return (
        <div className="admin-container">
            <header className="admin-header">
                <div>
                    <Link href="/admin" className="back-link">← Voltar para o Painel</Link>
                    <h1>Sorteio de Prêmios</h1>
                    <p>{assemblyTitle}</p>
                </div>
            </header>

            <div className="admin-content">
                {error && <div className="error-badge" style={{ marginBottom: '2rem' }}>{error}</div>}

                <div className="raffle-dashboard">
                    <div className="raffle-stats">
                        <div className="stat-card">
                            <span className="stat-label">Eleitores Aptos</span>
                            <span className="stat-value">{voters.length}</span>
                            <span className="stat-sub">Registraram voto nesta assembleia</span>
                        </div>
                    </div>

                    <div className="raffle-action-zone">
                        <div className={`raffle-display ${spinning ? 'spinning' : ''} ${winner ? 'has-winner' : ''}`}>
                            {!winner && !spinning && (
                                <div className="pre-raffle">
                                    <div className="raffle-icon">🎁</div>
                                    <h3>Pronto para o sorteio?</h3>
                                    <p>Clique no botão abaixo para escolher um ganhador aleatório.</p>
                                </div>
                            )}

                            {spinning && (
                                <div className="spinning-content">
                                    <div className="spinner-animation"></div>
                                    <h3>Sorteando...</h3>
                                    <p>Escolhendo entre {voters.length} eleitores</p>
                                </div>
                            )}

                            {winner && !spinning && (
                                <div className="winner-content">
                                    <div className="confetti-effect"></div>
                                    <div className="winner-badge">🏆 GANHADOR 🏆</div>
                                    <h2 className="winner-name">{winner.name}</h2>
                                    <p className="winner-cpf">CPF: {maskCPF(winner.cpf)}</p>
                                    <button className="reset-btn" onClick={() => setWinner(null)}>Novo Sorteio</button>
                                </div>
                            )}
                        </div>

                        <button 
                            className={`raffle-btn ${spinning ? 'disabled' : ''}`}
                            onClick={startRaffle}
                            disabled={spinning || voters.length === 0 || (voters.length > 0 && voters.length === previousWinners.length)}
                        >
                            {spinning ? 'SORTEANDO...' : 'REALIZAR SORTEIO'}
                        </button>
                    </div>

                    <div className="raffle-sidebar">
                        {previousWinners.length > 0 && (
                            <div className="previous-winners eligible-list" style={{ marginBottom: '2rem', border: '1px solid var(--primary)', background: 'rgba(99, 102, 241, 0.05)' }}>
                                <h3 style={{ color: 'var(--primary)' }}>🏆 Ganhadores ({previousWinners.length})</h3>
                                <div className="voter-scroll">
                                    {previousWinners.map(v => (
                                        <div key={v.id} className="voter-mini-card" style={{ background: 'white' }}>
                                            <span className="voter-name-mini" style={{ color: 'var(--primary)' }}>{v.name}</span>
                                            <span className="voter-cpf-mini">{maskCPF(v.cpf)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="eligible-list">
                            <h3>Lista de Aptos ({voters.length - previousWinners.length})</h3>
                            <div className="voter-scroll">
                                {voters
                                    .filter(v => !previousWinners.some(pw => pw.id === v.id))
                                    .map(v => (
                                        <div key={v.id} className="voter-mini-card">
                                            <span className="voter-name-mini">{v.name}</span>
                                            <span className="voter-cpf-mini">{maskCPF(v.cpf)}</span>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
