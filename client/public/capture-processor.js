// Resonate microphone capture processor.
//
// Runs in the AudioWorklet global scope, which cannot resolve bare module
// imports, so this file is deliberately self-contained and served as-is from
// /capture-processor.js. It does the minimum the real-time budget allows: copy
// channel 0 into transferable chunks and post them to the analysis Worker. All
// acoustic maths happens in the Sonorant wasm core, on the Worker.

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

if (typeof registerProcessor === 'function' && typeof AudioWorkletProcessor === 'function') {
  class ResonateCaptureProcessor extends AudioWorkletProcessor {
    constructor() {
      super()
      this.chunker = createChunker(DEFAULT_CHUNK_SAMPLES)
    }

    process(inputs) {
      var channel = inputs && inputs[0] && inputs[0][0]
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
