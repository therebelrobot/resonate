import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { encodeBase32 } from './crypto/base32'
import { DEFAULT_SCRYPT_PARAMETERS, type ScryptParameters } from './crypto/envelope'

export interface ServerConfig {
  listenPort: number
  listenHost: string
  /** Paths resolve from process.cwd(): esbuild flattens module locations, so import.meta.url is unreliable. */
  dataDirectory: string
  publicAssetsDirectory: string
  /** false only for local development over plain HTTP. Production must sit behind TLS. */
  cookieSecure: boolean
  /** true when behind a reverse proxy so the client IP comes from X-Forwarded-For. */
  trustProxy: boolean
  /** Optional explicit origin (https://voice.example.com). When unset, the Host header is used. */
  publicOrigin: string | null
  sessionIdleMinutes: number
  sessionMaxHours: number
  setupToken: string
  setupTokenWasGenerated: boolean
  scryptParameters: ScryptParameters
  /**
   * IANA zone used for the Date and Time columns of the server-side CSV export.
   * The browser-built exports use the device's own zone; this only matters for the
   * copy the server writes, which otherwise runs in the container's zone (UTC).
   */
  exportTimeZone: string
}

function readBoolean(environmentValue: string | undefined, fallback: boolean): boolean {
  if (environmentValue === undefined || environmentValue === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(environmentValue.toLowerCase())
}

function readPositiveInteger(environmentValue: string | undefined, fallback: number): number {
  const parsedValue = Number.parseInt(environmentValue ?? '', 10)
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback
}

export function loadServerConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const configuredSetupToken = environment.RESONATE_SETUP_TOKEN?.trim()
  return {
    listenPort: readPositiveInteger(environment.RESONATE_PORT ?? environment.PORT, 8788),
    listenHost: environment.RESONATE_HOST ?? '0.0.0.0',
    dataDirectory: path.resolve(process.cwd(), environment.RESONATE_DATA_DIR ?? 'data'),
    publicAssetsDirectory: path.resolve(process.cwd(), environment.RESONATE_PUBLIC_DIR ?? 'dist/public'),
    cookieSecure: readBoolean(environment.RESONATE_COOKIE_SECURE, true),
    trustProxy: readBoolean(environment.RESONATE_TRUST_PROXY, false),
    publicOrigin: environment.RESONATE_PUBLIC_ORIGIN?.replace(/\/+$/, '') || null,
    sessionIdleMinutes: readPositiveInteger(environment.RESONATE_SESSION_IDLE_MINUTES, 30),
    sessionMaxHours: readPositiveInteger(environment.RESONATE_SESSION_MAX_HOURS, 12),
    setupToken: configuredSetupToken || encodeBase32(randomBytes(10)),
    setupTokenWasGenerated: !configuredSetupToken,
    scryptParameters: {
      costFactorN: readPositiveInteger(environment.RESONATE_SCRYPT_N, DEFAULT_SCRYPT_PARAMETERS.costFactorN),
      blockSizeR: DEFAULT_SCRYPT_PARAMETERS.blockSizeR,
      parallelizationP: DEFAULT_SCRYPT_PARAMETERS.parallelizationP,
    },
    exportTimeZone: environment.RESONATE_TIMEZONE?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
}
