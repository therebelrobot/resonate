import { useEffect, useMemo, useState } from 'react'
import { CONFIDENCE_THRESHOLDS, ConfidenceBadge } from 'sonorant-react'
import {
  MAX_ANALYSIS_SECONDS,
  analyzeRecording,
} from '../audio/analyzeRecording'
import {
  deriveSegmentFields,
  type SegmentSuggestion,
  type SegmentSuggestions,
} from '../audio/deriveSegmentFields'
import type { FinishedRecording } from '../audio/AudioCaptureProvider'
import type { SegmentKind, SessionSegmentInput } from '../../shared/model'

export interface DerivedFieldsProps {
  kind: SegmentKind
  segment: SessionSegmentInput
  /** The just-recorded clip to read, or null when there is nothing to analyse. */
  recorded: FinishedRecording | null
  /** Applies a derived change to the open segment. */
  onApplyPatch: (patch: Partial<SessionSegmentInput>) => void
}

type AnalysisState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'ready'; result: SegmentSuggestions }
  | { status: 'error'; message: string }

/**
 * The fields one recorded step can fill, offered rather than assumed. The clip is
 * decoded and measured on this device (nothing leaves the phone), and every reading
 * carries the confidence it was derived at and how it was measured, so a pre-filled
 * number is still read as a claim rather than a fact. Nothing is written until the
 * user taps to accept it.
 */
export function DerivedFields({ kind, segment, recorded, onApplyPatch }: DerivedFieldsProps) {
  const [state, setState] = useState<AnalysisState>({ status: 'idle' })
  const [applied, setApplied] = useState<ReadonlySet<string>>(new Set())
  const [isDismissed, setIsDismissed] = useState(false)

  useEffect(() => {
    if (!recorded) {
      setState({ status: 'idle' })
      return
    }
    let cancelled = false
    setApplied(new Set())
    setIsDismissed(false)
    setState({ status: 'running' })
    void (async () => {
      try {
        // An endurance clip can be an hour; only read a prefix, and only the length
        // is offered for the parts of it that were not read.
        const readAudio = recorded.durationSeconds === null || recorded.durationSeconds <= MAX_ANALYSIS_SECONDS
        const analysis = readAudio
          ? await analyzeRecording({ audio: recorded.blob })
          : { frames: [], analyzedSeconds: 0, truncated: true }
        if (cancelled) return
        const result = deriveSegmentFields({
          kind,
          frames: analysis.frames,
          durationSeconds: recorded.durationSeconds,
          truncated: analysis.truncated,
          analyzedSeconds: analysis.analyzedSeconds,
        })
        setState({ status: 'ready', result })
      } catch (error) {
        if (cancelled) return
        setState({ status: 'error', message: error instanceof Error ? error.message : 'Could not read this clip.' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [recorded, kind])

  const { primary, weak } = useMemo(() => {
    if (state.status !== 'ready') return { primary: [], weak: [] as SegmentSuggestion[] }
    const primary: SegmentSuggestion[] = []
    const weak: SegmentSuggestion[] = []
    for (const suggestion of state.result.suggestions) {
      if (suggestion.confidence >= CONFIDENCE_THRESHOLDS.medium) primary.push(suggestion)
      else weak.push(suggestion)
    }
    return { primary, weak }
  }, [state])

  if (state.status === 'idle' || isDismissed) return null

  if (state.status === 'running') {
    return (
      <section className="derived-fields" aria-live="polite">
        <p className="field-hint">Reading the recording...</p>
      </section>
    )
  }

  if (state.status === 'error') {
    return (
      <section className="derived-fields" role="status">
        <p className="field-hint">{state.message}</p>
      </section>
    )
  }

  const result = state.result
  const acoustic = result.suggestions.filter((suggestion) => suggestion.field !== 'seconds')

  const applyOne = (suggestion: SegmentSuggestion) => {
    onApplyPatch(suggestion.apply(segment))
    setApplied((previous) => new Set(previous).add(suggestion.field))
  }

  const applyAll = () => {
    // Fold the patches through a working copy, so a nested patch (pitch, resonance)
    // from an earlier suggestion is not overwritten by a later one in the same tap.
    let working = segment
    let patch: Partial<SessionSegmentInput> = {}
    for (const suggestion of primary) {
      const next = suggestion.apply(working)
      patch = { ...patch, ...next }
      working = { ...working, ...next } as SessionSegmentInput
    }
    onApplyPatch(patch)
    setApplied(new Set(primary.map((suggestion) => suggestion.field)))
  }

  return (
    <section className="derived-fields" aria-labelledby="derived-heading">
      <div className="derived-head">
        <h4 id="derived-heading">From this recording</h4>
        <button type="button" className="button button-quiet button-small" onClick={() => setIsDismissed(true)}>
          Dismiss
        </button>
      </div>
      <p className="field-hint">
        Measured on this device; the clip stayed in the encrypted log. Nothing is written above until you tap a reading.
      </p>
      {result.truncated && (
        <p className="field-hint">
          This clip is longer than {Math.round(MAX_ANALYSIS_SECONDS / 60)} minutes, so only its length was read.
        </p>
      )}
      {acoustic.length === 0 ? (
        <p className="field-hint">Not enough clear voice to read the fields on this step.</p>
      ) : (
        <>
          <ul className="derived-list">
            {primary.map((suggestion) => (
              <SuggestionRow
                key={suggestion.field}
                suggestion={suggestion}
                applied={applied.has(suggestion.field)}
                onApply={() => applyOne(suggestion)}
              />
            ))}
          </ul>
          {primary.length > 0 && (
            <button type="button" className="button button-secondary button-small" onClick={applyAll}>
              Use all {primary.length} solid readings
            </button>
          )}
          {weak.length > 0 && (
            <details className="helper">
              <summary>{weak.length} weaker reading{weak.length === 1 ? '' : 's'}</summary>
              <ul className="derived-list">
                {weak.map((suggestion) => (
                  <SuggestionRow
                    key={suggestion.field}
                    suggestion={suggestion}
                    applied={applied.has(suggestion.field)}
                    onApply={() => applyOne(suggestion)}
                  />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  )
}

function SuggestionRow({
  suggestion,
  applied,
  onApply,
}: {
  suggestion: SegmentSuggestion
  applied: boolean
  onApply: () => void
}) {
  return (
    <li className="derived-item">
      <div className="derived-item-main">
        <span className="derived-item-label">{suggestion.label}</span>
        <span className="derived-item-value">{suggestion.displayValue}</span>
      </div>
      <div className="derived-item-meta">
        <ConfidenceBadge value={suggestion.confidence} of="this reading" />
        <span className="derived-item-method">{suggestion.method}</span>
      </div>
      {suggestion.caveat && <p className="derived-item-caveat">{suggestion.caveat}</p>}
      <button type="button" className="button button-secondary button-small" disabled={applied} onClick={onApply}>
        {applied ? 'Used' : `Use for ${suggestion.label.toLowerCase()}`}
      </button>
    </li>
  )
}
