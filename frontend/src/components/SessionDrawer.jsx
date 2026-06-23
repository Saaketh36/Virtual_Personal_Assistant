import { IconMessage, IconPlus } from '@tabler/icons-react'

export default function SessionDrawer({ open, setOpen, sessions, setSessions, activeSession, setActiveSession }) {

  const newSession = () => {
    const id = `session_${Date.now()}`
    setSessions(prev => [...prev, { id, name: 'New conversation' }])
    setActiveSession(id)
    setOpen(false)
  }

  return (
    <div style={{
      position: 'absolute', top: '50px', left: 0, right: 0, bottom: 0,
      zIndex: 20,
      background: '#0a0812',
      borderTop: '1px solid #251f3a',
      transform: open ? 'translateY(0)' : 'translateY(-100%)',
      transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '16px', height: '100%', overflowY: 'auto' }}>
        <p style={{ color: '#3d3020', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>
          sessions
        </p>

        {sessions.map(session => (
          <button
            key={session.id}
            onClick={() => { setActiveSession(session.id); setOpen(false) }}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 12px', borderRadius: '8px', textAlign: 'left',
              fontSize: '13px', cursor: 'pointer', width: '100%',
              background: activeSession === session.id ? '#2a0810' : 'transparent',
              border: activeSession === session.id ? '1px solid #c0152a' : '1px solid transparent',
              color: activeSession === session.id ? '#fdebd0' : '#5a4830',
            }}
          >
            <IconMessage size={14} style={{ color: activeSession === session.id ? '#c0152a' : '#3d3020', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.name}</span>
          </button>
        ))}

        <button
          onClick={newSession}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 12px', borderRadius: '8px',
            fontSize: '13px', cursor: 'pointer', width: '100%',
            background: 'transparent', border: '1px dashed #251f3a', color: '#3d3020',
            marginTop: '4px',
          }}
        >
          <IconPlus size={14} />
          new conversation
        </button>
      </div>
    </div>
  )
}