import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { VoiceFrame } from 'sonorant-react'

// The microphone constraints are mandatory, not a preference: AGC, echo
// cancellation and noise suppression all rewrite the signal's level and spectrum,
// which turns every level- and resonance-derived measurement into fiction.
const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  },
}

const WORKLET_URL = '/capture-processor.js'
const WORKLET_PROCESSOR = 'resonate-capture'
const MAX_FRAMES = 600
/** Copy accumulated frames into React state at most this often, not per frame. */
const FRAME_FLUSH_MILLISECONDS = 120
const PREFERRED_RECORDING_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/aac',
]

export type MonitorStatus = 'off' | 'starting' | 'on' | 'error'
export type RecordingStatus = 'idle' | 'recording'

export interface FinishedRecording {
  blob: Blob
  mimeType: string
  durationSeconds: number
}

interface AudioCapture {
  isSupported: boolean
  monitorStatus: MonitorStatus
  monitorError: string | null
  recordingStatus: RecordingStatus
  recordingSeconds: number
  recordingError: string | null
  /** Recent frames, oldest first (capped). Empty until the monitor is running. */
  frames: VoiceFrame[]
  latestFrame: VoiceFrame | null
  startMonitor: () => Promise<void>
  stopMonitor: () => void
  startRecording: () => Promise<void>
  stopRecording: () => Promise<FinishedRecording | null>
}

const AudioCaptureContext = createContext<AudioCapture | null>(null)

function pickRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  for (const mimeType of PREFERRED_RECORDING_MIME_TYPES) {
    if (typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(mimeType)) return mimeType
  }
  return undefined
}

/**
 * One microphone, two consumers: the real-time Sonorant monitor (worklet →
 * worker → wasm core) and inline per-step recording (MediaRecorder). Both share a
 * single `MediaStream`; the stream is only closed when neither is using it.
 *
 * Mounted inside the unlocked shell, so locking unmounts it and releases the mic.
 */
