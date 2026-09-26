import { useState, useRef, useEffect, useCallback } from 'react'
import {
  IconMicrophone,
  IconMicrophoneOff,
  IconX,
  IconSparkles,
  IconLoader2,
  IconVolume,
  IconAlertCircle,
  IconSend,
  IconRotateClockwise,
} from '@tabler/icons-react'

export default function VoiceModal({
  open,
  isOpen,
  onClose,
  onVoiceReply,
  activeSession,
}) {
  const visible = Boolean(isOpen ?? open)

  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [replyText, setReplyText] = useState('')
  const [error, setError] = useState(null)
  const [volumeLevel, setVolumeLevel] = useState(0)

  const streamRef = useRef(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const recognitionRef = useRef(null)
  const transcriptRef = useRef('')
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animFrameRef = useRef(null)
  const currentAudioRef = useRef(null)
  const isSubmittingRef = useRef(false)
  const recordingRef = useRef(false)

  // Keep transcript and recording refs in sync
  useEffect(() => {
    transcriptRef.current = transcript
  }, [transcript])

  useEffect(() => {
    recordingRef.current = recording
  }, [recording])

  // Stop everything (media, streams, contexts)
  const cleanupMedia = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null
        recognitionRef.current.onerror = null
        recognitionRef.current.stop()
      } catch (e) {
        // ignore
      }
      recognitionRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop()
      } catch (e) {
        // ignore
      }
      recorderRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close()
      } catch (e) {
        // ignore
      }
      audioContextRef.current = null
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current = null
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setRecording(false)
    setVolumeLevel(0)
  }, [])

  // Send audio blob and/or transcript to backend
  const sendVoiceData = useCallback(async (blob, mimeType) => {
    if (isSubmittingRef.current) return
    isSubmittingRef.current = true
    setProcessing(true)
    setError(null)

    const finalTranscript = transcriptRef.current.trim()
    const ext = (mimeType || 'audio/webm').includes('ogg') ? 'ogg' : 'webm'
    const formData = new FormData()

    if (blob && blob.size > 0) {
      formData.append('file', blob, `voice_${Date.now()}.${ext}`)
    }
    if (finalTranscript) {
      formData.append('transcript', finalTranscript)
    }
    formData.append('session_id', activeSession || 'default')

    try {
      const res = await fetch('http://localhost:8000/chat-voice-input', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}: ${res.statusText}`)
      }

      const data = await res.json()

      if (data.transcript && !finalTranscript) {
        setTranscript(data.transcript)
      }

      if (data.reply) {
        setReplyText(data.reply)
        onVoiceReply?.(data)

        // If backend provided TTS audio, it will be played by onVoiceReply in App.jsx.
        // If not, use browser Web Speech Synthesis as fallback speech output:
        if (!data.audio && 'speechSynthesis' in window) {
          setSpeaking(true)
          const utterance = new SpeechSynthesisUtterance(data.reply.slice(0, 400))
          utterance.rate = 1.05
          utterance.pitch = 1.0
          utterance.onend = () => setSpeaking(false)
          utterance.onerror = () => setSpeaking(false)
          window.speechSynthesis.speak(utterance)
        }
      } else {
        setError('No response received from assistant.')
      }
    } catch (err) {
      console.error('[VoiceModal error]', err)
      setError(
        'Could not reach the assistant. Please check if the backend is running on http://localhost:8000.'
      )
    } finally {
      setProcessing(false)
      isSubmittingRef.current = false
    }
  }, [activeSession, onVoiceReply])

  // Stop recording and trigger submit
  const stopRecording = useCallback(() => {
    if (!recording && !recorderRef.current) return

    setRecording(false)
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) {
        // ignore
      }
    }

    if (recorderRef.current && recorderRef.current.state === 'recording') {
      try {
        recorderRef.current.stop()
      } catch (e) {
        console.warn('Error stopping recorder:', e)
      }
    } else {
      // If recorder wasn't running, submit with transcript directly
      sendVoiceData(null, '')
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close()
      } catch (e) {
        // ignore
      }
      audioContextRef.current = null
    }
  }, [recording, sendVoiceData])

  // Start recording audio and live speech recognition
  const startRecording = useCallback(async () => {
    cleanupMedia()
    setError(null)
    setReplyText('')
    setTranscript('')
    transcriptRef.current = ''

    try {
      let stream = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: true,
          },
        })
      } catch (e1) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      }
      streamRef.current = stream

      // Set up volume analyzer for dynamic glowing orb animation
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (AudioCtx) {
        try {
          const ctx = new AudioCtx()
          const source = ctx.createMediaStreamSource(stream)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 64
          source.connect(analyser)
          audioContextRef.current = ctx
          analyserRef.current = analyser

          const dataArray = new Uint8Array(analyser.frequencyBinCount)
          const checkVolume = () => {
            if (!analyserRef.current) return
            analyserRef.current.getByteFrequencyData(dataArray)
            let sum = 0
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
            const avg = sum / dataArray.length
            setVolumeLevel(Math.min(1, avg / 80))
            animFrameRef.current = requestAnimationFrame(checkVolume)
          }
          checkVolume()
        } catch (e) {
          console.warn('Audio analyser setup failed:', e)
        }
      }

      // Set up MediaRecorder
      const supportedMimes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
      ]
      const mimeType = supportedMimes.find((m) => MediaRecorder.isTypeSupported(m)) || ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      recorder.onstop = () => {
        if (streamRef.current) {
          try {
            streamRef.current.getTracks().forEach((t) => t.stop())
          } catch (e) {}
          streamRef.current = null
        }
        const finalBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })
        sendVoiceData(finalBlob, recorder.mimeType)
      }

      recorder.start(250)
      setRecording(true)

      // Set up Web Speech API for real-time live transcript display
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SpeechRec) {
        try {
          const rec = new SpeechRec()
          rec.continuous = true
          rec.interimResults = true
          rec.lang = 'en-US'

          rec.onresult = (evt) => {
            let combined = ''
            for (let i = 0; i < evt.results.length; i++) {
              combined += evt.results[i][0].transcript + ' '
            }
            const clean = combined.trim()
            if (clean) {
              setTranscript(clean)
              transcriptRef.current = clean
            }
          }

          rec.onerror = (err) => {
            console.warn('Speech recognition warning:', err.error)
          }

          rec.onend = () => {
            if (recordingRef.current) {
              try {
                rec.start()
              } catch (e) {
                // ignore
              }
            }
          }

          rec.start()
          recognitionRef.current = rec
        } catch (recErr) {
          console.warn('Web Speech API could not start:', recErr)
        }
      }
    } catch (err) {
      console.error('Microphone access error:', err)
      setError(
        'Microphone access denied. Please click the lock or camera/mic icon in your browser address bar to allow microphone access.'
      )
      setRecording(false)
    }
  }, [cleanupMedia, sendVoiceData])

  // Handle modal open/close lifecycle
  useEffect(() => {
    if (visible) {
      // Auto-start recording when the modal opens
      const timer = setTimeout(() => {
        startRecording()
      }, 200)
      return () => {
        clearTimeout(timer)
        cleanupMedia()
      }
    } else {
      cleanupMedia()
    }
  }, [visible, startRecording, cleanupMedia])

  if (!visible) return null

  // Compute glowing orb style based on voice volume
  const scaleValue = recording ? 1 + volumeLevel * 0.25 : 1
  const glowSpread = recording ? 40 + volumeLevel * 80 : speaking ? 50 : 0

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(5, 7, 15, 0.94)',
        backdropFilter: 'blur(30px) saturate(180%)',
        WebkitBackdropFilter: 'blur(30px) saturate(180%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        animation: 'fadeIn 0.2s ease-out forwards',
      }}
    >
      {/* Close button */}
      <button
        onClick={() => {
          cleanupMedia()
          onClose?.()
        }}
        style={{
          position: 'absolute',
          top: '24px',
          right: '24px',
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.06)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          color: '#cbd5e1',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease',
        }}
        title="Exit Voice Mode"
      >
        <IconX size={20} />
      </button>

      {/* Main Glass Center Card */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '26px',
          maxWidth: '560px',
          width: '100%',
          textAlign: 'center',
        }}
      >
        {/* Main Glowing Sphere / Dynamic Voice Orb */}
        <div
          style={{
            position: 'relative',
            width: '170px',
            height: '170px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Outer Pulsing Aura Ring */}
          {recording && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: '2px solid rgba(139, 92, 246, 0.4)',
                transform: `scale(${scaleValue * 1.15})`,
                transition: 'transform 0.08s ease-out',
                opacity: 0.7,
              }}
            />
          )}

          <div
            className={recording ? 'voice-orb-glow' : ''}
            style={{
              width: '130px',
              height: '130px',
              borderRadius: '50%',
              background: recording
                ? 'linear-gradient(135deg, #8b5cf6, #ec4899, #06b6d4)'
                : speaking
                ? 'linear-gradient(135deg, #06b6d4, #3b82f6, #8b5cf6)'
                : processing
                ? 'linear-gradient(135deg, #6366f1, #a855f7)'
                : 'linear-gradient(135deg, #475569, #334155)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: recording
                ? `0 0 ${glowSpread}px rgba(139, 92, 246, 0.7), 0 0 ${glowSpread * 1.5}px rgba(236, 72, 153, 0.45)`
                : speaking
                ? '0 0 50px rgba(6, 182, 212, 0.6), 0 0 90px rgba(59, 130, 246, 0.4)'
                : 'none',
              transform: `scale(${scaleValue})`,
              transition: 'transform 0.1s ease-out, box-shadow 0.2s ease',
            }}
          >
            {processing ? (
              <IconLoader2 size={46} className="animate-spin" style={{ color: '#fff' }} />
            ) : speaking ? (
              <IconVolume size={44} style={{ color: '#fff' }} />
            ) : (
              <IconSparkles size={44} style={{ color: '#fff' }} />
            )}
          </div>
        </div>

        {/* Status Headings */}
        <div>
          <h2
            style={{
              fontSize: '22px',
              fontWeight: 700,
              color: '#f8fafc',
              marginBottom: '6px',
              letterSpacing: '-0.02em',
            }}
          >
            {recording
              ? 'Listening...'
              : processing
              ? 'Nexus is thinking...'
              : speaking
              ? 'Nexus is speaking...'
              : replyText
              ? 'Response Ready'
              : 'Voice Mode Ready'}
          </h2>
          <p style={{ fontSize: '13.5px', color: '#94a3b8' }}>
            {recording
              ? 'Speak naturally — tap Stop Listening when done'
              : processing
              ? 'Transcribing and preparing answer...'
              : speaking
              ? 'Playing voice response'
              : 'Tap Start Speaking to ask Nexus anything'}
          </p>
        </div>

        {/* Live User Transcript Box */}
        <div
          style={{
            minHeight: '68px',
            width: '100%',
            background: 'rgba(255, 255, 255, 0.035)',
            border: '1px solid rgba(255, 255, 255, 0.09)',
            borderRadius: '16px',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: '#818cf8',
              marginBottom: '4px',
              fontWeight: 600,
            }}
          >
            Your Voice Input
          </div>
          <span
            style={{
              fontSize: '14.5px',
              color: transcript ? '#f8fafc' : '#64748b',
              fontStyle: transcript ? 'normal' : 'italic',
              lineHeight: 1.5,
              wordBreak: 'break-word',
            }}
          >
            {transcript ? `"${transcript}"` : recording ? 'Listening for input...' : 'No speech recorded yet'}
          </span>
        </div>

        {/* Assistant Reply Card (if available) */}
        {replyText && (
          <div
            style={{
              width: '100%',
              maxHeight: '160px',
              overflowY: 'auto',
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              borderRadius: '16px',
              padding: '14px 18px',
              textAlign: 'left',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#c084fc',
                marginBottom: '6px',
                fontWeight: 600,
              }}
            >
              Nexus Response
            </div>
            <p
              style={{
                fontSize: '13.5px',
                color: '#e2e8f0',
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {replyText}
            </p>
          </div>
        )}

        {/* Error message card */}
        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: '100%',
              padding: '12px 16px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '12px',
              color: '#fca5a5',
              fontSize: '13px',
              textAlign: 'left',
            }}
          >
            <IconAlertCircle size={18} style={{ flexShrink: 0, color: '#f87171' }} />
            <span>{error}</span>
          </div>
        )}

        {/* Control Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {recording ? (
            <button
              onClick={stopRecording}
              disabled={processing}
              style={{
                height: '48px',
                padding: '0 26px',
                borderRadius: '24px',
                border: 'none',
                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                color: '#ffffff',
                fontSize: '14.5px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 22px rgba(239, 68, 68, 0.5)',
                transition: 'all 0.18s ease',
              }}
            >
              <IconMicrophoneOff size={19} />
              <span>Stop Listening</span>
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={processing}
              style={{
                height: '48px',
                padding: '0 26px',
                borderRadius: '24px',
                border: 'none',
                background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
                color: '#ffffff',
                fontSize: '14.5px',
                fontWeight: 600,
                cursor: processing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 22px rgba(139, 92, 246, 0.45)',
                transition: 'all 0.18s ease',
              }}
            >
              <IconMicrophone size={19} />
              <span>{replyText ? 'Speak Again' : 'Start Speaking'}</span>
            </button>
          )}

          {/* Quick Submit if user already spoke and stopped */}
          {!recording && transcript && !processing && (
            <button
              onClick={() => sendVoiceData(null, '')}
              style={{
                height: '48px',
                padding: '0 20px',
                borderRadius: '24px',
                border: '1px solid rgba(139, 92, 246, 0.4)',
                background: 'rgba(139, 92, 246, 0.15)',
                color: '#c084fc',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.18s ease',
              }}
            >
              <IconSend size={16} />
              <span>Send Input</span>
            </button>
          )}

          <button
            onClick={() => {
              cleanupMedia()
              onClose?.()
            }}
            style={{
              height: '48px',
              padding: '0 22px',
              borderRadius: '24px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#cbd5e1',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.18s ease',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
