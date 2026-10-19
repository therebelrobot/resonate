// Resonate microphone capture processor.
//
// Runs in the AudioWorklet global scope, which cannot resolve bare module
// imports, so this file is deliberately self-contained and served as-is from
// /capture-processor.js. It does the minimum the real-time budget allows: copy
// the voice-bearing channel into transferable chunks and post them to the analysis
// Worker. All acoustic maths happens in the Sonorant wasm core, on the Worker.

var PCM = 'resonate/pcm'

/** Samples per posted chunk. One analysis frame's worth arrives per batch. */
var DEFAULT_CHUNK_SAMPLES = 2048

function createChunker(chunkSize) {
  var pending = new Float32Array(0)
  return {
    push: function (block) {
      var merged = new Float32Array(pending.length + block.length)
      merged.set(pending, 0)
      merged.set(block, pending.length)
      var chunks = []
      var offset = 0
      while (merged.length - offset >= chunkSize) {
        // slice() copies, so the buffer is transferable without aliasing.
        chunks.push(merged.slice(offset, offset + chunkSize))
        offset += chunkSize
      }
      pending = merged.slice(offset)
      return chunks
    },
  }
}

/**
 * Picks the channel carrying the voice.
 *
 * A mono device yields one channel and a mono signal duplicated across stereo
 * yields two identical ones, so either choice is faithful. A device that splits its
 * sources across channels — a wireless receiver in stereo mode puts one transmitter
 * on each channel — puts the voice on one channel and silence on the other, and the
 * silent one must not be the one we measure. The loudest channel is taken whole
 * rather than mixed down: averaging a single-source stereo pair would halve its
 * level, and the Sonorant core derives its confidence and its CLIPPED/LOW_SNR flags
 * from level, so a gain change here would be a measurement change.
 */
function selectChannel(channels) {
  var chosen = channels[0]
  if (channels.length < 2) return chosen
  var loudest = -1
  for (var index = 0; index < channels.length; index += 1) {
    var candidate = channels[index]
    var energy = 0
    for (var sample = 0; sample < candidate.length; sample += 1) {
      energy += candidate[sample] * candidate[sample]
    }
    if (energy > loudest) {
      loudest = energy
      chosen = candidate
    }
  }
  return chosen
}

if (typeof registerProcessor === 'function' && typeof AudioWorkletProcessor === 'function') {
  class ResonateCaptureProcessor extends AudioWorkletProcessor {
    constructor() {
      super()
      this.chunker = createChunker(DEFAULT_CHUNK_SAMPLES)
    }

    process(inputs) {
      var channels = inputs && inputs[0]
      var channel = channels && channels.length ? selectChannel(channels) : null
      if (channel && channel.length) {
        var chunks = this.chunker.push(channel)
        for (var index = 0; index < chunks.length; index += 1) {
          var chunk = chunks[index]
          this.port.postMessage({ type: PCM, samples: chunk }, [chunk.buffer])
        }
      }
      return true
    }
  }
  registerProcessor('resonate-capture', ResonateCaptureProcessor)
}
