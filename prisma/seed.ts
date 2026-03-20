import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Clean up existing
  await prisma.vote.deleteMany()
  await prisma.agendaItem.deleteMany()
  await prisma.assembly.deleteMany()
  await prisma.user.deleteMany()

  // Create Admin
  const admin = await prisma.user.create({
    data: {
      name: 'Admin User',
      cpf: '00000000000',
      birthDate: new Date('1980-01-01'),
      isAdmin: true,
    },
  })
  console.log({ admin })

  // Create Voters
  const voter1 = await prisma.user.create({
    data: {
      name: 'João Silva',
      cpf: '11111111111',
      birthDate: new Date('1990-05-15'),
      isAdmin: false,
    },
  })
  console.log({ voter1 })

  const voter2 = await prisma.user.create({
    data: {
      name: 'Maria Santos',
      cpf: '22222222222',
      birthDate: new Date('1985-10-20'),
      isAdmin: false,
    },
  })
  console.log({ voter2 })

  // Create Sample Assembly
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const assembly = await prisma.assembly.create({
    data: {
      title: 'AGO 2026',
      description: 'Assembleia Geral Ordinária de 2026',
      status: 'OPEN', // Set specifically to OPEN for testing
      startTime: now,
      endTime: tomorrow,
      items: {
        create: [
          {
            title: 'Aprovação do Orçamento 2026',
            description: 'Proposta de orçamento para o próximo ano fiscal',
            order: 1
          },
          {
            title: 'Eleição da Nova Diretoria',
            description: 'Eleição dos membros da diretoria para o biênio 2026-2028',
            order: 2
          },
          {
            title: 'Alteração do Estatuto Social',
            description: 'Proposta de mudanças no estatuto da empresa',
            order: 3
          }
        ]
      }
    },
    include: {
      items: true
    }
  })
  console.log({ assembly })

  console.log('Seeding finished.')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
