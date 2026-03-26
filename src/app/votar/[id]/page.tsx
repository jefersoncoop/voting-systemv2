'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import '../votar.css'

interface AgendaItem {
    id: string
    title: string
    description: string | null
    order: number
    excludesRestricted?: boolean
}

interface Assembly {
    id: string
    title: string
    status: string
    items: AgendaItem[]
}

export default function VotingSessionPage() {
    const router = useRouter()
    const params = useParams()
    const id = params?.id as string

    // Safety check for searchParams in client component
    const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null

    const [assembly, setAssembly] = useState<Assembly | null>(null)
    const [currentVote, setCurrentVote] = useState<{ [key: string]: string }>({}) // itemId -> choice
    const [submittedVotes, setSubmittedVotes] = useState<string[]>([]) // itemIds that were submitted
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [showCompletion, setShowCompletion] = useState(false)
    const [protocol, setProtocol] = useState('')
    const [userInfo, setUserInfo] = useState<{ name: string; hasRestrictions: boolean } | null>(null)

    useEffect(() => {
        if (id) {
            loadAssemblyData()
            loadUserInfo()
        }

        const interval = setInterval(() => {
            if (id) loadAssemblyData()
        }, 5000)

        return () => clearInterval(interval)
    }, [id])

    const loadUserInfo = async () => {
        try {
            const res = await fetch('/api/user/me')
            if (res.ok) {
                const data = await res.json()
                setUserInfo({
                    name: data.user.name,
                    hasRestrictions: data.user.hasRestrictions
                })
            }
        } catch (err) {
            console.error('Erro ao carregar informações do usuário:', err)
        }
    }

    useEffect(() => {
        if (searchParams?.get('receipt') === 'true') {
            setShowCompletion(true)
        }
    }, [searchParams])

    useEffect(() => {
        if (assembly && assembly.items.length > 0) {
            // Check if all items have been voted on
            const allVoted = assembly.items.every(item => submittedVotes.includes(item.id))
            if (allVoted && submittedVotes.length > 0) {
                setShowCompletion(true)
            }
        }
    }, [submittedVotes, assembly])

    // Protocol is now set by the API after the first vote is submitted

    const loadAssemblyData = async () => {
        try {
            const res = await fetch(`/api/assembly/${id}`)
            if (res.status === 401) return router.push('/login')
            if (res.status === 404) {
                setError('Assembleia não encontrada')
                return
            }
            const data = await res.json()
            setAssembly(data.assembly)
            if (data.protocol) {
                setProtocol(data.protocol)
            }

            // Check if we already have votes (this would ideally come from the API)
            // But for now, if we loaded "receipt=true" or if local user tries to vote, it will be handled.
            // A better way is to fetch user votes here if needed, but the list page already handles the "Concluded" state entry point.
        } catch (err) {
            setError('Erro ao carregar dados')
        } finally {
            setLoading(false)
        }
    }

    const handleVote = async (itemId: string, choice: string) => {
        // Verificar se o item está bloqueado antes de tentar votar
        const item = assembly?.items.find(i => i.id === itemId)
        if (item?.excludesRestricted && userInfo?.hasRestrictions) {
            alert('Você não pode votar nesta pauta. Esta pauta está bloqueada para membros da Diretoria.')
            return
        }

        try {
            const res = await fetch('/api/vote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    agendaItemId: itemId,
                    choice,
                    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
                })
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Erro ao votar')
            }

            const data = await res.json()

            // Store the unique protocol returned by the server (set only on first vote)
            if (data.protocol && !protocol) {
                setProtocol(data.protocol)
            }

            setSubmittedVotes(prev => [...prev, itemId])
            setCurrentVote(prev => ({ ...prev, [itemId]: choice }))
        } catch (err: any) {
            alert(err.message)
        }
    }

    const handleFinish = () => {
        router.push('/votar')
    }

    if (loading) return <div className="loading-screen"><div className="spinner"></div></div>
    if (!assembly) return <div className="error-message">{error || 'Assembleia não encontrada'}</div>

    if (showCompletion) {
        return (
            <div className="vote-container">
                <div className="completion-card">
                    <div className="success-icon">✅</div>
                    <h1>Votação Concluída!</h1>
                    <p>Seus votos foram registrados com sucesso.</p>

                    <div className="receipt-box">
                        <h3>Comprovante de Participação</h3>
                        <p><strong>Assembleia:</strong> {assembly.title}</p>
                        <p><strong>Data:</strong> {new Date().toLocaleDateString()}</p>
                        <p><strong>Status:</strong> Concluído</p>
                        <div className="receipt-hash">
                            <div style={{ marginBottom: '0.4rem', fontWeight: 600, fontSize: '0.85rem', color: '#9ca3af', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Protocolo Único</div>
                            <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', letterSpacing: '0.15em', color: '#34d399' }}>{protocol || '—'}</div>
                            <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>Gerado a partir dos dados do seu dispositivo</div>
                        </div>
                    </div>

                    <button className="finish-btn" onClick={handleFinish}>
                        Concluir e Sair
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="vote-container">
            <header className="vote-header sticky">
                <div>
                    <Link href="/votar" className="back-link-voter">← Sair</Link>
                    <h1>{assembly.title}</h1>
                </div>
                <div className="user-status">
                    {userInfo && (
                        <div style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            alignItems: 'flex-end',
                            fontSize: '0.85rem',
                            color: '#9ca3af'
                        }}>
                            <span style={{ fontWeight: '600', color: '#fff' }}>{userInfo.name}</span>
                        </div>
                    )}
                </div>
            </header>

            <main className="vote-content">
                <div className="voting-feed">
                    {assembly.items.length === 0 ? (
                        <p className="empty-state">Nenhuma pauta disponível para votação.</p>
                    ) : (
                        assembly.items
                            .filter(item => !(item.excludesRestricted && userInfo?.hasRestrictions))
                            .map(item => {
                                const hasVoted = submittedVotes.includes(item.id)
                                const myChoice = currentVote[item.id]

                                return (
                                    <div key={item.id} className={`vote-card ${hasVoted ? 'voted' : ''}`}>
                                        <div className="vote-card-header">
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                                <div>
                                                    <span className="item-order">Item {item.order}</span>
                                                    <h3>{item.title}</h3>
                                                </div>
                                            </div>
                                        </div>

                                        {item.description && (
                                            <p className="vote-description">{item.description}</p>
                                        )}

                                    <div className="vote-actions">
                                        {hasVoted ? (
                                            <div className="vote-confirmation">
                                                <span>✅ Voto Registrado: <strong>{myChoice}</strong></span>
                                            </div>
                                        ) : (
                                            <>
                                                {assembly.status !== 'OPEN' ? (
                                                    <div className="vote-locked">
                                                        <p>🔒 Votação Aguardando Liberação</p>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <button
                                                            className="vote-btn approve"
                                                            onClick={() => handleVote(item.id, 'APPROVE')}
                                                        >
                                                            APROVO
                                                        </button>
                                                        <button
                                                            className="vote-btn reject"
                                                            onClick={() => handleVote(item.id, 'REJECT')}
                                                        >
                                                            REPROVO
                                                        </button>
                                                        <button
                                                            className="vote-btn abstain"
                                                            onClick={() => handleVote(item.id, 'ABSTAIN')}
                                                        >
                                                            ABSTENHO
                                                        </button>
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </main>
        </div>
    )
}
