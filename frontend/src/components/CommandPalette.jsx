import { useState, useEffect } from 'react'
import {
  IconSearch,
  IconMail,
  IconFileText,
  IconWorldSearch,
  IconCode,
  IconMicrophone,
  IconDownload,
  IconPlus,
  IconX,
  IconCommand,
} from '@tabler/icons-react'

export default function CommandPalette({
  open,
  onClose,
  onRunAction,
}) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const COMMANDS = [
    { id: 'gmail', group: 'Actions', title: 'Check unread Gmail', icon: IconMail, color: '#ec4899', action: () => onRunAction('gmail') },
    { id: 'doc', group: 'Actions', title: 'Summarize document / PDF', icon: IconFileText, color: '#8b5cf6', action: () => onRunAction('pdf') },
    { id: 'web', group: 'Actions', title: 'Search tech news on Web', icon: IconWorldSearch, color: '#06b6d4', action: () => onRunAction('web') },
    { id: 'code', group: 'Actions', title: 'Generate Python script', icon: IconCode, color: '#10b981', action: () => onRunAction('code') },
    { id: 'voice', group: 'Actions', title: 'Start Voice Session', icon: IconMicrophone, color: '#f472b6', action: () => onRunAction('voice') },
    { id: 'new_chat', group: 'Navigation', title: 'Create New Conversation', icon: IconPlus, color: '#a855f7', action: () => onRunAction('new_chat') },
    { id: 'export', group: 'Navigation', title: 'Export Chat to Markdown', icon: IconDownload, color: '#38bdf8', action: () => onRunAction('export') },
  ]

  const filtered = COMMANDS.filter(c =>
    c.title.toLowerCase().includes(query.toLowerCase()) ||
    c.group.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!open) return
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => (prev + 1) % (filtered.length || 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => (prev - 1 + (filtered.length || 1)) % (filtered.length || 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].action()
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, selectedIndex, filtered, onClose])

  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(5, 7, 15, 0.75)', backdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '580px', background: '#10121C',
          border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7), 0 0 40px rgba(139, 92, 246, 0.2)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Search Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '14px 18px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}>
          <IconSearch size={18} style={{ color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search Nexus actions, tools or commands... (Esc to close)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            style={{
              background: 'transparent', border: 'none', outline: 'none',
              color: '#f8fafc', fontSize: '14px', width: '100%',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex' }}
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Command List */}
        <div style={{ maxHeight: '360px', overflowY: 'auto', padding: '8px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
              No commands found
            </div>
          ) : (
            filtered.map((item, index) => {
              const isSelected = selectedIndex === index
              const Icon = item.icon

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    item.action()
                    onClose()
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderRadius: '10px', cursor: 'pointer',
                    background: isSelected ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                    border: isSelected ? '1px solid rgba(139, 92, 246, 0.4)' : '1px solid transparent',
                    color: isSelected ? '#f8fafc' : '#cbd5e1',
                    fontSize: '13px', transition: 'all 0.12s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '7px',
                      background: `${item.color}18`, display: 'flex',
                      alignItems: 'center', justifyContent: 'center', color: item.color,
                    }}>
                      <Icon size={16} />
                    </div>
                    <span>{item.title}</span>
                  </div>

                  <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {item.group}
                  </span>
                </div>
              )
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div style={{
          padding: '10px 18px', borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(0, 0, 0, 0.3)', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', fontSize: '11px', color: '#64748b',
        }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>Esc Close</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <IconCommand size={12} />
            <span>K</span>
          </div>
        </div>
      </div>
    </div>
  )
}
