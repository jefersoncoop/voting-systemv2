'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import '../../admin.css'

interface AgendaItem {
    id: string
    title: string
    description: string | null
    order: number
    _count: {
        votes: number
    }
}

interface Assembly {
    id: string
    title: string
    description: string | null
    startTime: string
    endTime: string
    status: string
    items: AgendaItem[]
}

export default function AssemblyDetailsPage() {
    const router = useRouter()
    // Utilizando React.use() para desembrulhar `params` no Next.js 16 se necessário, 
    // mas como estamos em 'use client', o hook useParams() é a forma correta síncrona.
    const params = useParams()
    const id = params?.id as string

    const [assembly, setAssembly] = useState<Assembly | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [showItemModal, setShowItemModal] = useState(false)

    // New Item State
    const [newItem, setNewItem] = useState({ title: '', description: '', excludesRestricted: false })

    useEffect(() => {
        if (id) loadAssembly()
    }, [id])

    const loadAssembly = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/assembly/${id}`)
            if (res.status === 401) return router.push('/login')
            if (res.status === 404) return router.push('/admin')

            const data = await res.json()
            setAssembly(data.assembly)
        } catch (err) {
            setError('Erro ao carregar detalhes da assembleia')
        } finally {
            setLoading(false)
        }
    }

    const createItem = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        try {
            const res = await fetch(`/api/assembly/${id}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newItem)
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao criar item')

            setNewItem({ title: '', description: '', excludesRestricted: false })
            setShowItemModal(false)
            loadAssembly()
        } catch (err: any) {
            setError(err.message)
        }
    }

    const updateAssemblyStatus = async (status: string) => {
        try {
            console.log('Updating status to:', status)
            const res = await fetch(`/api/assembly/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Falha ao atualizar status')
            }

            await loadAssembly()
            // Optional: alert success if needed, but UI update should be enough
        } catch (err: any) {
            console.error(err)
            setError(err.message || 'Erro ao atualizar status')
        }
    }

    const deleteItem = async (itemId: string) => {
        if (!confirm('Excluir este item?')) return
        try {
            // Aproveitando a API antiga de agenda para deletar itens individuais
            // já que o ID é único globalmente
            await fetch(`/api/agenda/${itemId}`, { method: 'DELETE' })
            loadAssembly()
        } catch (err) {
            setError('Erro ao excluir item')
        }
    }

    if (loading) return <div className="loading">Carregando...</div>
    if (!assembly) return <div className="error-message">Assembleia não encontrada</div>

    return (
        <div className="admin-container">
            <div className="admin-header">
                <div>
                    <Link href="/admin" className="back-link">← Voltar</Link>
                    <h1>{assembly.title}</h1>
                    <p>{assembly.description || 'Sem descrição'}</p>
                </div>
                <div className="header-actions">
                    <span className={`status-badge status-${assembly.status.toLowerCase()}`}>
                        {assembly.status}
                    </span>
                </div>
            </div>

            <div className="assembly-info-card mb-4">
                <div className="row">
                    <div className="col">
                        <strong>Início:</strong> {new Date(assembly.startTime).toLocaleString()}
                    </div>
                    <div className="col">
                        <strong>Fim:</strong> {new Date(assembly.endTime).toLocaleString()}
                    </div>
                </div>
                <div className="actions mt-4">
                    <Link href={`/admin/relatorios/${assembly.id}`} className="btn btn-outline" target="_blank" style={{ marginRight: '1rem' }}>
                        📑 Emitir Relatório
                    </Link>
                    {assembly.status === 'PENDING' && (
                        <button className="btn btn-primary" onClick={() => updateAssemblyStatus('OPEN')}>
                            Abrir Assembleia Agora
                        </button>
                    )}
                    {assembly.status === 'OPEN' && (
                        <button className="btn btn-outline" onClick={() => updateAssemblyStatus('CLOSED')}>
                            Encerrar Assembleia
                        </button>
                    )}
                </div>
            </div>

            <div className="items-section">
                <div className="section-header">
                    <h2>Pautas da Assembleia</h2>
                    <button className="btn btn-primary btn-sm" onClick={() => setShowItemModal(true)}>
                        + Adicionar Pauta
                    </button>
                </div>

                {error && <div className="error-message">{error}</div>}

                <div className="items-list">
                    {assembly.items.length === 0 ? (
                        <p className="empty-text">Nenhuma pauta adicionada.</p>
                    ) : (
                        assembly.items.map((item) => (
                            <div key={item.id} className="agenda-item-row">
                                <div className="item-info">
                                    <span className="item-order">#{item.order}</span>
                                    <div>
                                        <h3>{item.title}</h3>
                                        {item.description && <p>{item.description}</p>}
                                    </div>
                                </div>
                                <div className="item-meta">
                                    <span>🗳️ {item._count.votes} votos</span>
                                    <button
                                        className="btn-icon danger"
                                        onClick={() => deleteItem(item.id)}
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* New Item Modal */}
            {showItemModal && (
                <div className="modal-overlay" onClick={() => setShowItemModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h2>Nova Pauta</h2>
                        <form onSubmit={createItem}>
                            <div className="form-group">
                                <label>Título</label>
                                <input
                                    value={newItem.title}
                                    onChange={e => setNewItem({ ...newItem, title: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Descrição</label>
                                <textarea
                                    value={newItem.description}
                                    onChange={e => setNewItem({ ...newItem, description: e.target.value })}
                                />
                            </div>
                            <div className="form-group checkbox-group" style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <input
                                    type="checkbox"
                                    id="excludesRestricted"
                                    checked={newItem.excludesRestricted}
                                    onChange={e => setNewItem({ ...newItem, excludesRestricted: e.target.checked })}
                                />
                                <label htmlFor="excludesRestricted" style={{ cursor: 'pointer' }}>
                                    Impedir voto da Diretoria (Pauta Restrita)
                                </label>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-outline" onClick={() => setShowItemModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
