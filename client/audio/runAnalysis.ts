import { decodeFrames, framesView, type DecodedFrame, type Engine } from 'sonorant'

/** Samples per push: two seconds at 44.1 kHz, so a long clip is never one huge push. */
export const ANALYSIS_CHUNK_SAMPLES = 44_100 * 2

/**
 * Runs a whole clip through the Sonorant core and returns every frame it produced.
 *
 * The core's frame view holds only the frames from the most recent `push`, not a
 * cumulative history: reading the view once at the end would silently keep only the
 * last chunk. So each chunk's frames are decoded and collected before the next push.
 * (The live monitor never hits this because it reads after every push.)
 */
export function analyzeSamples(engine: Engine, samples: Float32Array): DecodedFrame[] {
  engine.reset()
  const frames: DecodedFrame[] = []
  for (let offset = 0; offset < samples.length; offset += ANALYSIS_CHUNK_SAMPLES) {
    const produced = engine.push(samples.subarray(offset, offset + ANALYSIS_CHUNK_SAMPLES))
    if (produced > 0) frames.push(...decodeFrames(framesView(engine).slice()))
  }
  return frames
}
