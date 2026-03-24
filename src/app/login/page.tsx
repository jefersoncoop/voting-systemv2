'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import './login.css'

export default function LoginPage() {
    const router = useRouter()
    const [step, setStep] = useState(1)
    const [cpf, setCpf] = useState('')
    const [birthDate, setBirthDate] = useState('')
    const [code, setCode] = useState('')
    const [challenge, setChallenge] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [userInfo, setUserInfo] = useState<{ name: string; hasRestrictions: boolean } | null>(null)

    const handleStep1 = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const res = await fetch('/api/auth/login/step1', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cpf, birthDate })
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || 'Erro ao validar dados')
                setLoading(false)
                return
            }

            if (data.skip2FA) {
                setUserInfo({
                    name: data.user.name,
                    hasRestrictions: data.user.hasRestrictions
                })
                setTimeout(() => {
                    if (data.user.isAdmin) {
                        router.push('/admin')
                    } else {
                        router.push('/votar')
                    }
                }, 2000)
            } else {
                setChallenge(data.challenge)
                setStep(2)
            }
        } catch (err) {
            setError('Erro de conexão')
        } finally {
            setLoading(false)
        }
    }

    const handleStep2 = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const res = await fetch('/api/auth/login/step2', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ challenge, code })
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || 'Código inválido')
                setLoading(false)
                return
            }

            // Salvar informações do usuário para exibir
            setUserInfo({
                name: data.user.name,
                hasRestrictions: data.user.hasRestrictions
            })

            // Aguardar um pouco para mostrar as informações antes de redirecionar
            setTimeout(() => {
                // Redirect based on user role
                if (data.user.isAdmin) {
                    router.push('/admin')
                } else {
                    router.push('/votar')
                }
            }, 2000)
        } catch (err) {
            setError('Erro de conexão')
        } finally {
            setLoading(false)
        }
    }

    const formatCPF = (value: string) => {
        const numbers = value.replace(/\D/g, '')
        return numbers.slice(0, 11)
    }

    return (
        <div className="login-container">
            <div className="login-card animate-fade-in">
                <div className="login-header">
                    <h1>Sistema de Votação</h1>
                    <p>Assembleia Virtual</p>
                </div>

                {step === 1 && (
                    <form onSubmit={handleStep1} className="login-form">
                        <h2>Identificação</h2>
                        <div className="form-group">
                            <label htmlFor="cpf">CPF</label>
                            <input
                                id="cpf"
                                type="text"
                                placeholder="000.000.000-00"
                                value={cpf}
                                onChange={(e) => setCpf(formatCPF(e.target.value))}
                                required
                                disabled={loading}
                                maxLength={11}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="birthDate">Data de Nascimento</label>
                            <input
                                id="birthDate"
                                type="date"
                                value={birthDate}
                                onChange={(e) => setBirthDate(e.target.value)}
                                required
                                disabled={loading}
                            />
                        </div>

                        {error && <div className="error-message">{error}</div>}

                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Verificando...' : 'Continuar'}
                        </button>
                    </form>
                )}

                {step === 2 && !userInfo && (
                    <form onSubmit={handleStep2} className="login-form">
                        <h2>Verificação de Segurança</h2>
                        <p className="info-text">
                            Um código de 6 dígitos foi enviado para seu email e WhatsApp cadastrados.
                        </p>

                        <div className="form-group">
                            <label htmlFor="code">Código de Verificação</label>
                            <input
                                id="code"
                                type="text"
                                placeholder="000000"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                required
                                disabled={loading}
                                maxLength={6}
                                className="code-input"
                            />
                        </div>

                        {error && <div className="error-message">{error}</div>}

                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? 'Verificando...' : 'Entrar'}
                        </button>

                        <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => setStep(1)}
                            disabled={loading}
                        >
                            Voltar
                        </button>
                    </form>
                )}

                {userInfo && (
                    <div className="login-form">
                        <div className="success-message" style={{ 
                            background: 'rgba(16, 185, 129, 0.1)', 
                            border: '1px solid #10b981', 
                            borderRadius: '8px', 
                            padding: '1.5rem',
                            textAlign: 'center'
                        }}>
                            <h2 style={{ color: '#10b981', marginBottom: '1rem' }}>✅ Login Realizado com Sucesso!</h2>
                            <div style={{ marginBottom: '1rem' }}>
                                <p style={{ fontSize: '1.2rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                                    {userInfo.name}
                                </p>
                            </div>
                            <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                                Redirecionando...
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
