import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { RecoveryCodeNotice } from '../components/RecoveryCodeNotice'
import { formatFullTimestamp } from '../format'
import type { AuditEvent, VaultStatus } from '../../shared/model'

const AUDIT_EVENT_LABELS: Record<string, string> = {
  vault_created: 'Practice log created',
  unlocked: 'Unlocked',
  unlock_failed: 'Failed unlock',
  locked: 'Locked',
  recovered_with_recovery_code: 'Recovered with the recovery code',
  recovery_failed: 'Failed recovery',
  passphrase_changed: 'Passphrase changed',
  recovery_code_replaced: 'Recovery code replaced',
  authenticator_enabled: 'Authenticator turned on',
  authenticator_disabled: 'Authenticator turned off',
  report_prepared: 'Report prepared',
  exported_slp_csv: 'Exported the CSV for a clinician',
  exported_json: 'Exported the JSON archive',
  exported_csv: 'Exported the CSV from the server',
}

export function SettingsScreen({
  status,
  onStatusChange,
  onLock,
}: {
  status: VaultStatus
  onStatusChange: () => void
  onLock: () => void
}) {
  const [currentPassphrase, setCurrentPassphrase] = useState('')
  const [newPassphrase, setNewPassphrase] = useState('')
  const [newPassphraseConfirmation, setNewPassphraseConfirmation] = useState('')
  const [recoveryPassphrase, setRecoveryPassphrase] = useState('')
  const [issuedRecoveryCode, setIssuedRecoveryCode] = useState<string | null>(null)
  const [totpSetup, setTotpSetup] = useState<{ secretBase32: string; otpauthUri: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [disablePassphrase, setDisablePassphrase] = useState('')
  const [auditEvents, setAuditEvents] = useState<AuditEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const run = async (action: () => Promise<unknown>, successNotice?: string) => {
    setIsBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      if (successNotice) setNotice(successNotice)
      onStatusChange()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'That did not work.')
    } finally {
      setIsBusy(false)
    }
  }

  const changePassphrase = async (event: FormEvent) => {
    event.preventDefault()
    if (newPassphrase.length < 12) {
      setError('Use at least 12 characters.')
      return
    }
    if (newPassphrase !== newPassphraseConfirmation) {
      setError('The two passphrases do not match.')
      return
    }
    await run(async () => {
      await api.changePassphrase(currentPassphrase, newPassphrase)
      setCurrentPassphrase('')
      setNewPassphrase('')
      setNewPassphraseConfirmation('')
    }, 'Passphrase changed. Every other device was signed out.')
  }

  const issueRecoveryCode = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setIsBusy(true)
    try {
      const result = await api.replaceRecoveryCode(recoveryPassphrase)
      setIssuedRecoveryCode(result.recoveryCode)
      setRecoveryPassphrase('')
    } catch (recoveryError) {
      setError(recoveryError instanceof Error ? recoveryError.message : 'That did not work.')
    } finally {
      setIsBusy(false)
    }
  }

  const confirmTotp = async (event: FormEvent) => {
    event.preventDefault()
    await run(async () => {
      await api.confirmAuthenticatorSetup(totpCode)
      setTotpSetup(null)
      setTotpCode('')
    }, 'Authenticator turned on. You will be asked for a code at every unlock.')
  }

  if (issuedRecoveryCode) {
    return (
      <div className="screen">
        <RecoveryCodeNotice
          recoveryCode={issuedRecoveryCode}
          onDismiss={() => {
            setIssuedRecoveryCode(null)
            setNotice('The previous recovery code no longer works.')
          }}
        />
      </div>
    )
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>Settings</h1>
        <p className="screen-subtitle">
          Everything the server can and cannot see, and everything you can change about how the log is protected.
        </p>
      </header>

      {notice && <p className="form-ok">{notice}</p>}
      {error && <p className="form-error">{error}</p>}

      <section className="detail-section">
        <h2>Session</h2>
        <p className="detail-text">
          {status.unlocked ? 'Unlocked on this device.' : 'Locked.'} It locks itself after {status.sessionIdleMinutes} minutes
          without activity, and whenever the server restarts.
        </p>
        <button type="button" className="button button-secondary button-small" onClick={onLock}>
          Lock now
        </button>
      </section>

      <section className="detail-section">
        <h2>Passphrase</h2>
        <p className="field-hint">
          Changing it re-wraps the data key and signs out every other device. Your sessions are not re-encrypted, because the
          data key itself does not change.
        </p>
        <form className="stacked-form" onSubmit={(event) => void changePassphrase(event)}>
          <div className="field">
            <label className="field-label" htmlFor="current-passphrase">Current passphrase</label>
            <input
              id="current-passphrase"
              type="password"
              value={currentPassphrase}
              autoComplete="current-password"
              onChange={(event) => setCurrentPassphrase(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="new-passphrase">New passphrase</label>
            <input
              id="new-passphrase"
              type="password"
              value={newPassphrase}
              autoComplete="new-password"
              onChange={(event) => setNewPassphrase(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="confirm-passphrase">New passphrase again</label>
            <input
              id="confirm-passphrase"
              type="password"
              value={newPassphraseConfirmation}
              autoComplete="new-password"
              onChange={(event) => setNewPassphraseConfirmation(event.target.value)}
              required
            />
          </div>
          <button type="submit" className="button button-secondary button-small" disabled={isBusy}>
            Change passphrase
          </button>
        </form>
      </section>

      <section className="detail-section">
        <h2>Recovery code</h2>
        <p className="field-hint">
          Issuing a new code retires the old one immediately. The old code stops working the moment this succeeds, so write the
          new one down before you close the screen.
        </p>
        <form className="stacked-form" onSubmit={(event) => void issueRecoveryCode(event)}>
          <div className="field">
            <label className="field-label" htmlFor="recovery-passphrase">Passphrase</label>
            <input
              id="recovery-passphrase"
              type="password"
              value={recoveryPassphrase}
              autoComplete="current-password"
              onChange={(event) => setRecoveryPassphrase(event.target.value)}
              required
            />
          </div>
          <button type="submit" className="button button-secondary button-small" disabled={isBusy}>
            Issue a new recovery code
          </button>
        </form>
      </section>

      <section className="detail-section">
        <h2>Authenticator app</h2>
        {status.totpEnabled ? (
          <>
            <p className="detail-text">A 6-digit code is required at every unlock.</p>
            <form className="stacked-form" onSubmit={(event) => { event.preventDefault(); void run(async () => { await api.disableAuthenticator(disablePassphrase); setDisablePassphrase('') }, 'Authenticator turned off.') }}>
              <div className="field">
                <label className="field-label" htmlFor="disable-passphrase">Passphrase</label>
                <input
                  id="disable-passphrase"
                  type="password"
                  value={disablePassphrase}
                  autoComplete="current-password"
                  onChange={(event) => setDisablePassphrase(event.target.value)}
                  required
                />
              </div>
              <button type="submit" className="button button-danger button-small" disabled={isBusy}>
                Turn off the authenticator
              </button>
            </form>
          </>
        ) : totpSetup ? (
          <>
            <p className="field-hint">
              Add this secret to your authenticator app, then enter the code it shows. On iOS the link below opens the app
              directly.
            </p>
            <p className="recovery-code">{totpSetup.secretBase32}</p>
            <p>
              <a className="link-button" href={totpSetup.otpauthUri}>Open in authenticator app</a>
            </p>
            <form className="stacked-form" onSubmit={(event) => void confirmTotp(event)}>
              <div className="field">
                <label className="field-label" htmlFor="totp-code">6-digit code</label>
                <input
                  id="totp-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={12}
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value)}
                  required
                />
              </div>
              <button type="submit" className="button button-secondary button-small" disabled={isBusy}>
                Confirm and turn on
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="detail-text">Not set up. Optional, and worth it if this instance is reachable from anywhere but your LAN.</p>
            <button
              type="button"
              className="button button-secondary button-small"
              disabled={isBusy}
              onClick={() =>
                void run(async () => {
                  setTotpSetup(await api.beginAuthenticatorSetup())
                })
              }
            >
              Set up the authenticator
            </button>
          </>
        )}
      </section>

      <section className="detail-section">
        <h2>Export</h2>
        <p className="field-hint">
          Both exports are plaintext and leave the server unencrypted. Each one is recorded in the access log below.
        </p>
        <div className="card-row">
          <a className="button button-secondary button-small" href="/api/export?format=json" download>
            Full archive (JSON)
          </a>
          <a className="button button-secondary button-small" href="/api/export?format=csv" download>
            Everything as CSV
          </a>
        </div>
      </section>

      <section className="detail-section">
        <h2>Access log</h2>
        <p className="field-hint">
          Times, event names, IP addresses, and user agents. No session content is ever written here.
        </p>
        {auditEvents === null ? (
          <button type="button" className="button button-secondary button-small" onClick={() => void run(async () => setAuditEvents(await api.listAuditEvents()))}>
            Show the last 100 events
          </button>
        ) : (
          <ul className="audit-list">
            {auditEvents.map((event) => (
              <li key={event.id}>
                <span className="audit-when">{formatFullTimestamp(event.at)}</span>
                <span className="audit-event">{AUDIT_EVENT_LABELS[event.event] ?? event.event}</span>
                <span className="audit-ip">{event.ipAddress}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="detail-section">
        <h2>Elsewhere</h2>
        <div className="card-row">
          <a className="button button-secondary button-small" href="#/protocol">The plan</a>
          <a className="button button-secondary button-small" href="#/tags">Tags</a>
          <a className="button button-secondary button-small" href="#/report">Report for your SLP</a>
        </div>
      </section>
    </div>
  )
}
