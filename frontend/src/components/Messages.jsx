import { useEffect, useRef, useState } from 'react';
import {
  IconFileTypePdf,
  IconDownload,
} from '@tabler/icons-react';

const T = {
  text: '#fdebd0', text2: '#9a7e5a', text3: '#5a4830',
  agentBg: '#131025', agentBorder: '#221d38',
  userBg: '#1e1530', userBorder: '#2d2048', userText: '#f0d8a8',
  toolBg: '#1a0508', toolBorder: '#3a0e18', toolText: '#c0152a',
  audioBg: '#0d0b1a', audioBorder: '#201c32',
  typingBg: '#131025', typingBorder: '#221d38',
  hintText: '#5a4830', hintAccent: '#96101f',
  nameText: '#3d3020', timeText: '#3d3020',
  accent: '#c0152a', border2: '#312848',
  sendBg: 'linear-gradient(135deg,#c0152a,#7a0812)',
};

function formatContent(content) {
  if (!content) return [];
  const parts = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        value: content.substring(lastIndex, match.index)
      });
    }
    parts.push({
      type: 'code',
      language: match[1] || 'code',
      value: match[2]
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    parts.push({
      type: 'text',
      value: content.substring(lastIndex)
    });
  }

  return parts;
}

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      background: '#07050d',
      borderRadius: '8px',
      border: '1px solid #201c32',
      margin: '10px 0',
      overflow: 'hidden',
      fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, monospace',
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      width: '100%'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        background: '#131025',
        borderBottom: '1px solid #201c32',
        color: '#9a7e5a',
        textTransform: 'uppercase',
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.05em'
      }}>
        <span>{language}</span>
        <button
          onClick={handleCopy}
          style={{
            background: 'transparent',
            border: 'none',
            color: copied ? '#4ade80' : '#fdebd0',
            cursor: 'pointer',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            opacity: 0.8,
            transition: 'opacity 0.2s'
          }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre style={{
        padding: '12px',
        margin: 0,
        overflowX: 'auto',
        color: '#e5c7a3',
        lineHeight: 1.5,
        textAlign: 'left'
      }}><code>{code}</code></pre>
    </div>
  );
}

function PdfDownloadCard({ url }) {
  const filename = decodeURIComponent(url.split('/').pop() || 'document.pdf');
  const displayName = filename.length > 40 ? filename.slice(0, 37) + '...' : filename;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      download
      style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '12px 16px', margin: '10px 0', borderRadius: '10px',
        background: 'linear-gradient(135deg, rgba(192,21,42,0.08), rgba(19,16,37,0.6))',
        border: '1px solid rgba(192,21,42,0.25)',
        textDecoration: 'none',
        transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
        cursor: 'pointer',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(192,21,42,0.5)';
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(192,21,42,0.15)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(192,21,42,0.25)';
        e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.3)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={{
        width: '38px', height: '38px', borderRadius: '8px',
        background: 'linear-gradient(135deg, #c0152a, #7a0812)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(192,21,42,0.3)',
      }}>
        <IconFileTypePdf size={20} style={{ color: '#fff' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 500, color: '#fdebd0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName}
        </div>
        <div style={{ fontSize: '11px', color: '#9a7e5a', marginTop: '2px' }}>PDF Document · Click to download</div>
      </div>
      <div style={{
        width: '30px', height: '30px', borderRadius: '6px',
        background: 'rgba(192,21,42,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <IconDownload size={15} style={{ color: '#c0152a' }} />
      </div>
    </a>
  );
}

function TextWithInlineCode({ text }) {
  if (!text) return null;
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <span>
      {parts.map((part, index) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code
              key={index}
              style={{
                background: '#201c32',
                padding: '2px 5px',
                borderRadius: '4px',
                fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, monospace',
                fontSize: '12px',
                color: '#c0152a',
                border: '1px solid #2a2240',
                margin: '0 2px'
              }}
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return part.split(/(https?:\/\/[^\s]+)/g).map((piece, pieceIndex) => {
          if (piece.startsWith('http://') || piece.startsWith('https://')) {
            if (piece.includes('/files/') && piece.toLowerCase().includes('.pdf')) {
              return <PdfDownloadCard key={`${index}-${pieceIndex}`} url={piece} />;
            }
            return (
              <a
                key={`${index}-${pieceIndex}`}
                href={piece}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#f0b35c', textDecoration: 'underline' }}
              >
                {piece}
              </a>
            );
          }
          return piece;
        });
      })}
    </span>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxWidth: '75%', alignSelf: 'flex-start', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.05em', color: T.nameText }}>ASSISTANT</span>
      </div>
      <div className="msg-bubble-agent" style={{
        display: 'flex', alignItems: 'center', gap: '5px',
        padding: '9px 13px', borderRadius: '2px 12px 12px 12px', width: 'fit-content',
      }}>
        {[0, 0.2, 0.4].map((delay, i) => (
          <div key={i} style={{
            width: '5px', height: '5px', borderRadius: '50%', background: T.text3,
            animation: 'pulse 0.9s infinite', animationDelay: `${delay}s`,
          }} />
        ))}
      </div>
    </div>
  );
}

