import {
  IconMicrophone,
  IconMicrophoneOff,
  IconX,
  IconSparkles,
  IconLoader2,
} from '@tabler/icons-react'

export default function VoiceModal({
  open,
  onClose,
  recording,
  processing,
  onToggleMic,
  transcript,
}) {
  if (!open) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 90,
      background: 'rgba(5, 7, 15, 0.92)', backdropFilter: 'blur(24px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px', animation: 'fadeIn 0.2s ease-out forwards',
    }}>
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: '24px', right: '24px',
          width: '36px', height: '36px', borderRadius: '50%',
          background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)',
          color: '#cbd5e1', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease',
        }}
        title="Exit Voice Mode"
      >
        <IconX size={18} />
      </button>

      {/* Main Glowing Sphere / Orb */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px',
        maxWidth: '520px', width: '100%', textAlign: 'center',
      }}>
        <div style={{
          position: 'relative', width: '140px', height: '140px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div
            className={recording ? 'voice-orb-glow' : ''}
            style={{
              width: '120px', height: '120px', borderRadius: '50%',
              background: recording
                ? 'linear-gradient(135deg, #8b5cf6, #ec4899, #06b6d4)'
                : 'linear-gradient(135deg, #475569, #334155)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: recording
                ? '0 0 40px rgba(139, 92, 246, 0.6), 0 0 80px rgba(236, 72, 153, 0.4)'
                : 'none',
              transition: 'all 0.3s ease',
            }}
          >
            {processing ? (
              <IconLoader2 size={42} className="animate-spin" style={{ color: '#fff' }} />
            ) : (
              <IconSparkles size={42} style={{ color: '#fff' }} />
            )}
          </div>
        </div>

        {/* Listening / Processing state label */}
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>
            {recording ? 'Listening...' : processing ? 'Processing Response...' : 'Voice Mode Ready'}
          </h2>
          <p style={{ fontSize: '13px', color: '#94a3b8' }}>
            {recording ? 'Speak clearly into your microphone' : 'Tap mic below to speak to Nexus'}
          </p>
        </div>

        {/* Live Transcript Display */}
        <div style={{
          minHeight: '60px', width: '100%', background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px',
          padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{
            fontSize: '14px', color: transcript ? '#f8fafc' : '#64748b',
            fontStyle: transcript ? 'normal' : 'italic',
          }}>
            {transcript ? `"${transcript}"` : 'Listening for input...'}
          </span>
        </div>

        {/* Control Action Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={onToggleMic}
            disabled={processing}
            style={{
              height: '48px', padding: '0 24px', borderRadius: '24px', border: 'none',
              background: recording
                ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                : 'linear-gradient(135deg, #8b5cf6, #ec4899)',
              color: '#ffffff', fontSize: '14px', fontWeight: 600,
              cursor: processing ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '8px',
              boxShadow: '0 4px 20px rgba(139, 92, 246, 0.4)',
              transition: 'all 0.18s ease',
            }}
          >
            {recording ? (
              <>
                <IconMicrophoneOff size={18} />
                <span>Stop Listening</span>
              </>
            ) : (
              <>
                <IconMicrophone size={18} />
                <span>Start Speaking</span>
              </>
            )}
          </button>

          <button
            onClick={onClose}
            style={{
              height: '48px', padding: '0 20px', borderRadius: '24px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              background: 'rgba(255, 255, 255, 0.04)', color: '#cbd5e1',
              fontSize: '14px', fontWeight: 500, cursor: 'pointer',
            }}
          >
            End Voice Session
          </button>
        </div>
      </div>
    </div>
  )
}
