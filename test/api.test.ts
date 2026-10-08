import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createTestServer, readJson, TEST_PASSPHRASE } from './testHelpers'
import type { ProtocolDocument, Session, Tag, VaultStatus } from '../shared/model'

type TagWithUsage = Tag & { usageCount: number }

const UNKNOWN_TAG_ID = '00000000-0000-4000-8000-000000000000'

async function setUpServer() {
  const server = createTestServer()
  const setupResponse = await server.request('POST', '/api/setup', {
    setupToken: server.setupToken,
    passphrase: TEST_PASSPHRASE,
  })
  assert.equal(setupResponse.status, 200)
  const { recoveryCode } = await readJson<{ recoveryCode: string }>(setupResponse)
  return { server, recoveryCode }
}

async function tagIds(server: ReturnType<typeof createTestServer>) {
  const seededTags = await readJson<TagWithUsage[]>(await server.request('GET', '/api/tags'))
  const tagIdByName = new Map(seededTags.map((tag) => [tag.name, tag.id]))
  return {
    seededTags,
    mountain: tagIdByName.get('Mountain')!,
    ooh: tagIdByName.get('Ooh')!,
    breathSupport: tagIdByName.get('Breath support')!,
  }
}

function sessionInput(glideTagIds: string[], focusTagIds: string[] = []) {
  return {
    occurredAt: new Date().toISOString(),
    status: 'complete' as const,
    role: 'warmup' as const,
    effortBefore: 55,
    effortAfter: 35,
    focusTagIds,
    winTagIds: [],
    watchTagIds: [],
    slpNote: 'The warm-up felt easier than last week.',
    segments: [
      {
        kind: 'warmupNote' as const,
        seconds: 60,
        repetitions: 3,
        clarityRating: 80,
        voiceBreaks: 1,
        glidePace: null,
        registerShifts: null,
        startNote: '',
        topNote: '',
        bottomNote: '',
        notesClimbed: null,
        longestSustainSeconds: null,
        identifiedComfortableRange: false,
        phaseNumber: null,
        coordinationRating: null,
        stretchAndFlow: null,
        paceRating: null,
        fatigueRating: null,
        tagIds: [],
        notes: '',
      },
      {
        kind: 'glides' as const,
        seconds: 420,
        repetitions: null,
        clarityRating: null,
        voiceBreaks: null,
        glidePace: 'slow' as const,
        registerShifts: 4,
        startNote: '',
        topNote: '',
        bottomNote: '',
        notesClimbed: null,
        longestSustainSeconds: null,
        identifiedComfortableRange: false,
        phaseNumber: null,
        coordinationRating: null,
        stretchAndFlow: null,
        paceRating: null,
        fatigueRating: null,
        tagIds: glideTagIds,
        notes: 'Mostly slow mountains.',
      },
    ],
  }
}

describe('status and setup', () => {
  it('reports an uninitialized, locked log on a fresh instance', async () => {
    const response = await createTestServer().request('GET', '/api/status')
    const status = await readJson<VaultStatus>(response)
    assert.equal(response.status, 200)
    assert.equal(status.vaultInitialized, false)
    assert.equal(status.unlocked, false)
    assert.equal(status.totpEnabled, false)
  })

  it('refuses the wrong setup token without creating anything', async () => {
    const server = createTestServer()
    const response = await server.request('POST', '/api/setup', {
      setupToken: 'not-the-token',
      passphrase: TEST_PASSPHRASE,
    })
    assert.equal(response.status, 401)
    assert.equal(server.vault.isInitialized(), false)
  })

  it('refuses a passphrase under twelve characters', async () => {
    const server = createTestServer()
    const response = await server.request('POST', '/api/setup', { setupToken: server.setupToken, passphrase: 'short' })
    assert.equal(response.status, 400)
    assert.equal(server.vault.isInitialized(), false)
  })

  it('creates the log, unlocks it, and hands back a grouped recovery code', async () => {
    const server = createTestServer()
    const response = await server.request('POST', '/api/setup', {
      setupToken: server.setupToken,
      passphrase: TEST_PASSPHRASE,
    })
    const { recoveryCode } = await readJson<{ recoveryCode: string }>(response)
    assert.match(recoveryCode, /^[A-Z2-7]{4}(-[A-Z2-7]{4}){7}$/)

    const status = await readJson<VaultStatus>(await server.request('GET', '/api/status'))
    assert.equal(status.vaultInitialized, true)
    assert.equal(status.unlocked, true)
  })

  it('refuses to set up twice', async () => {
    const { server } = await setUpServer()
    const response = await server.request('POST', '/api/setup', {
      setupToken: server.setupToken,
      passphrase: 'another-long-passphrase',
    })
    assert.equal(response.status, 409)
  })
})

