import { useState } from 'react'
import {
  IconSearch,
  IconX,
  IconCheck,
  IconActivity,
  IconBrain,
  IconShieldCheck,
  IconBell,
  IconChevronDown,
  IconDownload,
  IconMail,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react'

export default function Topbar({
  sidebarOpen,
  setSidebarOpen,
  emailPanelOpen,
  setEmailPanelOpen,
  unreadCount = 0,
  activeSessionName = 'Personal workspace',
  onExportChat,
  onOpenCommandPalette,
}) {
  const [showEngineModal, setShowEngineModal] = useState(false)

  return (
    <>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          height: '56px',
          flexShrink: 0,
          zIndex: 30,
          position: 'relative',
          background: 'rgba(255, 255, 255, 0.02)',
          backdropFilter: 'blur(32px) saturate(190%)',
          WebkitBackdropFilter: 'blur(32px) saturate(190%)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        {/* Left Section: Sidebar Toggle & Personal Workspace Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '9px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(255, 255, 255, 0.04)',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justify: 'center',
              transition: 'all 0.18s ease',
            }}
            title={sidebarOpen ? 'Collapse Sidebar (⌘B)' : 'Expand Sidebar (⌘B)'}
          >
            {sidebarOpen ? <IconLayoutSidebarLeftCollapse size={16} /> : <IconLayoutSidebarLeftExpand size={16} />}
          </button>

          {/* Workspace Selector Dropdown */}
          <button
            onClick={() => setShowEngineModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: '13px',
              color: '#f8fafc',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.18s ease',
            }}
          >
            <span>Personal workspace</span>
            <IconChevronDown size={14} style={{ color: '#94a3b8' }} />
          </button>
        </div>

        {/* Right Section: Status Pill, Spotlight ⌘K, Bell, Export & Gmail */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Status Pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 12px',
              borderRadius: '20px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              fontSize: '11.5px',
              color: '#34d399',
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#10b981',
                boxShadow: '0 0 8px #10b981',
              }}
            />
            <span>● Ready</span>
          </div>

          {/* Command Spotlight Button */}
          <button
            onClick={onOpenCommandPalette}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '14px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#94a3b8',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.18s ease',
            }}
          >
            <IconSearch size={14} style={{ color: '#818cf8' }} />
            <span>Search</span>
            <kbd
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                padding: '1px 5px',
                borderRadius: '4px',
                fontSize: '10px',
                color: '#cbd5e1',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              ⌘K
            </kbd>
          </button>

          {/* Notifications Bell */}
          <button
            onClick={onOpenCommandPalette}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(255, 255, 255, 0.04)',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justify: 'center',
            }}
          >
            <IconBell size={16} />
          </button>

          {/* Export Chat */}
          {onExportChat && (
            <button
              onClick={onExportChat}
              style={{
                height: '32px',
                padding: '0 12px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(255, 255, 255, 0.04)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: '#cbd5e1',
                fontSize: '12px',
                fontWeight: 500,
              }}
              title="Export Markdown Transcript"
            >
              <IconDownload size={14} style={{ color: '#38bdf8' }} />
              <span>Export</span>
            </button>
          )}

          {/* Gmail Drawer Toggle */}
          <button
            onClick={() => setEmailPanelOpen(prev => !prev)}
            style={{
              height: '32px',
              padding: '0 12px',
              borderRadius: '10px',
              border: emailPanelOpen ? '1px solid #f472b6' : '1px solid rgba(255, 255, 255, 0.08)',
              background: emailPanelOpen ? 'rgba(244, 114, 182, 0.18)' : 'rgba(255, 255, 255, 0.04)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: emailPanelOpen ? '#ffffff' : '#cbd5e1',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            <IconMail size={15} style={{ color: emailPanelOpen ? '#ffffff' : '#f472b6' }} />
            <span>Gmail</span>
            {unreadCount > 0 && (
              <span
                style={{
                  background: '#f472b6',
                  color: '#ffffff',
                  fontSize: '9.5px',
                  fontWeight: 700,
                  borderRadius: '10px',
                  minWidth: '16px',
                  height: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'center',
                  padding: '0 4px',
                }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* AI Engine Status & Capabilities Modal */}
      {showEngineModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justify: 'center',
            padding: '20px',
          }}
          onClick={() => setShowEngineModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '480px',
              background: '#10121c',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'rgba(139, 92, 246, 0.15)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justify: 'center',
                    color: '#c084fc',
                  }}
                >
                  <IconBrain size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
                    Nexus AI Engine Capabilities
                  </h3>
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                    Active inference specs & tool capabilities
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowEngineModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <IconX size={18} />
              </button>
            </div>

            {/* Spec Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              <div
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>
                  Model Architecture
                </span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>Llama 3.1 8B Instruct</span>
              </div>
              <div
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>
                  Context Window
                </span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#38bdf8' }}>128,000 Tokens</span>
              </div>
            </div>

            {/* Active Tools List */}
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Connected Workspace Tools
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  { name: 'Gmail Integration (OAuth2)', status: 'Connected', icon: IconShieldCheck, color: '#10b981' },
                  { name: 'DuckDuckGo Live Web Search', status: 'Active', icon: IconCheck, color: '#38bdf8' },
                  { name: 'PDF Ingestion & Chroma Vector DB', status: 'Ready', icon: IconCheck, color: '#c084fc' },
                  { name: 'Whisper Audio Transcription & TTS', status: 'Ready', icon: IconActivity, color: '#ec4899' },
                ].map((tool, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justify: 'space-between',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      fontSize: '12.5px',
                      color: '#cbd5e1',
                    }}
                  >
                    <span>{tool.name}</span>
                    <span style={{ color: tool.color, fontSize: '11px', fontWeight: 600 }}>{tool.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setShowEngineModal(false)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  )
}



