'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import '../../admin.css'
import { getErrorMessage } from '@/lib/errors'
import Pagination from '@/components/Pagination'

const ELECTORS_PER_PAGE = 10
const AVAILABLE_ELECTORS_PER_PAGE = 5

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
    showLiveResults: boolean
    items: AgendaItem[]
}

interface Elector {
    id: string
    name: string
    cpf: string
    birthDate: string
    phone: string | null
    hasRestrictions: boolean
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
    const [electors, setElectors] = useState<Elector[]>([])
    const [availableUsers, setAvailableUsers] = useState<Elector[]>([])
    const [electorsEditable, setElectorsEditable] = useState(false)
    const [electorsRemovable, setElectorsRemovable] = useState(false)
    const [showElectorBatchModal, setShowElectorBatchModal] = useState(false)
    const [editingElector, setEditingElector] = useState<Elector | null>(null)
    const [electorEditForm, setElectorEditForm] = useState({
        name: '', cpf: '', birthDate: '', phone: '', hasRestrictions: false
    })
    const [savingElector, setSavingElector] = useState(false)
    const [selectedElectorIds, setSelectedElectorIds] = useState<string[]>([])
    const [assignedElectorSearch, setAssignedElectorSearch] = useState('')
    const [electorSearch, setElectorSearch] = useState('')
    const [electorPage, setElectorPage] = useState(1)
    const [availableElectorPage, setAvailableElectorPage] = useState(1)
    const [electorImportText, setElectorImportText] = useState('')
    const [electorImportStatus, setElectorImportStatus] = useState('')
    const [importingElectors, setImportingElectors] = useState(false)

    // New Item State
    const [newItem, setNewItem] = useState({ title: '', description: '', excludesRestricted: false })

