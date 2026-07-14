import { useState, useRef, useEffect } from 'react';
import {
  IconFileTypePdf,
  IconLoader2,
  IconMicrophone,
  IconMicrophoneOff,
  IconPaperclip,
  IconSend,
  IconX,
} from '@tabler/icons-react';

const T = {
  bg: '#0a0812', inputBg: '#131025', inputBorder: '#2a2240',
  text: '#fdebd0', text2: '#9a7e5a', border2: '#312848',
  border: '#251f3a', hintText: '#5a4830',
  sendBg: 'linear-gradient(135deg,#c0152a,#7a0812)',
};

export default function InputBar({ onSend, onVoiceReply, loading, activeSession }) {
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const ref = useRef(null);
  const fileRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recognitionRef = useRef(null);

  // Persists accumulated final words across SpeechRecognition result events
  const finalTranscriptRef = useRef('');
  // Tracks whether the mic is still supposed to be on (for auto-restart)
  const recordingActiveRef = useRef(false);
  // Prevents runaway restart loops when recognition keeps failing
  const recognitionRetriesRef = useRef(0);
  const MAX_RECOGNITION_RETRIES = 3;

  useEffect(() => {
    return () => {
      recordingActiveRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const handleInput = (e) => {
    setText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleSend = () => {
    if ((!text.trim() && !attachment) || loading) return;
    onSend(text.trim(), attachment);
    setText('');
    setAttachment(null);
    if (ref.current) ref.current.style.height = 'auto';
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Please attach a PDF file.');
      e.target.value = '';
      return;
    }
    setAttachment(file);
    e.target.value = '';
  };

  // ── Speech Recognition helpers ──────────────────────────────────────────────

  const startSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    // Reset retry count when recognition actually starts
    recognition.onstart = () => {
      recognitionRetriesRef.current = 0;
    };

    recognition.onresult = (event) => {
      // Accumulate any newly finalized segments into the persistent ref
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += event.results[i][0].transcript + ' ';
        }
      }

      // Collect the current interim (non-final) segment
      const lastResult = event.results[event.results.length - 1];
      const interim = lastResult.isFinal ? '' : lastResult[0].transcript;

      const display = finalTranscriptRef.current + interim;
      setText(display);

      if (ref.current) {
        ref.current.style.height = 'auto';
        ref.current.style.height = Math.min(ref.current.scrollHeight, 120) + 'px';
      }
    };

    recognition.onerror = (event) => {
      console.warn('Speech recognition error:', event.error);
      // 'aborted' means recognition was killed — do NOT restart (avoids infinite loop)
      // Only restart on genuinely transient network/silence errors, with a retry cap
      const recoverable = ['no-speech', 'network'];
      if (
        recoverable.includes(event.error) &&
        recordingActiveRef.current &&
        recognitionRetriesRef.current < MAX_RECOGNITION_RETRIES
      ) {
        recognitionRetriesRef.current += 1;
        setTimeout(() => {
          if (recordingActiveRef.current) startSpeechRecognition();
        }, 500);
      }
    };

    // Chrome automatically stops recognition after a pause — always restart if still recording
    recognition.onend = () => {
      if (recordingActiveRef.current) {
        setTimeout(() => {
          if (recordingActiveRef.current) startSpeechRecognition();
        }, 100);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.warn('Could not start speech recognition:', e);
    }
  };

  const stopSpeechRecognition = () => {
    recordingActiveRef.current = false;
    recognitionRetriesRef.current = MAX_RECOGNITION_RETRIES; // prevent any pending restart
    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // prevent auto-restart on deliberate stop
      recognitionRef.current.onerror = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  };

  // ── Recording ───────────────────────────────────────────────────────────────

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
      ].find(m => MediaRecorder.isTypeSupported(m)) || '';

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        console.log(`[Voice] Recorded blob: ${blob.size} bytes, type: ${blob.type}`);
        stream.getTracks().forEach(t => t.stop());
        await sendVoice(blob, mediaRecorder.mimeType);
      };

      // Clear previous transcript and start live recognition
      finalTranscriptRef.current = '';
      setText('');
      recordingActiveRef.current = true;
      startSpeechRecognition();

      mediaRecorder.start(250);
      setRecording(true);
    } catch (err) {
      console.error('Recording error:', err);
      alert('Microphone access denied. Please allow mic access in your browser.');
    }
  };

  const stopRecording = () => {
    stopSpeechRecognition();
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      setProcessing(true);
    }
  };

  const sendVoice = async (blob, mimeType) => {
    const ext = (mimeType || 'audio/webm').includes('ogg') ? 'ogg' : 'webm';
    const formData = new FormData();
    formData.append('file', blob, `recording.${ext}`);
    formData.append('session_id', activeSession || 'default');

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
      stopRecording();
    } else {
      startRecording();
    }
  };

  const micLabel = recording
    ? 'Recording... tap to stop'
    : processing
    ? 'Processing...'
    : 'ollama connected · llama 3.1 8b';

  return (
    <div style={{ padding: '12px 16px 16px', flexShrink: 0, borderTop: `1px solid ${T.border}`, background: T.bg }}>
      <div className="msg-input-wrap" style={{
        display: 'flex', alignItems: 'flex-end', gap: '8px',
        borderRadius: '12px', padding: '7px 10px',
      }}>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <textarea
          ref={ref}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={recording ? 'Listening... speak now' : processing ? 'Transcribing...' : 'ask anything...'}
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
            onClick={() => fileRef.current?.click()}
            disabled={processing || loading}
            style={{
              width: '30px', height: '30px', borderRadius: '8px',
              border: `1px solid ${attachment ? '#c0152a' : T.border2}`,
              background: attachment ? '#2a1018' : 'transparent',
              cursor: processing || loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: attachment ? '#fdebd0' : T.text2,
            }}
            aria-label="Attach PDF"
            title="Attach PDF"
          >
            <IconPaperclip size={16} />
          </button>
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
            {recording ? (
              <IconMicrophoneOff size={16} />
            ) : processing ? (
              <IconLoader2 size={16} className="animate-spin" />
            ) : (
              <IconMicrophone size={16} />
            )}
          </button>
          <button
            onClick={handleSend}
            disabled={(!text.trim() && !attachment) || loading || processing}
            style={{
              width: '30px', height: '30px', borderRadius: '8px', border: 'none',
              background: ((!text.trim() && !attachment) || loading || processing) ? '#2a1018' : T.sendBg,
              cursor: ((!text.trim() && !attachment) || loading || processing) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              boxShadow: text.trim() && !loading ? '0 2px 8px #c0152a44' : 'none',
              transition: 'transform 0.1s',
            }}
            aria-label="Send message"
          >
            <IconSend size={15} style={{ color: '#fff' }} />
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '7px', padding: '0 2px' }}>
        <div style={{ fontSize: '11px', color: recording ? '#c0152a' : T.hintText, display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          {attachment ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              maxWidth: '260px', overflow: 'hidden', whiteSpace: 'nowrap',
              textOverflow: 'ellipsis', color: T.text2,
            }}>
              <IconFileTypePdf size={14} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{attachment.name}</span>
              <button
                onClick={() => setAttachment(null)}
                style={{
                  border: 'none', background: 'transparent', color: T.text2,
                  cursor: 'pointer', padding: 0, display: 'inline-flex',
                }}
                aria-label="Remove PDF"
              >
                <IconX size={13} />
              </button>
            </span>
          ) : (
            <span>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: recording ? '#c0152a' : '#4ade80', display: 'inline-block', marginRight: '5px' }} />
              {micLabel}
            </span>
          )}
        </div>
        <div style={{ fontSize: '11px', color: T.hintText }}>enter to send</div>
      </div>
    </div>
  );
}
