import type { VoiceFrame } from 'sonorant-react'

// Turns a stored recording back into PCM and hands it to the same Sonorant core
// the live monitor uses, so a saved clip is measured by the one implementation.
//
// Nothing leaves the device: the clip is decoded in memory, analysed in a Worker,
// and only the decoded frame objects come back. The stored audio is untouched.

/** The most audio a one-shot analysis will read. Endurance clips can run an hour. */
export const MAX_ANALYSIS_SECONDS = 300

/** Decode at a fixed rate so the frames do not depend on the device's audio context. */
export const ANALYSIS_SAMPLE_RATE = 44_100

/** A one-shot analysis should finish well inside this; a hang is a real failure. */
const ANALYSIS_TIMEOUT_MILLISECONDS = 60_000

export interface RecordingAnalysis {
  /** The frames the core produced for the analysed window. */
  frames: VoiceFrame[]
  /** Seconds of audio actually analysed. */
  analyzedSeconds: number
  /** True when the clip was longer than the cap and only a prefix was read. */
  truncated: boolean
}

type OfflineAudioContextConstructor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext

function offlineAudioContextConstructor(): OfflineAudioContextConstructor | null {
  const scope = self as unknown as {
    OfflineAudioContext?: OfflineAudioContextConstructor
    webkitOfflineAudioContext?: OfflineAudioContextConstructor
  }
  return scope.OfflineAudioContext ?? scope.webkitOfflineAudioContext ?? null
}

/**
 * Decodes a recording and runs it through the analysis core. Rejects when the
 * browser cannot decode the clip's format, the core fails, or the analysis stalls.
 */
export async function analyzeRecording(input: { audio: Blob; maxSeconds?: number }): Promise<RecordingAnalysis> {
  const maxSeconds = input.maxSeconds ?? MAX_ANALYSIS_SECONDS
  const ContextConstructor = offlineAudioContextConstructor()
  if (!ContextConstructor) throw new Error('This browser cannot decode audio for analysis.')

  const arrayBuffer = await input.audio.arrayBuffer()
  const context = new ContextConstructor(1, 1, ANALYSIS_SAMPLE_RATE)
  const decoded = await context.decodeAudioData(arrayBuffer)
  const sampleRate = decoded.sampleRate
  const channel = decoded.getChannelData(0)
  const maxSamples = Math.max(1, Math.floor(maxSeconds * sampleRate))
  const truncated = channel.length > maxSamples
  // Copy out of the AudioBuffer: the slice's buffer is transferred to the worker.
  const samples = channel.slice(0, truncated ? maxSamples : channel.length)

  const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })
  try {
    const frames = await new Promise<VoiceFrame[]>((resolve, reject) => {
      const requestId = Date.now() + Math.floor(Math.random() * 1_000_000)
      const timeout = window.setTimeout(() => reject(new Error('Analysis took too long.')), ANALYSIS_TIMEOUT_MILLISECONDS)
      const settle = (callback: () => void) => {
        window.clearTimeout(timeout)
        callback()
      }
      worker.addEventListener('message', (event: MessageEvent<{ type: string; requestId?: number; frames?: VoiceFrame[]; message?: string }>) => {
        const data = event.data
        if (!data) return
        if (data.type === 'resonate/analyzed' && data.requestId === requestId) {
          settle(() => resolve(data.frames ?? []))
        } else if (data.type === 'resonate/error' && (data.requestId === undefined || data.requestId === requestId)) {
          settle(() => reject(new Error(data.message ?? 'The analyser failed.')))
        }
      })
      worker.postMessage({ type: 'resonate/analyze', requestId, samples, sampleRate }, [samples.buffer])
    })
    return { frames, analyzedSeconds: samples.length / sampleRate, truncated }
  } finally {
    worker.terminate()
  }
}
