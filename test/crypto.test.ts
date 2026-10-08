import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { decodeBase32, encodeBase32 } from '../server/crypto/base32'
import {
  DATA_ENCRYPTION_KEY_BYTES,
  DecryptionFailedError,
  decryptBytes,
  decryptJson,
  deriveKeyEncryptionKey,
  encryptBytes,
  encryptJson,
  generateDataEncryptionKey,
  recordAdditionalAuthenticatedData,
} from '../server/crypto/envelope'
import { buildOtpauthUri, computeTimeStepCounter, generateTotpCode, verifyTotpCode } from '../server/crypto/totp'

const TEST_SCRYPT = { costFactorN: 1024, blockSizeR: 8, parallelizationP: 1 }
const FIXED_TIME = 1_700_000_000_000
const TEST_SECRET = Buffer.from('01234567890123456789')

describe('envelope encryption', () => {
  it('generates a 256-bit data key', () => {
    assert.equal(generateDataEncryptionKey().length, DATA_ENCRYPTION_KEY_BYTES)
  })

  it('round-trips bytes under the same key and authenticated data', () => {
    const key = generateDataEncryptionKey()
    const aad = recordAdditionalAuthenticatedData('sessions', 'row-1')
    const ciphertext = encryptBytes(key, Buffer.from('a sustained note', 'utf8'), aad)
    assert.notEqual(ciphertext.toString('utf8'), 'a sustained note')
    assert.equal(decryptBytes(key, ciphertext, aad).toString('utf8'), 'a sustained note')
  })

  it('refuses a row swapped for another, because the row id is authenticated', () => {
    const key = generateDataEncryptionKey()
    const ciphertext = encryptBytes(key, Buffer.from('glides', 'utf8'), recordAdditionalAuthenticatedData('sessions', 'row-1'))
    assert.throws(() => decryptBytes(key, ciphertext, recordAdditionalAuthenticatedData('sessions', 'row-2')), DecryptionFailedError)
  })

  it('refuses a ciphertext reused as a different kind of secret', () => {
    const key = generateDataEncryptionKey()
    const ciphertext = encryptBytes(key, Buffer.from('x', 'utf8'), 'resonate:dek-wrap:passphrase')
    assert.throws(() => decryptBytes(key, ciphertext, 'resonate:dek-wrap:recovery-code'), DecryptionFailedError)
  })

  it('detects tampering with the ciphertext', () => {
    const key = generateDataEncryptionKey()
    const aad = recordAdditionalAuthenticatedData('tags', 'row-1')
    const ciphertext = Buffer.from(encryptBytes(key, Buffer.from('breath support', 'utf8'), aad))
    const lastIndex = ciphertext.length - 1
    ciphertext[lastIndex] = (ciphertext[lastIndex] ?? 0) ^ 0b1
    assert.throws(() => decryptBytes(key, ciphertext, aad), DecryptionFailedError)
  })

  it('fails closed on a truncated envelope', () => {
    const key = generateDataEncryptionKey()
    assert.throws(() => decryptBytes(key, Buffer.alloc(4), 'anything'), DecryptionFailedError)
    assert.throws(() => decryptBytes(key, Buffer.alloc(40), 'anything'), DecryptionFailedError)
  })

  it('round-trips JSON, which is how every row is stored', () => {
    const key = generateDataEncryptionKey()
    const aad = recordAdditionalAuthenticatedData('documents', 'protocolNotes')
    const value = { text: 'warm-up note: eee', updatedAt: '2026-10-07T12:00:00.000Z' }
    assert.deepEqual(decryptJson<typeof value>(key, encryptJson(key, value, aad), aad), value)
  })

  it('refuses to decrypt with the wrong key', () => {
    const aad = recordAdditionalAuthenticatedData('sessions', 'row-1')
    const ciphertext = encryptBytes(generateDataEncryptionKey(), Buffer.from('x', 'utf8'), aad)
    assert.throws(() => decryptBytes(generateDataEncryptionKey(), ciphertext, aad), DecryptionFailedError)
  })
})

