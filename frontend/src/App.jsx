import { useState, useEffect } from 'react'
import Topbar from './components/Topbar'
import Sidebar from './components/Sidebar'
import EmailPanel from './components/EmailPanel'
import Messages from './components/Messages'
import InputBar from './components/InputBar'
import CommandPalette from './components/CommandPalette'
import VoiceModal from './components/VoiceModal'

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [emailPanelOpen, setEmailPanelOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [voiceModalOpen, setVoiceModalOpen] = useState(false)

  const [unreadCount, setUnreadCount] = useState(0)
  const [sessions, setSessions] = useState([
    { id: 'default', name: 'General Research' }
  ])
  const [activeSession, setActiveSession] = useState('default')
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'agent',
      content: "Welcome to **Nexus Studio** — your intelligent AI workspace.",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      model: 'llama 3.1 8b',
    }
  ])
  const [loading, setLoading] = useState(false)

  const activeSessionItem = sessions.find(s => s.id === activeSession)

  // Global Keyboard Shortcuts (Cmd/Ctrl + K, Cmd/Ctrl + B)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey
      if (isCmdOrCtrl && (e.code === 'KeyK' || e.key.toLowerCase() === 'k')) {
        e.preventDefault()
        e.stopPropagation()
        setCommandPaletteOpen(prev => !prev)
      }
      if (isCmdOrCtrl && (e.code === 'KeyB' || e.key.toLowerCase() === 'b')) {
        e.preventDefault()
        e.stopPropagation()
        setSidebarOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  const handleNewSession = () => {
    const newId = `session_${Date.now()}`
    const newSession = { id: newId, name: `Conversation ${sessions.length + 1}` }
    setSessions(prev => [newSession, ...prev])
    setActiveSession(newId)
    setMessages([
      {
        id: Date.now(),
        role: 'agent',
        content: "New workspace session created. How can I help you?",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        model: 'llama 3.1 8b',
      }
    ])
  }

  const exportChat = () => {
    if (!messages.length) return
    const activeName = activeSessionItem?.name || 'chat'
    let content = `# Conversation Log: ${activeName}\n`
    content += `*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`
    
    messages.forEach(msg => {
      const sender = msg.role === 'user' ? 'User' : 'Assistant'
      content += `### **${sender}** (${msg.time})\n\n${msg.content}\n\n`
    })

    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${activeName.toLowerCase().replace(/\s+/g, '_')}_export.md`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const sendMessage = async (text, attachment = null) => {
    if ((!text.trim() && !attachment) || loading) return

    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: attachment ? `${text || 'PDF request'}\n\nAttached: ${attachment.name}` : text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      let res
      if (attachment) {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 120000)
        const formData = new FormData()
        formData.append('message', text || 'Summarize this PDF')
        formData.append('session_id', activeSession)
        formData.append('file', attachment)
        res = await fetch('http://localhost:8000/chat-pdf', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        })
        clearTimeout(timeout)
      } else {
        res = await fetch('http://localhost:8000/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, session_id: activeSession }),
        })
      }
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`)
      }
      const data = await res.json()
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'agent',
        content: data.reply || 'The server returned an empty response. Please try again.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        model: data.model || 'llama 3.1 8b',
        usedSearch: data.used_search,
      }])
    } catch (err) {
      console.error('[PDF/Chat error]', err)
      let msg = 'Something went wrong. Is the backend running?'
      if (err?.name === 'AbortError') {
        msg = 'The PDF request timed out. Try a smaller file or a simpler question.'
      } else if (err?.message) {
        msg = `Something went wrong: ${err.message}`
      }
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'agent',
        content: msg,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        model: 'llama 3.1 8b',
      }])
    } finally {
      setLoading(false)
    }
  }

  const handleVoiceReply = (data) => {
    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: data.transcript ? `🎤 "${data.transcript}"` : '🎤 voice message',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    if (data.audio) {
      const audioBytes = atob(data.audio)
      const arrayBuffer = new Uint8Array(audioBytes.length)
      for (let i = 0; i < audioBytes.length; i++) {
        arrayBuffer[i] = audioBytes.charCodeAt(i)
      }
      const blob = new Blob([arrayBuffer], { type: 'audio/wav' })
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.play()
    }

    const agentMsg = {
      id: Date.now() + 1,
      role: 'agent',
      content: data.reply,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      model: data.model || 'llama 3.1 8b',
      usedSearch: data.used_search || false,
      audio: !!data.audio,
      audioData: data.audio || null,
    }

    setMessages(prev => [...prev, userMsg, agentMsg])
  }

  const deleteSession = (id) => {
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id)
      if (filtered.length === 0) {
        const newId = `session_${Date.now()}`
        setActiveSession(newId)
        return [{ id: newId, name: 'New conversation' }]
      }
      if (activeSession === id) {
        setActiveSession(filtered[0].id)
      }
      return filtered
    })
  }

  const renameSession = (id, newName) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s))
  }

  return (
    <div style={{ height: '100vh', display: 'flex', background: '#06070b', fontFamily: 'inherit', width: '100%', position: 'relative', overflow: 'hidden' }}>
      {/* Background Mesh Orbs */}
      <div className="bg-mesh-container">
        <div className="mesh-orb mesh-orb-1" />
        <div className="mesh-orb mesh-orb-2" />
        <div className="mesh-orb mesh-orb-3" />
      </div>

      {/* Persistent Left Workspace Sidebar */}
      <Sidebar
        open={sidebarOpen}
        setOpen={setSidebarOpen}
        sessions={sessions}
        activeSession={activeSession}
        setActiveSession={setActiveSession}
        onDeleteSession={deleteSession}
        onRenameSession={renameSession}
        onNewSession={handleNewSession}
        onOpenGmail={() => setEmailPanelOpen(true)}
        onOpenVoiceModal={() => setVoiceModalOpen(true)}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        unreadCount={unreadCount}
      />

      {/* Main AI Workspace Content Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', position: 'relative' }}>
        <Topbar
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          emailPanelOpen={emailPanelOpen}
          setEmailPanelOpen={setEmailPanelOpen}
          unreadCount={unreadCount}
          activeSessionName={activeSessionItem?.name || 'General Assistant'}
          onExportChat={exportChat}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        />
        
        <EmailPanel
          open={emailPanelOpen}
          setOpen={setEmailPanelOpen}
          onUpdateUnread={setUnreadCount}
        />
        
        <Messages
          messages={messages}
          loading={loading}
          onSelectPrompt={(prompt) => sendMessage(prompt)}
        />
        
        <InputBar
          onSend={sendMessage}
          onVoiceReply={handleVoiceReply}
          loading={loading}
          activeSession={activeSession}
          onOpenVoiceModal={() => setVoiceModalOpen(true)}
        />
      </div>

      {/* Spotlight Command Palette Modal */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNewChat={handleNewSession}
        onOpenGmail={() => setEmailPanelOpen(true)}
        onOpenVoice={() => setVoiceModalOpen(true)}
        onExport={exportChat}
        onClear={() => setMessages([])}
      />

      {/* Immersive Voice Mode Modal */}
      <VoiceModal
        isOpen={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
        onVoiceReply={handleVoiceReply}
        activeSession={activeSession}
      />
    </div>
  )
}

export default App