describe('request guards', () => {
  it('requires the custom header on state-changing requests', async () => {
    const { server } = await setUpServer()
    const response = await server.request(
      'POST',
      '/api/tags',
      { kind: 'focus', name: 'Nope', archived: false },
      { 'x-resonate-request': '0' },
    )
    assert.equal(response.status, 403)
  })

  it('refuses a cross-origin state-changing request', async () => {
    const { server } = await setUpServer()
    const response = await server.request(
      'POST',
      '/api/tags',
      { kind: 'focus', name: 'Nope', archived: false },
      { origin: 'https://elsewhere.example' },
    )
    assert.equal(response.status, 403)
  })

  it('accepts a same-origin request', async () => {
    const { server } = await setUpServer()
    const response = await server.request(
      'POST',
      '/api/tags',
      { kind: 'focus', name: 'Resonance practice', archived: false },
      { origin: 'http://localhost' },
    )
    assert.equal(response.status, 201)
  })

  it('keeps API responses out of every cache', async () => {
    const { server } = await setUpServer()
    assert.equal((await server.request('GET', '/api/status')).headers.get('cache-control'), 'no-store')
  })

  it('refuses the API without an unlocked session', async () => {
    const server = createTestServer()
    const response = await server.request('GET', '/api/sessions')
    assert.equal(response.status, 401)
    assert.equal((await readJson<{ error: string }>(response)).error, 'locked')
  })
})

describe('tags', () => {
  it('seeds the vocabulary from the plan', async () => {
    const { server } = await setUpServer()
    const { seededTags } = await tagIds(server)
    const names = seededTags.map((tag) => tag.name)
    for (const expected of ['Breath support', 'Clear vibration', 'Voice breaks', 'Mountain', 'Ole', 'Cozy novel']) {
      assert.ok(names.includes(expected), `expected the seeded tags to include ${expected}`)
    }
    assert.ok(seededTags.every((tag) => tag.usageCount === 0))
  })

  it('counts how many sessions each tag is on', async () => {
    const { server } = await setUpServer()
    const { mountain, ooh, breathSupport } = await tagIds(server)
    await server.request('POST', '/api/sessions', sessionInput([mountain, ooh], [breathSupport]))

    const tags = await readJson<TagWithUsage[]>(await server.request('GET', '/api/tags'))
    const usageByName = new Map(tags.map((tag) => [tag.name, tag.usageCount]))
    assert.equal(usageByName.get('Mountain'), 1)
    assert.equal(usageByName.get('Ooh'), 1)
    assert.equal(usageByName.get('Breath support'), 1)
    assert.equal(usageByName.get('Voice breaks'), 0)
  })

  it('refuses to delete a tag that is on a session, and allows archiving it', async () => {
    const { server } = await setUpServer()
    const { mountain } = await tagIds(server)
    await server.request('POST', '/api/sessions', sessionInput([mountain]))

    const deleteResponse = await server.request('DELETE', `/api/tags/${mountain}`)
    assert.equal(deleteResponse.status, 409)

    const archiveResponse = await server.request('PUT', `/api/tags/${mountain}`, {
      kind: 'glideShape',
      name: 'Mountain',
      archived: true,
    })
    assert.equal(archiveResponse.status, 200)
    assert.equal((await readJson<Tag>(archiveResponse)).archived, true)
  })

  it('deletes a tag nothing references', async () => {
    const { server } = await setUpServer()
    const created = await readJson<Tag>(
      await server.request('POST', '/api/tags', { kind: 'focus', name: 'Unused idea', archived: false }),
    )
    assert.equal((await server.request('DELETE', `/api/tags/${created.id}`)).status, 200)
  })
})

