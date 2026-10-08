import { useEffect, useState } from 'react'
import { api } from '../api'
import { useSessionData } from '../sessionData'
import { formatFullTimestamp } from '../format'
import {
  PRACTICE_TRACKS,
  SEGMENT_DEFINITIONS,
  SEGMENT_KINDS,
  SEGMENT_TRACK,
  STRETCH_AND_FLOW_CARRYOVER,
  STRETCH_AND_FLOW_CARRYOVER_KINDS,
  STRETCH_AND_FLOW_CARRYOVER_KIND_LABELS,
  STRETCH_AND_FLOW_CUES,
  STRETCH_AND_FLOW_PACING,
  STRETCH_AND_FLOW_STAGES,
  STRETCH_AND_FLOW_STEPS,
  TRACK_DEFINITIONS,
  stretchAndFlowStepLabel,
} from '../../shared/protocol'
import { PROTOCOL_DOCUMENT_IDS, type ProtocolDocumentId } from '../../shared/model'

const DOCUMENT_LABELS: Record<ProtocolDocumentId, { title: string; hint: string }> = {
  protocolNotes: {
    title: 'The plan as written',
    hint:
      'The tracker now embeds the Stretch and Flow content above, so pasting the handout is optional. Use this note for anything extra from the handout, or your own notes.',
  },
  phasePlan: {
    title: 'Phase notes and next steps',
    hint:
      'Which Stretch and Flow phase you are on, what moves you to the next one, and anything to raise at the next session.',
  },
}