    const loadAssembly = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/assembly/${id}`)
            if (res.status === 401) return router.push('/login')
            if (res.status === 404) return router.push('/admin')

            const data = await res.json()
            setAssembly(data.assembly)
        } catch {
            setError('Erro ao carregar detalhes da assembleia')
        } finally {
            setLoading(false)
        }
    }, [id, router])

    const loadElectors = useCallback(async () => {
        try {
            const res = await fetch(`/api/assembly/${id}/electors`)
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao carregar eleitores')
            setElectors(data.electors)
            setAvailableUsers(data.availableUsers)
            setElectorsEditable(data.editable)
            setElectorsRemovable(data.removable)
            setSelectedElectorIds(current => current.filter(userId => data.availableUsers.some((user: Elector) => user.id === userId)))
        } catch (error: unknown) {
            setError(getErrorMessage(error, 'Erro ao carregar eleitores da assembleia'))
        }
    }, [id])

    useEffect(() => {
        if (id) {
            void loadAssembly()
            void loadElectors()
        }
    }, [id, loadAssembly, loadElectors])

    const addSelectedElectors = async () => {
        if (selectedElectorIds.length === 0) return
        try {
            const res = await fetch(`/api/assembly/${id}/electors`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userIds: selectedElectorIds })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao adicionar eleitores')
            setSelectedElectorIds([])
            await loadElectors()
        } catch (error: unknown) {
            setError(getErrorMessage(error, 'Erro ao adicionar eleitores'))
        }
    }

    const importElectors = async () => {
        const lines = electorImportText.split('\n').filter(line => line.trim())
        if (lines.length === 0) return
        setImportingElectors(true)
        setElectorImportStatus('Processando arquivo...')
        try {
            const users = lines.map(line => {
                const parts = line.split(/[;,]/).map(value => value.trim())
                const restrictionValue = parts[4]?.toLowerCase()
                return {
                    name: parts[0],
                    cpf: parts[1],
                    birthDate: parts[2],
                    phone: parts[3] || undefined,
                    hasRestrictions: restrictionValue
                        ? ['sim', 'true', '1'].includes(restrictionValue)
                        : undefined
                }
            })
            const res = await fetch('/api/users/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ users, assemblyId: id })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao importar eleitores')

            let status = `Processados: ${data.totalProcessed}. Novos cadastros: ${data.created}. Atualizados: ${data.updated}. Vinculados: ${data.assigned}. Já vinculados: ${data.alreadyAssigned}.`
            if (data.errors.length > 0) {
                status += `\nErros:\n${data.errors.map((item: { cpf?: string, error: string }) => `${item.cpf ?? 'Linha'}: ${item.error}`).join('\n')}`
            }
            setElectorImportStatus(status)
            await loadElectors()
        } catch (error: unknown) {
            setElectorImportStatus(getErrorMessage(error, 'Erro ao importar eleitores'))
        } finally {
            setImportingElectors(false)
        }
    }

    const removeElector = async (userId: string) => {
        if (!confirm('Remover este eleitor da assembleia?')) return
        try {
            const res = await fetch(`/api/assembly/${id}/electors?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao remover eleitor')
            await loadElectors()
        } catch (error: unknown) {
            setError(getErrorMessage(error, 'Erro ao remover eleitor'))
        }
    }

    const openElectorEdit = (elector: Elector) => {
        setEditingElector(elector)
        setElectorEditForm({
            name: elector.name,
            cpf: elector.cpf,
            birthDate: new Date(elector.birthDate).toISOString().split('T')[0],
            phone: elector.phone ?? '',
            hasRestrictions: elector.hasRestrictions
        })
    }

    const saveElector = async (event: React.FormEvent) => {
        event.preventDefault()
        if (!editingElector) return
        setSavingElector(true)
        setError('')
        try {
            const res = await fetch(`/api/users/${editingElector.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(electorEditForm)
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao atualizar eleitor')
            setEditingElector(null)
            await loadElectors()
        } catch (error: unknown) {
            setError(getErrorMessage(error, 'Erro ao atualizar eleitor'))
        } finally {
            setSavingElector(false)
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
            void loadAssembly()
        } catch (error: unknown) {
            setError(getErrorMessage(error, 'Erro ao criar item'))
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

            await Promise.all([loadAssembly(), loadElectors()])
            // Optional: alert success if needed, but UI update should be enough
        } catch (error: unknown) {
            console.error(error)
            setError(getErrorMessage(error, 'Erro ao atualizar status'))
        }
    }

    const startAssembly = () => {
        if (!confirm('Iniciar a assembleia agora? A votação ficará disponível para os eleitores habilitados.')) return
        void updateAssemblyStatus('OPEN')
    }

    const updateLiveResults = async (showLiveResults: boolean) => {
        try {
            const res = await fetch(`/api/assembly/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ showLiveResults })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Falha ao atualizar a divulgação dos resultados')
            await loadAssembly()
        } catch (error: unknown) {
            setError(getErrorMessage(error, 'Erro ao atualizar a divulgação dos resultados'))
        }
    }

    const deleteItem = async (itemId: string) => {
        if (!confirm('Excluir este item?')) return
        try {
            const res = await fetch(`/api/agenda/${itemId}`, { method: 'DELETE' })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao excluir pauta')
            void loadAssembly()
        } catch (error: unknown) {
            setError(getErrorMessage(error, 'Erro ao excluir pauta'))
        }
    }

    const normalizedSearch = electorSearch.trim().toLowerCase()
    const filteredAvailableUsers = availableUsers.filter(user =>
        !normalizedSearch || user.name.toLowerCase().includes(normalizedSearch) || user.cpf.includes(normalizedSearch.replace(/\D/g, ''))
    )
    const normalizedAssignedSearch = assignedElectorSearch.trim().toLowerCase()
    const assignedSearchDigits = normalizedAssignedSearch.replace(/\D/g, '')
    const filteredElectors = electors.filter(elector =>
        !normalizedAssignedSearch
        || elector.name.toLowerCase().includes(normalizedAssignedSearch)
        || elector.cpf.replace(/\D/g, '').includes(assignedSearchDigits)
        || Boolean(assignedSearchDigits && elector.phone?.replace(/\D/g, '').includes(assignedSearchDigits))
    )
    const electorTotalPages = Math.max(1, Math.ceil(filteredElectors.length / ELECTORS_PER_PAGE))
    const currentElectorPage = Math.min(electorPage, electorTotalPages)
    const paginatedElectors = filteredElectors.slice(
        (currentElectorPage - 1) * ELECTORS_PER_PAGE,
        currentElectorPage * ELECTORS_PER_PAGE
    )
    const availableElectorTotalPages = Math.max(1, Math.ceil(filteredAvailableUsers.length / AVAILABLE_ELECTORS_PER_PAGE))
    const currentAvailableElectorPage = Math.min(availableElectorPage, availableElectorTotalPages)
    const paginatedAvailableUsers = filteredAvailableUsers.slice(
        (currentAvailableElectorPage - 1) * AVAILABLE_ELECTORS_PER_PAGE,
        currentAvailableElectorPage * AVAILABLE_ELECTORS_PER_PAGE
    )

    useEffect(() => {
        if (electorPage > electorTotalPages) setElectorPage(electorTotalPages)
    }, [electorPage, electorTotalPages])

    useEffect(() => {
        if (availableElectorPage > availableElectorTotalPages) {
            setAvailableElectorPage(availableElectorTotalPages)
        }
    }, [availableElectorPage, availableElectorTotalPages])

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
                    {assembly.status === 'SCHEDULED' && (
                        <div className="start-assembly-control">
                            <button className="btn btn-primary" onClick={startAssembly}>
                                ▶ Iniciar Assembleia
                            </button>
                            <span>A votação não começa automaticamente.</span>
                        </div>
                    )}
                    {assembly.status === 'OPEN' && (
                        <button className="btn btn-outline" onClick={() => updateAssemblyStatus('CLOSED')}>
                            Encerrar Assembleia
                        </button>
                    )}
                    {assembly.status === 'CLOSED' && (
                        <button className="btn btn-outline" onClick={() => updateAssemblyStatus('ARCHIVED')}>
                            Arquivar Assembleia
                        </button>
                    )}
                    <button className="btn btn-outline" onClick={() => updateLiveResults(!assembly.showLiveResults)}>
                        {assembly.showLiveResults ? 'Ocultar resultados ao vivo' : 'Permitir resultados ao vivo'}
                    </button>
                </div>
            </div>

            <div className="items-section">
                <div className="section-header">
                    <div>
                        <h2>Eleitores desta Assembleia</h2>
                        <p className="text-gray-500 text-sm">{electors.length} eleitor(es) habilitado(s)</p>
                    </div>
                    {electorsEditable && (
                        <button className="btn btn-primary btn-sm" onClick={() => {
                            setAvailableElectorPage(1)
                            setShowElectorBatchModal(true)
                        }}>
                            + Adicionar em lote
                        </button>
                    )}
                </div>

                <div className="elector-list-toolbar">
                    <div className="form-group elector-list-search">
                        <label htmlFor="assigned-elector-search">Buscar eleitor</label>
                        <input
                            id="assigned-elector-search"
                            type="search"
                            value={assignedElectorSearch}
                            onChange={event => {
                                setAssignedElectorSearch(event.target.value)
                                setElectorPage(1)
                            }}
                            placeholder="Buscar por nome, CPF ou WhatsApp"
                        />
                    </div>
                    {assignedElectorSearch && (
                        <span className="elector-search-result">
                            {filteredElectors.length} resultado(s)
                        </span>
                    )}
                </div>

                {electors.length === 0 ? (
                    <p className="empty-text">Nenhum eleitor habilitado para esta assembleia.</p>
                ) : (
                    <div className="table-responsive">
                        <table className="data-table elector-table">
                            <thead>
                                <tr>
                                    <th>Nome</th>
                                    <th>CPF</th>
                                    <th>WhatsApp</th>
                                    <th>Perfil</th>
                                    {electorsRemovable && <th>Ações</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedElectors.map(elector => (
                                    <tr key={elector.id}>
                                        <td>
                                            <div className="elector-name-cell">
                                                <strong>{elector.name}</strong>
                                                {electorsEditable && (
                                                    <button
                                                        className="btn-icon elector-edit-button"
                                                        title="Editar eleitor"
                                                        aria-label={`Editar ${elector.name}`}
                                                        onClick={() => openElectorEdit(elector)}
                                                    >
                                                        ✏️
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="elector-nowrap">{elector.cpf}</td>
                                        <td className="elector-nowrap">{elector.phone || 'Não cadastrado'}</td>
                                        <td>
                                            <span className={`elector-profile ${elector.hasRestrictions ? 'restricted' : ''}`}>
                                                {elector.hasRestrictions ? 'Diretoria' : 'Membro'}
                                            </span>
                                        </td>
                                        {electorsRemovable && (
                                            <td>
                                                <button
                                                    className="btn-icon danger"
                                                    title="Remover eleitor"
                                                    aria-label={`Remover ${elector.name}`}
                                                    onClick={() => removeElector(elector.id)}
                                                >
                                                    🗑️
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                                {filteredElectors.length === 0 && (
                                    <tr>
                                        <td colSpan={electorsRemovable ? 5 : 4} className="table-empty">
                                            Nenhum eleitor encontrado para essa busca.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
                <Pagination
                    currentPage={currentElectorPage}
                    pageSize={ELECTORS_PER_PAGE}
                    totalItems={filteredElectors.length}
                    onPageChange={setElectorPage}
                />
            </div>

            {showElectorBatchModal && (
                <div className="modal-overlay" onClick={() => setShowElectorBatchModal(false)}>
                    <div className="modal-content large" onClick={event => event.stopPropagation()}>
                        <h2>Adicionar Eleitores em Lote</h2>

                        <div className="form-group">
                            <label htmlFor="elector-search">Selecionar do cadastro geral</label>
                            <input
                                id="elector-search"
                                value={electorSearch}
                                onChange={event => {
                                    setElectorSearch(event.target.value)
                                    setAvailableElectorPage(1)
                                }}
                                placeholder="Buscar por nome ou CPF"
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                            <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => setSelectedElectorIds(current => [...new Set([...current, ...filteredAvailableUsers.map(user => user.id)])])}
                                disabled={filteredAvailableUsers.length === 0}
                            >
                                Selecionar resultados
                            </button>
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => setSelectedElectorIds([])}>
                                Limpar seleção
                            </button>
                            <span style={{ alignSelf: 'center', marginLeft: 'auto' }}>{selectedElectorIds.length} selecionado(s)</span>
                        </div>

                        <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', marginBottom: '1rem' }}>
                            {filteredAvailableUsers.length === 0 ? (
                                <p className="empty-text" style={{ padding: '1rem' }}>Nenhum eleitor disponível.</p>
                            ) : paginatedAvailableUsers.map(user => (
                                <label key={user.id} style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={selectedElectorIds.includes(user.id)}
                                        onChange={event => setSelectedElectorIds(current => event.target.checked
                                            ? [...current, user.id]
                                            : current.filter(userId => userId !== user.id))}
                                    />
                                    <span><strong>{user.name}</strong><br /><small>{user.cpf}</small></span>
                                </label>
                            ))}
                        </div>

                        <Pagination
                            currentPage={currentAvailableElectorPage}
                            pageSize={AVAILABLE_ELECTORS_PER_PAGE}
                            totalItems={filteredAvailableUsers.length}
                            onPageChange={setAvailableElectorPage}
                        />

                        <button type="button" className="btn btn-primary" onClick={addSelectedElectors} disabled={selectedElectorIds.length === 0}>
                            Adicionar {selectedElectorIds.length || ''} selecionado(s)
                        </button>

                        <hr style={{ margin: '1.5rem 0', border: 0, borderTop: '1px solid var(--border)' }} />

                        <div className="form-group">
                            <label htmlFor="elector-import">Importar CSV</label>
                            <p className="text-sm text-gray mb-4">
                                Uma linha por eleitor: <code>Nome; CPF; Data de nascimento (DD/MM/AAAA); WhatsApp; Diretoria (Sim/Não)</code>.
                                Cadastros existentes serão atualizados pelo CPF.
                            </p>
                            <textarea
                                id="elector-import"
                                rows={7}
                                value={electorImportText}
                                onChange={event => setElectorImportText(event.target.value)}
                                placeholder="Maria Silva; 52998224725; 20/05/1990; +5585999999999; Não"
                            />
                        </div>

                        {electorImportStatus && <pre className="import-status" style={{ whiteSpace: 'pre-wrap' }}>{electorImportStatus}</pre>}

                        <div className="modal-actions">
                            <button type="button" className="btn btn-outline" onClick={() => setShowElectorBatchModal(false)}>Fechar</button>
                            <button type="button" className="btn btn-primary" onClick={importElectors} disabled={importingElectors || !electorImportText.trim()}>
                                {importingElectors ? 'Importando...' : 'Importar e vincular'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editingElector && (
                <div className="modal-overlay" onClick={() => setEditingElector(null)}>
                    <div className="modal-content" onClick={event => event.stopPropagation()}>
                        <h2>Editar Eleitor</h2>
                        <form onSubmit={saveElector}>
                            <div className="form-group">
                                <label htmlFor="elector-edit-name">Nome completo</label>
                                <input id="elector-edit-name" value={electorEditForm.name} onChange={event => setElectorEditForm(current => ({ ...current, name: event.target.value }))} required />
                            </div>
                            <div className="form-group">
                                <label htmlFor="elector-edit-cpf">CPF</label>
                                <input id="elector-edit-cpf" value={electorEditForm.cpf} onChange={event => setElectorEditForm(current => ({ ...current, cpf: event.target.value }))} required />
                            </div>
                            <div className="form-group">
                                <label htmlFor="elector-edit-birth-date">Data de nascimento (acesso)</label>
                                <input id="elector-edit-birth-date" type="date" value={electorEditForm.birthDate} onChange={event => setElectorEditForm(current => ({ ...current, birthDate: event.target.value }))} required />
                            </div>
                            <div className="form-group">
                                <label htmlFor="elector-edit-phone">WhatsApp com código do país</label>
                                <input id="elector-edit-phone" type="tel" value={electorEditForm.phone} onChange={event => setElectorEditForm(current => ({ ...current, phone: event.target.value }))} placeholder="+5585999999999" />
                            </div>
                            <div className="form-group checkbox-group">
                                <label>
                                    <input type="checkbox" checked={electorEditForm.hasRestrictions} onChange={event => setElectorEditForm(current => ({ ...current, hasRestrictions: event.target.checked }))} />
                                    Membro da Diretoria (voto restrito)
                                </label>
                            </div>
                            <p className="text-sm text-gray">Ao alterar dados de acesso, sessões abertas desse eleitor serão encerradas por segurança.</p>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-outline" onClick={() => setEditingElector(null)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={savingElector}>{savingElector ? 'Salvando...' : 'Salvar alterações'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="items-section">
                <div className="section-header">
                    <h2>Pautas da Assembleia</h2>
                    {['DRAFT', 'SCHEDULED'].includes(assembly.status) && (
                        <button className="btn btn-primary btn-sm" onClick={() => setShowItemModal(true)}>
                            + Adicionar Pauta
                        </button>
                    )}
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
                                    {['DRAFT', 'SCHEDULED'].includes(assembly.status) && (
                                        <button className="btn-icon danger" onClick={() => deleteItem(item.id)}>🗑️</button>
                                    )}
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
