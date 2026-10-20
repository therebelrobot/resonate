/**
 * Encodes decoded PCM samples as a WAV file, no dependencies.
 *
 * Recordings are captured by MediaRecorder, which produces a compressed
 * container (webm/opus in Chrome and Firefox, mp4/AAC in Safari) that many
 * desktop players will not open. The browser can decode its own recordings with
 * the Web Audio API, so the export decodes each clip and writes a plain 16-bit
 * PCM WAV - the format every player and editor reads, at the cost of size.
 *
 * Nothing here touches browser APIs: it takes channel data and a sample rate, so
 * it is unit-testable in Node.
 */

const RIFF_HEADER_BYTES = 44

/** Clamps a float sample to the signed 16-bit range and rounds to nearest. */
function toInt16(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample))
  // Asymmetric scaling: -1 maps to -32768, +1 to 32767.
  return clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff)
}

/**
 * Writes interleaved 16-bit little-endian PCM from one Float32Array per channel.
 * All channels are expected to share a length; shorter ones are treated as silent.
 */
export function encodePcm16Wav(channels: readonly Float32Array[], sampleRate: number): Uint8Array {
  const channelCount = channels.length
  if (channelCount === 0) throw new Error('A WAV needs at least one channel.')
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error('A WAV needs a positive sample rate.')

  const frameCount = channels.reduce((longest, channel) => Math.max(longest, channel.length), 0)
  const bytesPerSample = 2
  const blockAlign = channelCount * bytesPerSample
  const dataBytes = frameCount * blockAlign

  const buffer = new ArrayBuffer(RIFF_HEADER_BYTES + dataBytes)
  const view = new DataView(buffer)

  const writeAscii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index))
    }
  }

  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true) // size of everything after this field
  writeAscii(8, 'WAVE')

  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM fmt chunk size
  view.setUint16(20, 1, true) // audio format: PCM
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true) // byte rate
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true) // bits per sample

  writeAscii(36, 'data')
  view.setUint32(40, dataBytes, true)

  let offset = RIFF_HEADER_BYTES
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const source = channels[channel]!
      view.setInt16(offset, frame < source.length ? toInt16(source[frame]!) : 0, true)
      offset += bytesPerSample
    }
  }

  return new Uint8Array(buffer)
}
