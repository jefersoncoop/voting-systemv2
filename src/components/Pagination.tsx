'use client'

interface PaginationProps {
    currentPage: number
    pageSize: number
    totalItems: number
    onPageChange: (page: number) => void
}

export default function Pagination({ currentPage, pageSize, totalItems, onPageChange }: PaginationProps) {
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

    if (totalItems <= pageSize) return null

    const safePage = Math.min(Math.max(currentPage, 1), totalPages)
    const firstItem = (safePage - 1) * pageSize + 1
    const lastItem = Math.min(safePage * pageSize, totalItems)
    const firstPageButton = Math.max(1, Math.min(safePage - 2, totalPages - 4))
    const visiblePages = Array.from(
        { length: Math.min(5, totalPages) },
        (_, index) => firstPageButton + index
    )

    return (
        <nav className="pagination" aria-label="Paginação da lista de eleitores">
            <span className="pagination-summary">
                Exibindo {firstItem}–{lastItem} de {totalItems}
            </span>
            <div className="pagination-controls">
                <button
                    type="button"
                    className="pagination-button pagination-nav"
                    onClick={() => onPageChange(safePage - 1)}
                    disabled={safePage === 1}
                >
                    Anterior
                </button>
                {visiblePages.map(page => (
                    <button
                        key={page}
                        type="button"
                        className={`pagination-button ${page === safePage ? 'active' : ''}`}
                        onClick={() => onPageChange(page)}
                        aria-current={page === safePage ? 'page' : undefined}
                        aria-label={`Página ${page}`}
                    >
                        {page}
                    </button>
                ))}
                <button
                    type="button"
                    className="pagination-button pagination-nav"
                    onClick={() => onPageChange(safePage + 1)}
                    disabled={safePage === totalPages}
                >
                    Próxima
                </button>
            </div>
        </nav>
    )
}
