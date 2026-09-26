import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import {
  IconFileTypePdf,
  IconDownload,
  IconCopy,
  IconCheck,
  IconVolume,
  IconWorldSearch,
  IconSparkles,
  IconMail,
  IconSearch,
  IconCode,
  IconFileText,
  IconChevronDown,
  IconChevronRight,
  IconSettings,
} from '@tabler/icons-react'

function getTimeAwareGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function HomeDashboard({ onSelectPrompt }) {
  const greeting = getTimeAwareGreeting()

  const CAPSULES = [
    {
      icon: IconMail,
      label: '@ Gmail',
      subtext: 'Check inbox',
      prompt: 'Check my Gmail inbox for unread messages and summarize key action items.',
      color: '#f472b6',
    },
    {
      icon: IconFileText,
      label: '📄 Documents',
      subtext: 'Summarize PDF',
      prompt: 'Please summarize the attached PDF document and list key metrics.',
      color: '#c084fc',
    },
    {
      icon: IconWorldSearch,
      label: '🌐 Web',
      subtext: 'Search AI news',
      prompt: 'Search the web for recent artificial intelligence news and summarize.',
      color: '#38bdf8',
    },
    {
      icon: IconCode,
      label: '</> Python',
      subtext: 'Write script',
      prompt: 'Write a clean Python script using asyncio to process JSON data.',
      color: '#34d399',
    },
  ]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px 20px 20px',
        maxWidth: '820px',
        margin: '0 auto',
        width: '100%',
        textAlign: 'center',
      }}
    >
      {/* Floating Centered Squircle N Logo Badge */}
      <div
        style={{
          width: '54px',
          height: '54px',
          borderRadius: '18px',
          background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
          display: 'flex',
          alignItems: 'center',
          justify: 'center',
          textAlign: 'center',
          lineHeight: 1,
          color: '#ffffff',
          fontWeight: 800,
          fontSize: '26px',
          boxShadow: '0 12px 30px rgba(99, 102, 241, 0.45)',
          marginBottom: '20px',
          fontFamily: 'Outfit, sans-serif',
          flexShrink: 0,
        }}
      >
        N
      </div>

      {/* Time-Aware Sub-tag */}
      <span
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#a855f7',
          letterSpacing: '0.5px',
          marginBottom: '8px',
        }}
      >
        {greeting}, Saaketh 👋
      </span>

      {/* Main Hero Headline */}
      <h1
        style={{
          fontSize: '38px',
          fontWeight: 600,
          letterSpacing: '-1.2px',
          color: '#ffffff',
          margin: '0 0 12px 0',
          lineHeight: 1.15,
        }}
      >
        What can we move forward today?
      </h1>

      {/* Subtitle */}
      <p
        style={{
          fontSize: '15px',
          color: '#94a3b8',
          margin: '0 0 36px 0',
          maxWidth: '540px',
          lineHeight: 1.5,
          fontWeight: 400,
        }}
      >
        Think, search, and work across your tools from one calm, focused space.
      </p>

      {/* Horizontal Capsule Action Pills */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          width: '100%',
          maxWidth: '720px',
        }}
      >
        {CAPSULES.map((item, idx) => (
          <button
            key={idx}
            onClick={() => onSelectPrompt && onSelectPrompt(item.prompt)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: '24px',
              background: 'rgba(255, 255, 255, 0.04)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#f8fafc',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.18)'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <span>{item.label}</span>
            <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 400 }}>· {item.subtext}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function ToolExecutionTimeline({ usedSearch, executionSteps = [] }) {
  const [expanded, setExpanded] = useState(false)

  const steps = executionSteps.length > 0 ? executionSteps : [
    { label: 'Ingested context & system prompt', status: 'completed' },
    ...(usedSearch ? [{ label: 'Performed web query via DuckDuckGo', status: 'completed' }] : []),
    { label: 'Synthesized response via Llama 3.1 8B', status: 'completed' },
  ]

  return (
    <div
      style={{
        margin: '8px 0 12px 0',
        borderRadius: '10px',
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#94a3b8',
          fontSize: '11.5px',
          fontWeight: 500,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <IconSettings size={13} style={{ color: '#8b5cf6' }} />
          <span>Used {steps.length} tool steps · 2.4s</span>
        </div>
        {expanded ? <IconChevronDown size={13} /> : <IconChevronRight size={13} />}
      </button>

      {expanded && (
        <div style={{ padding: '8px 12px 12px 12px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11.5px', color: '#cbd5e1' }}>
              <IconCheck size={12} style={{ color: '#10b981' }} />
              <span>{step.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      style={{
        background: '#090b14',
        borderRadius: '10px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        margin: '12px 0',
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '7px 14px',
          background: 'rgba(255, 255, 255, 0.03)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          color: '#94a3b8',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        <span>{language || 'code'}</span>
        <button
          onClick={handleCopy}
          style={{
            background: 'transparent',
            border: 'none',
            color: copied ? '#10b981' : '#94a3b8',
            cursor: 'pointer',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontWeight: 500,
          }}
        >
          {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
          <span>{copied ? 'Copied!' : 'Copy code'}</span>
        </button>
      </div>
      <pre
        style={{
          padding: '14px',
          margin: 0,
          overflowX: 'auto',
          color: '#e2e8f0',
          fontSize: '12.5px',
          lineHeight: 1.5,
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        <code>{code}</code>
      </pre>
    </div>
  )
}

function PdfDownloadCard({ url }) {
  const filename = decodeURIComponent(url.split('/').pop() || 'document.pdf')
  const displayName = filename.length > 40 ? filename.slice(0, 37) + '...' : filename
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      download
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        margin: '10px 0',
        borderRadius: '12px',
        background: 'rgba(139, 92, 246, 0.1)',
        border: '1px solid rgba(139, 92, 246, 0.3)',
        textDecoration: 'none',
        transition: 'all 0.18s ease',
      }}
    >
      <div
        style={{
          width: '38px',
          height: '38px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
          display: 'flex',
          alignItems: 'center',
          justify: 'center',
          flexShrink: 0,
        }}
      >
        <IconFileTypePdf size={20} style={{ color: '#fff' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName}
        </div>
        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>PDF Document · Click to download</div>
      </div>
      <IconDownload size={18} style={{ color: '#c084fc' }} />
    </a>
  )
}

function preprocessFormatting(text) {
  if (!text) return ''
  let result = text
  // Convert [\boxed{...}] or [ \boxed{...} ] to $$ \boxed{...} $$
  result = result.replace(/\[\s*(\\boxed\{[^}]+\})\s*\]/g, '$$ $1 $$')
  // Convert standalone \boxed{...} without math delimiters to $$ \boxed{...} $$
  result = result.replace(/(?<!\$)\s*(\\boxed\{[^}]+\})\s*(?!\$)/g, ' $$ $1 $$ ')
  // Convert \[ ... \] display math to $$ ... $$
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, '$$$$ $1 $$$$')
  // Convert \( ... \) inline math to $ ... $
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, '$ $1 $')
  // Ensure standalone bold lines before bullet points have proper markdown paragraph break
  result = result.replace(/^(\*\*[^*\n]+\*\*)\s*\n(?=[-*•\d])/gm, '$1\n\n')
  return result
}

function FormattedMarkdown({ content }) {
  if (!content) return null
  const processed = preprocessFormatting(content)

  return (
    <div style={{ fontSize: '14px', lineHeight: 1.65, color: '#f8fafc' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          strong({ children }) {
            return <strong style={{ fontWeight: 600, color: '#ffffff' }}>{children}</strong>
          },
          em({ children }) {
            return <em style={{ fontStyle: 'italic', color: '#cbd5e1' }}>{children}</em>
          },
          hr() {
            return <hr style={{ border: 'none', borderTop: '1px solid rgba(255, 255, 255, 0.08)', margin: '16px 0' }} />
          },
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '')
            const codeString = String(children).replace(/\n$/, '')
            if (!inline && (match || codeString.includes('\n'))) {
              return <CodeBlock language={match ? match[1] : ''} code={codeString} />
            }
            return (
              <code
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '12.5px',
                  fontFamily: "'JetBrains Mono', monospace",
                  color: '#c084fc',
                }}
                {...props}
              >
                {children}
              </code>
            )
          },
          table({ children }) {
            return (
              <div style={{ overflowX: 'auto', margin: '14px 0', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', background: 'rgba(255, 255, 255, 0.02)' }}>
                  {children}
                </table>
              </div>
            )
          },
          th({ children }) {
            return (
              <th style={{ background: 'rgba(255, 255, 255, 0.06)', color: '#ffffff', fontWeight: 600, textAlign: 'left', padding: '10px 14px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                {children}
              </th>
            )
          },
          td({ children }) {
            return (
              <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', color: '#cbd5e1', lineHeight: 1.5 }}>
                {children}
              </td>
            )
          },
          h1({ children }) {
            return <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#ffffff', margin: '18px 0 10px 0', letterSpacing: '-0.5px' }}>{children}</h1>
          },
          h2({ children }) {
            return <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#ffffff', margin: '16px 0 8px 0', letterSpacing: '-0.3px' }}>{children}</h2>
          },
          h3({ children }) {
            return <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#c084fc', margin: '14px 0 6px 0' }}>{children}</h3>
          },
          h4({ children }) {
            return <h4 style={{ fontSize: '13.5px', fontWeight: 600, color: '#38bdf8', margin: '12px 0 4px 0' }}>{children}</h4>
          },
          ul({ children }) {
            return <ul style={{ paddingLeft: '20px', margin: '8px 0', display: 'flex', flexDirection: 'column', gap: '4px' }}>{children}</ul>
          },
          ol({ children }) {
            return <ol style={{ paddingLeft: '20px', margin: '8px 0', display: 'flex', flexDirection: 'column', gap: '4px' }}>{children}</ol>
          },
          li({ children }) {
            return <li style={{ margin: '2px 0', lineHeight: 1.6, color: '#e2e8f0' }}>{children}</li>
          },
          p({ children }) {
            return <p style={{ margin: '6px 0', lineHeight: 1.65 }}>{children}</p>
          },
          a({ href, children }) {
            if (href && href.includes('/files/') && href.toLowerCase().endsWith('.pdf')) {
              return <PdfDownloadCard url={href} />
            }
            return (
              <a href={href} target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'underline' }}>
                {children}
              </a>
            )
          },
          blockquote({ children }) {
            return (
              <blockquote style={{ borderLeft: '3px solid #818cf8', paddingLeft: '12px', margin: '10px 0', color: '#94a3b8', fontStyle: 'italic' }}>
                {children}
              </blockquote>
            )
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 16px',
        maxWidth: '840px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: '#c084fc',
          animation: 'spin 1s linear infinite',
        }}
      />
      <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>Nexus is processing query...</span>
    </div>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  const [speaking, setSpeaking] = useState(false)

  const handleSpeak = () => {
    if (!('speechSynthesis' in window)) return
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const utterance = new SpeechSynthesisUtterance(msg.content.replace(/```[\s\S]*?```/g, 'Code snippet omitted.'))
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    setSpeaking(true)
    window.speechSynthesis.speak(utterance)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        maxWidth: '840px',
        width: '100%',
        margin: '0 auto',
        padding: '4px 0',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justify: 'space-between',
          fontSize: '11px',
          color: '#64748b',
          fontWeight: 500,
          padding: '0 2px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontWeight: 700,
              color: isUser ? '#f472b6' : '#c084fc',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {isUser ? 'You' : 'Nexus Assistant'}
          </span>
          <span>{msg.time}</span>
        </div>

        {!isUser && (
          <button
            onClick={handleSpeak}
            style={{
              background: 'transparent',
              border: 'none',
              color: speaking ? '#ec4899' : '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: 500,
            }}
            title="Read Aloud"
          >
            <IconVolume size={14} />
            <span>{speaking ? 'Stop' : 'Listen'}</span>
          </button>
        )}
      </div>

      {/* Tool step timeline for assistant messages */}
      {!isUser && <ToolExecutionTimeline usedSearch={msg.usedSearch} />}

      {/* Message Content Card */}
      <div
        style={{
          borderRadius: '14px',
          padding: '16px 18px',
          fontSize: '13.5px',
          lineHeight: 1.65,
          color: '#f8fafc',
          background: isUser ? '#181b2a' : '#10121c',
          border: isUser ? '1px solid rgba(244, 114, 182, 0.2)' : '1px solid rgba(255, 255, 255, 0.07)',
        }}
      >
        <FormattedMarkdown content={msg.content} />
      </div>
    </div>
  )
}

export default function Messages({ messages, loading, onSelectPrompt }) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const showWelcome = !messages.some(m => m.role === 'user')

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 24px 16px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
      }}
    >
      {showWelcome ? (
        <HomeDashboard onSelectPrompt={onSelectPrompt} />
      ) : (
        messages.map(msg => <Message key={msg.id} msg={msg} />)
      )}
      {loading && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  )
}