function WaveformBars() {
  const heights = [4,7,12,18,14,9,20,16,8,13,22,10,6,15,11,19,7,14,9,17,12,8,20,6,13,16,10,18,5,11];
  return (
    <div style={{ flex: 1, height: '22px', display: 'flex', alignItems: 'center', gap: '2px' }}>
      {heights.map((h, i) => (
        <div key={i} style={{
          width: '3px', height: `${h}px`, borderRadius: '2px',
          background: i < 10 ? T.accent : T.border2,
        }} />
      ))}
    </div>
  );
}

function Message({ msg }) {
  const isUser = msg.role === 'user';
  const now = msg.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '5px',
      maxWidth: '75%', alignSelf: isUser ? 'flex-end' : 'flex-start',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {isUser ? (
          <>
            <span style={{ fontSize: '11px', color: T.timeText }}>{now}</span>
            <span style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.05em', color: T.nameText }}>YOU</span>
          </>
        ) : (
          <>
            <span style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.05em', color: T.nameText }}>ASSISTANT</span>
            <span style={{ fontSize: '11px', color: T.timeText }}>{now}</span>
          </>
        )}
      </div>

      {msg.usedSearch && (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          fontSize: '11px', padding: '3px 9px', borderRadius: '20px',
          border: `1px solid ${T.toolBorder}`, background: T.toolBg, color: T.toolText,
          marginBottom: '4px',
        }}>
          <i className="ti ti-world-search" style={{ fontSize: '11px' }} aria-hidden="true" />
          searched the web
        </div>
      )}

      <div
        className={isUser ? 'msg-bubble-user' : 'msg-bubble-agent'}
        style={{
          padding: '10px 14px', fontSize: '13px', lineHeight: 1.65,
          color: isUser ? T.userText : T.text,
          borderRadius: isUser ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
          width: '100%',
          boxSizing: 'border-box',
          whiteSpace: 'pre-wrap',
        }}
      >
        {(() => {
          const parts = formatContent(msg.content);
          if (parts.length === 0) return <TextWithInlineCode text={msg.content} />;
          return parts.map((part, index) => {
            if (part.type === 'code') {
              return <CodeBlock key={index} language={part.language} code={part.value} />;
            }
            return <TextWithInlineCode key={index} text={part.value} />;
          });
        })()}
      </div>

      {msg.audio && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          marginTop: '7px', padding: '7px 11px', borderRadius: '8px',
          border: `1px solid ${T.audioBorder}`, background: T.audioBg,
        }}>
          <button style={{
            width: '24px', height: '24px', borderRadius: '50%', border: 'none',
            background: T.sendBg, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <i className="ti ti-player-play" style={{ fontSize: '11px', color: '#fff' }} aria-hidden="true" />
          </button>
          <WaveformBars />
          <span style={{ fontSize: '11px', color: T.hintText }}>0:05</span>
        </div>
      )}

      {!isUser && msg.model && (
        <div style={{ fontSize: '11px', marginTop: '3px', color: T.hintText }}>
          via <span style={{ color: T.hintAccent }}>{msg.model}</span>
          {msg.usedSearch && ' · web search active'}
        </div>
      )}
    </div>
  );
}

export default function Messages({ messages, loading }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  return (
    <>
      <style>{`
        @keyframes pulse { 0%,60%,100%{opacity:.3} 30%{opacity:1} }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div className="msg-area" style={{
        flex: 1, overflowY: 'auto', padding: '20px',
        display: 'flex', flexDirection: 'column', gap: '18px', scrollbarWidth: 'thin',
      }}>
        {messages.map(msg => <Message key={msg.id} msg={msg} />)}
        {loading && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </>
  );
}