export function isValidCpf(cpf: string) {
    const digits = cpf.replace(/\D/g, '')
    if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false

    const calculateDigit = (length: number) => {
        let sum = 0
        for (let index = 0; index < length; index++) {
            sum += Number(digits[index]) * (length + 1 - index)
        }
        const remainder = (sum * 10) % 11
        return remainder === 10 ? 0 : remainder
    }

    return calculateDigit(9) === Number(digits[9]) && calculateDigit(10) === Number(digits[10])
}

export function normalizePhone(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return null
    const normalized = `+${value.replace(/\D/g, '')}`
    return /^\+\d{10,15}$/.test(normalized) ? normalized : undefined
}

export function parseDateOnly(value: unknown) {
    if (typeof value !== 'string') return null

    const input = value.trim()
    const brazilianDate = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input)
    const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input)

    const year = Number(brazilianDate?.[3] ?? isoDate?.[1])
    const month = Number(brazilianDate?.[2] ?? isoDate?.[2])
    const day = Number(brazilianDate?.[1] ?? isoDate?.[3])

    if (!year || !month || !day) return null

    const date = new Date(Date.UTC(year, month - 1, day))
    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
    ) {
        return null
    }

    return date
}
