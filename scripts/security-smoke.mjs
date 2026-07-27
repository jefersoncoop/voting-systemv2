import assert from 'node:assert/strict'

const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3100'

async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, options)
    const text = await response.text()
    const data = text ? JSON.parse(text) : null
    return { response, data }
}

async function login(cpf, birthDate) {
    const step1 = await request('/api/auth/login/step1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf, birthDate })
    })
    assert.equal(step1.response.status, 200)
    assert.equal(typeof step1.data.challenge, 'string')
    assert.match(step1.data.developmentCode, /^\d{6}$/)

    const step2 = await request('/api/auth/login/step2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge: step1.data.challenge, code: step1.data.developmentCode })
    })
    assert.equal(step2.response.status, 200)
    const cookie = step2.response.headers.get('set-cookie')?.split(';')[0]
    assert.ok(cookie?.startsWith('session='))
    return { cookie, challenge: step1.data.challenge, code: step1.data.developmentCode }
}

const admin = await login('00000000000', '1980-01-01')
const voter = await login('11111111111', '1990-05-15')
const secondVoter = await login('22222222222', '1985-10-20')

const assemblies = await request('/api/assembly', { headers: { Cookie: voter.cookie } })
assert.equal(assemblies.response.status, 200)
const assembly = assemblies.data.assemblies.find(item => item.status === 'OPEN')
assert.ok(assembly)

const electorate = await request(`/api/assembly/${assembly.id}/electors`, { headers: { Cookie: admin.cookie } })
assert.equal(electorate.response.status, 200)
assert.equal(electorate.data.electors.length, 2)
const firstVoter = electorate.data.electors.find(item => item.cpf === '11111111111')
assert.ok(firstVoter)

const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
const dayAfterTomorrow = new Date(Date.now() + 48 * 60 * 60 * 1000)
const isolatedAssembly = await request('/api/assembly', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: admin.cookie },
    body: JSON.stringify({
        title: 'Assembleia com eleitorado isolado',
        startTime: tomorrow.toISOString(),
        endTime: dayAfterTomorrow.toISOString()
    })
})
assert.equal(isolatedAssembly.response.status, 201)

const assignElector = await request(`/api/assembly/${isolatedAssembly.data.assembly.id}/electors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: admin.cookie },
    body: JSON.stringify({ userIds: [firstVoter.id] })
})
assert.equal(assignElector.response.status, 200)

const bulkImport = await request('/api/users/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: admin.cookie },
    body: JSON.stringify({
        assemblyId: isolatedAssembly.data.assembly.id,
        users: [{ name: 'Eleitora Importada', cpf: '52998224725', birthDate: '1990-05-20' }]
    })
})
assert.equal(bulkImport.response.status, 200)
assert.equal(bulkImport.data.created, 1)
assert.equal(bulkImport.data.assigned, 1)

const importedVoter = await login('52998224725', '1990-05-20')
const importedVoterAssemblies = await request('/api/assembly', { headers: { Cookie: importedVoter.cookie } })
assert.ok(importedVoterAssemblies.data.assemblies.some(item => item.id === isolatedAssembly.data.assembly.id))

const firstVoterAssemblies = await request('/api/assembly', { headers: { Cookie: voter.cookie } })
const secondVoterAssemblies = await request('/api/assembly', { headers: { Cookie: secondVoter.cookie } })
assert.ok(firstVoterAssemblies.data.assemblies.some(item => item.id === isolatedAssembly.data.assembly.id))
assert.ok(!secondVoterAssemblies.data.assemblies.some(item => item.id === isolatedAssembly.data.assembly.id))

const forbiddenAssembly = await request(`/api/assembly/${isolatedAssembly.data.assembly.id}`, {
    headers: { Cookie: secondVoter.cookie }
})
assert.equal(forbiddenAssembly.response.status, 403)

const detail = await request(`/api/assembly/${assembly.id}`, { headers: { Cookie: voter.cookie } })
assert.equal(detail.response.status, 200)
const agendaItem = detail.data.assembly.items[0]
assert.ok(agendaItem)

const vote = await request('/api/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: voter.cookie },
    body: JSON.stringify({ agendaItemId: agendaItem.id, choice: 'APPROVE' })
})
assert.equal(vote.response.status, 201)
assert.match(vote.data.protocol, /^[A-F0-9]{4}(-[A-F0-9]{4}){3}$/)

const duplicateVote = await request('/api/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: voter.cookie },
    body: JSON.stringify({ agendaItemId: agendaItem.id, choice: 'REJECT' })
})
assert.equal(duplicateVote.response.status, 409)

const hiddenResults = await request(`/api/results?assemblyId=${assembly.id}`, { headers: { Cookie: voter.cookie } })
assert.equal(hiddenResults.response.status, 403)

const adminResults = await request(`/api/results?assemblyId=${assembly.id}`, { headers: { Cookie: admin.cookie } })
assert.equal(adminResults.response.status, 200)

const protectedDelete = await request(`/api/agenda/${agendaItem.id}`, {
    method: 'DELETE',
    headers: { Cookie: admin.cookie }
})
assert.equal(protectedDelete.response.status, 409)

const question = await request(`/api/assembly/${assembly.id}/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: voter.cookie },
    body: JSON.stringify({ municipality: 'Fortaleza', content: 'Pergunta de validação do fluxo.' })
})
assert.equal(question.response.status, 201)

const reusedChallenge = await request('/api/auth/login/step2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge: voter.challenge, code: voter.code })
})
assert.equal(reusedChallenge.response.status, 401)

const logout = await request('/api/auth/logout', { method: 'POST', headers: { Cookie: voter.cookie } })
assert.equal(logout.response.status, 200)
const revokedSession = await request('/api/user/me', { headers: { Cookie: voter.cookie } })
assert.equal(revokedSession.response.status, 401)

console.log('Security smoke test passed')
