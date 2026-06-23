import { useState } from 'react'
import Topbar from './components/Topbar'
import SessionDrawer from './components/SessionDrawer'
import Messages from './components/Messages'
import InputBar from './components/InputBar'

function App() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sessions, setSessions] = useState([
    { id: 'default', name: "Today's session" }
  ])
  const [activeSession, setActiveSession] = useState('default')
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'agent',
      content: "Hey Saaketh — I'm online and ready. Ask me anything, or tap the mic to speak.",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      model: 'llama 3.1 8b',
    }
  ])
  const [loading, setLoading] = useState(false)

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return

    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const res = await fetch('http://localhost:8000/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: activeSession }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'agent',
        content: data.reply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        model: data.model,
        usedSearch: data.used_search,
      }])
    } catch {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'agent',
        content: 'Something went wrong. Is the backend running?',
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

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0812', fontFamily: 'inherit', width: '100%', position: 'relative', overflow: 'hidden' }}>
      <Topbar drawerOpen={drawerOpen} setDrawerOpen={setDrawerOpen} />
      <SessionDrawer
        open={drawerOpen}
        setOpen={setDrawerOpen}
        sessions={sessions}
        setSessions={setSessions}
        activeSession={activeSession}
        setActiveSession={setActiveSession}
      />
      <Messages messages={messages} loading={loading} />
      <InputBar onSend={sendMessage} onVoiceReply={handleVoiceReply} loading={loading} />
    </div>
  )
}

export default App