export function AudioCaptureProvider({ children }: { children: ReactNode }) {
  const [monitorStatus, setMonitorStatus] = useState<MonitorStatus>('off')
  const [monitorError, setMonitorError] = useState<string | null>(null)
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [recordingError, setRecordingError] = useState<string | null>(null)
  const [frames, setFrames] = useState<VoiceFrame[]>([])

  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const nodeRef = useRef<AudioWorkletNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordingStartedAtRef = useRef<number>(0)
  const recordingTimerRef = useRef<number | null>(null)

  const framesRef = useRef<VoiceFrame[]>([])
  const latestFrameRef = useRef<VoiceFrame | null>(null)
  const frameFlushTimerRef = useRef<number | null>(null)

  const isSupported =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof window !== 'undefined' &&
    (window.isSecureContext || window.location.hostname === 'localhost')

  const ensureMicrophone = useCallback(async (): Promise<MediaStream> => {
    const existing = streamRef.current
    if (existing && existing.getAudioTracks().some((track) => track.readyState === 'live')) return existing
    const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS)
    streamRef.current = stream
    return stream
  }, [])

  const releaseMicrophoneIfIdle = useCallback(() => {
    // Keep the stream alive if either consumer still needs it: an in-flight
    // recording, or a running monitor.
    if (recorderRef.current || nodeRef.current) return
    const context = contextRef.current
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (context && context.state !== 'closed') void context.close().catch(() => undefined)
    contextRef.current = null
  }, [])

  const stopFrameFlush = useCallback(() => {
    if (frameFlushTimerRef.current !== null) {
      window.clearInterval(frameFlushTimerRef.current)
      frameFlushTimerRef.current = null
    }
  }, [])

  const teardownMonitor = useCallback(() => {
    stopFrameFlush()
    nodeRef.current?.port.close?.()
    nodeRef.current?.disconnect()
    sourceRef.current?.disconnect()
    nodeRef.current = null
    sourceRef.current = null
    workerRef.current?.terminate()
    workerRef.current = null
    framesRef.current = []
    latestFrameRef.current = null
    setFrames([])
  }, [stopFrameFlush])

  const stopMonitor = useCallback(() => {
    teardownMonitor()
    releaseMicrophoneIfIdle()
    setMonitorStatus('off')
  }, [releaseMicrophoneIfIdle, teardownMonitor])

  const startMonitor = useCallback(async () => {
    if (monitorStatus === 'on' || monitorStatus === 'starting') return
    if (!isSupported) {
      setMonitorStatus('error')
      setMonitorError('This browser cannot reach the microphone over a secure connection.')
      return
    }
    setMonitorStatus('starting')
    setMonitorError(null)
    // Create the AudioContext inside the user gesture; a context created after an
    // await starts suspended and its worklet never runs.
    const context = contextRef.current ?? new AudioContext()
    contextRef.current = context
    try {
      if (context.state === 'suspended') await context.resume()
      const stream = await ensureMicrophone()
      await context.audioWorklet.addModule(WORKLET_URL)
      const source = context.createMediaStreamSource(stream)
      const node = new AudioWorkletNode(context, WORKLET_PROCESSOR)
      const worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })
      worker.addEventListener('message', (event: MessageEvent<{ type: string; frames?: VoiceFrame[]; message?: string }>) => {
        if (event.data?.type === 'resonate/frames' && event.data.frames) {
          const next = framesRef.current.concat(event.data.frames)
          framesRef.current = next.length > MAX_FRAMES ? next.slice(next.length - MAX_FRAMES) : next
          latestFrameRef.current = framesRef.current[framesRef.current.length - 1] ?? null
        } else if (event.data?.type === 'resonate/error') {
          setMonitorError(event.data.message ?? 'The analyser stopped.')
        }
      })
      node.port.onmessage = (event: MessageEvent<{ type: string; samples: Float32Array }>) => {
        if (event.data?.type === 'resonate/pcm') {
          worker.postMessage({ type: 'resonate/pcm', samples: event.data.samples, sampleRate: context.sampleRate }, [
            event.data.samples.buffer,
          ])
        }
      }
      // Analysis only: the node is never connected to the output, so nothing is played back.
      source.connect(node)
      sourceRef.current = source
      nodeRef.current = node
      workerRef.current = worker
      stopFrameFlush()
      frameFlushTimerRef.current = window.setInterval(() => {
        setFrames(framesRef.current)
      }, FRAME_FLUSH_MILLISECONDS)
      setMonitorStatus('on')
    } catch (error) {
      teardownMonitor()
      releaseMicrophoneIfIdle()
      setMonitorStatus('error')
      setMonitorError(error instanceof Error ? error.message : 'Could not start the microphone monitor.')
    }
  }, [ensureMicrophone, isSupported, monitorStatus, releaseMicrophoneIfIdle, stopFrameFlush, teardownMonitor])

  const startRecording = useCallback(async () => {
    if (recordingStatus === 'recording') return
    setRecordingError(null)
    if (!isSupported || typeof MediaRecorder === 'undefined') {
      setRecordingError('This browser cannot record audio.')
      return
    }
    try {
      const stream = await ensureMicrophone()
      const mimeType = pickRecordingMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      recordedChunksRef.current = []
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data)
      })
      recorder.addEventListener('error', () => {
        setRecordingError('Recording stopped unexpectedly.')
      })
      recorder.start(1000)
      recorderRef.current = recorder
      recordingStartedAtRef.current = Date.now()
      setRecordingSeconds(0)
      setRecordingStatus('recording')
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((Date.now() - recordingStartedAtRef.current) / 1000)
      }, 250)
    } catch (error) {
      releaseMicrophoneIfIdle()
      setRecordingError(error instanceof Error ? error.message : 'Could not start recording.')
      setRecordingStatus('idle')
    }
  }, [ensureMicrophone, isSupported, recordingStatus, releaseMicrophoneIfIdle])

  const stopRecording = useCallback(async (): Promise<FinishedRecording | null> => {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === 'inactive') return null
    const durationSeconds = Math.max(0, (Date.now() - recordingStartedAtRef.current) / 1000)
    const mimeType = recorder.mimeType || 'audio/webm'
    const finished = await new Promise<FinishedRecording>((resolve) => {
      recorder.addEventListener(
        'stop',
        () => {
          resolve({
            blob: new Blob(recordedChunksRef.current, { type: mimeType }),
            mimeType,
            durationSeconds,
          })
        },
        { once: true },
      )
      recorder.stop()
    })
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    recorderRef.current = null
    recordedChunksRef.current = []
    setRecordingStatus('idle')
    setRecordingSeconds(0)
    releaseMicrophoneIfIdle()
    return finished.blob.size > 0 ? finished : null
  }, [releaseMicrophoneIfIdle])

  // Release the mic and tears down the pipeline when the shell unmounts (a lock).
  useEffect(
    () => () => {
      stopFrameFlush()
      if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current)
      try {
        recorderRef.current?.stop()
      } catch {
        // already stopped
      }
      teardownMonitor()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      const context = contextRef.current
      if (context && context.state !== 'closed') void context.close().catch(() => undefined)
      contextRef.current = null
    },
    [stopFrameFlush, teardownMonitor],
  )

  const value = useMemo<AudioCapture>(
    () => ({
      isSupported,
      monitorStatus,
      monitorError,
      recordingStatus,
      recordingSeconds,
      recordingError,
      frames,
      latestFrame: frames[frames.length - 1] ?? null,
      startMonitor,
      stopMonitor,
      startRecording,
      stopRecording,
    }),
    [
      isSupported,
      monitorStatus,
      monitorError,
      recordingStatus,
      recordingSeconds,
      recordingError,
      frames,
      startMonitor,
      stopMonitor,
      startRecording,
      stopRecording,
    ],
  )

  return <AudioCaptureContext.Provider value={value}>{children}</AudioCaptureContext.Provider>
}

export function useAudioCapture(): AudioCapture {
  const capture = useContext(AudioCaptureContext)
  if (!capture) throw new Error('useAudioCapture must be used inside AudioCaptureProvider')
  return capture
}
