import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import vm from 'node:vm'

// The capture worklet is served verbatim from /capture-processor.js and cannot be
// imported, so the test loads that exact file into a worklet-shaped sandbox. A test
// that reimplemented the processor would not be able to go red on a bug in the real
// one.
const WORKLET_SOURCE = readFileSync(new URL('../client/public/capture-processor.js', import.meta.url), 'utf8')

const RENDER_QUANTUM = 128
const SAMPLES_PER_FRAME = 2048
const SAMPLE_RATE = 48_000
const TONE_HZ = 440
const TONE_PEAK = 0.5

type ChannelPlan = 'tone' | 'silence'

interface WorkletProcessorInstance {
  process: (inputs: Float32Array[][]) => boolean
}

interface WorkletHarness {
  /** Feeds one render quantum of audio, one entry per channel. */
  push: (channels: Float32Array[]) => void
  chunks: Float32Array[]
}

function loadWorklet(): WorkletHarness {
  const chunks: Float32Array[] = []
  const registry: { processor: (new () => WorkletProcessorInstance) | null } = { processor: null }

  class AudioWorkletProcessor {
    port = {
      postMessage: (message: { type: string; samples: Float32Array }) => {
        chunks.push(message.samples)
      },
      close: () => undefined,
    }
  }

  const context = vm.createContext({
    AudioWorkletProcessor,
    registerProcessor: (_name: string, processor: unknown) => {
      registry.processor = processor as new () => WorkletProcessorInstance
    },
  })
  vm.runInContext(WORKLET_SOURCE, context)

  const ProcessorClass = registry.processor
  assert.ok(ProcessorClass, 'capture-processor.js did not register a processor')
  const processor = new ProcessorClass()

  return {
    chunks,
    push: (channels) => {
      processor.process([channels])
    },
  }
}

function toneBlock(offsetSamples: number): Float32Array {
  const block = new Float32Array(RENDER_QUANTUM)
  for (let index = 0; index < RENDER_QUANTUM; index += 1) {
    block[index] = TONE_PEAK * Math.sin((2 * Math.PI * TONE_HZ * (offsetSamples + index)) / SAMPLE_RATE)
  }
  return block
}

/** Runs one full analysis frame's worth of blocks and returns the emitted frame. */
function captureFrame(channelPlan: ChannelPlan[]): Float32Array {
  const harness = loadWorklet()
  for (let blockIndex = 0; blockIndex < SAMPLES_PER_FRAME / RENDER_QUANTUM; blockIndex += 1) {
    const offsetSamples = blockIndex * RENDER_QUANTUM
    harness.push(channelPlan.map((kind) => (kind === 'tone' ? toneBlock(offsetSamples) : new Float32Array(RENDER_QUANTUM))))
  }
  const chunk = harness.chunks[0]
  assert.ok(chunk, 'expected the worklet to emit one analysis frame')
  assert.equal(harness.chunks.length, 1, 'expected exactly one analysis frame')
  return chunk
}

function peak(samples: Float32Array): number {
  let maximum = 0
  for (const sample of samples) maximum = Math.max(maximum, Math.abs(sample))
  return maximum
}

function assertLevel(frame: Float32Array): void {
  // Level must survive capture untouched: the Sonorant core derives its confidence
  // and its CLIPPED/LOW_SNR flags from it, so a gain change here is a measurement
  // change.
  assert.ok(
    Math.abs(peak(frame) - TONE_PEAK) < 0.01,
    `expected a peak near ${TONE_PEAK}, got ${peak(frame).toFixed(4)}`,
  )
}

describe('capture worklet channel selection', () => {
  it('captures a mono input', () => {
    assertLevel(captureFrame(['tone']))
  })

  it('captures a voice that arrives on the left channel', () => {
    assertLevel(captureFrame(['tone', 'silence']))
  })

  // Regression: a wireless receiver in stereo mode routes one transmitter per
  // channel, so a single active transmitter leaves the other channel silent. Reading
  // channel 0 alone measured that silence and the monitor stayed dark while macOS,
  // which meters the whole device, showed peaks.
  it('captures a voice that arrives on the right channel only', () => {
    assertLevel(captureFrame(['silence', 'tone']))
  })

  it('passes a mono signal duplicated across channels through at its original level', () => {
    assertLevel(captureFrame(['tone', 'tone']))
  })

  it('stays silent when every channel is silent', () => {
    assert.equal(peak(captureFrame(['silence', 'silence'])), 0)
  })
})
