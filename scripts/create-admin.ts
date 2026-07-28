import 'dotenv/config'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { PrismaClient } from '@prisma/client'
import { isValidCpf, normalizePhone, parseDateOnly } from '../src/lib/identity'

const prisma = new PrismaClient()

function requiredValue(value: string | undefined, label: string) {
    const normalized = value?.trim()
    if (!normalized) throw new Error(`${label} é obrigatório`)
    return normalized
}

function parseBoolean(value: string | undefined, fallback = false) {
    if (!value?.trim()) return fallback
    const normalized = value.trim().toLowerCase()
    if (['1', 'true', 'sim', 's', 'yes', 'y'].includes(normalized)) return true
    if (['0', 'false', 'não', 'nao', 'n', 'no'].includes(normalized)) return false
    throw new Error(`Valor booleano inválido: ${value}`)
}

function maskCpf(cpf: string) {
    return `***.***.***-${cpf.slice(-2)}`
}

async function collectAdminInput() {
    const interactive = stdin.isTTY && stdout.isTTY
    const prompt = interactive ? createInterface({ input: stdin, output: stdout }) : null

    try {
        const ask = async (current: string | undefined, question: string) => {
            if (current?.trim()) return current.trim()
            if (!prompt) throw new Error(`${question} não informado no ambiente não interativo`)
            return (await prompt.question(`${question}: `)).trim()
        }

        const name = requiredValue(await ask(process.env.ADMIN_NAME, 'Nome completo do administrador'), 'Nome')
        const cpf = (await ask(process.env.ADMIN_CPF, 'CPF válido do administrador')).replace(/\D/g, '')
        if (!isValidCpf(cpf)) throw new Error('CPF do administrador é inválido')

        const birthDateInput = await ask(process.env.ADMIN_BIRTH_DATE, 'Data de nascimento (DD/MM/AAAA)')
        const birthDate = parseDateOnly(birthDateInput)
        if (!birthDate) throw new Error('Data de nascimento inválida')

        const phoneInput = process.env.ADMIN_PHONE?.trim()
            || (prompt ? (await prompt.question('WhatsApp com +55 (opcional): ')).trim() : '')
        const phone = normalizePhone(phoneInput)
        if (phone === undefined) throw new Error('WhatsApp inválido. Use código do país e DDD.')

        const require2FAInput = process.env.ADMIN_REQUIRE_2FA
            ?? (prompt ? await prompt.question('Ativar 2FA agora? [s/N]: ') : 'false')
        const require2FA = parseBoolean(require2FAInput, false)
        if (require2FA && !phone) throw new Error('WhatsApp é obrigatório quando o 2FA está ativo')
        if (require2FA && (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_WHATSAPP_FROM)) {
            throw new Error('Configure as três variáveis TWILIO antes de ativar o 2FA')
        }

        return { name, cpf, birthDate, phone, require2FA }
    } finally {
        prompt?.close()
    }
}

async function main() {
    const existingAdmin = await prisma.user.findFirst({
        where: { isAdmin: true },
        select: { id: true, name: true, cpf: true }
    })
    if (existingAdmin) {
        console.log(`Administrador já existe: ${existingAdmin.name} (${maskCpf(existingAdmin.cpf)}). Nenhuma alteração realizada.`)
        return
    }

    const input = await collectAdminInput()
    const conflictingUser = await prisma.user.findUnique({ where: { cpf: input.cpf }, select: { id: true } })
    if (conflictingUser) throw new Error('Já existe um usuário com o CPF informado')

    const admin = await prisma.$transaction(async tx => {
        const created = await tx.user.create({
            data: {
                name: input.name,
                cpf: input.cpf,
                birthDate: input.birthDate,
                phone: input.phone,
                isAdmin: true,
                hasRestrictions: false
            },
            select: { id: true, name: true, cpf: true }
        })
        await tx.systemSettings.upsert({
            where: { id: 'global' },
            create: { id: 'global', require2FA: input.require2FA },
            update: { require2FA: input.require2FA }
        })
        await tx.auditEvent.create({
            data: {
                type: 'ADMIN_BOOTSTRAPPED',
                actorUserId: created.id,
                targetId: created.id,
                metadata: JSON.stringify({ require2FA: input.require2FA })
            }
        })
        return created
    })

    console.log(`Administrador criado: ${admin.name} (${maskCpf(admin.cpf)}).`)
    console.log(`2FA inicial: ${input.require2FA ? 'ativado' : 'desativado'}.`)
}

main()
    .catch(error => {
        console.error(`Falha ao criar administrador: ${error instanceof Error ? error.message : 'erro desconhecido'}`)
        process.exitCode = 1
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
