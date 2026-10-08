interface RecoveryCodeNoticeProps {
  recoveryCode: string
  onDismiss: () => void
}

export function RecoveryCodeNotice({ recoveryCode, onDismiss }: RecoveryCodeNoticeProps) {
  return (
    <div className="recovery-notice" role="alert">
      <h2>Write this down now</h2>
      <p>
        This code is shown once and never again. It is the only way back in if you forget your passphrase or lose your
        phone, and nobody - including the server this runs on - can recover your log without it.
      </p>
      <p className="recovery-code">{recoveryCode}</p>
      <p className="field-hint">Store it somewhere you would keep a passport, not in the same place as your passphrase.</p>
      <button type="button" className="button button-primary" onClick={onDismiss}>
        I have written it down
      </button>
    </div>
  )
}
