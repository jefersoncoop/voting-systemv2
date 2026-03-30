'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import './votar.css'

interface Assembly {
    id: string
    title: string
    description: string | null
    startTime: string
    endTime: string
    status: string
    hasCompletedVoting?: boolean
    _count: {
        items: number
    }
}

function CountdownTimer({ targetDate, onComplete }: { targetDate: string; onComplete?: () => void }) {
    const [timeLeft, setTimeLeft] = useState<{ days: number, hours: number, minutes: number, seconds: number } | null>(null)

    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date().getTime()
            const target = new Date(targetDate).getTime()
            const distance = target - now

            if (distance < 0) {
                clearInterval(interval)
                setTimeLeft(null)
                if (onComplete) onComplete()
            } else {
                setTimeLeft({
                    days: Math.floor(distance / (1000 * 60 * 60 * 24)),
                    hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
                    minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
                    seconds: Math.floor((distance % (1000 * 60)) / 1000)
                })
            }
        }, 1000)

        return () => clearInterval(interval)
    }, [targetDate, onComplete])

    if (!timeLeft) return null

    return (
        <div className="countdown">
            <div className="countdown-item">
                <span className="value">{timeLeft.days}</span>
                <span className="label">dias</span>
            </div>
            <div className="countdown-item">
                <span className="value">{timeLeft.hours}</span>
                <span className="label">h</span>
            </div>
            <div className="countdown-item">
                <span className="value">{timeLeft.minutes}</span>
                <span className="label">min</span>
            </div>
            <div className="countdown-item">
                <span className="value">{timeLeft.seconds}</span>
                <span className="label">seg</span>
            </div>
        </div>
    )
}

export default function VotarPage() {
    const router = useRouter()
    const [assemblies, setAssemblies] = useState<Assembly[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [userName, setUserName] = useState('')

    useEffect(() => {
        loadAssemblies()
        loadUserInfo()

        // Auto-refresh every 5 seconds to check for status updates
        const interval = setInterval(() => {
            loadAssemblies()
        }, 5000)

        return () => clearInterval(interval)
    }, [])

    const loadAssemblies = async () => {
        try {
            const res = await fetch('/api/assembly')
            if (res.status === 401) return router.push('/login')
            const data = await res.json()
            // Filter Active and Future Assemblies (CLOSED are hidden)
            setAssemblies(data.assemblies.filter((a: Assembly) => a.status !== 'CLOSED'))
        } catch (err) {
            setError('Erro ao carregar assembleias')
        } finally {
            setLoading(false)
        }
    }

    const isFuture = (dateString: string) => {
        return new Date(dateString).getTime() > new Date().getTime()
    }

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' })
            router.push('/login')
        } catch (err) {
            console.error('Erro ao fazer logout:', err)
            // Mesmo com erro, redireciona para login
            router.push('/login')
        }
    }

    const loadUserInfo = async () => {
        try {
            const res = await fetch('/api/user/me')
            if (res.ok) {
                const data = await res.json()
                setUserName(data.user.name)
            }
        } catch (err) {
            console.error(err)
        }
    }

    if (loading) return <div className="loading-screen"><div className="spinner"></div></div>

    return (
        <div className="vote-container">
            <header className="vote-header">
                <div className="logo-area">
                    <h1>Sala de Votação</h1>
                    <p>Selecione uma assembleia para participar</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    {userName && (
                        <span style={{ fontSize: '0.9rem', color: 'var(--foreground)', fontWeight: '600' }}>
                            {userName}
                        </span>
                    )}
                    <button onClick={handleLogout} className="logout-btn">
                        Sair
                    </button>
                </div>
            </header>

            <main className="vote-content">
                {error && <div className="error-message">{error}</div>}

                <div className="assemblies-grid">
                    {assemblies.length === 0 ? (
                        <div className="empty-state">
                            <h2>Nenhuma assembleia disponível</h2>
                            <p>Aguarde o agendamento de novas votações.</p>
                        </div>
                    ) : (
                        assemblies.map(assembly => {
                            // Priority 1: Check if user already finished voting
                            if (assembly.hasCompletedVoting) {
                                return (
                                    <div key={assembly.id} className="assembly-card voted-card">
                                        <div className="card-header">
                                            <span className="status-badge success">Concluído</span>
                                            <h2>{assembly.title}</h2>
                                        </div>
                                        <p className="description">Você já concluiu sua votação nesta assembleia.</p>
                                        <div className="meta-info">
                                            <span className="success-text">✅ Votos Registrados</span>
                                        </div>
                                        <Link href={`/votar/${assembly.id}?receipt=true`} className="enter-btn receipt-btn">
                                            Ver Comprovante 📄
                                        </Link>
                                    </div>
                                )
                            }

                            // Priority 2: Check status OPEN (Admins can force open even if future)
                            const isStatusOpen = assembly.status === 'OPEN'

                            // Priority 3: Check date (Future)
                            const startsInFuture = !isStatusOpen && isFuture(assembly.startTime)

                            return (
                                <div key={assembly.id} className={`assembly-card ${startsInFuture ? 'future' : ''}`}>
                                    <div className="card-header">
                                        {startsInFuture ? (
                                            <span className="status-badge future">Em Breve</span>
                                        ) : (
                                            <span className="status-badge open">Em Andamento</span>
                                        )}
                                        <h2>{assembly.title}</h2>
                                    </div>

                                    <p className="description">{assembly.description}</p>

                                    {startsInFuture ? (
                                        <div className="countdown-container">
                                            <p className="countdown-title">Inicia em:</p>
                                            <CountdownTimer
                                                targetDate={assembly.startTime}
                                                onComplete={() => loadAssemblies()}
                                            />
                                            <div className="meta-info mt-2">
                                                <span>📅 {new Date(assembly.startTime).toLocaleString()}</span>
                                            </div>
                                            <button className="enter-btn disabled" disabled>
                                                Aguarde o Início 🔒
                                            </button>
                                            <Link href={`/perguntas/${assembly.id}`} className="question-link" style={{ display: 'block', textAlign: 'center', marginTop: '1rem', color: 'var(--primary)', fontSize: '0.9rem', fontWeight: '600' }}>
                                                ¿ Tem dúvidas? Enviar Pergunta
                                            </Link>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="meta-info">
                                                <span>🕒 Encerra em: {new Date(assembly.endTime).toLocaleString()}</span>
                                                <span>📋 {assembly._count.items} pautas</span>
                                            </div>
                                            <Link href={`/votar/${assembly.id}`} className="enter-btn">
                                                Iniciar Votação ➜
                                            </Link>
                                            <Link href={`/perguntas/${assembly.id}`} className="question-link" style={{ display: 'block', textAlign: 'center', marginTop: '1rem', color: 'var(--primary)', fontSize: '0.9rem', fontWeight: '600' }}>
                                                ¿ Tem dúvidas? Enviar Pergunta
                                            </Link>
                                        </>
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>
            </main>
        </div>
    )
}
