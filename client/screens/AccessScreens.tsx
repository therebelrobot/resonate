import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { RecoveryCodeNotice } from '../components/RecoveryCodeNotice'

const MINIMUM_PASSPHRASE_LENGTH = 12

export function SetupScreen({ onReady }: { onReady: () => void }) {
  const [setupToken, setSetupToken] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (passphrase.length < MINIMUM_PASSPHRASE_LENGTH) {
      setError(`Use at least ${MINIMUM_PASSPHRASE_LENGTH} characters.`)
      return
    }
    if (passphrase !== confirmation) {
      setError('The two passphrases do not match.')
      return
    }
    setIsBusy(true)
    try {
      const result = await api.setUp(setupToken.trim(), passphrase)
      setRecoveryCode(result.recoveryCode)
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : 'Could not set up the practice log.')
    } finally {
      setIsBusy(false)
    }
  }

  if (recoveryCode) {
    return (
      <main className="access-screen">
        <RecoveryCodeNotice recoveryCode={recoveryCode} onDismiss={onReady} />
      </main>
    )
  }

  return (
    <main className="access-screen">
      <div className="access-card">
        <h1>Set up Resonate</h1>
        <p className="screen-subtitle">
          Name the practice log and choose the passphrase that encrypts it. The server stores only ciphertext, so this
          passphrase is the only key - pick something long and keep it in a password manager.
        </p>
        <form className="stacked-form" onSubmit={(event) => void submit(event)}>
          <div className="field">
            <label className="field-label" htmlFor="setup-token">
              Setup token
            </label>
            <input
              id="setup-token"
              type="text"
              value={setupToken}
              onChange={(event) => setSetupToken(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              required
            />
            <p className="field-hint">Printed in the server log on first start.</p>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="setup-passphrase">
              Passphrase
            </label>
            <input
              id="setup-passphrase"
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              autoComplete="new-password"
              required
            />
            <p className="field-hint">{MINIMUM_PASSPHRASE_LENGTH} characters or more. A long phrase beats a short jumble.</p>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="setup-confirmation">
              Passphrase again
            </label>
            <input
              id="setup-confirmation"
              type="password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="button button-primary" disabled={isBusy}>
            {isBusy ? 'Creating...' : 'Create the practice log'}
          </button>
        </form>
      </div>
    </main>
  )
}

export function UnlockScreen({ totpEnabled, onUnlocked }: { totpEnabled: boolean; onUnlocked: () => void }) {
  const [passphrase, setPassphrase] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [newPassphrase, setNewPassphrase] = useState('')
  const [newPassphraseConfirmation, setNewPassphraseConfirmation] = useState('')
  const [isRecovering, setIsRecovering] = useState(false)
  const [issuedRecoveryCode, setIssuedRecoveryCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const unlock = async (event: FormEvent) => {
    event.preventDefault()
    setIsBusy(true)
    try {
      await api.unlock(passphrase, totpEnabled || totpCode ? totpCode : undefined)
      onUnlocked()
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : 'Could not unlock.')
    } finally {
      setIsBusy(false)
    }
  }

  const recover = async (event: FormEvent) => {
    event.preventDefault()
    if (newPassphrase.length < MINIMUM_PASSPHRASE_LENGTH) {
      setError(`Use at least ${MINIMUM_PASSPHRASE_LENGTH} characters.`)
      return
    }
    if (newPassphrase !== newPassphraseConfirmation) {
      setError('The two passphrases do not match.')
      return
    }
    setIsBusy(true)
    try {
      const result = await api.recover(recoveryCode, newPassphrase)
      setIssuedRecoveryCode(result.recoveryCode)
    } catch (recoverError) {
      setError(recoverError instanceof Error ? recoverError.message : 'Could not recover.')
    } finally {
      setIsBusy(false)
    }
  }

  if (issuedRecoveryCode) {
    return (
      <main className="access-screen">
        <RecoveryCodeNotice recoveryCode={issuedRecoveryCode} onDismiss={onUnlocked} />
      </main>
    )
  }

  return (
    <main className="access-screen">
      <div className="access-card">
        <h1>Resonate</h1>
        {!isRecovering ? (
          <>
            <p className="screen-subtitle">Your practice log is locked. Nothing is readable until you unlock it.</p>
            <form className="stacked-form" onSubmit={(event) => void unlock(event)}>
              <div className="field">
                <label className="field-label" htmlFor="unlock-passphrase">
                  Passphrase
                </label>
                <input
                  id="unlock-passphrase"
                  type="password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  autoComplete="current-password"
                  autoFocus
                  required
                />
              </div>
              {(totpEnabled || totpCode) && (
                <div className="field">
                  <label className="field-label" htmlFor="unlock-totp">
                    Authenticator code
                  </label>
                  <input
                    id="unlock-totp"
                    type="text"
                    inputMode="numeric"
                    value={totpCode}
                    onChange={(event) => setTotpCode(event.target.value)}
                    autoComplete="one-time-code"
                    maxLength={12}
                  />
                </div>
              )}
              {error && <p className="form-error">{error}</p>}
              <button type="submit" className="button button-primary" disabled={isBusy}>
                {isBusy ? 'Unlocking...' : 'Unlock'}
              </button>
            </form>
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setIsRecovering(true)
                setError(null)
              }}
            >
              I lost my passphrase or my phone
            </button>
          </>
        ) : (
          <>
            <p className="screen-subtitle">
              The recovery code unwraps the key, sets a new passphrase, and turns the authenticator off. The code you use
              is retired and a new one is issued.
            </p>
            <form className="stacked-form" onSubmit={(event) => void recover(event)}>
              <div className="field">
                <label className="field-label" htmlFor="recovery-code">
                  Recovery code
                </label>
                <input
                  id="recovery-code"
                  type="text"
                  value={recoveryCode}
                  onChange={(event) => setRecoveryCode(event.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  required
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="new-passphrase">
                  New passphrase
                </label>
                <input
                  id="new-passphrase"
                  type="password"
                  value={newPassphrase}
                  onChange={(event) => setNewPassphrase(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="new-passphrase-confirmation">
                  New passphrase again
                </label>
                <input
                  id="new-passphrase-confirmation"
                  type="password"
                  value={newPassphraseConfirmation}
                  onChange={(event) => setNewPassphraseConfirmation(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              {error && <p className="form-error">{error}</p>}
              <button type="submit" className="button button-primary" disabled={isBusy}>
                {isBusy ? 'Recovering...' : 'Recover the log'}
              </button>
              <button type="button" className="link-button" onClick={() => setIsRecovering(false)}>
                Back to unlocking
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
