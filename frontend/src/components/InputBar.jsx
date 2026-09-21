import { useState, useRef, useEffect } from 'react'
import {
  IconFileTypePdf,
  IconLoader2,
  IconMicrophone,
  IconMicrophoneOff,
  IconPaperclip,
  IconSend,
  IconX,
  IconMail,
  IconWorldSearch,
  IconFileText,
  IconCheck,
} from '@tabler/icons-react'

export default function InputBar({ onSend, onVoiceReply, loading, activeSession, onOpenVoiceModal }) {
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [attachment, setAttachment] = useState(null)

  // Tool transparency pills state
  const [toolGmail, setToolGmail] = useState(true)
  const [toolWeb, setToolWeb] = useState(true)
  const [toolDocs, setToolDocs] = useState(true)

  const ref = useRef(null)
  const fileRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const recognitionRef = useRef(null)

  const finalTranscriptRef = useRef('')
  const recordingActiveRef = useRef(false)

  useEffect(() => {
    return () => {
      recordingActiveRef.current = false
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [])

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
    onSend(text.trim(), attachment)
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

  return (
    <div
      style={{
        padding: '12px 24px 16px 24px',
        flexShrink: 0,
        width: '100%',
        maxWidth: '820px',
        margin: '0 auto',
        boxSizing: 'border-box',
        position: 'relative',
        zIndex: 10,
      }}
    >
      <div
        style={{
          borderRadius: '24px',
          background: 'rgba(255, 255, 255, 0.035)',
          backdropFilter: 'blur(36px) saturate(190%)',
          WebkitBackdropFilter: 'blur(36px) saturate(190%)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderTop: '1px solid rgba(255, 255, 255, 0.16)',
          padding: '16px 20px 14px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
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
          placeholder="Ask Nexus anything..."
          disabled={processing}
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
          {/* Left Controls: Paperclip, Voice & Web Access Toggle Pill */}
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
                justify: 'center',
                color: '#94a3b8',
                transition: 'all 0.18s ease',
              }}
              title="Attach PDF Document"
            >
              <IconPaperclip size={16} />
            </button>

            <button
              type="button"
              onClick={onOpenVoiceModal}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(255, 255, 255, 0.04)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justify: 'center',
                color: '#94a3b8',
                transition: 'all 0.18s ease',
              }}
              title="Open Voice Input"
            >
              <IconMicrophone size={16} />
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
              justify: 'center',
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