describe('key derivation', () => {
  it('is deterministic for the same secret and salt', async () => {
    const salt = Buffer.from('0123456789abcdef')
    const first = await deriveKeyEncryptionKey('a passphrase here', salt, TEST_SCRYPT)
    const second = await deriveKeyEncryptionKey('a passphrase here', salt, TEST_SCRYPT)
    assert.deepEqual(first, second)
    assert.equal(first.length, DATA_ENCRYPTION_KEY_BYTES)
  })

  it('produces a different key for a different salt or passphrase', async () => {
    const first = await deriveKeyEncryptionKey('a passphrase here', Buffer.from('0123456789abcdef'), TEST_SCRYPT)
    const otherSalt = await deriveKeyEncryptionKey('a passphrase here', Buffer.from('fedcba9876543210'), TEST_SCRYPT)
    const otherSecret = await deriveKeyEncryptionKey('another passphrase', Buffer.from('0123456789abcdef'), TEST_SCRYPT)
    assert.notDeepEqual(first, otherSalt)
    assert.notDeepEqual(first, otherSecret)
  })

  it('normalizes the passphrase, so the same word typed two ways still derives one key', async () => {
    const salt = Buffer.from('0123456789abcdef')
    // U+00E9 composed versus U+0065 U+0301 decomposed: the same word to a reader.
    const composed = await deriveKeyEncryptionKey('caf\u00e9 passphrase', salt, TEST_SCRYPT)
    const decomposed = await deriveKeyEncryptionKey('cafe\u0301 passphrase', salt, TEST_SCRYPT)
    assert.deepEqual(composed, decomposed)
  })
})

describe('base32', () => {
  it('round-trips bytes', () => {
    const bytes = Buffer.from([0, 1, 2, 250, 255, 128, 64])
    assert.deepEqual(decodeBase32(encodeBase32(bytes)), bytes)
  })

  it('ignores lowercase, spaces, and the dashes that group recovery codes', () => {
    const encoded = encodeBase32(Buffer.from('secret material'))
    assert.equal(decodeBase32(encoded.toLowerCase()).toString('utf8'), 'secret material')
    assert.equal(decodeBase32(encoded.match(/.{1,4}/g)!.join('-')).toString('utf8'), 'secret material')
  })
})

describe('authenticator codes', () => {
  it('accepts the code it just generated', () => {
    const counter = computeTimeStepCounter(FIXED_TIME)
    const code = generateTotpCode(TEST_SECRET, counter)
    assert.match(code, /^\d{6}$/)
    assert.equal(verifyTotpCode(TEST_SECRET, code, FIXED_TIME, null), counter)
  })

  it('refuses a code that was already used', () => {
    const counter = computeTimeStepCounter(FIXED_TIME)
    const code = generateTotpCode(TEST_SECRET, counter)
    assert.equal(verifyTotpCode(TEST_SECRET, code, FIXED_TIME, counter), null)
  })

  it('tolerates one step of clock drift in either direction', () => {
    const counter = computeTimeStepCounter(FIXED_TIME)
    assert.equal(verifyTotpCode(TEST_SECRET, generateTotpCode(TEST_SECRET, counter - 1), FIXED_TIME, null), counter - 1)
    assert.equal(verifyTotpCode(TEST_SECRET, generateTotpCode(TEST_SECRET, counter + 1), FIXED_TIME, null), counter + 1)
  })

  it('rejects anything that is not six digits', () => {
    for (const candidate of ['', '12345', '1234567', 'abcdef', '12 34x6']) {
      assert.equal(verifyTotpCode(TEST_SECRET, candidate, FIXED_TIME, null), null)
    }
  })

  it('accepts the code the way people type it, with a space in the middle', () => {
    const counter = computeTimeStepCounter(FIXED_TIME)
    const code = generateTotpCode(TEST_SECRET, counter)
    assert.equal(verifyTotpCode(TEST_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, FIXED_TIME, null), counter)
  })

  it('builds an otpauth URI an authenticator app can read', () => {
    const uri = buildOtpauthUri('ABCDEFGHIJKLMNOP', 'practice-log', 'Resonate')
    assert.match(uri, /^otpauth:\/\/totp\//)
    assert.match(uri, /secret=ABCDEFGHIJKLMNOP/)
    assert.match(uri, /issuer=Resonate/)
    assert.match(uri, /period=30/)
  })
})
