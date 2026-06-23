import { useEffect, useRef } from 'react';

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
        }}
      >
        {msg.content}
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
      <style>{`@keyframes pulse { 0%,60%,100%{opacity:.3} 30%{opacity:1} }`}</style>
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