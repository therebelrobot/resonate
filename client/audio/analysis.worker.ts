// Analysis Worker: receive PCM chunks from the capture worklet, drive the
// Sonorant wasm core, and post decoded frames back to the page.
//
// No acoustic maths lives here or in the page: the Rust core does the measuring,
// and this Worker only moves samples in and frame objects out.

import { decodeFrames, framesView, loadEngine, type Engine } from 'sonorant'
import { analyzeSamples } from './runAnalysis'
// Vite emits the package's wasm as a fingerprinted asset and hands us its URL.
// The loader verifies the file against its recorded SHA-256 before instantiating
// it, so a swapped artifact fails loudly rather than being trusted.
import sonorantWasmUrl from 'sonorant/pkg/sonorant_ffi_bg.wasm?url'

let engine: Engine | null = null
let engineSampleRate = 0

async function ensureEngine(sampleRate: number): Promise<Engine> {
  if (engine && sampleRate === engineSampleRate) return engine
  engineSampleRate = sampleRate
  const loaded = await loadEngine(sampleRate, { wasmUrl: new URL(sonorantWasmUrl, self.location.href) })
  // 2048-sample frames, 512-sample hop, 24-pole LPC — the Sonorant defaults.
  loaded.configure(2048, 512, 24)
  engine = loaded
  return loaded
}

interface PcmMessage {
  type: 'resonate/pcm'
  samples: Float32Array
  sampleRate: number
}

/** A finished clip handed over for one-shot analysis, e.g. a recorded step. */
interface AnalyzeMessage {
  type: 'resonate/analyze'
  requestId: number
  samples: Float32Array
  sampleRate: number
}

type IncomingMessage = PcmMessage | AnalyzeMessage

/** The core is fed in chunks, so one long clip never needs a single huge push. */
async function analyzeClip(data: AnalyzeMessage): Promise<void> {
  const activeEngine = await ensureEngine(data.sampleRate)
  const frames = analyzeSamples(activeEngine, data.samples)
  self.postMessage({ type: 'resonate/analyzed', requestId: data.requestId, frames })
}

self.addEventListener('message', async (event: MessageEvent<IncomingMessage>) => {
  const data = event.data
  if (!data) return
  if (data.type === 'resonate/analyze') {
    try {
      await analyzeClip(data)
    } catch (error) {
      self.postMessage({
        type: 'resonate/error',
        requestId: data.requestId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
    return
  }
  if (data.type !== 'resonate/pcm') return
  try {
    const activeEngine = await ensureEngine(data.sampleRate)
    const frameCount = activeEngine.push(data.samples)
    if (frameCount > 0) {
      const frames = decodeFrames(framesView(activeEngine).slice())
      self.postMessage({ type: 'resonate/frames', frames })
    }
  } catch (error) {
    // Report and keep going: one bad frame must not kill the monitor.
    self.postMessage({ type: 'resonate/error', message: error instanceof Error ? error.message : String(error) })
  }
})
