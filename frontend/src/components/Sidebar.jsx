import { useState } from 'react'
import {
  IconMessage,
  IconPlus,
  IconEdit,
  IconTrash,
  IconCheck,
  IconLayoutSidebarLeftCollapse,
  IconMail,
  IconFileText,
  IconMicrophone,
  IconCommand,
  IconSettings,
  IconChevronDown,
} from '@tabler/icons-react'

export default function Sidebar({
  open,
  setOpen,
  sessions,
  activeSession,
  setActiveSession,
  onDeleteSession,
  onRenameSession,
  onNewSession,
  onOpenCommandPalette,
  onOpenGmail,
  onOpenVoiceModal,
  onSelectWorkspaceCategory,
  unreadCount = 0,
}) {
  const [editingSessionId, setEditingSessionId] = useState(null)
  const [editingName, setEditingName] = useState('')

  const startRenaming = (session) => {
    setEditingSessionId(session.id)
    setEditingName(session.name)
  }

  const saveRenaming = (id) => {
    if (editingName.trim()) {
      onRenameSession(id, editingName.trim())
    }
    setEditingSessionId(null)
  }

  if (!open) return null

  return (
    <aside
      style={{
        width: '256px',
        height: '100vh',
        flexShrink: 0,
        background: 'rgba(255, 255, 255, 0.025)',
        backdropFilter: 'blur(36px) saturate(190%)',
        WebkitBackdropFilter: 'blur(36px) saturate(190%)',
        borderRight: '1px solid rgba(255, 255, 255, 0.07)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 30,
        transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Sidebar Header: N Squircle Logo & Brand */}
      <div
        style={{
          padding: '18px 20px',
          display: 'flex',
          alignItems: 'center',
          justify: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              display: 'flex',
              alignItems: 'center',
              justify: 'center',
              textAlign: 'center',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '16px',
              fontFamily: 'Outfit, sans-serif',
              lineHeight: 1,
              boxShadow: '0 4px 16px rgba(99, 102, 241, 0.4)',
              flexShrink: 0,
            }}
          >
            N
          </div>
          <span style={{ fontSize: '17px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.4px' }}>
            Nexus
          </span>
        </div>

        <button
          onClick={() => setOpen(false)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: '4px',
            borderRadius: '6px',
            transition: 'color 0.15s ease',
          }}
          title="Collapse Sidebar (⌘B)"
        >
          <IconLayoutSidebarLeftCollapse size={18} />
        </button>
      </div>

      {/* Primary Action Button: + New chat */}
      <div style={{ padding: '4px 16px 14px 16px' }}>
        <button
          onClick={onNewSession}
          style={{
            width: '100%',
            height: '44px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            border: 'none',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            justify: 'center',
            gap: '8px',
            cursor: 'pointer',
            boxShadow: '0 10px 24px rgba(99, 102, 241, 0.35)',
            transition: 'all 0.18s ease',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <IconPlus size={18} />
          <span>New chat</span>
        </button>
      </div>

      {/* Main Navigation & Recent Scroll Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0 14px 16px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* Navigation Section */}
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div
              onClick={() => onSelectWorkspaceCategory && onSelectWorkspaceCategory('chats')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 12px',
                borderRadius: '14px',
                cursor: 'pointer',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#f8fafc',
                fontSize: '13.5px',
                fontWeight: 600,
                transition: 'all 0.15s ease',
              }}
            >
              <IconMessage size={17} style={{ color: '#818cf8' }} />
              <span>Chats</span>
            </div>

            <div
              onClick={() => onSelectWorkspaceCategory && onSelectWorkspaceCategory('documents')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 12px',
                borderRadius: '14px',
                cursor: 'pointer',
                color: '#94a3b8',
                fontSize: '13.5px',
                fontWeight: 500,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
            >
              <IconFileText size={17} style={{ color: '#a855f7' }} />
              <span>Documents</span>
            </div>

            <div
              onClick={onOpenGmail}
              style={{
                display: 'flex',
                alignItems: 'center',
                justify: 'space-between',
                padding: '10px 12px',
                borderRadius: '14px',
                cursor: 'pointer',
                color: '#94a3b8',
                fontSize: '13.5px',
                fontWeight: 500,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <IconMail size={17} style={{ color: '#f472b6' }} />
                <span>Gmail</span>
              </div>
              {unreadCount > 0 && (
                <span
                  style={{
                    background: '#f472b6',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: 700,
                    borderRadius: '10px',
                    padding: '2px 7px',
                  }}
                >
                  {unreadCount}
                </span>
              )}
            </div>


            <div
              onClick={onOpenVoiceModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 12px',
                borderRadius: '14px',
                cursor: 'pointer',
                color: '#94a3b8',
                fontSize: '13.5px',
                fontWeight: 500,
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
            >
              <IconMicrophone size={17} style={{ color: '#fb7185' }} />
              <span>Voice</span>
            </div>
          </div>
        </div>

        {/* RECENT Threads Section */}
        <div>
          <div
            style={{
              fontSize: '10.5px',
              fontWeight: 700,
              color: '#64748b',
              padding: '4px 10px 8px 10px',
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
            }}
          >
            Recent
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {sessions.map((s) => {
              const isActive = activeSession === s.id
              const isEditing = editingSessionId === s.id

              return (
                <div
                  key={s.id}
                  onClick={() => setActiveSession(s.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justify: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    background: isActive ? 'rgba(255, 255, 255, 0.07)' : 'transparent',
                    border: isActive ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid transparent',
                    color: isActive ? '#f8fafc' : '#94a3b8',
                    fontSize: '13px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px', overflow: 'hidden', flex: 1 }}>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveRenaming(s.id)}
                        autoFocus
                        style={{
                          background: 'rgba(0,0,0,0.5)',
                          border: '1px solid #6366f1',
                          color: '#fff',
                          fontSize: '12px',
                          borderRadius: '6px',
                          padding: '2px 6px',
                          width: '100%',
                          outline: 'none',
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontWeight: isActive ? 600 : 400,
                        }}
                      >
                        {s.name}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {isEditing ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); saveRenaming(s.id); }}
                        style={{ background: 'transparent', border: 'none', color: '#10b981', cursor: 'pointer', padding: '2px' }}
                      >
                        <IconCheck size={14} />
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); startRenaming(s); }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#64748b',
                            cursor: 'pointer',
                            padding: '2px',
                            opacity: isActive ? 1 : 0.5,
                          }}
                          title="Rename"
                        >
                          <IconEdit size={13} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id); }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#64748b',
                            cursor: 'pointer',
                            padding: '2px',
                            opacity: isActive ? 1 : 0.5,
                          }}
                          title="Delete"
                        >
                          <IconTrash size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Footer: Settings & Workspace Account Profile Pill */}
      <div
        style={{
          padding: '12px 14px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div
          onClick={onOpenCommandPalette}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 12px',
            borderRadius: '12px',
            cursor: 'pointer',
            color: '#94a3b8',
            fontSize: '13px',
            fontWeight: 500,
            transition: 'all 0.15s ease',
          }}
        >
          <IconSettings size={16} style={{ color: '#64748b' }} />
          <span>Settings</span>
        </div>

        {/* Account Profile Pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justify: 'space-between',
            padding: '8px 12px',
            borderRadius: '16px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '9px',
                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                display: 'flex',
                alignItems: 'center',
                justify: 'center',
                textAlign: 'center',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 700,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              N
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#f8fafc', lineHeight: 1.2 }}>
                Nexus workspace
              </span>
              <span style={{ fontSize: '10.5px', color: '#64748b' }}>
                Local preview
              </span>
            </div>
          </div>
          <IconChevronDown size={14} style={{ color: '#64748b' }} />
        </div>
      </div>
    </aside>
  )
}


