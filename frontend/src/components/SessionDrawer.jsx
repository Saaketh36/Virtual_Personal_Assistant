import { useState } from 'react'
import { IconMessage, IconPlus, IconEdit, IconTrash, IconCheck, IconX } from '@tabler/icons-react'

export default function SessionDrawer({
  open,
  setOpen,
  sessions,
  setSessions,
  activeSession,
  setActiveSession,
  onDeleteSession,
  onRenameSession
}) {
  const [editingSessionId, setEditingSessionId] = useState(null)
  const [editingName, setEditingName] = useState('')

  const newSession = () => {
    const id = `session_${Date.now()}`
    setSessions(prev => [...prev, { id, name: `Chat ${sessions.length + 1}` }])
    setActiveSession(id)
    setOpen(false)
  }

  const startEditing = (e, session) => {
    e.stopPropagation()
    setEditingSessionId(session.id)
    setEditingName(session.name)
  }

  const saveRename = (e, id) => {
    e.stopPropagation()
    if (editingName.trim()) {
      onRenameSession(id, editingName.trim())
    }
    setEditingSessionId(null)
  }

  const cancelRename = (e) => {
    e.stopPropagation()
    setEditingSessionId(null)
  }

  const handleDelete = (e, id) => {
    e.stopPropagation()
    if (confirm('Are you sure you want to delete this conversation?')) {
      onDeleteSession(id)
    }
  }

  return (
    <div className="glass-panel" style={{
      position: 'absolute', top: '54px', left: 0, right: 0, bottom: 0,
      zIndex: 25,
      background: 'rgba(7, 9, 19, 0.92)',
      backdropFilter: 'blur(20px)',
      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
      transform: open ? 'translateY(0)' : 'translateY(calc(-100% - 54px))',
      transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '8px', padding: '20px',
        maxWidth: '720px', margin: '0 auto', height: '100%', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <p style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
            Recent Conversations ({sessions.length})
          </p>
          <button
            onClick={newSession}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 12px', borderRadius: '8px',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
              border: 'none', color: '#ffffff',
              boxShadow: '0 2px 12px rgba(139, 92, 246, 0.4)',
            }}
          >
            <IconPlus size={14} />
            <span>New Chat</span>
          </button>
        </div>

        {sessions.map(session => {
          const isActive = activeSession === session.id
          const isEditing = editingSessionId === session.id

          return (
            <div
              key={session.id}
              onClick={() => {
                if (!isEditing) {
                  setActiveSession(session.id)
                  setOpen(false)
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                padding: '10px 14px', borderRadius: '10px',
                fontSize: '13.5px', cursor: isEditing ? 'default' : 'pointer', width: '100%',
                background: isActive ? 'rgba(139, 92, 246, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                border: isActive ? '1px solid rgba(139, 92, 246, 0.45)' : '1px solid rgba(255, 255, 255, 0.06)',
                color: isActive ? '#f8fafc' : '#94a3b8',
                transition: 'all 0.18s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                <IconMessage size={16} style={{ color: isActive ? '#c084fc' : '#64748b', flexShrink: 0 }} />
                {isEditing ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.key === 'Enter' && saveRename(e, session.id)}
                    style={{
                      background: '#070913', border: '1px solid #8b5cf6',
                      borderRadius: '6px', color: '#f8fafc', fontSize: '13px',
                      padding: '4px 8px', width: '100%', outline: 'none',
                    }}
                    autoFocus
                  />
                ) : (
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isActive ? 600 : 400 }}>
                    {session.name}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                {isEditing ? (
                  <>
                    <button
                      onClick={(e) => saveRename(e, session.id)}
                      style={{ background: 'transparent', border: 'none', color: '#10b981', cursor: 'pointer', padding: '3px' }}
                      title="Save"
                    >
                      <IconCheck size={15} />
                    </button>
                    <button
                      onClick={cancelRename}
                      style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '3px' }}
                      title="Cancel"
                    >
                      <IconX size={15} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={(e) => startEditing(e, session)}
                      style={{ background: 'transparent', border: 'none', color: '#94a3b8', opacity: 0.7, cursor: 'pointer', padding: '3px' }}
                      title="Rename"
                    >
                      <IconEdit size={14} />
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, session.id)}
                      style={{ background: 'transparent', border: 'none', color: '#ef4444', opacity: 0.7, cursor: 'pointer', padding: '3px' }}
                      title="Delete"
                    >
                      <IconTrash size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}