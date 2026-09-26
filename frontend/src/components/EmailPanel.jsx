import { useState, useEffect, useCallback, useRef } from 'react'
import {
  IconMail,
  IconX,
  IconPlus,
  IconSearch,
  IconRefresh,
  IconArrowLeft,
  IconSend,
  IconBrandGoogle,
  IconInbox,
  IconPaperclip,
  IconFileText,
} from '@tabler/icons-react'

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

export default function EmailPanel({ open, setOpen, onUpdateUnread }) {
  const [authStatus, setAuthStatus] = useState({
    authenticated: false,
    unread_count: 0,
    email: null,
    total_messages: 0,
  })
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('all') // 'all' | 'unread'
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEmail, setSelectedEmail] = useState(null)

  // Compose modal state
  const [composing, setComposing] = useState(false)
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState([])
  const [sending, setSending] = useState(false)
  const fileInputRef = useRef(null)

  // Reply state
  const [replyBody, setReplyBody] = useState('')
  const [replying, setReplying] = useState(false)

  // Load status
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/email/status')
      const data = await res.json()
      setAuthStatus(data)
      if (onUpdateUnread) onUpdateUnread(data.unread_count || 0)
      return data.authenticated
    } catch (e) {
      console.error('Error checking email status:', e)
      return false
    }
  }, [onUpdateUnread])

  // Load emails
  const loadEmails = useCallback(async (query = '') => {
    setLoading(true)
    try {
      let url = '/email/inbox'
      if (query.trim()) {
        url = `/email/search?q=${encodeURIComponent(query.trim())}`
      }
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setEmails(data.emails || [])
      } else {
        setEmails([])
      }
    } catch (e) {
      console.error('Error loading emails:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  // Check on mount and open
  useEffect(() => {
    checkStatus().then((authed) => {
      if (authed && open) {
        loadEmails(searchQuery)
      }
    })
  }, [open, searchQuery, checkStatus, loadEmails])

  // Handle Auth connect click
  const handleConnect = async () => {
    setLoading(true)
    try {
      const res = await fetch('/email/auth')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Unable to start Gmail authentication.')
      }

      const data = await res.json()
      const authWindow = window.open(data.auth_url, 'gmailAuth', 'width=720,height=780')
      if (!authWindow) {
        window.location.href = data.auth_url
        return
      }

      for (let attempt = 0; attempt < 60; attempt += 1) {
        await wait(2000)
        const authed = await checkStatus()
        if (authed) {
          loadEmails()
          return
        }
      }

      alert('Gmail sign-in did not complete yet. Finish the Google approval window, then try Connect again.')
    } catch (e) {
      console.error('Auth trigger failed:', e)
      alert('Authentication trigger failed. Ensure backend is running.')
    } finally {
      setLoading(false)
    }
  }

  // View single email detail
  const handleViewEmail = async (email) => {
    setLoading(true)
    try {
      const res = await fetch(`/email/message/${email.id}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedEmail(data)
        // Mark as read in UI and backend
        if (email.unread) {
          fetch(`/email/message/${email.id}/read`, { method: 'POST' })
          setEmails(prev => prev.map(item => item.id === email.id ? { ...item, unread: false } : item))
          checkStatus()
        }
      }
    } catch (e) {
      console.error('Error loading email details:', e)
    } finally {
      setLoading(false)
    }
  }

  // Handle file attachment selection
  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files || [])
    if (!selected.length) return
    
    // Check total size
    const currentSize = attachments.reduce((sum, f) => sum + f.size, 0)
    const newSize = selected.reduce((sum, f) => sum + f.size, 0)
    if (currentSize + newSize > 25 * 1024 * 1024) {
      alert('Total attachment size cannot exceed 25 MB.')
      return
    }
    setAttachments(prev => [...prev, ...selected])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  // Send new compose email
  const handleSendEmail = async (e) => {
    e.preventDefault()
    if (!to || !subject || !body) return
    setSending(true)
    try {
      let res
      if (attachments.length > 0) {
        const formData = new FormData()
        formData.append('to', to)
        formData.append('subject', subject)
        formData.append('body', body)
        attachments.forEach((file) => {
          formData.append('files', file)
        })
        res = await fetch('/email/send', {
          method: 'POST',
          body: formData,
        })
      } else {
        res = await fetch('/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, subject, body }),
        })
      }

      if (res.ok) {
        setComposing(false)
        setTo('')
        setSubject('')
        setBody('')
        setAttachments([])
        alert('Email sent successfully!')
        loadEmails(searchQuery)
      } else {
        const err = await res.json()
        alert(`Failed to send email: ${err.detail || 'Unknown error'}`)
      }
    } catch (e) {
      alert(`Error sending email: ${e.message}`)
    } finally {
      setSending(false)
    }
  }

  // Send reply
  const handleSendReply = async () => {
    if (!replyBody.trim() || !selectedEmail) return
    setReplying(true)
    try {
      const res = await fetch('/email/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: selectedEmail.threadId,
          message_id: selectedEmail.id,
          to: selectedEmail.from,
          subject: selectedEmail.subject,
          body: replyBody,
        }),
      })
      if (res.ok) {
        setReplyBody('')
        alert('Reply sent successfully!')
        handleViewEmail(selectedEmail)
      } else {
        const err = await res.json()
        alert(`Failed to reply: ${err.detail || 'Unknown error'}`)
      }
    } catch (e) {
      alert(`Error replying: ${e.message}`)
    } finally {
      setReplying(false)
    }
  }

  if (!open) return null

  const filteredEmails = emails.filter(email => {
    if (filter === 'unread') return email.unread
    return true
  })

  const connectedEmail = authStatus.email || 'connected.user@gmail.com'
  const userInitial = connectedEmail.charAt(0).toUpperCase()

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(7, 9, 19, 0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justify: 'center',
        padding: '24px',
      }}
      onClick={() => setOpen(false)}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '920px',
          height: '85vh',
          maxHeight: '760px',
          background: 'rgba(13, 16, 28, 0.85)',
          backdropFilter: 'blur(36px) saturate(190%)',
          WebkitBackdropFilter: 'blur(36px) saturate(190%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '24px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(168, 85, 247, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Panel Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justify: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: 'rgba(244, 114, 182, 0.15)',
                border: '1px solid rgba(244, 114, 182, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justify: 'center',
                color: '#f472b6',
              }}
            >
              <IconMail size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
                Gmail Workspace
              </h3>
              <p style={{ fontSize: '11.5px', color: '#64748b', margin: 0 }}>
                Integrated email management & AI assistant
              </p>
            </div>
          </div>

          <button
            onClick={() => setOpen(false)}
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
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {!authStatus.authenticated ? (
            /* Unauthenticated View */
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justify: 'center',
                padding: '40px 24px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '20px',
                  background: 'linear-gradient(135deg, rgba(244, 114, 182, 0.2), rgba(168, 85, 247, 0.2))',
                  border: '1px solid rgba(244, 114, 182, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'center',
                  color: '#f472b6',
                  marginBottom: '20px',
                  boxShadow: '0 8px 24px rgba(244, 114, 182, 0.2)',
                }}
              >
                <IconBrandGoogle size={32} />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#ffffff', margin: '0 0 8px 0' }}>
                Connect Your Gmail Account
              </h3>
              <p style={{ fontSize: '13.5px', color: '#94a3b8', margin: '0 0 24px 0', maxWidth: '380px', lineHeight: 1.5 }}>
                Grant Nexus secure OAuth access to summarize unread emails, search messages, and compose replies.
              </p>
              <button
                onClick={handleConnect}
                disabled={loading}
                style={{
                  height: '42px',
                  padding: '0 24px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '13.5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 8px 20px rgba(236, 72, 153, 0.35)',
                }}
              >
                <IconBrandGoogle size={18} />
                <span>{loading ? 'Connecting Google Account...' : 'Sign in with Google'}</span>
              </button>
            </div>
          ) : (
            /* Authenticated View */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 24px' }}>
              
              {/* Visually Prominent Connected Account Section */}
              <div
                style={{
                  padding: '16px 20px',
                  borderRadius: '16px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'space-between',
                  marginBottom: '20px',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.2)',
                }}
              >
                {/* Account Profile Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '14px',
                      background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justify: 'center',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '18px',
                      boxShadow: '0 4px 14px rgba(236, 72, 153, 0.3)',
                    }}
                  >
                    {userInitial}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14.5px', fontWeight: 600, color: '#ffffff' }}>
                        {connectedEmail}
                      </span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          background: 'rgba(16, 185, 129, 0.12)',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          color: '#34d399',
                          fontSize: '11px',
                          fontWeight: 600,
                        }}
                      >
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981' }} />
                        Connected
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', fontSize: '12px', color: '#94a3b8' }}>
                      <span><strong>{authStatus.unread_count || 0}</strong> unread</span>
                      <span>•</span>
                      <span><strong>{authStatus.total_messages || emails.length}</strong> total messages</span>
                    </div>
                  </div>
                </div>

                {/* Primary Workspace Quick Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    onClick={() => {
                      loadEmails(searchQuery)
                      checkStatus()
                    }}
                    style={{
                      height: '34px',
                      padding: '0 12px',
                      borderRadius: '10px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: '#cbd5e1',
                      fontSize: '12px',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <IconRefresh size={14} className={loading ? 'animate-spin' : ''} />
                    <span>Sync</span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectedEmail(null)
                      setComposing(true)
                    }}
                    style={{
                      height: '34px',
                      padding: '0 14px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(236, 72, 153, 0.3)',
                    }}
                  >
                    <IconPlus size={15} />
                    <span>Compose</span>
                  </button>
                </div>
              </div>

              {/* Main Workspace Navigation / Search Bar */}
              {!selectedEmail && !composing && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
                  {/* Filter Tabs */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255, 255, 255, 0.03)', padding: '3px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <button
                      onClick={() => setFilter('all')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '9px',
                        border: 'none',
                        background: filter === 'all' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                        color: filter === 'all' ? '#ffffff' : '#94a3b8',
                        fontSize: '12px',
                        fontWeight: filter === 'all' ? 600 : 500,
                        cursor: 'pointer',
                      }}
                    >
                      All Inbox ({emails.length})
                    </button>
                    <button
                      onClick={() => setFilter('unread')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '9px',
                        border: 'none',
                        background: filter === 'unread' ? 'rgba(244, 114, 182, 0.18)' : 'transparent',
                        color: filter === 'unread' ? '#f472b6' : '#94a3b8',
                        fontSize: '12px',
                        fontWeight: filter === 'unread' ? 600 : 500,
                        cursor: 'pointer',
                      }}
                    >
                      Unread ({authStatus.unread_count || 0})
                    </button>
                  </div>

                  {/* Search Query Input */}
                  <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
                    <IconSearch size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                    <input
                      type="text"
                      placeholder="Search mail (e.g. from:me)..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && loadEmails(searchQuery)}
                      style={{
                        width: '100%',
                        padding: '7px 12px 7px 34px',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        color: '#f8fafc',
                        fontSize: '12px',
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Email Reader / Compose / List Workspace Views */}
              {selectedEmail && !composing ? (
                /* Email Reader View */
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.07)', padding: '20px' }}>
                  <button
                    onClick={() => { setSelectedEmail(null); loadEmails(searchQuery); }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'none',
                      border: 'none',
                      color: '#818cf8',
                      fontSize: '12.5px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      marginBottom: '16px',
                    }}
                  >
                    <IconArrowLeft size={16} />
                    <span>Back to inbox list</span>
                  </button>

                  <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#ffffff', margin: '0 0 12px 0' }}>
                    {selectedEmail.subject || '(No Subject)'}
                  </h2>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', marginBottom: '16px', fontSize: '12px', color: '#94a3b8' }}>
                    <div>
                      <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{selectedEmail.from}</span>
                    </div>
                    <span>{selectedEmail.date}</span>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', fontSize: '13.5px', color: '#f8fafc', lineHeight: 1.65, marginBottom: '20px' }}>
                    {selectedEmail.body ? (
                      selectedEmail.body.split('\n').map((line, idx) => {
                        const trimmed = line.trim()
                        const isSectionHeader = /^(?:\*\*(.+?)\*\*|([A-Z][A-Za-z\s]{2,25}:))\s*$/.test(trimmed)
                        if (isSectionHeader) {
                          const title = trimmed.replace(/\*\*/g, '').replace(/:$/, '')
                          return (
                            <div key={idx} style={{ fontWeight: 600, color: '#ffffff', fontSize: '14px', marginTop: '14px', marginBottom: '6px' }}>
                              {title}:
                            </div>
                          )
                        }
                        const cleanLine = line.replace(/\*\*(.+?)\*\*/g, '$1')
                        return (
                          <div key={idx} style={{ minHeight: trimmed ? 'auto' : '10px', color: '#cbd5e1', lineHeight: 1.65 }}>
                            {cleanLine}
                          </div>
                        )
                      })
                    ) : (
                      <span style={{ color: '#64748b', fontStyle: 'italic' }}>(No Content)</span>
                    )}
                  </div>

                  {/* Inline Reply Area */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                    <textarea
                      placeholder={`Reply to ${selectedEmail.from.split('<')[0].trim()}...`}
                      value={replyBody}
                      onChange={e => setReplyBody(e.target.value)}
                      rows={3}
                      style={{
                        width: '100%',
                        padding: '12px',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        color: '#f8fafc',
                        fontSize: '13px',
                        outline: 'none',
                        resize: 'vertical',
                      }}
                    />
                    <button
                      onClick={handleSendReply}
                      disabled={replying || !replyBody.trim()}
                      style={{
                        alignSelf: 'flex-end',
                        padding: '8px 18px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
                        border: 'none',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <IconSend size={14} />
                      <span>{replying ? 'Sending Reply...' : 'Send Reply'}</span>
                    </button>
                  </div>
                </div>
              ) : composing ? (
                /* Compose View */
                <form
                  onSubmit={handleSendEmail}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: '16px',
                    border: '1px solid rgba(255, 255, 255, 0.07)',
                    padding: '20px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                      New Email Message
                    </h3>
                    <button
                      type="button"
                      onClick={() => setComposing(false)}
                      style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '12px' }}
                    >
                      Cancel
                    </button>
                  </div>

                  <div>
                    <label style={{ fontSize: '11.5px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>To:</label>
                    <input
                      type="email"
                      required
                      placeholder="recipient@example.com"
                      value={to}
                      onChange={e => setTo(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        color: '#f8fafc',
                        fontSize: '13px',
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11.5px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Subject:</label>
                    <input
                      type="text"
                      required
                      placeholder="Enter subject line..."
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        color: '#f8fafc',
                        fontSize: '13px',
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontSize: '11.5px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Body:</label>
                    <textarea
                      required
                      placeholder="Write your email body..."
                      value={body}
                      onChange={e => setBody(e.target.value)}
                      style={{
                        width: '100%',
                        flex: 1,
                        padding: '12px',
                        borderRadius: '10px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        color: '#f8fafc',
                        fontSize: '13px',
                        outline: 'none',
                        resize: 'none',
                      }}
                    />
                  </div>

                  {/* Attachments Selection */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                        Attachments {attachments.length > 0 ? `(${attachments.length})` : ''}:
                      </label>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        multiple
                        style={{ display: 'none' }}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '8px',
                          color: '#cbd5e1',
                          padding: '4px 10px',
                          fontSize: '11.5px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          cursor: 'pointer',
                        }}
                      >
                        <IconPaperclip size={13} style={{ color: '#ec4899' }} />
                        <span>Attach files</span>
                      </button>
                    </div>

                    {attachments.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '80px', overflowY: 'auto' }}>
                        {attachments.map((file, idx) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 8px',
                              borderRadius: '8px',
                              background: 'rgba(244, 114, 182, 0.12)',
                              border: '1px solid rgba(244, 114, 182, 0.3)',
                              color: '#f8fafc',
                              fontSize: '11.5px',
                            }}
                          >
                            <IconFileText size={13} style={{ color: '#f472b6', flexShrink: 0 }} />
                            <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {file.name}
                            </span>
                            <span style={{ color: '#94a3b8', fontSize: '10px' }}>
                              ({(file.size / 1024).toFixed(0)} KB)
                            </span>
                            <button
                              type="button"
                              onClick={() => removeAttachment(idx)}
                              style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center' }}
                              title="Remove attachment"
                            >
                              <IconX size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={sending}
                    style={{
                      height: '38px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justify: 'center',
                      gap: '8px',
                      cursor: sending ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <IconSend size={15} />
                    <span>{sending ? 'Sending...' : 'Send Email'}</span>
                  </button>
                </form>
              ) : (
                /* Email Cards List View */
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {loading && filteredEmails.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                      Fetching emails from Google...
                    </div>
                  ) : filteredEmails.length === 0 ? (
                    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                      <IconInbox size={32} style={{ color: '#475569', marginBottom: '8px' }} />
                      <p style={{ margin: 0 }}>No emails found in this filter.</p>
                    </div>
                  ) : (
                    filteredEmails.map(email => {
                      const cleanSender = email.from.split('<')[0].replace(/"/g, '').trim() || email.from
                      const dateDisplay = email.date ? (email.date.split(',')[1]?.trim()?.slice(0, 11) || email.date.slice(0, 12)) : ''

                      return (
                        <div
                          key={email.id}
                          onClick={() => handleViewEmail(email)}
                          style={{
                            padding: '12px 16px',
                            borderRadius: '12px',
                            background: email.unread ? 'rgba(244, 114, 182, 0.06)' : 'rgba(255, 255, 255, 0.025)',
                            border: email.unread ? '1px solid rgba(244, 114, 182, 0.25)' : '1px solid rgba(255, 255, 255, 0.06)',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            transition: 'all 0.18s ease',
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = email.unread ? 'rgba(244, 114, 182, 0.06)' : 'rgba(255, 255, 255, 0.025)'
                            e.currentTarget.style.borderColor = email.unread ? 'rgba(244, 114, 182, 0.25)' : '1px solid rgba(255, 255, 255, 0.06)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {email.unread && (
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f472b6', boxShadow: '0 0 6px #f472b6' }} />
                              )}
                              <span style={{ fontSize: '13px', fontWeight: email.unread ? 700 : 500, color: email.unread ? '#ffffff' : '#cbd5e1' }}>
                                {cleanSender}
                              </span>
                            </div>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>
                              {dateDisplay}
                            </span>
                          </div>

                          <div style={{ fontSize: '12.5px', fontWeight: email.unread ? 600 : 400, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {email.subject || '(No Subject)'}
                          </div>

                          <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4 }}>
                            {email.snippet}
                          </p>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
