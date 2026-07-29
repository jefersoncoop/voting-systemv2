'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import '../sorteio.css'
import '../../admin.css'

interface Voter {
    id: string
    name: string
    cpf: string
}

function secureRandomIndex(maxExclusive: number) {
    const range = 0x100000000
    const limit = Math.floor(range / maxExclusive) * maxExclusive
    const values = new Uint32Array(1)
    let value = 0

    do {
        crypto.getRandomValues(values)
        value = values[0]
    } while (value >= limit)

    return value % maxExclusive
}

function drawVoters(voters: Voter[], quantity: number) {
    const pool = [...voters]

    for (let index = 0; index < quantity; index++) {
        const selectedIndex = index + secureRandomIndex(pool.length - index)
        const current = pool[index]
        pool[index] = pool[selectedIndex]
        pool[selectedIndex] = current
    }

    return pool.slice(0, quantity)
}

export default function AdminRafflePage() {
    const params = useParams()
    const id = params?.id as string

    const [voters, setVoters] = useState<Voter[]>([])
    const [loading, setLoading] = useState(true)
    const [spinning, setSpinning] = useState(false)
    const [winners, setWinners] = useState<Voter[]>([])
    const [previousWinners, setPreviousWinners] = useState<Voter[]>([])
    const [winnerQuantity, setWinnerQuantity] = useState(1)
    const [assemblyTitle, setAssemblyTitle] = useState('')
    const [error, setError] = useState('')

    const loadData = useCallback(async () => {
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
        } catch {
            setError('Erro de conexão ao carregar dados.')
        } finally {
            setLoading(false)
        }
    }, [id])

    useEffect(() => {
        if (id) void loadData()
    }, [id, loadData])

    const remainingVoters = voters.filter(v => !previousWinners.some(winner => winner.id === v.id))

    useEffect(() => {
        setWinnerQuantity(current => Math.min(Math.max(current, 1), Math.max(remainingVoters.length, 1)))
    }, [remainingVoters.length])

    const startRaffle = () => {
        if (remainingVoters.length === 0) {
            setError('Todos os eleitores aptos já foram sorteados!')
            return
        }

        if (!Number.isInteger(winnerQuantity) || winnerQuantity < 1 || winnerQuantity > remainingVoters.length) {
            setError(`Informe uma quantidade entre 1 e ${remainingVoters.length}.`)
            return
        }
        
        setWinners([])
        setSpinning(true)
        setError('')

        // Simulation of spinning for 3 seconds
        setTimeout(() => {
            const chosen = drawVoters(remainingVoters, winnerQuantity)
            setWinners(chosen)
            setPreviousWinners(previous => [...chosen, ...previous])
            setSpinning(false)
        }, 3000)
    }

    const maskCPF = (cpf: string) => {
        return `***.${cpf.substring(3, 6)}.***-**`
    }

    if (loading) return <div className="loading">Carregando módulo de sorteio...</div>

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
                        <div className={`raffle-display ${spinning ? 'spinning' : ''} ${winners.length > 0 ? 'has-winner' : ''}`}>
                            {winners.length === 0 && !spinning && (
                                <div className="pre-raffle">
                                    <div className="raffle-icon">🎁</div>
                                    <h3>Pronto para o sorteio?</h3>
                                    <p>Defina a quantidade e sorteie os ganhadores sem repetição.</p>
                                </div>
                            )}

                            {spinning && (
                                <div className="spinning-content">
                                    <div className="spinner-animation"></div>
                                    <h3>Sorteando...</h3>
                                    <p>Escolhendo {winnerQuantity} de {remainingVoters.length} eleitores</p>
                                </div>
                            )}

                            {winners.length > 0 && !spinning && (
                                <div className="winner-content">
                                    <div className="confetti-effect"></div>
                                    <div className="winner-badge">
                                        🏆 {winners.length === 1 ? 'GANHADOR' : `${winners.length} GANHADORES`} 🏆
                                    </div>
                                    <div className="current-winners">
                                        {winners.map((winner, index) => (
                                            <div key={winner.id} className="current-winner-card">
                                                <span className="winner-position">{index + 1}º</span>
                                                <div>
                                                    <h2 className="winner-name">{winner.name}</h2>
                                                    <p className="winner-cpf">CPF: {maskCPF(winner.cpf)}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <button className="reset-btn" onClick={() => setWinners([])}>Novo Sorteio</button>
                                </div>
                            )}
                        </div>

                        <div className="raffle-quantity-control">
                            <label htmlFor="winner-quantity">Quantidade de sorteados neste sorteio</label>
                            <input
                                id="winner-quantity"
                                type="number"
                                min={1}
                                max={Math.max(remainingVoters.length, 1)}
                                value={winnerQuantity}
                                onChange={event => setWinnerQuantity(Number(event.target.value))}
                                disabled={spinning || remainingVoters.length === 0}
                            />
                            <span>{remainingVoters.length} eleitor(es) ainda disponível(is)</span>
                        </div>

                        <button 
                            className={`raffle-btn ${spinning ? 'disabled' : ''}`}
                            onClick={startRaffle}
                            disabled={spinning || remainingVoters.length === 0}
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
                            <h3>Lista de Aptos ({remainingVoters.length})</h3>
                            <div className="voter-scroll">
                                {remainingVoters.map(v => (
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
