import { useState, useRef, useEffect, useCallback } from 'react'
import {
  IconFileTypePdf,
  IconLoader2,
  IconMicrophone,
  IconMicrophoneOff,
  IconPaperclip,
  IconSend,
  IconX,
  IconWorldSearch,
  IconCheck,
  IconSparkles,
  IconVolume,
  IconAlertTriangle,
} from '@tabler/icons-react'

export default function InputBar({ onSend, loading, activeSession, onOpenVoiceModal }) {
  const [text, setText] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [toolWeb, setToolWeb] = useState(true)

  // Live voice transcriber state
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [micVolume, setMicVolume] = useState(0)
  const [voiceDetected, setVoiceDetected] = useState(false)
  const [micStatusMsg, setMicStatusMsg] = useState(null)
  const [audioDevices, setAudioDevices] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')

  const ref = useRef(null)
  const fileRef = useRef(null)

  // Audio / Speech refs
  const isRecordingRef = useRef(false)
  const mediaStreamRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const speechRecognitionRef = useRef(null)
  const timerIntervalRef = useRef(null)
  const whisperIntervalRef = useRef(null)
  const animFrameRef = useRef(null)
  const audioContextRef = useRef(null)
  const initialTextRef = useRef('')
  const capturedTextRef = useRef('')
  const lastWebSpeechTimeRef = useRef(0)
  const isWhisperTranscribingRef = useRef(false)

  // Sync isRecordingRef
  useEffect(() => {
    isRecordingRef.current = isRecording
  }, [isRecording])

  // Enumerate audio input devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices()
          const inputs = devices.filter((d) => d.kind === 'audioinput')
          setAudioDevices(inputs)
          if (inputs.length > 0 && !selectedDeviceId) {
            setSelectedDeviceId(inputs[0].deviceId)
          }
        }
      } catch (err) {
        // ignore device listing error
      }
    }
    getDevices()
  }, [selectedDeviceId])

  const handleInput = (e) => {
    setText(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSend = () => {
    if ((!text.trim() && !attachment) || loading) return
    if (isRecording) {
      stopLiveTranscription(false)
    }
    onSend(text.trim(), attachment, toolWeb)
    setText('')
    setAttachment(null)
    if (ref.current) ref.current.style.height = 'auto'
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please attach a PDF file.')
      e.target.value = ''
      return
    }
    setAttachment(file)
    e.target.value = ''
  }

  // Cleanup helper
  const cleanupAudio = useCallback(() => {
    isRecordingRef.current = false
    setIsRecording(false)

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
    if (whisperIntervalRef.current) {
      clearInterval(whisperIntervalRef.current)
      whisperIntervalRef.current = null
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.onend = null
        speechRecognitionRef.current.onerror = null
        speechRecognitionRef.current.stop()
      } catch (err) {
        // ignore
      }
      speechRecognitionRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close()
      } catch (err) {
        // ignore
      }
      audioContextRef.current = null
    }
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      } catch (err) {
        // ignore
      }
      mediaStreamRef.current = null
    }
    setMicVolume(0)
    setVoiceDetected(false)
  }, [])

  // Call backend Groq Whisper /transcribe
  const transcribeAudioBlob = async (blob) => {
    if (!blob || blob.size < 300) return ''
    setIsTranscribing(true)
    try {
      const formData = new FormData()
      formData.append('file', blob, `audio_${Date.now()}.webm`)
      const res = await fetch('http://localhost:8000/transcribe', {
        method: 'POST',
        body: formData,
      })
      if (res.ok) {
        const data = await res.json()
        return (data.transcript || '').trim()
      }
    } catch (err) {
      console.warn('[Transcription error]', err)
    } finally {
      setIsTranscribing(false)
    }
    return ''
  }

  // Live periodic Whisper fallback: if Web Speech hasn't delivered speech, transcribe live chunks
  const pollWhisperLive = async () => {
    if (!isRecordingRef.current || isWhisperTranscribingRef.current) return
    const now = Date.now()
    // If Web Speech API is actively delivering words (in last 2 seconds), don't duplicate
    if (now - lastWebSpeechTimeRef.current < 2000 && capturedTextRef.current) return

    const chunks = [...audioChunksRef.current]
    if (chunks.length < 2) return

    isWhisperTranscribingRef.current = true
    try {
      const mime = mediaRecorderRef.current?.mimeType || 'audio/webm'
      const blob = new Blob(chunks, { type: mime })
      const textResult = await transcribeAudioBlob(blob)
      if (textResult && isRecordingRef.current) {
        setLiveTranscript(textResult)
        capturedTextRef.current = textResult
        const fullPrompt = initialTextRef.current
          ? `${initialTextRef.current} ${textResult}`
          : textResult
        setText(fullPrompt)
        if (ref.current) {
          ref.current.style.height = 'auto'
          ref.current.style.height = Math.min(ref.current.scrollHeight, 140) + 'px'
        }
      }
    } catch (e) {
      // ignore live poll error
    } finally {
      isWhisperTranscribingRef.current = false
    }
  }

  // Stop recording and finalize transcript
  const stopLiveTranscription = useCallback(
    async (cancel = false) => {
      isRecordingRef.current = false
      setIsRecording(false)

      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
        timerIntervalRef.current = null
      }
      if (whisperIntervalRef.current) {
        clearInterval(whisperIntervalRef.current)
        whisperIntervalRef.current = null
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
        animFrameRef.current = null
      }

      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.onend = null
          speechRecognitionRef.current.onerror = null
          speechRecognitionRef.current.stop()
        } catch (e) {
          // ignore
        }
        speechRecognitionRef.current = null
      }

      // Collect complete audio blob
      let audioBlob = null
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        audioBlob = await new Promise((resolve) => {
          mediaRecorderRef.current.onstop = () => {
            const blob = new Blob(audioChunksRef.current, {
              type: mediaRecorderRef.current?.mimeType || 'audio/webm',
            })
            resolve(blob)
          }
          try {
            mediaRecorderRef.current.stop()
          } catch (e) {
            resolve(null)
          }
        })
      }

      cleanupAudio()

      if (cancel) {
        setText(initialTextRef.current)
        setLiveTranscript('')
        capturedTextRef.current = ''
        return
      }

      const clientSpeech = capturedTextRef.current.trim()

      // If text was already placed live in setText, focus and finish
      if (clientSpeech) {
        setLiveTranscript('')
        capturedTextRef.current = ''
        if (ref.current) {
          ref.current.focus()
          ref.current.style.height = 'auto'
          ref.current.style.height = Math.min(ref.current.scrollHeight, 140) + 'px'
        }
        return
      }

      // Fallback: run Groq Whisper on the complete audio blob
      if (audioBlob && audioBlob.size > 400) {
        const whisperText = await transcribeAudioBlob(audioBlob)
        if (whisperText) {
          const finalPrompt = initialTextRef.current
            ? `${initialTextRef.current} ${whisperText}`
            : whisperText
          setText(finalPrompt)
          if (ref.current) {
            setTimeout(() => {
              ref.current?.focus()
              ref.current.style.height = 'auto'
              ref.current.style.height = Math.min(ref.current.scrollHeight, 140) + 'px'
            }, 50)
          }
        } else {
          setMicStatusMsg("No speech detected. Check if your microphone is unmuted in Windows Sound Settings.")
          setTimeout(() => setMicStatusMsg(null), 5000)
        }
      } else {
        setMicStatusMsg("Audio recording was too short or empty. Please speak closer to the microphone.")
        setTimeout(() => setMicStatusMsg(null), 4000)
      }
      setLiveTranscript('')
      capturedTextRef.current = ''
    },
    [cleanupAudio]
  )

  // Start Live Transcriber
  const startLiveTranscription = async () => {
    cleanupAudio()
    setMicStatusMsg(null)
    setLiveTranscript('')
    capturedTextRef.current = ''
    initialTextRef.current = text.trim()
    setRecordSeconds(0)
    audioChunksRef.current = []
    lastWebSpeechTimeRef.current = 0
    isWhisperTranscribingRef.current = false

    try {
      // Build audio constraints without aggressive noise suppression (which silences mics on Windows)
      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
        ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {}),
      }

      let stream = null
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
      } catch (e1) {
        console.warn('Custom constraints failed, falling back to basic audio: true', e1)
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      }
      mediaStreamRef.current = stream

      // Set up real-time AudioContext volume visualizer
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (AudioCtx) {
        try {
          const ctx = new AudioCtx()
          const source = ctx.createMediaStreamSource(stream)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 128
          analyser.smoothingTimeConstant = 0.5
          source.connect(analyser)
          audioContextRef.current = ctx

          const dataArray = new Uint8Array(analyser.frequencyBinCount)
          const updateAudioLevel = () => {
            if (!isRecordingRef.current) return
            analyser.getByteFrequencyData(dataArray)
            let sum = 0
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
            const avg = sum / dataArray.length
            const vol = Math.min(1, avg / 60)
            setMicVolume(vol)
            if (vol > 0.05) {
              setVoiceDetected(true)
            }
            animFrameRef.current = requestAnimationFrame(updateAudioLevel)
          }
          animFrameRef.current = requestAnimationFrame(updateAudioLevel)
        } catch (ctxErr) {
          console.warn('[AudioContext visualizer error]', ctxErr)
        }
      }

      // Set up timer
      timerIntervalRef.current = setInterval(() => {
        setRecordSeconds((prev) => prev + 1)
      }, 1000)

      // Set up periodic Whisper streaming fallback (every 2.5s)
      whisperIntervalRef.current = setInterval(() => {
        pollWhisperLive()
      }, 2500)

      // 1. Setup MediaRecorder for background Whisper capture
      const supportedMimes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/mp4',
      ]
      const mimeType = supportedMimes.find((m) => MediaRecorder.isTypeSupported(m)) || ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }
      recorder.start(250)

      // 2. Setup Web Speech API for instantaneous real-time typing
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition()
          rec.continuous = true
          rec.interimResults = true
          // Use user's browser language with fallback to en-US
          rec.lang = navigator.language || 'en-US'

          rec.onresult = (evt) => {
            lastWebSpeechTimeRef.current = Date.now()
            let interim = ''
            let final = ''
            for (let i = 0; i < evt.results.length; i++) {
              const item = evt.results[i]
              if (item.isFinal) {
                final += item[0].transcript + ' '
              } else {
                interim += item[0].transcript
              }
            }

            const currentSpoken = (final + interim).trim()
            if (currentSpoken) {
              setLiveTranscript(currentSpoken)
              capturedTextRef.current = currentSpoken

              // Live typing into the prompt textarea in real time!
              const fullText = initialTextRef.current
                ? `${initialTextRef.current} ${currentSpoken}`
                : currentSpoken
              setText(fullText)

              if (ref.current) {
                ref.current.style.height = 'auto'
                ref.current.style.height = Math.min(ref.current.scrollHeight, 140) + 'px'
              }
            }
          }

          rec.onerror = (evt) => {
            console.warn('[Web Speech API notice]:', evt.error)
            // 'no-speech' happens on pause, Whisper live poll handles audio continuously
          }

          rec.onend = () => {
            if (isRecordingRef.current) {
              try {
                rec.start()
              } catch (restartErr) {
                // ignore restart error
              }
            }
          }

          rec.start()
          speechRecognitionRef.current = rec
        } catch (speechErr) {
          console.warn('SpeechRecognition could not start, Whisper will transcribe:', speechErr)
        }
      }

      isRecordingRef.current = true
      setIsRecording(true)
    } catch (err) {
      console.error('Microphone access denied:', err)
      setMicStatusMsg('Microphone access denied. Please click the lock or camera/mic icon in your address bar to allow microphone access.')
      setTimeout(() => setMicStatusMsg(null), 6000)
      setIsRecording(false)
    }
  }

  // Toggle Live Recording
  const toggleRecording = () => {
    if (isRecording) {
      stopLiveTranscription(false)
    } else {
      startLiveTranscription()
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudio()
    }
  }, [cleanupAudio])

  const formatSeconds = (sec) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // Equalizer heights dynamic modulation based on volume
  const eqScale = Math.max(0.25, micVolume)
  const isSilent = isRecording && recordSeconds > 2 && micVolume < 0.03 && !voiceDetected

  return (
    <div
      style={{
        padding: '10px 24px 16px 24px',
        flexShrink: 0,
        width: '100%',
        maxWidth: '820px',
        margin: '0 auto',
        boxSizing: 'border-box',
        position: 'relative',
        zIndex: 10,
      }}
    >
      {/* Live Voice Transcription Pill / Status Banner */}
      {isRecording && (
        <div
          style={{
            marginBottom: '8px',
            borderRadius: '16px',
            background: isSilent
              ? 'rgba(234, 179, 8, 0.14)'
              : 'rgba(239, 68, 68, 0.14)',
            border: isSilent
              ? '1px solid rgba(234, 179, 8, 0.45)'
              : '1px solid rgba(239, 68, 68, 0.45)',
            backdropFilter: 'blur(24px)',
            padding: '10px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            animation: 'fadeIn 0.2s ease-out',
            boxShadow: isSilent
              ? '0 6px 24px rgba(234, 179, 8, 0.2)'
              : '0 6px 24px rgba(239, 68, 68, 0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
              {/* Pulsing indicator */}
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: isSilent ? '#eab308' : voiceDetected ? '#10b981' : '#ef4444',
                  boxShadow: isSilent
                    ? '0 0 10px #eab308'
                    : voiceDetected
                    ? '0 0 10px #10b981'
                    : '0 0 10px #ef4444',
                  flexShrink: 0,
                  animation: 'micRadar 1.2s infinite',
                }}
              />

              {/* Dynamic Sound Wave Bars reacting to microphone volume */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '18px', flexShrink: 0 }}>
                <div
                  className="wave-bar"
                  style={{
                    height: `${Math.max(4, eqScale * 18)}px`,
                    background: voiceDetected ? '#10b981' : '#a855f7',
                    transition: 'height 0.08s ease-out',
                  }}
                />
                <div
                  className="wave-bar"
                  style={{
                    height: `${Math.max(4, eqScale * 24)}px`,
                    background: voiceDetected ? '#34d399' : '#ec4899',
                    transition: 'height 0.08s ease-out',
                  }}
                />
                <div
                  className="wave-bar"
                  style={{
                    height: `${Math.max(4, eqScale * 16)}px`,
                    background: voiceDetected ? '#10b981' : '#8b5cf6',
                    transition: 'height 0.08s ease-out',
                  }}
                />
                <div
                  className="wave-bar"
                  style={{
                    height: `${Math.max(4, eqScale * 22)}px`,
                    background: voiceDetected ? '#34d399' : '#06b6d4',
                    transition: 'height 0.08s ease-out',
                  }}
                />
                <div
                  className="wave-bar"
                  style={{
                    height: `${Math.max(4, eqScale * 14)}px`,
                    background: voiceDetected ? '#10b981' : '#3b82f6',
                    transition: 'height 0.08s ease-out',
                  }}
                />
              </div>

              {/* Timer */}
              <span style={{ fontSize: '12px', color: '#f87171', fontWeight: 700, fontFamily: 'monospace', flexShrink: 0 }}>
                {formatSeconds(recordSeconds)}
              </span>

              {/* Status / Speech Preview */}
              <span
                style={{
                  fontSize: '13px',
                  color: isSilent ? '#fef08a' : liveTranscript ? '#f8fafc' : '#fca5a5',
                  fontStyle: liveTranscript ? 'normal' : 'italic',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                  fontWeight: liveTranscript ? 500 : 400,
                }}
              >
                {liveTranscript
                  ? `"${liveTranscript}"`
                  : isSilent
                  ? 'No audio detected yet — speak into your microphone'
                  : voiceDetected
                  ? 'Voice detected · Transcribing speech live...'
                  : 'Listening... Start speaking now'}
              </span>
            </div>

            {/* Action buttons on live transcriber */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <button
                onClick={() => stopLiveTranscription(false)}
                style={{
                  background: '#10b981',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '8px',
                  padding: '5px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
                }}
                title="Apply speech to prompt"
              >
                <IconCheck size={14} />
                <span>Done</span>
              </button>

              <button
                onClick={() => stopLiveTranscription(true)}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  color: '#94a3b8',
                  borderRadius: '8px',
                  padding: '5px 8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Cancel voice input"
              >
                <IconX size={14} />
              </button>
            </div>
          </div>

          {/* Silence Diagnostic Helper */}
          {isSilent && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '4px',
                borderTop: '1px solid rgba(234, 179, 8, 0.25)',
                fontSize: '11.5px',
                color: '#fef08a',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <IconAlertTriangle size={14} style={{ color: '#eab308' }} />
                <span>Microphone volume is 0. Make sure your mic is unmuted in Windows Sound Settings.</span>
              </div>
              {audioDevices.length > 1 && (
                <select
                  value={selectedDeviceId}
                  onChange={(e) => {
                    setSelectedDeviceId(e.target.value)
                    startLiveTranscription()
                  }}
                  style={{
                    background: '#1e1b4b',
                    color: '#f8fafc',
                    border: '1px solid rgba(139, 92, 246, 0.5)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    padding: '2px 6px',
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {audioDevices.map((d, idx) => (
                    <option key={d.deviceId || idx} value={d.deviceId}>
                      {d.label || `Microphone ${idx + 1}`}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      )}

      {/* Whisper transcribing banner */}
      {isTranscribing && (
        <div
          style={{
            marginBottom: '8px',
            borderRadius: '12px',
            background: 'rgba(139, 92, 246, 0.15)',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12.5px',
            color: '#c084fc',
          }}
        >
          <IconLoader2 size={16} className="animate-spin" />
          <span>Whisper AI is transcribing speech...</span>
        </div>
      )}

      {/* Status notification banner */}
      {micStatusMsg && (
        <div
          style={{
            marginBottom: '8px',
            borderRadius: '12px',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            padding: '6px 14px',
            fontSize: '12.5px',
            color: '#fca5a5',
          }}
        >
          {micStatusMsg}
        </div>
      )}

      {/* Main Glass Input Bar Card */}
      <div
        style={{
          borderRadius: '24px',
          background: 'rgba(255, 255, 255, 0.035)',
          backdropFilter: 'blur(36px) saturate(190%)',
          WebkitBackdropFilter: 'blur(36px) saturate(190%)',
          border: isRecording ? '1px solid rgba(239, 68, 68, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
          borderTop: isRecording ? '1px solid rgba(239, 68, 68, 0.7)' : '1px solid rgba(255, 255, 255, 0.16)',
          padding: '16px 20px 14px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          boxShadow: isRecording
            ? '0 20px 50px rgba(239, 68, 68, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.12)'
            : '0 20px 50px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        }}
      >
        {/* Attachment Tag Pill */}
        {attachment && (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(139, 92, 246, 0.15)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                borderRadius: '8px',
                padding: '4px 10px',
                fontSize: '12px',
                color: '#f8fafc',
              }}
            >
              <IconFileTypePdf size={15} style={{ color: '#c084fc' }} />
              <span style={{ maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                {attachment.name}
              </span>
              <button
                onClick={() => setAttachment(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', display: 'flex' }}
                title="Remove attachment"
              >
                <IconX size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={ref}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={isRecording ? 'Listening live... speak your prompt' : 'Ask Nexus anything...'}
          disabled={loading}
          rows={1}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: '14.5px',
            fontFamily: 'inherit',
            resize: 'none',
            lineHeight: 1.5,
            maxHeight: '140px',
            minHeight: '40px',
            color: '#f8fafc',
          }}
        />

        {/* Bottom Bar Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px' }}>
          {/* Left Controls: Paperclip, Live Mic, Voice Mode & Web Access */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={loading}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(255, 255, 255, 0.04)',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
                transition: 'all 0.18s ease',
              }}
              title="Attach PDF Document"
            >
              <IconPaperclip size={16} />
            </button>

            {/* Live Voice Transcriber Button */}
            <button
              id="btn-live-voice"
              type="button"
              onClick={toggleRecording}
              disabled={loading || isTranscribing}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                border: isRecording ? '1px solid #ef4444' : '1px solid rgba(139, 92, 246, 0.25)',
                background: isRecording ? 'rgba(239, 68, 68, 0.2)' : 'rgba(139, 92, 246, 0.08)',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isRecording ? '#ef4444' : '#c084fc',
                boxShadow: isRecording ? '0 0 12px rgba(239, 68, 68, 0.5)' : 'none',
                transition: 'all 0.18s ease',
              }}
              title={isRecording ? 'Stop Live Transcription' : 'Live Voice Dictation (Speak to Type)'}
              aria-label="Live Voice Dictation"
            >
              {isRecording ? <IconMicrophoneOff size={16} /> : <IconMicrophone size={16} />}
            </button>

            {/* Immersive Voice Mode Button (Conversational Modal) */}
            <button
              id="btn-voice-modal-launcher"
              type="button"
              onClick={onOpenVoiceModal}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '12px',
                border: '1px solid rgba(236, 72, 153, 0.3)',
                background: 'rgba(236, 72, 153, 0.08)',
                color: '#f472b6',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.18s ease',
              }}
              title="Open Conversational Voice Mode (Nexus speaks back)"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(236, 72, 153, 0.18)'
                e.currentTarget.style.borderColor = 'rgba(236, 72, 153, 0.6)'
                e.currentTarget.style.color = '#ffffff'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(236, 72, 153, 0.08)'
                e.currentTarget.style.borderColor = 'rgba(236, 72, 153, 0.3)'
                e.currentTarget.style.color = '#f472b6'
              }}
            >
              <IconSparkles size={14} style={{ color: '#f472b6' }} />
              <span>Voice mode</span>
            </button>

            {/* Web Access Toggle Pill */}
            <button
              type="button"
              onClick={() => setToolWeb(!toolWeb)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '14px',
                border: toolWeb ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                background: toolWeb ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                color: toolWeb ? '#818cf8' : '#64748b',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.18s ease',
              }}
              title="Toggle Live Web Search"
            >
              <IconWorldSearch size={14} />
              <span>Web access</span>
              {toolWeb && <IconCheck size={12} style={{ color: '#818cf8' }} />}
            </button>
          </div>

          {/* Right Control: Submit Arrow Button */}
          <button
            onClick={handleSend}
            disabled={(!text.trim() && !attachment) || loading}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '11px',
              border: 'none',
              background: ((!text.trim() && !attachment) || loading)
                ? 'rgba(255, 255, 255, 0.08)'
                : 'linear-gradient(135deg, #6366f1, #a855f7)',
              cursor: ((!text.trim() && !attachment) || loading) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: ((!text.trim() && !attachment) || loading) ? 'none' : '0 4px 14px rgba(99, 102, 241, 0.4)',
              transition: 'all 0.18s ease',
            }}
          >
            {loading ? <IconLoader2 size={16} className="animate-spin" /> : <IconSend size={15} />}
          </button>
        </div>
      </div>

      {/* Footer Disclaimer */}
      <p
        style={{
          fontSize: '11px',
          color: '#64748b',
          textAlign: 'center',
          margin: '8px 0 0 0',
          fontWeight: 400,
        }}
      >
        Nexus can make mistakes. Check important information.
      </p>
    </div>
  )
}
