import { useState } from 'react'
import { api } from '../api'
import { useAudioCapture } from '../audio/AudioCaptureProvider'
import { formatClockDuration } from '../format'
import { recordingDisplayLabel, type Recording, type SegmentKind } from '../../shared/model'
import { SEGMENT_DEFINITIONS } from '../../shared/protocol'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Could not read the recording.'))
        return
      }
      const commaIndex = result.indexOf(',')
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result)
    })
    reader.addEventListener('error', () => reject(new Error('Could not read the recording.')))
    reader.readAsDataURL(blob)
  })
}

export interface StepRecorderProps {
  kind: SegmentKind
  /** The saved session id, or null while a brand-new session is still unsaved. */
  sessionId: string | null
  /** Saves the draft if needed and returns the session id, so a recording always has a home. */
  ensureSessionId: () => Promise<string | null>
  /** All recordings for the open session; this component shows the ones for its step. */
  recordings: Recording[]
  /** Called after an upload or delete so the shared session data refreshes. */
  onChanged: () => void
}

/**
 * Record audio inline on any step. The clip is uploaded to the encrypted store as
 * soon as it is stopped and rides along with the session in an export, rather
 * than living only in the tab.
 */
export function StepRecorder({ kind, sessionId, ensureSessionId, recordings, onChanged }: StepRecorderProps) {
  const capture = useAudioCapture()
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stepRecordings = recordings.filter((recording) => recording.segmentKind === kind)
  const stepLabel = SEGMENT_DEFINITIONS[kind].label
  const isRecording = capture.recordingStatus === 'recording'

  const uploadFinished = async () => {
    const finished = await capture.stopRecording()
    if (!finished) return
    setIsUploading(true)
    setError(null)
    try {
      const targetSessionId = await ensureSessionId()
      if (!targetSessionId) throw new Error('Could not save the session for this recording.')
      await api.createRecording(targetSessionId, {
        segmentKind: kind,
        label: stepLabel,
        mimeType: finished.mimeType,
        durationSeconds: Math.round(finished.durationSeconds),
        audioBase64: await blobToBase64(finished.blob),
      })
      onChanged()
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not save the recording.')
    } finally {
      setIsUploading(false)
    }
  }

  const deleteRecording = async (recordingId: string) => {
    if (!window.confirm('Delete this recording? This cannot be undone.')) return
    setError(null)
    try {
      await api.deleteRecording(recordingId)
      onChanged()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete the recording.')
    }
  }

  return (
    <div className="step-recorder">
      <div className="step-recorder-controls">
        {isRecording ? (
          <>
            <span className="step-recorder-timer" role="status">
              Recording {formatClockDuration(capture.recordingSeconds)}
            </span>
            <button type="button" className="button button-primary button-small" onClick={() => void uploadFinished()}>
              Stop and save
            </button>
          </>
        ) : (
          <button
            type="button"
            className="button button-secondary button-small"
            disabled={isUploading || !capture.isSupported || capture.monitorStatus === 'starting'}
            onClick={() => void capture.startRecording()}
          >
            {isUploading ? 'Saving…' : `Record ${stepLabel.toLowerCase()}`}
          </button>
        )}
        {capture.recordingError && <span className="field-error">{capture.recordingError}</span>}
      </div>

      {stepRecordings.length > 0 && (
        <ul className="recording-list">
          {stepRecordings.map((recording) => (
            <li key={recording.id} className="recording-item">
              <div className="recording-item-head">
                <span className="recording-item-label">{recordingDisplayLabel(recording)}</span>
                <span className="recording-item-meta">{formatClockDuration(recording.durationSeconds)}</span>
                <button
                  type="button"
                  className="button button-quiet button-small"
                  onClick={() => void deleteRecording(recording.id)}
                >
                  Delete
                </button>
              </div>
              {/* The audio streams back from the encrypted store through this same origin. */}
              <audio controls preload="none" src={api.recordingAudioUrl(recording.id)} />
            </li>
          ))}
        </ul>
      )}

      {error && <p className="field-error">{error}</p>}
      <p className="field-hint">
        {sessionId
          ? 'Recordings are stored encrypted with the session and included in an export.'
          : 'A recording saves a draft of this session so the audio has somewhere to live.'}
      </p>
    </div>
  )
}