describe('sessions', () => {
  it('stores a session and returns its parts in protocol order', async () => {
    const { server } = await setUpServer()
    const { mountain, ooh } = await tagIds(server)
    const response = await server.request('POST', '/api/sessions', sessionInput([mountain, ooh], []))
    assert.equal(response.status, 201)
    const created = await readJson<Session>(response)
    assert.equal(created.segments.length, 2)
    assert.equal(created.segments[0]!.kind, 'warmupNote')
    assert.equal(created.segments[1]!.kind, 'glides')
    assert.equal(created.segments[1]!.glidePace, 'slow')
    assert.equal(created.createdAt, created.updatedAt)
  })

  it('rejects a session that references a tag which does not exist', async () => {
    const { server } = await setUpServer()
    const response = await server.request('POST', '/api/sessions', sessionInput([UNKNOWN_TAG_ID]))
    assert.equal(response.status, 400)
    assert.equal((await readJson<{ error: string }>(response)).error, 'invalid_request')
  })

  it('rejects a session with a glide pace outside the known set', async () => {
    const { server } = await setUpServer()
    const payload = sessionInput([])
      ; (payload.segments[1] as { glidePace: string | null }).glidePace = 'glacial'
    assert.equal((await server.request('POST', '/api/sessions', payload)).status, 400)
  })

  it('round-trips a Stretch and Flow detail object', async () => {
    const { server } = await setUpServer()
    const payload = sessionInput([]) as unknown as { segments: Record<string, unknown>[] }
    payload.segments[1] = {
      ...payload.segments[1],
      kind: 'stretchAndFlow',
      phaseNumber: 1,
      stretchAndFlow: {
        stageId: 'phase1',
        ratio: 'twentyEighty',
        usedTissue: true,
        steps: [{ stepId: 'oneNumber', completed: true, breathCount: 10 }],
        cuesChecked: ['elongateVowels'],
        toggledAirOnlyAndVoiced: null,
        carryover: { kind: 'singleWord', itemIds: ['free'], customText: '' },
      },
    }
    const response = await server.request('POST', '/api/sessions', payload)
    assert.equal(response.status, 201)
    const created = await readJson<Session>(response)
    const stretch = created.segments.find((segment) => segment.kind === 'stretchAndFlow')
    assert.ok(stretch)
    assert.equal(stretch.stretchAndFlow?.stageId, 'phase1')
    assert.equal(stretch.stretchAndFlow?.ratio, 'twentyEighty')
    assert.equal(stretch.stretchAndFlow?.steps[0]?.breathCount, 10)
    assert.deepEqual(stretch.stretchAndFlow?.carryover?.itemIds, ['free'])
  })

  it('rejects a Stretch and Flow detail with an unknown ratio', async () => {
    const { server } = await setUpServer()
    const payload = sessionInput([]) as unknown as { segments: Record<string, unknown>[] }
    payload.segments[1] = {
      ...payload.segments[1],
      kind: 'stretchAndFlow',
      stretchAndFlow: {
        stageId: 'phase1',
        ratio: 'seventyThirty',
        usedTissue: null,
        steps: [],
        cuesChecked: [],
        toggledAirOnlyAndVoiced: null,
        carryover: null,
      },
    }
    assert.equal((await server.request('POST', '/api/sessions', payload)).status, 400)
  })

  it('accepts a legacy segment with the stretchAndFlow key absent and normalizes it to null', async () => {
    const { server } = await setUpServer()
    const payload = sessionInput([]) as unknown as { segments: Record<string, unknown>[] }
    const legacySegment = { ...payload.segments[1] }
    delete legacySegment.stretchAndFlow
    payload.segments[1] = legacySegment
    const response = await server.request('POST', '/api/sessions', payload)
    assert.equal(response.status, 201)
    const created = await readJson<Session>(response)
    const glides = created.segments.find((segment) => segment.kind === 'glides')
    assert.ok(glides)
    assert.equal(glides.stretchAndFlow, null)
  })

  it('accepts a stored phase number above the canonical set', async () => {
    const { server } = await setUpServer()
    const payload = sessionInput([]) as unknown as { segments: Record<string, unknown>[] }
    payload.segments[1] = {
      ...payload.segments[1],
      kind: 'stretchAndFlow',
      phaseNumber: 7,
      stretchAndFlow: null,
    }
    const response = await server.request('POST', '/api/sessions', payload)
    assert.equal(response.status, 201)
    const created = await readJson<Session>(response)
    const stretch = created.segments.find((segment) => segment.kind === 'stretchAndFlow')
    assert.equal(stretch?.phaseNumber, 7)
  })

  it('lists, updates, and deletes a session', async () => {
    const { server } = await setUpServer()
    const created = await readJson<Session>(await server.request('POST', '/api/sessions', sessionInput([])))

    const listed = await readJson<Session[]>(await server.request('GET', '/api/sessions'))
    assert.equal(listed.length, 1)

    const updateResponse = await server.request('PUT', `/api/sessions/${created.id}`, {
      ...sessionInput([]),
      status: 'draft',
      effortAfter: null,
    })
    assert.equal(updateResponse.status, 200)
    const updated = await readJson<Session>(updateResponse)
    assert.equal(updated.status, 'draft')
    assert.equal(updated.effortAfter, null)
    assert.equal(updated.id, created.id)
    assert.equal(updated.createdAt, created.createdAt)

    assert.equal((await server.request('DELETE', `/api/sessions/${created.id}`)).status, 200)
    assert.equal((await readJson<Session[]>(await server.request('GET', '/api/sessions'))).length, 0)
  })

  it('404s on a session that does not exist', async () => {
    const { server } = await setUpServer()
    assert.equal((await server.request('GET', `/api/sessions/${UNKNOWN_TAG_ID}`)).status, 404)
  })
})

