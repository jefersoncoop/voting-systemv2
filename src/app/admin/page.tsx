'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import './admin.css'

interface User {
    id: string
    name: string
    cpf: string
    birthDate: string
    hasRestrictions: boolean
}

interface Assembly {
    id: string
    title: string
    description: string | null
    startTime: string
    endTime: string
    status: string
    _count: {
        items: number
    }
}

export default function AdminPage() {
    const router = useRouter()
    const [activeTab, setActiveTab] = useState<'assemblies' | 'voters' | 'settings'>('assemblies')

    // Settings State
    const [require2FA, setRequire2FA] = useState(true)

    // Assemblies State
    const [assemblies, setAssemblies] = useState<Assembly[]>([])
    const [newAssembly, setNewAssembly] = useState({
        title: '',
        description: '',
        startTime: '',
        endTime: ''
    })

    // Voters State
    const [voters, setVoters] = useState<User[]>([])
    const [newVoter, setNewVoter] = useState({ name: '', cpf: '', birthDate: '', hasRestrictions: false })
    const [searchQuery, setSearchQuery] = useState('')
    const [showEditVoterModal, setShowEditVoterModal] = useState(false)
    const [editingVoter, setEditingVoter] = useState<User | null>(null)
    const [editFormData, setEditFormData] = useState({ name: '', cpf: '', birthDate: '', hasRestrictions: false })

    const [loading, setLoading] = useState(true)
    const [showAssemblyModal, setShowAssemblyModal] = useState(false)
    const [showImportModal, setShowImportModal] = useState(false)
    const [showVoterModal, setShowVoterModal] = useState(false)
    const [error, setError] = useState('')

    // Import State
    const [importText, setImportText] = useState('')
    const [importStatus, setImportStatus] = useState('')

    useEffect(() => {
        if (activeTab === 'assemblies') loadAssemblies()
        else if (activeTab === 'voters') loadVoters()
        else loadSettings()
    }, [activeTab])

    const loadSettings = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/settings')
            if (res.status === 401) return router.push('/login')
            if (res.ok) {
                const data = await res.json()
                if (data.settings) setRequire2FA(data.settings.require2FA)
            }
        } catch (err) {
            setError('Erro ao carregar configurações')
        } finally {
            setLoading(false)
        }
    }

    const saveSettings = async () => {
        setLoading(true)
        setError('')
        try {
            const res = await fetch('/api/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ require2FA })
            })
            if (!res.ok) throw new Error('Erro ao salvar configurações')
            alert('Configurações salvas com sucesso!')
        } catch (err: any) {
            setError(err.message || 'Erro ao salvar config')
        } finally {
            setLoading(false)
        }
    }

    const loadAssemblies = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/assembly')
            if (res.status === 401) return router.push('/login')
            const data = await res.json()
            setAssemblies(data.assemblies)
        } catch (err) {
            setError('Erro ao carregar assembleias')
        } finally {
            setLoading(false)
        }
    }

    const loadVoters = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/users')
            if (res.status === 401) return router.push('/login')
            const data = await res.json()
            setVoters(data.users)
        } catch (err) {
            setError('Erro ao carregar eleitores')
        } finally {
            setLoading(false)
        }
    }

    const createAssembly = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        try {
            const res = await fetch('/api/assembly', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newAssembly)
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao criar assembleia')

            setNewAssembly({ title: '', description: '', startTime: '', endTime: '' })
            setShowAssemblyModal(false)
            loadAssemblies()
        } catch (err: any) {
            setError(err.message)
        }
    }

    const createVoter = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        
        // Validação básica no frontend
        if (!newVoter.name.trim()) {
            setError('Nome é obrigatório')
            return
        }
        
        if (!newVoter.cpf.trim()) {
            setError('CPF é obrigatório')
            return
        }
        
        if (!newVoter.birthDate) {
            setError('Data de nascimento é obrigatória')
            return
        }
        
        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newVoter)
            })

            const data = await res.json()
            if (!res.ok) {
                throw new Error(data.error || 'Erro ao criar eleitor')
            }

            setNewVoter({ name: '', cpf: '', birthDate: '', hasRestrictions: false })
            setShowVoterModal(false)
            loadVoters()
        } catch (err: any) {
            setError(err.message || 'Erro ao criar eleitor. Verifique os dados e tente novamente.')
            console.error('Erro ao criar eleitor:', err)
        }
    }

    const handleImport = async () => {
        setLoading(true)
        setImportStatus('Lendo dados...')
        try {
            const lines = importText.split('\n').filter(l => l.trim().length > 0)
            const usersToImport = lines.map(line => {
                const parts = line.split(/[;,]/).map(p => p.trim())
                // Expected: Name, CPF, Date, Phone(opt), Restricted(opt)
                const isRestricted = parts[4]?.toLowerCase() === 'sim' || parts[4]?.toLowerCase() === 'true'

                return {
                    name: parts[0],
                    cpf: parts[1],
                    birthDate: parts[2],
                    phone: parts[3] || undefined,
                    hasRestrictions: isRestricted
                }
            })

            const res = await fetch('/api/users/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ users: usersToImport })
            })

            const data = await res.json()

            if (data.success) {
                setImportStatus(`Sucesso! Criados: ${data.created}. Erros: ${data.errors.length}`)
                if (data.errors.length > 0) {
                    setImportStatus(prev => prev + '\nErros:\n' + data.errors.map((e: any) => `${e.cpf}: ${e.error}`).join('\n'))
                }
                loadVoters()
            } else {
                setImportStatus('Erro na importação: ' + data.error)
            }

        } catch (err: any) {
            setImportStatus('Erro interno: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const deleteAssembly = async (id: string) => {
        if (!confirm('Deseja excluir esta assembleia e todos os itens?')) return
        try {
            await fetch(`/api/assembly/${id}`, { method: 'DELETE' })
            loadAssemblies()
        } catch (err) {
            setError('Erro ao excluir assembleia')
        }
    }

    const deleteVoter = async (id: string) => {
        if (!confirm('Deseja excluir este eleitor?')) return
        try {
            await fetch(`/api/users/${id}`, { method: 'DELETE' })
            loadVoters()
        } catch (err) {
            setError('Erro ao excluir eleitor')
        }
    }

    const openEditVoter = (voter: User) => {
        setEditingVoter(voter)
        setEditFormData({
            name: voter.name,
            cpf: voter.cpf,
            birthDate: new Date(voter.birthDate).toISOString().split('T')[0],
            hasRestrictions: voter.hasRestrictions
        })
        setShowEditVoterModal(true)
    }

    const saveEditVoter = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingVoter) return
        setError('')
        setLoading(true)

        try {
            const res = await fetch(`/api/users/${editingVoter.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editFormData)
            })

            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Erro ao editar eleitor')

            setShowEditVoterModal(false)
            setEditingVoter(null)
            loadVoters()
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const filteredVoters = voters.filter(v => {
        const query = searchQuery.toLowerCase()
        const cleanCpfQuery = query.replace(/\D/g, '')
        return v.name.toLowerCase().includes(query) || v.cpf.includes(query) || (cleanCpfQuery.length > 0 && v.cpf.replace(/\D/g, '').includes(cleanCpfQuery))
    })

    return (
        <div className="admin-container">
            <div className="admin-header">
                <div>
                    <h1>Painel Administrativo</h1>
                    <p>Gestão de Assembleias e Eleitores</p>
                </div>
                <div className="tab-buttons">
                    <button
                        className={`tab-btn ${activeTab === 'assemblies' ? 'active' : ''}`}
                        onClick={() => setActiveTab('assemblies')}
                    >
                        📅 Assembleias
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'voters' ? 'active' : ''}`}
                        onClick={() => setActiveTab('voters')}
                    >
                        👥 Eleitores
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
                        onClick={() => setActiveTab('settings')}
                    >
                        ⚙️ Configurações
                    </button>
                </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            {activeTab === 'assemblies' && (
                <div className="assemblies-section">
                    <button className="btn btn-primary mb-4" onClick={() => setShowAssemblyModal(true)}>
                        + Nova Assembleia
                    </button>

                    <div className="items-grid">
                        {assemblies.map(assembly => (
                            <div key={assembly.id} className="item-card">
                                <div className="item-header">
                                    <h3>{assembly.title}</h3>
                                    <span className={`status-badge status-${assembly.status.toLowerCase()}`}>
                                        {assembly.status}
                                    </span>
                                </div>
                                <p className="item-description">{assembly.description}</p>
                                <div className="item-stats">
                                    <span>📅 {new Date(assembly.startTime).toLocaleDateString()}</span>
                                    <span>📋 {assembly._count.items} itens</span>
                                </div>
                                <div className="item-actions">
                                    <Link href={`/admin/assemblies/${assembly.id}`} className="btn btn-primary btn-sm">
                                        Gerenciar Itens
                                    </Link>
                                    <button
                                        className="btn btn-outline btn-danger"
                                        onClick={() => deleteAssembly(assembly.id)}
                                    >
                                        Excluir
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            {activeTab === 'voters' && (
                <div className="voters-section">
                    <div className="voters-header-actions mb-4" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button className="btn btn-primary" onClick={() => setShowVoterModal(true)}>
                                + Novo Eleitor
                            </button>
                            <button className="btn btn-outline" onClick={() => setShowImportModal(true)}>
                                📥 Importar Lista (CSV)
                            </button>
                            <button className="btn btn-outline" onClick={() => window.open('/admin/relatorios/eleitores', '_blank')}>
                                🖨️ Imprimir Lista (PDF)
                            </button>
                        </div>
                        <div style={{ minWidth: '250px', flexGrow: 1, maxWidth: '400px' }}>
                            <input
                                type="text"
                                placeholder="Buscar por Nome ou CPF..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                style={{
                                    width: '100%', padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-main)'
                                }}
                            />
                        </div>
                    </div>

                    <div className="table-responsive">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Nome</th>
                                    <th>CPF</th>
                                    <th>Data Nasc.</th>
                                    <th>Tipo</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredVoters.map(voter => (
                                    <tr key={voter.id}>
                                        <td>{voter.name}</td>
                                        <td>{voter.cpf}</td>
                                        <td>{new Date(voter.birthDate).toLocaleDateString('pt-BR')}</td>
                                        <td>
                                            {voter.hasRestrictions ? (
                                                <span className="status-badge status-open" style={{ borderColor: '#ef4444', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }}>Diretoria</span>
                                            ) : (
                                                <span className="text-gray-500 text-sm">Membro</span>
                                            )}
                                        </td>
                                        <td>
                                            <button
                                                className="btn-icon"
                                                title="Editar Eleitor"
                                                onClick={() => openEditVoter(voter)}
                                                style={{ marginRight: '0.5rem' }}
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                className="btn-icon danger"
                                                title="Excluir Eleitor"
                                                onClick={() => deleteVoter(voter.id)}
                                            >
                                                🗑️
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'settings' && (
                <div className="settings-section">
                    <div className="item-card" style={{ maxWidth: '600px' }}>
                        <div className="item-header">
                            <h3>Autenticação em Duas Etapas (2FA)</h3>
                        </div>
                        <p className="item-description" style={{ marginBottom: '1.5rem' }}>
                            Se desabilitado, os eleitores e administradores poderão acessar o sistema
                            fornecendo apenas CPF e Data de Nascimento, pulando a digitação do Token de 6 dígitos.
                        </p>
                        
                        <div className="form-group checkbox-group" style={{ marginBottom: '2rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', fontSize: '1.1rem' }}>
                                <input
                                    type="checkbox"
                                    checked={require2FA}
                                    onChange={e => setRequire2FA(e.target.checked)}
                                    style={{ width: '20px', height: '20px' }}
                                />
                                <strong>Exigir Código de Segurança (2FA) no Login</strong>
                            </label>
                        </div>

                        <button 
                            className="btn btn-primary" 
                            onClick={saveSettings}
                            disabled={loading}
                        >
                            {loading ? 'Salvando...' : 'Salvar Configurações'}
                        </button>
                    </div>
                </div>
            )}

            {/* Assembly Modal */}
            {showAssemblyModal && (
                <div className="modal-overlay" onClick={() => setShowAssemblyModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h2>Nova Assembleia</h2>
                        <form onSubmit={createAssembly}>
                            <div className="form-group">
                                <label>Título *</label>
                                <input
                                    value={newAssembly.title}
                                    onChange={e => setNewAssembly({ ...newAssembly, title: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Descrição</label>
                                <textarea
                                    value={newAssembly.description}
                                    onChange={e => setNewAssembly({ ...newAssembly, description: e.target.value })}
                                />
                            </div>
                            <div className="row">
                                <div className="form-group col">
                                    <label>Início</label>
                                    <input
                                        type="datetime-local"
                                        value={newAssembly.startTime}
                                        onChange={e => setNewAssembly({ ...newAssembly, startTime: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group col">
                                    <label>Fim</label>
                                    <input
                                        type="datetime-local"
                                        value={newAssembly.endTime}
                                        onChange={e => setNewAssembly({ ...newAssembly, endTime: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-outline" onClick={() => setShowAssemblyModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Salvar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Voter Modal */}
            {showVoterModal && (
                <div className="modal-overlay" onClick={() => setShowVoterModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h2>Novo Eleitor</h2>
                        <form onSubmit={createVoter}>
                            <div className="form-group">
                                <label>Nome Completo</label>
                                <input
                                    value={newVoter.name}
                                    onChange={e => setNewVoter({ ...newVoter, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>CPF</label>
                                <input
                                    value={newVoter.cpf}
                                    onChange={e => setNewVoter({ ...newVoter, cpf: e.target.value })}
                                    placeholder="000.000.000-00"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Data de Nascimento</label>
                                <input
                                    type="date"
                                    value={newVoter.birthDate}
                                    onChange={e => setNewVoter({ ...newVoter, birthDate: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group checkbox-group" style={{ marginTop: '1rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={newVoter.hasRestrictions}
                                        onChange={e => setNewVoter({ ...newVoter, hasRestrictions: e.target.checked })}
                                    />
                                    Membro da Diretoria (Voto Restrito)
                                </label>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-outline" onClick={() => setShowVoterModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Voter Modal */}
            {showEditVoterModal && editingVoter && (
                <div className="modal-overlay" onClick={() => setShowEditVoterModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h2>Editar Eleitor</h2>
                        <form onSubmit={saveEditVoter}>
                            <div className="form-group">
                                <label>Nome Completo</label>
                                <input
                                    value={editFormData.name}
                                    onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>CPF</label>
                                <input
                                    value={editFormData.cpf}
                                    onChange={e => setEditFormData({ ...editFormData, cpf: e.target.value })}
                                    placeholder="000.000.000-00"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Senha (Data de Nascimento)</label>
                                <input
                                    type="date"
                                    value={editFormData.birthDate}
                                    onChange={e => setEditFormData({ ...editFormData, birthDate: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group checkbox-group" style={{ marginTop: '1rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={editFormData.hasRestrictions}
                                        onChange={e => setEditFormData({ ...editFormData, hasRestrictions: e.target.checked })}
                                    />
                                    Membro da Diretoria (Voto Restrito)
                                </label>
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn btn-outline" onClick={() => setShowEditVoterModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Salvando...' : 'Salvar Alterações'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Import Modal */}
            {showImportModal && (
                <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
                    <div className="modal-content large" onClick={e => e.stopPropagation()}>
                        <h2>Importar Eleitores</h2>
                        <p className="text-sm text-gray mb-4">
                            Cole os dados no formato CSV (separado por vírgula ou ponto-e-vírgula):<br />
                            <code>Nome, CPF, Data de Nascimento, Telefone, Membro Diretoria (Sim/Não)</code>
                        </p>

                        <textarea
                            className="import-area"
                            rows={10}
                            placeholder={`João Silva, 123.456.789-00, 1990-01-01, 1199999999, Não\nMaria Santos; 222.333.444-55; 1985-05-20; 1188888888; Sim`}
                            value={importText}
                            onChange={e => setImportText(e.target.value)}
                        />

                        {importStatus && (
                            <div className="import-status mt-4 p-4 bg-gray-100 rounded">
                                <pre>{importStatus}</pre>
                            </div>
                        )}

                        <div className="modal-actions mt-4">
                            <button type="button" className="btn btn-outline" onClick={() => setShowImportModal(false)}>Fechar</button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleImport}
                                disabled={loading || !importText.trim()}
                            >
                                {loading ? 'Processando...' : 'Processar Importação'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
