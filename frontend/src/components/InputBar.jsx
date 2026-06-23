import { useState, useRef } from 'react';

const T = {
  bg: '#0a0812', inputBg: '#131025', inputBorder: '#2a2240',
  text: '#fdebd0', text2: '#9a7e5a', border2: '#312848',
  border: '#251f3a', hintText: '#5a4830',
  sendBg: 'linear-gradient(135deg,#c0152a,#7a0812)',
};

export default function InputBar({ onSend, onVoiceReply, loading }) {
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const ref = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const handleInput = (e) => {
    setText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleSend = () => {
    if (!text.trim() || loading) return;
    onSend(text.trim());
    setText('');
    if (ref.current) ref.current.style.height = 'auto';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        await sendVoice(blob);
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      alert('Microphone access denied. Please allow mic access in your browser.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      setProcessing(true);
    }
  };

  const sendVoice = async (blob) => {
    const formData = new FormData();
    formData.append('file', blob, 'recording.wav');

    try {
      const res = await fetch('http://localhost:8000/chat-voice-input', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.reply) {
        onVoiceReply(data);
      }
    } catch {
      onVoiceReply({ reply: 'Something went wrong with voice. Is the backend running?', error: true });
    } finally {
      setProcessing(false);
    }
  };

  const handleMic = () => {
  if (recording) {
    // minimum 1 second before stopping
    setTimeout(() => {
      if (mediaRecorderRef.current) stopRecording();
    }, 500);
    stopRecording();
  } else {
    startRecording();
  }
};

  const micLabel = recording ? 'Recording... tap to stop' : processing ? 'Processing...' : 'ollama connected · llama 3.1 8b';

  return (
    <div style={{ padding: '12px 16px 16px', flexShrink: 0, borderTop: `1px solid ${T.border}`, background: T.bg }}>
      <div className="msg-input-wrap" style={{
        display: 'flex', alignItems: 'flex-end', gap: '8px',
        borderRadius: '12px', padding: '7px 10px',
      }}>
        <textarea
          ref={ref}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={processing ? 'Transcribing...' : 'ask anything...'}
          disabled={processing}
          rows={1}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            fontSize: '13px', fontFamily: 'inherit', resize: 'none',
            lineHeight: 1.5, maxHeight: '80px', minHeight: '22px',
            padding: '2px 4px', color: T.text,
            opacity: processing ? 0.5 : 1,
          }}
        />
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            onClick={handleMic}
            disabled={processing}
            style={{
              width: '30px', height: '30px', borderRadius: '8px',
              border: `1px solid ${recording ? '#c0152a' : T.border2}`,
              background: recording ? 'linear-gradient(135deg,#c0152a,#7a0812)' : 'transparent',
              cursor: processing ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: recording ? '#fff' : T.text2,
              animation: recording ? 'pulse 0.9s infinite' : 'none',
            }}
            aria-label={recording ? 'Stop recording' : 'Start recording'}
          >
            <i className={`ti ${recording ? 'ti-microphone-off' : processing ? 'ti-loader' : 'ti-microphone'}`} style={{ fontSize: '15px' }} aria-hidden="true" />
          </button>
          <button
            onClick={handleSend}
            disabled={!text.trim() || loading || processing}
            style={{
              width: '30px', height: '30px', borderRadius: '8px', border: 'none',
              background: (!text.trim() || loading || processing) ? '#2a1018' : T.sendBg,
              cursor: (!text.trim() || loading || processing) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              boxShadow: text.trim() && !loading ? '0 2px 8px #c0152a44' : 'none',
              transition: 'transform 0.1s',
            }}
            aria-label="Send message"
          >
            <i className="ti ti-arrow-up" style={{ fontSize: '14px', color: '#fff' }} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '7px', padding: '0 2px' }}>
        <div style={{ fontSize: '11px', color: recording ? '#c0152a' : T.hintText }}>
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: recording ? '#c0152a' : '#4ade80', display: 'inline-block', marginRight: '5px' }} />
          {micLabel}
        </div>
        <div style={{ fontSize: '11px', color: T.hintText }}>enter to send</div>
      </div>
    </div>
  );
}