describe('protocol documents', () => {
  it('returns both documents empty before anything is written', async () => {
    const { server } = await setUpServer()
    const documents = await readJson<ProtocolDocument[]>(await server.request('GET', '/api/documents'))
    assert.deepEqual(
      documents.map((document) => document.id),
      ['protocolNotes', 'phasePlan'],
    )
    assert.ok(documents.every((document) => document.text === '' && document.updatedAt === null))
  })

  it('stores a pasted plan and reads it back', async () => {
    const { server } = await setUpServer()
    const text = 'Stretch and Flow - phase 1: coordinating diaphragmatic breathing with phonation.'
    const saveResponse = await server.request('PUT', '/api/documents/protocolNotes', { text })
    assert.equal(saveResponse.status, 200)
    assert.equal((await readJson<ProtocolDocument>(saveResponse)).text, text)

    const documents = await readJson<ProtocolDocument[]>(await server.request('GET', '/api/documents'))
    assert.equal(documents.find((document) => document.id === 'protocolNotes')?.text, text)
  })

  it('refuses an unknown document id', async () => {
    const { server } = await setUpServer()
    assert.equal((await server.request('PUT', '/api/documents/whatever', { text: 'x' })).status, 404)
  })
})

describe('export', () => {
  it('exports CSV with one row per part and a header', async () => {
    const { server } = await setUpServer()
    const { mountain } = await tagIds(server)
    await server.request('POST', '/api/sessions', sessionInput([mountain]))

    const response = await server.request('GET', '/api/export?format=csv')
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') ?? '', /text\/csv/)
    // response.text() strips a leading BOM during UTF-8 decode, so check the raw
    // bytes for it and decode with ignoreBOM to keep it in the text.
    const csvBytes = new Uint8Array(await response.arrayBuffer())
    assert.deepEqual([...csvBytes.slice(0, 3)], [0xef, 0xbb, 0xbf])
    const csvText = new TextDecoder('utf-8', { ignoreBOM: true }).decode(csvBytes)
    assert.ok(csvText.startsWith('\ufeff'))
    assert.ok(csvText.includes('Session ID'))
    assert.ok(csvText.includes('Glides'))
    assert.ok(csvText.includes('Mountain'))
    // Warm-up plus glides is two rows plus the header.
    assert.equal(csvText.trimEnd().split('\r\n').length, 3)
  })

  it('neutralizes a spreadsheet formula in a note', async () => {
    const { server } = await setUpServer()
    await server.request('POST', '/api/sessions', { ...sessionInput([]), slpNote: '=SUM(A1:A9)' })
    const csvText = await (await server.request('GET', '/api/export?format=csv')).text()
    assert.ok(csvText.includes("'=SUM(A1:A9)"))
  })

  it('exports JSON with the sessions and documents together', async () => {
    const { server } = await setUpServer()
    await server.request('POST', '/api/sessions', sessionInput([]))
    const archive = await readJson<{ format: string; sessions: Session[]; documents: ProtocolDocument[]; tags: Tag[] }>(
      await server.request('GET', '/api/export?format=json'),
    )
    assert.equal(archive.format, 'resonate-export')
    assert.equal(archive.sessions.length, 1)
    assert.equal(archive.documents.length, 2)
    assert.ok(archive.tags.length > 20)
  })

  it('records that an export happened, without recording what was in it', async () => {
    const { server } = await setUpServer()
    await server.request('GET', '/api/export?format=json')
    const auditEvents = await readJson<{ event: string; userAgent: string }[]>(await server.request('GET', '/api/audit'))
    assert.ok(auditEvents.some((event) => event.event === 'exported_json'))
    assert.ok(auditEvents.every((event) => !event.event.includes('Mountain')))
  })
})

