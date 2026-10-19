import { useState } from 'react'
import { ConfidenceBadge, FlagList, FrameSummary, VoicePad } from 'sonorant-react'
import 'sonorant-react/styles.css'
import { useAudioCapture } from '../audio/AudioCaptureProvider'
import { noteNameForHz } from '../../shared/model'

/**
 * The sticky vocal monitor: a compact, always-present strip that shows where the
 * voice currently sits, on every screen. Tapping Start asks for the microphone
 * and begins live analysis through the Sonorant core; the pad and the
 * confidence-bearing summary expand on demand.
 *
 * Pitch and resonance are shown separately, and nothing is shown without a
 * confidence indication (the Sonorant principles). The strip is `no-print` so it
 * never lands in the SLP report.
 */
export function VocalMonitor() {
  const capture = useAudioCapture()
  const [isExpanded, setIsExpanded] = useState(false)

  const isOn = capture.monitorStatus === 'on'
  const frame = capture.latestFrame
  const pitchHz = frame && frame.f0_hz > 0 ? frame.f0_hz : null
  const resonance = frame && Number.isFinite(frame.scale_semitones) ? frame.scale_semitones : null

  return (
    <section className={`vocal-monitor no-print${isExpanded ? ' is-expanded' : ''}`} aria-label="Vocal monitor">
      <div className="vocal-monitor-bar">
        <span className={`vocal-monitor-dot${isOn ? ' is-on' : ''}`} aria-hidden="true" />
        <span className="vocal-monitor-readout" aria-live="polite">
          {isOn ? (
            <>
              {pitchHz === null ? 'Listening' : `${Math.round(pitchHz)} Hz · ${noteNameForHz(pitchHz)}`}
              {resonance !== null && (
                <span className="vocal-monitor-resonance">
                  {' '}
                  · {resonance >= 0 ? '+' : ''}
                  {resonance.toFixed(1)} st
                </span>
              )}
            </>
          ) : (
            'Voice monitor off'
          )}
        </span>
        {isOn ? (
          <>
            <button
              type="button"
              className="vocal-monitor-button"
              aria-expanded={isExpanded}
              onClick={() => setIsExpanded((previous) => !previous)}
            >
              {isExpanded ? 'Hide' : 'View'}
            </button>
            <button type="button" className="vocal-monitor-button" onClick={() => capture.stopMonitor()}>
              Stop
            </button>
          </>
        ) : (
          <button
            type="button"
            className="vocal-monitor-button is-primary"
            disabled={!capture.isSupported || capture.monitorStatus === 'starting'}
            onClick={() => void capture.startMonitor()}
          >
            {capture.monitorStatus === 'starting' ? 'Starting' : 'Start'}
          </button>
        )}
      </div>

      {capture.monitorError && (
        <p className="vocal-monitor-note" role="status">
          {capture.monitorError}
        </p>
      )}
      {!capture.isSupported && !capture.monitorError && (
        <p className="vocal-monitor-note">The microphone needs HTTPS (or localhost).</p>
      )}

      {isExpanded && isOn && (
        <div className="vocal-monitor-body">
          <VoicePad frames={capture.frames} width={300} height={170} title="Pitch by resonance" />
          {frame ? (
            <>
              <FrameSummary frame={frame} heading="Live" />
              <div className="vocal-monitor-confidence">
                <ConfidenceBadge value={frame.f0_confidence} of="pitch" />
              </div>
              <FlagList flags={frame.flags} emptyText="Input looks clean." />
            </>
          ) : (
            <p className="vocal-monitor-note">Not enough clear voice yet. Hold a note.</p>
          )}
        </div>
      )}
    </section>
  )
}
