'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import '../../admin.css'

interface Question {
    id: string
    content: string
    voterCpf: string
    voterName: string
    voterMunicipality: string
    createdAt: string
}

export default function AdminQuestionsPage() {
    const params = useParams()
    const router = useRouter()
    const id = params?.id as string

    const [questions, setQuestions] = useState<Question[]>([])
    const [loading, setLoading] = useState(true)
    const [assemblyTitle, setAssemblyTitle] = useState('')

    useEffect(() => {
        if (id) {
            loadData()
        }
    }, [id])

    const loadData = async () => {
        try {
            const [qRes, aRes] = await Promise.all([
                fetch(`/api/admin/questions/${id}`),
                fetch(`/api/assembly/${id}`)
            ])

            if (qRes.ok) {
                const qData = await qRes.json()
                setQuestions(qData.questions)
            }
            if (aRes.ok) {
                const aData = await aRes.json()
                setAssemblyTitle(aData.assembly.title)
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    if (loading) return <div className="loading">Carregando perguntas...</div>

    return (
        <div className="admin-container">
            <header className="admin-header">
                <div>
                    <Link href="/admin" className="back-link">← Voltar para o Painel</Link>
                    <h1>Perguntas da Assembleia</h1>
                    <p>{assemblyTitle}</p>
                </div>
            </header>

            <div className="admin-content">
                {questions.length === 0 ? (
                    <div className="empty-state">
                        <p>Nenhuma pergunta enviada até o momento.</p>
                    </div>
                ) : (
                    <div className="questions-grid" style={{ display: 'grid', gap: '1.5rem', marginTop: '2rem' }}>
                        {questions.map(q => (
                            <div key={q.id} className="item-card" style={{ padding: '2rem' }}>
                                <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--foreground)' }}>{q.voterName}</h3>
                                        <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
                                            CPF: {q.voterCpf} | {q.voterMunicipality}
                                        </div>
                                    </div>
                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                        {new Date(q.createdAt).toLocaleString()}
                                    </span>
                                </div>
                                <p style={{ 
                                    background: '#f8fafc', 
                                    padding: '1.5rem', 
                                    borderRadius: 'var(--radius-md)', 
                                    lineHeight: '1.6',
                                    color: 'var(--foreground)',
                                    border: '1px solid var(--border)',
                                    whiteSpace: 'pre-wrap',
                                    margin: 0
                                }}>
                                    {q.content}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
