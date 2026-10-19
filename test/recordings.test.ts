import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createTestServer, readJson, TEST_PASSPHRASE } from './testHelpers'
import type { Recording, Session } from '../shared/model'

async function setUpServer() {
  const server = createTestServer()
  const setupResponse = await server.request('POST', '/api/setup', {
    setupToken: server.setupToken,
    passphrase: TEST_PASSPHRASE,
  })
  assert.equal(setupResponse.status, 200)
  return server
}

function emptySessionInput() {
  return {
    occurredAt: new Date().toISOString(),
    status: 'draft' as const,
    role: 'warmup' as const,
    effortBefore: 50,
    effortAfter: null,
    focusTagIds: [],
    winTagIds: [],
    watchTagIds: [],
    slpNote: '',
    segments: [],
  }
}

async function createSession(server: ReturnType<typeof createTestServer>): Promise<Session> {
  const response = await server.request('POST', '/api/sessions', emptySessionInput())
  assert.equal(response.status, 201)
  return readJson<Session>(response)
}

const AUDIO_BYTES = Buffer.from('not-really-audio-but-good-enough-for-a-round-trip')

describe('recordings', () => {
  it('stores, lists, and streams a recording back byte-for-byte', async () => {
    const server = await setUpServer()
    const session = await createSession(server)

    const createResponse = await server.request('POST', `/api/sessions/${session.id}/recordings`, {
      segmentKind: 'glides',
      label: 'Glides',
      mimeType: 'audio/webm;codecs=opus',
      durationSeconds: 12,
      audioBase64: AUDIO_BYTES.toString('base64'),
    })
    assert.equal(createResponse.status, 201)
    const created = await readJson<Recording>(createResponse)
    assert.equal(created.sessionId, session.id)
    assert.equal(created.segmentKind, 'glides')
    assert.equal(created.byteLength, AUDIO_BYTES.byteLength)

    const list = await readJson<Recording[]>(await server.request('GET', `/api/sessions/${session.id}/recordings`))
    assert.equal(list.length, 1)
    assert.equal(list[0]!.id, created.id)

    const audioResponse = await server.request('GET', `/api/recordings/${created.id}/audio`)
    assert.equal(audioResponse.status, 200)
    assert.equal(audioResponse.headers.get('content-type'), 'audio/webm;codecs=opus')
    const returned = Buffer.from(await audioResponse.arrayBuffer())
    assert.deepEqual(returned, AUDIO_BYTES)
  })

  it('refuses a recording for a session that does not exist', async () => {
    const server = await setUpServer()
    const response = await server.request('POST', '/api/sessions/does-not-exist/recordings', {
      segmentKind: null,
      label: '',
      mimeType: 'audio/webm',
      durationSeconds: 1,
      audioBase64: AUDIO_BYTES.toString('base64'),
    })
    assert.equal(response.status, 404)
  })

  it('rejects an empty recording', async () => {
    const server = await setUpServer()
    const session = await createSession(server)
    const response = await server.request('POST', `/api/sessions/${session.id}/recordings`, {
      segmentKind: 'glides',
      label: '',
      mimeType: 'audio/webm',
      durationSeconds: null,
      audioBase64: Buffer.from('').toString('base64'),
    })
    assert.equal(response.status, 400)
  })

  it('deletes a recording', async () => {
    const server = await setUpServer()
    const session = await createSession(server)
    const created = await readJson<Recording>(
      await server.request('POST', `/api/sessions/${session.id}/recordings`, {
        segmentKind: 'glides',
        label: '',
        mimeType: 'audio/webm',
        durationSeconds: 3,
        audioBase64: AUDIO_BYTES.toString('base64'),
      }),
    )
    const deleteResponse = await server.request('DELETE', `/api/recordings/${created.id}`)
    assert.equal(deleteResponse.status, 200)
    const list = await readJson<Recording[]>(await server.request('GET', `/api/sessions/${session.id}/recordings`))
    assert.equal(list.length, 0)
  })

  it('deletes a session\u2019s recordings along with the session', async () => {
    const server = await setUpServer()
    const session = await createSession(server)
    await server.request('POST', `/api/sessions/${session.id}/recordings`, {
      segmentKind: 'glides',
      label: '',
      mimeType: 'audio/webm',
      durationSeconds: 3,
      audioBase64: AUDIO_BYTES.toString('base64'),
    })
    await server.request('DELETE', `/api/sessions/${session.id}`)
    const all = await readJson<Recording[]>(await server.request('GET', '/api/recordings'))
    assert.equal(all.length, 0)
  })

  it('accepts a clip larger than the standard 256 KB JSON body limit', async () => {
    const server = await setUpServer()
    const session = await createSession(server)
    // ~300 KB of audio, which base64-inflates well past the small-route cap.
    const largeAudio = Buffer.alloc(300 * 1024, 7)
    const response = await server.request('POST', `/api/sessions/${session.id}/recordings`, {
      segmentKind: 'endurance',
      label: 'Endurance',
      mimeType: 'audio/webm',
      durationSeconds: 120,
      audioBase64: largeAudio.toString('base64'),
    })
    assert.equal(response.status, 201)
    const created = await readJson<Recording>(response)
    assert.equal(created.byteLength, largeAudio.byteLength)
  })

  it('includes recordings with their audio in the JSON export', async () => {
    const server = await setUpServer()
    const session = await createSession(server)
    await server.request('POST', `/api/sessions/${session.id}/recordings`, {
      segmentKind: 'glides',
      label: 'Glides',
      mimeType: 'audio/webm',
      durationSeconds: 5,
      audioBase64: AUDIO_BYTES.toString('base64'),
    })
    const exportResponse = await server.request('GET', '/api/export')
    assert.equal(exportResponse.status, 200)
    const body = await readJson<{ recordings: Array<Recording & { audioBase64: string }> }>(exportResponse)
    assert.equal(body.recordings.length, 1)
    assert.equal(body.recordings[0]!.audioBase64, AUDIO_BYTES.toString('base64'))
  })
})