export function ProtocolScreen() {
  return (
    <div className="screen">
      <header className="screen-header">
        <h1>The plan</h1>
        <p className="screen-subtitle">
          Straight from your speech-language pathologist, with the targets the tracker measures against. Spelling has been
          normalized. The embedded Stretch and Flow content is transcribed from the handout; anything the handout does not
          print is marked as such.
        </p>
      </header>

      {PRACTICE_TRACKS.map((track) => {
        const definition = TRACK_DEFINITIONS[track]
        const minutesText =
          definition.sessionMinutesMaximum === null
            ? `${definition.sessionMinutesMinimum}+ minutes`
            : `${definition.sessionMinutesMinimum}-${definition.sessionMinutesMaximum} minutes`
        const dayText =
          definition.daysPerWeekMinimum === definition.daysPerWeekMaximum
            ? `${definition.daysPerWeekMinimum} days a week`
            : `${definition.daysPerWeekMinimum}-${definition.daysPerWeekMaximum} days a week`

        return (
          <section key={track} className="track-card">
            <h2>{definition.label}</h2>
            <p className="track-meta">
              {minutesText} - {dayText}
            </p>
            <ul className="guidance-list">
              {definition.guidance.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="field-hint">{definition.cadenceNote}</p>
            {definition.goalNote && <p className="field-hint">{definition.goalNote}</p>}

            <details className="helper">
              <summary>Parts of this track</summary>
              <ul>
                {SEGMENT_KINDS.filter((kind) => SEGMENT_TRACK[kind] === track).map((kind) => (
                  <li key={kind}>
                    <strong>{SEGMENT_DEFINITIONS[kind].label}</strong> - {SEGMENT_DEFINITIONS[kind].summary}
                  </li>
                ))}
              </ul>
            </details>
          </section>
        )
      })}

      <section className="detail-section">
        <h2>Stretch and Flow</h2>
        <p className="field-hint">
          The handout's stages, ratios, five-step shape, cues, pacing, and carryover material, embedded from the source.
        </p>

        <h3>Stages and ratios</h3>
        <ul className="guidance-list">
          {STRETCH_AND_FLOW_STAGES.map((stage) => (
            <li key={stage.id}>
              <strong>{stage.label}</strong>
              {stage.ratioLabel ? ` - ${stage.ratioLabel}` : ' - voicing ratio not printed in the handout'}
              {stage.tissue === 'required'
                ? ' - tissue: still with tissue'
                : stage.tissue === 'optional'
                  ? ' - tissue: optional'
                  : ''}
              {stage.guidance.length > 0 && (
                <ul className="guidance-list">
                  {stage.guidance.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>

        <h3>The five-step shape</h3>
        {STRETCH_AND_FLOW_STAGES.filter((stage) => stage.stepIds.length > 0).map((stage) => (
          <div key={stage.id}>
            <p className="field-label">{stage.label}</p>
            <ol className="guidance-list">
              {STRETCH_AND_FLOW_STEPS.map((step) => (
                <li key={step.id}>
                  {stretchAndFlowStepLabel(step, stage)}
                  {step.countRange
                    ? ` (count ${step.countRange.min}-${step.countRange.max}${step.elongateVowels ? ', elongate vowels' : ''})`
                    : ''}
                </li>
              ))}
            </ol>
          </div>
        ))}

        <h3>Cues</h3>
        <ul className="guidance-list">
          {STRETCH_AND_FLOW_CUES.map((cue) => (
            <li key={cue.id}>{cue.text}</li>
          ))}
        </ul>

        <h3>Pacing and safety</h3>
        <ul className="guidance-list">
          {STRETCH_AND_FLOW_PACING.map((item) => (
            <li key={item.id}>{item.text}</li>
          ))}
        </ul>

        <h3>Carryover material</h3>
        {STRETCH_AND_FLOW_CARRYOVER_KINDS.map((kind) => {
          const items = STRETCH_AND_FLOW_CARRYOVER.filter((item) => item.kind === kind)
          if (items.length === 0) return null
          return (
            <details key={kind} className="helper">
              <summary>
                {STRETCH_AND_FLOW_CARRYOVER_KIND_LABELS[kind]} ({items.length})
              </summary>
              <ul>
                {items.map((item) => (
                  <li key={item.id}>{item.text}</li>
                ))}
              </ul>
            </details>
          )
        })}
      </section>

      <section className="detail-section">
        <h2>Notes</h2>
        <p className="field-hint">
          These two notes are encrypted with everything else and included in the JSON export. They are not included in the CSV
          export.
        </p>
        {PROTOCOL_DOCUMENT_IDS.map((documentId) => (
          <DocumentEditor key={documentId} documentId={documentId} />
        ))}
      </section>
    </div>
  )
}

function DocumentEditor({ documentId }: { documentId: ProtocolDocumentId }) {
  const { documentById, refresh } = useSessionData()
  const storedDocument = documentById.get(documentId)
  const [text, setText] = useState(storedDocument?.text ?? '')
  const [isDirty, setIsDirty] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Seed the field once the document loads, but never clobber what is being typed.
  useEffect(() => {
    if (!isDirty && storedDocument) setText(storedDocument.text)
  }, [storedDocument, isDirty])

  const save = async () => {
    setIsBusy(true)
    setError(null)
    setNotice(null)
    try {
      await api.saveDocument(documentId, text)
      await refresh()
      setIsDirty(false)
      setNotice('Saved.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save that note.')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="document-editor">
      <h3>{DOCUMENT_LABELS[documentId].title}</h3>
      <p className="field-hint">{DOCUMENT_LABELS[documentId].hint}</p>
      <textarea
        value={text}
        maxLength={20_000}
        aria-label={DOCUMENT_LABELS[documentId].title}
        onChange={(event) => {
          setText(event.target.value)
          setIsDirty(true)
          setNotice(null)
        }}
      />
      <div className="document-actions">
        <button type="button" className="button button-secondary button-small" onClick={() => void save()} disabled={isBusy || !isDirty}>
          {isBusy ? 'Saving...' : 'Save note'}
        </button>
        {storedDocument?.updatedAt && <span className="field-hint">Saved {formatFullTimestamp(storedDocument.updatedAt)}</span>}
      </div>
      {notice && <p className="form-ok">{notice}</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