describe('locking and credentials', () => {
  it('locks on logout and refuses the API afterwards', async () => {
    const { server } = await setUpServer()
    assert.equal((await server.request('POST', '/api/logout')).status, 200)
    const response = await server.request('GET', '/api/sessions')
    assert.equal(response.status, 401)
    assert.equal((await readJson<{ error: string }>(response)).error, 'locked')
  })

  it('refuses the wrong passphrase and accepts the right one', async () => {
    const { server } = await setUpServer()
    await server.request('POST', '/api/logout')
    assert.equal((await server.request('POST', '/api/login', { passphrase: 'definitely-not-it' })).status, 401)
    assert.equal((await server.request('POST', '/api/login', { passphrase: TEST_PASSPHRASE })).status, 200)
    assert.equal((await server.request('GET', '/api/sessions')).status, 200)
  })

  it('changes the passphrase and signs out the other sessions', async () => {
    const { server } = await setUpServer()
    const newPassphrase = 'a-new-long-enough-passphrase'
    const changeResponse = await server.request('POST', '/api/passphrase', {
      currentPassphrase: TEST_PASSPHRASE,
      newPassphrase,
    })
    assert.equal(changeResponse.status, 200)
    // The cookie this client just received is the only live session.
    assert.equal((await server.request('GET', '/api/sessions')).status, 200)

    await server.request('POST', '/api/logout')
    assert.equal((await server.request('POST', '/api/login', { passphrase: TEST_PASSPHRASE })).status, 401)
    assert.equal((await server.request('POST', '/api/login', { passphrase: newPassphrase })).status, 200)
  })

  it('recovers with the recovery code and issues a fresh one', async () => {
    const { server, recoveryCode } = await setUpServer()
    const newPassphrase = 'recovered-long-enough-passphrase'
    const recoverResponse = await server.request('POST', '/api/recover', { recoveryCode, newPassphrase })
    assert.equal(recoverResponse.status, 200)
    const { recoveryCode: replacementCode } = await readJson<{ recoveryCode: string }>(recoverResponse)
    assert.notEqual(replacementCode, recoveryCode)
    assert.match(replacementCode, /^[A-Z2-7]{4}(-[A-Z2-7]{4}){7}$/)

    // The used code is retired.
    await server.request('POST', '/api/logout')
    assert.equal((await server.request('POST', '/api/recover', { recoveryCode, newPassphrase })).status, 401)
    assert.equal((await server.request('POST', '/api/login', { passphrase: newPassphrase })).status, 200)
  })

  it('keeps a session after a server restart is simulated by an idle sweep of zero sessions', async () => {
    const { server } = await setUpServer()
    assert.equal(server.sessions.sweepExpired(), 0)
    assert.equal((await server.request('GET', '/api/sessions')).status, 200)
  })
})
