'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import '../perguntas.css'

export default function PublicQuestionsPage() {
    const params = useParams()
    const id = params?.id as string

    const [assembly, setAssembly] = useState<{ title: string } | null>(null)
    const [formData, setFormData] = useState({
        municipality: '',
        content: ''
    })
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

    useEffect(() => {
        if (id) {
            fetch(`/api/assembly/${id}`)
                .then(res => res.json())
                .then(data => {
                    if (data.assembly) setAssembly(data.assembly)
                })
                .catch(err => console.error(err))
        }
    }, [id])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setMessage(null)

        try {
            const res = await fetch(`/api/assembly/${id}/questions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            })

            const data = await res.json()

            if (res.ok) {
                setMessage({ type: 'success', text: 'Sua pergunta foi enviada com sucesso! Obrigado pela participação.' })
                setFormData({ municipality: '', content: '' })
            } else {
                setMessage({ type: 'error', text: data.error || 'Erro ao enviar pergunta. Tente novamente.' })
            }
        } catch {
            setMessage({ type: 'error', text: 'Erro de conexão. Tente novamente.' })
        } finally {
            setLoading(false)
        }
    }

    if (!assembly) return <div className="loading-screen">Carregando...</div>

    return (
        <div className="questions-page">
            <div className="questions-card">
                <header className="questions-header">
                    <h1>Enviar Pergunta</h1>
                    <h2>{assembly.title}</h2>
                    <p>Utilize o formulário abaixo para enviar sua dúvida em relação a esta assembleia.</p>
                </header>

                {message && (
                    <div className={`message ${message.type}`}>
                        {message.text}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="questions-form">
                    <div className="form-group">
                        <label htmlFor="municipality">Seu Município</label>
                        <input
                            type="text"
                            id="municipality"
                            name="municipality"
                            value={formData.municipality}
                            onChange={handleChange}
                            placeholder="Digite seu município"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="content">Sua Pergunta</label>
                        <textarea
                            id="content"
                            name="content"
                            value={formData.content}
                            onChange={handleChange}
                            placeholder="Escreva aqui sua pergunta..."
                            rows={5}
                            required
                        />
                    </div>

                    <button type="submit" className="submit-btn" disabled={loading}>
                        {loading ? 'Enviando...' : 'Enviar Pergunta'}
                    </button>
                </form>

                <footer className="questions-footer">
                    <p>Sua identificação é obtida da sessão autenticada. Não compartilhe seu acesso.</p>
                </footer>
            </div>
        </div>
    )
}
