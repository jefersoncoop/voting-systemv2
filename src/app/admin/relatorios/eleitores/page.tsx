'use client'

import { useEffect, useState } from 'react'

interface User {
    id: string
    name: string
    cpf: string
    birthDate: string
    hasRestrictions: boolean
}

export default function VotersReportPage() {
    const [voters, setVoters] = useState<User[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchVoters = async () => {
            try {
                const res = await fetch('/api/users')
                const data = await res.json()
                if (data.users) {
                    setVoters(data.users)
                }
            } catch (err) {
                console.error(err)
            } finally {
                setLoading(false)
                // Trigger print dialog after a short delay to ensure render
                setTimeout(() => {
                    window.print()
                }, 800)
            }
        }
        fetchVoters()
    }, [])

    if (loading) {
        return <div style={{ padding: '2rem', textAlign: 'center' }}>Gerando relatório...</div>
    }

    return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '1000px', margin: '0 auto', background: 'white', minHeight: '100vh', color: 'black' }}>
            <style dangerouslySetInnerHTML={{__html: `
                @media print {
                    @page { margin: 1.5cm; }
                    body { background: white; color: black; }
                    .no-print { display: none !important; }
                }
                body { background: #f0f0f0; } /* For web view */
                table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 14px; }
                th, td { border: 1px solid #ddd; padding: 10px 8px; text-align: left; }
                th { background-color: #f4f4f4; font-weight: bold; }
                tr:nth-child(even) { background-color: #fafafa; }
                h1 { font-size: 24px; margin-bottom: 0.5rem; text-transform: uppercase; }
                .meta { color: #555; font-size: 13px; margin-bottom: 2rem; border-bottom: 2px solid #ccc; padding-bottom: 1rem; }
            `}} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>Relatório de Eleitores</h1>
                <button 
                    className="no-print" 
                    onClick={() => window.print()}
                    style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                    🖨️ Imprimir / Salvar PDF
                </button>
            </div>
            
            <div className="meta">
                <strong>Data de Geração:</strong> {new Date().toLocaleString('pt-BR')} <br/>
                <strong>Total de Eleitores:</strong> {voters.length}
            </div>

            <table>
                <thead>
                    <tr>
                        <th style={{ width: '40%' }}>Nome Completo</th>
                        <th style={{ width: '25%' }}>CPF</th>
                        <th style={{ width: '20%' }}>Data de Nascimento</th>
                        <th style={{ width: '15%' }}>Perfil</th>
                    </tr>
                </thead>
                <tbody>
                    {voters.map(v => {
                        // Safe formatting for CPF if it's 11 digits
                        let formattedCpf = v.cpf
                        if (formattedCpf.length === 11) {
                            formattedCpf = formattedCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
                        }

                        return (
                            <tr key={v.id}>
                                <td>{v.name}</td>
                                <td>{formattedCpf}</td>
                                <td>{new Date(v.birthDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
                                <td>
                                    {v.hasRestrictions ? (
                                        <span style={{ color: '#dc2626', fontWeight: 'bold' }}>Diretoria</span>
                                    ) : (
                                        <span style={{ color: '#4b5563' }}>Membro</span>
                                    )}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
