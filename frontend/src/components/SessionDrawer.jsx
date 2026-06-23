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
    setSessions(prev => [...prev, { id, name: 'New conversation' }])
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
    <div style={{
      position: 'absolute', top: '50px', left: 0, right: 0, bottom: 0,
      zIndex: 20,
      background: '#0a0812e6',
      backdropFilter: 'blur(10px)',
      borderTop: '1px solid #251f3a',
      transform: open ? 'translateY(0)' : 'translateY(-100%)',
      transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '16px', height: '100%', overflowY: 'auto' }}>
        <p style={{ color: '#9a7e5a', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px', opacity: 0.7 }}>
          conversations
        </p>

        {sessions.map(session => (
          <div
            key={session.id}
            onClick={() => {
              if (editingSessionId !== session.id) {
                setActiveSession(session.id)
                setOpen(false)
              }
            }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
              padding: '8px 12px', borderRadius: '8px',
              fontSize: '13px', cursor: editingSessionId === session.id ? 'default' : 'pointer', width: '100%',
              background: activeSession === session.id ? 'rgba(192, 21, 42, 0.08)' : 'rgba(255, 255, 255, 0.01)',
              border: activeSession === session.id ? '1px solid rgba(192, 21, 42, 0.4)' : '1px solid rgba(37, 31, 58, 0.5)',
              color: activeSession === session.id ? '#fdebd0' : '#9a7e5a',
              transition: 'all 0.2s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
              <IconMessage size={14} style={{ color: activeSession === session.id ? '#c0152a' : '#5a4830', flexShrink: 0 }} />
              {editingSessionId === session.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: '#131025', border: '1px solid #c0152a',
                    borderRadius: '4px', color: '#fdebd0', fontSize: '13px',
                    padding: '2px 6px', width: '100%', outline: 'none',
                  }}
                  autoFocus
                />
              ) : (
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.name}</span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              {editingSessionId === session.id ? (
                <>
                  <button
                    onClick={(e) => saveRename(e, session.id)}
                    style={{ background: 'transparent', border: 'none', color: '#4ade80', cursor: 'pointer', padding: '2px' }}
                    title="Save"
                  >
                    <IconCheck size={14} />
                  </button>
                  <button
                    onClick={cancelRename}
                    style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', padding: '2px' }}
                    title="Cancel"
                  >
                    <IconX size={14} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={(e) => startEditing(e, session)}
                    style={{ background: 'transparent', border: 'none', color: '#9a7e5a', opacity: 0.6, cursor: 'pointer', padding: '2px' }}
                    title="Rename"
                  >
                    <IconEdit size={13} />
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, session.id)}
                    style={{ background: 'transparent', border: 'none', color: '#c0152a', opacity: 0.6, cursor: 'pointer', padding: '2px' }}
                    title="Delete"
                  >
                    <IconTrash size={13} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}

        <button
          onClick={newSession}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 12px', borderRadius: '8px',
            fontSize: '13px', cursor: 'pointer', width: '100%',
            background: 'transparent', border: '1px dashed #251f3a', color: '#9a7e5a',
            marginTop: '4px', transition: 'all 0.2s',
          }}
        >
          <IconPlus size={14} />
          new conversation
        </button>
      </div>
    </div>
  )
}