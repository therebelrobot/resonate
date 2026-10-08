import { createApplication } from '../server/app'
import { loadServerConfig } from '../server/config'
import { openDatabase } from '../server/database'
import type { StaticAsset } from '../server/staticAssets'

/**
 * scrypt at N=2^17 is the right cost for a real vault and the wrong cost for a test
 * suite. The vault stores the parameters it was created with, so this only has to be
 * consistent within one database - which for an in-memory test is one run.
 */
export const TEST_SCRYPT_COST = 1024
export const TEST_PASSPHRASE = 'a-long-enough-test-passphrase'

export function createTestServer() {
  const config = loadServerConfig({
    RESONATE_SCRYPT_N: String(TEST_SCRYPT_COST),
    RESONATE_COOKIE_SECURE: 'false',
    RESONATE_SESSION_IDLE_MINUTES: '30',
    RESONATE_SESSION_MAX_HOURS: '12',
  } as unknown as NodeJS.ProcessEnv)

  const database = openDatabase(':memory:')
  const { app, sessions, vault } = createApplication({
    config,
    database,
    staticAssets: new Map<string, StaticAsset>(),
  })

  let cookieHeader = ''

  const request = async (method: string, urlPath: string, body?: unknown, extraHeaders: Record<string, string> = {}) => {
    const headers: Record<string, string> = { 'x-resonate-request': '1', ...extraHeaders }
    if (cookieHeader) headers.cookie = cookieHeader
    if (body !== undefined) headers['content-type'] = 'application/json'
    const response = await app.fetch(
      new Request(`http://localhost${urlPath}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    )
    const setCookie = response.headers.get('set-cookie')
    if (setCookie) cookieHeader = setCookie.split(';')[0] ?? ''
    return response
  }

  return {
    config,
    database,
    app,
    sessions,
    vault,
    request,
    setupToken: config.setupToken,
    clearCookie: () => {
      cookieHeader = ''
    },
  }
}

export async function readJson<ResponseBody>(response: Response): Promise<ResponseBody> {
  return (await response.json()) as ResponseBody
}
