import { useState, useEffect, useCallback } from 'react'

const THEME = {
  bg: '#0a0812',
  border: '#251f3a',
  text: '#fdebd0',
  text2: '#9a7e5a',
  bg3: '#171528',
  accent: '#c0152a',
  accentGlow: '#c0152a55',
  cardBg: 'rgba(255, 255, 255, 0.02)',
  inputBg: '#131025',
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

export default function EmailPanel({ open, setOpen, onUpdateUnread }) {
  const [authStatus, setAuthStatus] = useState({ authenticated: false, unread_count: 0 })
  const [emails, setEmails] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEmail, setSelectedEmail] = useState(null)
  
  // Compose modal state
  const [composing, setComposing] = useState(false)
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  // Reply state
  const [replyBody, setReplyBody] = useState('')
  const [replying, setReplying] = useState(false)

  // Load status
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/email/status')
      const data = await res.json()
      setAuthStatus(data)
      if (onUpdateUnread) onUpdateUnread(data.unread_count)
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
    // The panel intentionally refreshes remote Gmail state when it is opened.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // Send new compose email
  const handleSendEmail = async (e) => {
    e.preventDefault()
    if (!to || !subject || !body) return
    setSending(true)
    try {
      const res = await fetch('/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, body }),
      })
      if (res.ok) {
        setComposing(false)
        setTo('')
        setSubject('')
        setBody('')
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
        // Reload detail/inbox
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

  return (
    <div style={{
      position: 'absolute', top: '50px', left: 0, right: 0, bottom: 0,
      zIndex: 20,
      background: '#0a0812fa',
      backdropFilter: 'blur(12px)',
      borderTop: `1px solid ${THEME.border}`,
      transform: open ? 'translateX(0)' : 'translateX(100%)',
      transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Panel Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: `1px solid ${THEME.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="ti ti-mail" style={{ color: THEME.accent, fontSize: '18px' }} />
          <span style={{ fontSize: '14px', fontWeight: 600, color: THEME.text }}>Gmail integration</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {authStatus.authenticated && (
            <button
              onClick={() => setComposing(true)}
              style={{
                background: THEME.accent, border: 'none', color: '#fff',
                padding: '5px 10px', borderRadius: '6px', fontSize: '11px',
                fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
              }}
            >
              <i className="ti ti-pencil" /> compose
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            style={{
              background: 'transparent', border: `1px solid ${THEME.border}`,
              color: THEME.text2, width: '26px', height: '26px', borderRadius: '6px',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <i className="ti ti-x" />
          </button>
        </div>
      </div>

      {/* Main panel scroll container */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        
        {/* Unauthenticated State */}
        {!authStatus.authenticated ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: '16px', padding: '40px 20px', flex: 1,
          }}>
            <div style={{
              width: '60px', height: '60px', borderRadius: '50%',
              background: 'rgba(192,21,42,0.06)', border: `1px solid ${THEME.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className="ti ti-mail-forward" style={{ fontSize: '24px', color: THEME.accent }} />
            </div>
            <div style={{ textAlign: 'center', maxWidth: '280px' }}>
              <h4 style={{ color: THEME.text, fontSize: '14px', fontWeight: 600, margin: '0 0 6px' }}>Connect Your Gmail</h4>
              <p style={{ color: THEME.text2, fontSize: '12px', lineHeight: 1.5, margin: 0 }}>
                Allow the assistant to access your inbox to read, search, reply, and send messages on your behalf.
              </p>
            </div>
            <button
              onClick={handleConnect}
              disabled={loading}
              style={{
                background: THEME.accent, border: 'none', color: '#fff',
                padding: '10px 24px', borderRadius: '8px', fontSize: '13px',
                fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                boxShadow: `0 4px 12px ${THEME.accentGlow}`,
              }}
            >
              {loading ? (
                <>Waiting for Google...</>
              ) : (
                <>
                  <i className="ti ti-brand-google" /> Connect Gmail Account
                </>
              )}
            </button>
          </div>
        ) : (
          /* Authenticated State */
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            
            {/* Search Input bar */}
            {!selectedEmail && !composing && (
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${THEME.border}` }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <i className="ti ti-search" style={{
                    position: 'absolute', left: '10px', color: THEME.text2, fontSize: '13px',
                  }} />
                  <input
                    type="text"
                    placeholder="Search mail (e.g. from:me is:unread)..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && loadEmails(searchQuery)}
                    style={{
                      width: '100%', padding: '8px 12px 8px 32px',
                      background: THEME.inputBg, border: `1px solid ${THEME.border}`,
                      borderRadius: '8px', color: THEME.text, fontSize: '12.5px',
                      outline: 'none',
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => { setSearchQuery(''); loadEmails(''); }}
                      style={{
                        position: 'absolute', right: '10px', background: 'transparent',
                        border: 'none', color: THEME.text2, cursor: 'pointer',
                      }}
                    >
                      <i className="ti ti-circle-x" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Email list */}
            {!selectedEmail && !composing && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
                {loading && emails.length === 0 ? (
                  <div style={{ color: THEME.text2, fontSize: '12px', textAlign: 'center', padding: '24px' }}>
                    Loading inbox...
                  </div>
                ) : emails.length === 0 ? (
                  <div style={{ color: THEME.text2, fontSize: '12px', textAlign: 'center', padding: '24px' }}>
                    No emails found.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {emails.map(email => (
                      <div
                        key={email.id}
                        onClick={() => handleViewEmail(email)}
                        style={{
                          background: THEME.cardBg, border: `1px solid ${THEME.border}`,
                          borderRadius: '8px', padding: '10px 12px', cursor: 'pointer',
                          display: 'flex', flexDirection: 'column', gap: '4px',
                          transition: 'all 0.18s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(192,21,42,0.3)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = THEME.border}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{
                            fontSize: '12.5px', fontWeight: email.unread ? 700 : 500,
                            color: email.unread ? THEME.text : THEME.text2,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%',
                          }}>
                            {email.from.split('<')[0].trim() || email.from}
                          </span>
                          <span style={{ fontSize: '10px', color: '#9a7e5a77' }}>
                            {email.date ? email.date.split(',')[1]?.trim()?.slice(0, 11) || email.date.slice(0, 12) : ''}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {email.unread && (
                            <span style={{
                              width: '6px', height: '6px', borderRadius: '50%',
                              background: THEME.accent, flexShrink: 0,
                            }} />
                          )}
                          <span style={{
                            fontSize: '12px', fontWeight: email.unread ? 600 : 400,
                            color: THEME.text, overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {email.subject || '(No Subject)'}
                          </span>
                        </div>
                        <p style={{
                          fontSize: '11px', color: '#9a7e5a99', margin: 0,
                          overflow: 'hidden', display: '-webkit-box', WebkitLineBreak: 'anywhere',
                          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4,
                        }}>
                          {email.snippet}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Email Detail View */}
            {selectedEmail && !composing && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: 'transparent' }}>
                {/* Back bar */}
                <div style={{
                  padding: '8px 12px', borderBottom: `1px solid ${THEME.border}`,
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                  <button
                    onClick={() => { setSelectedEmail(null); loadEmails(searchQuery); }}
                    style={{
                      background: 'transparent', border: 'none', color: THEME.text2,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                      fontSize: '12px',
                    }}
                  >
                    <i className="ti ti-arrow-left" /> Back to list
                  </button>
                </div>

                {/* Email details */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '15px', color: THEME.text, margin: '0 0 6px', fontWeight: 600 }}>
                      {selectedEmail.subject || '(No Subject)'}
                    </h3>
                    <div style={{ fontSize: '11px', color: THEME.text2, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div><strong>From:</strong> {selectedEmail.from}</div>
                      <div><strong>Date:</strong> {selectedEmail.date}</div>
                    </div>
                  </div>
                  <hr style={{ border: 'none', borderTop: `1px solid ${THEME.border}`, margin: '4px 0' }} />
                  
                  {/* Body text */}
                  <div style={{
                    fontSize: '12.5px', color: THEME.text, lineHeight: 1.6,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {selectedEmail.body || '(No Content)'}
                  </div>

                  <hr style={{ border: 'none', borderTop: `1px solid ${THEME.border}`, margin: '8px 0' }} />

                  {/* Reply Box */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <textarea
                      placeholder={`Reply to ${selectedEmail.from.split('<')[0].trim()}...`}
                      value={replyBody}
                      onChange={e => setReplyBody(e.target.value)}
                      style={{
                        width: '100%', minHeight: '80px', padding: '10px',
                        background: THEME.inputBg, border: `1px solid ${THEME.border}`,
                        borderRadius: '8px', color: THEME.text, fontSize: '12px',
                        outline: 'none', resize: 'vertical',
                      }}
                    />
                    <button
                      onClick={handleSendReply}
                      disabled={replying || !replyBody.trim()}
                      style={{
                        alignSelf: 'flex-end', background: THEME.accent, border: 'none',
                        color: '#fff', padding: '6px 16px', borderRadius: '6px',
                        fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '6px',
                      }}
                    >
                      {replying ? <>Replying...</> : <><i className="ti ti-send" /> Send Reply</>}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Compose View */}
            {composing && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <div style={{
                  padding: '8px 12px', borderBottom: `1px solid ${THEME.border}`,
                  display: 'flex', alignItems: 'center',
                }}>
                  <button
                    onClick={() => setComposing(false)}
                    style={{
                      background: 'transparent', border: 'none', color: THEME.text2,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                      fontSize: '12px',
                    }}
                  >
                    <i className="ti ti-arrow-left" /> Cancel compose
                  </button>
                </div>
                <form onSubmit={handleSendEmail} style={{
                  flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: THEME.text2 }}>To:</label>
                    <input
                      type="email"
                      required
                      placeholder="recipient@example.com"
                      value={to}
                      onChange={e => setTo(e.target.value)}
                      style={{
                        padding: '8px', background: THEME.inputBg, border: `1px solid ${THEME.border}`,
                        borderRadius: '6px', color: THEME.text, fontSize: '12px', outline: 'none',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', color: THEME.text2 }}>Subject:</label>
                    <input
                      type="text"
                      required
                      placeholder="Enter subject"
                      value={subject}
                      onChange={e => setSubject(e.target.value)}
                      style={{
                        padding: '8px', background: THEME.inputBg, border: `1px solid ${THEME.border}`,
                        borderRadius: '6px', color: THEME.text, fontSize: '12px', outline: 'none',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                    <label style={{ fontSize: '11px', color: THEME.text2 }}>Body:</label>
                    <textarea
                      required
                      placeholder="Write your email here..."
                      value={body}
                      onChange={e => setBody(e.target.value)}
                      style={{
                        width: '100%', flex: 1, padding: '10px',
                        background: THEME.inputBg, border: `1px solid ${THEME.border}`,
                        borderRadius: '8px', color: THEME.text, fontSize: '12px',
                        outline: 'none', resize: 'none',
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={sending}
                    style={{
                      background: THEME.accent, border: 'none', color: '#fff',
                      padding: '10px', borderRadius: '8px', fontSize: '13px',
                      fontWeight: 600, cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', gap: '6px',
                    }}
                  >
                    {sending ? <>Sending...</> : <><i className="ti ti-send" /> Send Email</>}
                  </button>
                </form>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
