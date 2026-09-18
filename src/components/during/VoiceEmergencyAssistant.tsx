import React, { useState, useEffect, useRef } from 'react';
import { duringApi, RescueRequest } from '../../api/duringApi';
import { DisasterEvent } from '../../services/disasterService.ts';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Send,
  LifeBuoy,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Clock,
  MapPin,
  X,
  Loader2,
  Radio,
  Users,
  Droplets,
  Flame,
  Activity,
  Sparkles,
  Square,
  RotateCcw,
} from 'lucide-react';

interface VoiceEmergencyAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  activeDisaster: DisasterEvent | null;
  onSosUpdated?: (request: RescueRequest) => void;
  initialActiveRequestId?: string | null;
}

interface MessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  mode?: 'ASSIST' | 'ASSESS' | 'EMERGENCY';
  extractedFacts?: any;
}

export const VoiceEmergencyAssistant: React.FC<VoiceEmergencyAssistantProps> = ({
  isOpen,
  onClose,
  activeDisaster,
  onSosUpdated,
  initialActiveRequestId,
}) => {
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content:
        "Hello, I am the STRIDE Emergency Voice Assistant. You can speak naturally to report an emergency, ask for safety guidance, or find the nearest shelter. How can I help you?",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mode: 'ASSIST',
    },
  ]);

  const [inputVal, setInputVal] = useState('');
  const [currentStatus, setCurrentStatus] = useState<'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING'>('IDLE');
  const [currentMode, setCurrentMode] = useState<'ASSIST' | 'ASSESS' | 'EMERGENCY'>('ASSIST');
  const [activeRequest, setActiveRequest] = useState<RescueRequest | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [locationConflict, setLocationConflict] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [sessionId, setSessionId] = useState<string>(
    () => `sess-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
  );

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const isRecordingRef = useRef(false);
  const hasStoppedRef = useRef(false);
  const isSubmittingAudioRef = useRef(false);
  const isSubmittingTextRef = useRef(false);

  // Initialize GPS location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCurrentLocation({
            latitude: parseFloat(pos.coords.latitude.toFixed(4)),
            longitude: parseFloat(pos.coords.longitude.toFixed(4)),
          });
        },
        () => {
          // Default to Bengaluru central coords
          setCurrentLocation({ latitude: 12.9716, longitude: 77.5946 });
        }
      );
    }
  }, []);

  // Track modal open transitions to initialize clean conversation history
  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      // Opening a new assistant session initializes clean conversation history
      setSessionId(`sess-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`);
      setMessages([
        {
          id: 'welcome-msg-' + Date.now(),
          role: 'assistant',
          content:
            "Hello, I am the STRIDE Emergency Voice Assistant. You can speak naturally to report an emergency, ask for safety guidance, or find the nearest shelter. How can I help you?",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          mode: 'ASSIST',
        },
      ]);
      setInputVal('');
      setCurrentStatus('IDLE');
      setCurrentMode('ASSIST');
      isRecordingRef.current = false;
      hasStoppedRef.current = false;
      isSubmittingAudioRef.current = false;
      isSubmittingTextRef.current = false;
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  const resetSession = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSessionId(`sess-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`);
    setMessages([
      {
        id: 'welcome-msg-' + Date.now(),
        role: 'assistant',
        content:
          "Hello, I am the STRIDE Emergency Voice Assistant. You can speak naturally to report an emergency, ask for safety guidance, or find the nearest shelter. How can I help you?",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: 'ASSIST',
      },
    ]);
    setInputVal('');
    setCurrentStatus('IDLE');
    setCurrentMode('ASSIST');
    isRecordingRef.current = false;
    hasStoppedRef.current = false;
    isSubmittingAudioRef.current = false;
    isSubmittingTextRef.current = false;
  };

  // Load existing active SOS if passed or in localStorage
  useEffect(() => {
    const existingId = initialActiveRequestId || localStorage.getItem('stride_active_sos_id');
    if (existingId) {
      duringApi.getRequestById(existingId).then((req) => {
        if (req && req.status !== 'CANCELLED' && req.status !== 'RESCUED') {
          setActiveRequest(req);
        }
      }).catch(() => {});
    }
  }, [initialActiveRequestId, isOpen]);

  // Clean up recording tracks & TTS on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStatus, recordingSeconds]);

  // TTS Helper
  const speakText = (text: string) => {
    if (isMuted || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.lang = 'en-IN';

      utterance.onstart = () => setCurrentStatus('SPEAKING');
      utterance.onend = () => setCurrentStatus('IDLE');
      utterance.onerror = () => setCurrentStatus('IDLE');

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('TTS playback error:', err);
      setCurrentStatus('IDLE');
    }
  };

  const stopRecording = () => {
    if (!isRecordingRef.current || hasStoppedRef.current) return;
    hasStoppedRef.current = true;
    isRecordingRef.current = false;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    // Immediately switch status so UI disables the button and displays processing state
    setCurrentStatus('PROCESSING');

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn('Error stopping MediaRecorder:', err);
      }
    }
  };

  const startRecording = async () => {
    if (isRecordingRef.current || isSubmittingAudioRef.current) return;
    if (currentStatus === 'SPEAKING' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setMicError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMicError('Audio recording is not supported in this browser environment. Please type below.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      let mimeType = 'audio/webm;codecs=opus';
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (!MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
          } else {
            mimeType = '';
          }
        }
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      isRecordingRef.current = true;
      hasStoppedRef.current = false;
      isSubmittingAudioRef.current = false;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        // Defensive lock: prevent onstop handler from ever executing twice
        if (isSubmittingAudioRef.current) {
          console.warn('[STRIDE Voice] Duplicate onstop invocation suppressed.');
          return;
        }
        isSubmittingAudioRef.current = true;

        const mime = recorder.mimeType || 'audio/webm';
        const chunks = [...audioChunksRef.current];
        audioChunksRef.current = [];

        // Release hardware mic track
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach((t) => t.stop());
          audioStreamRef.current = null;
        }

        const blob = new Blob(chunks, { type: mime });

        if (blob.size >= 50) {
          await handleAudioUpload(blob);
        } else {
          console.warn('[STRIDE Voice] Recording too small (<50 bytes), ignoring.');
          setCurrentStatus('IDLE');
          isSubmittingAudioRef.current = false;
        }
      };

      recorder.start(250);
      setCurrentStatus('LISTENING');
      setRecordingSeconds(0);

      // Enforce 30s limit for short emergency utterances
      let secs = 0;
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        secs += 1;
        setRecordingSeconds(secs);
        if (secs >= 30) {
          stopRecording();
        }
      }, 1000);
    } catch (err: any) {
      console.warn('Microphone getUserMedia error:', err);
      isRecordingRef.current = false;
      hasStoppedRef.current = false;
      isSubmittingAudioRef.current = false;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicError('Microphone permission denied. Please allow microphone access or type your emergency message below.');
      } else {
        setMicError(`Microphone error (${err.message || 'unknown'}). Please type your message below.`);
      }
      setCurrentStatus('IDLE');
    }
  };

  const toggleRecording = () => {
    if (isSubmittingAudioRef.current) return;
    if (currentStatus === 'LISTENING' || isRecordingRef.current) {
      stopRecording();
    } else if (currentStatus === 'IDLE' || currentStatus === 'SPEAKING') {
      startRecording();
    }
  };

  const handleAudioUpload = async (audioBlob: Blob) => {
    const clientRequestId = 'req-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);
    setCurrentStatus('PROCESSING');

    const tempUserMsgId = 'msg-' + Date.now();
    const tempUserMsg: MessageItem = {
      id: tempUserMsgId,
      role: 'user',
      content: '🎙️ [Analyzing voice recording...]',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const historyPayload = messages
        .filter(
          (m) =>
            m.id !== 'welcome-msg' &&
            !m.content.includes('[Analyzing') &&
            !m.content.includes('[Audio recording')
        )
        .map((m) => ({
          role: m.role,
          content: m.content.replace(/^🎙️\s*"?|"?$/g, '').trim(),
        }))
        .filter((m) => m.content.length > 0);

      const res = await duringApi.voiceEmergencyAudio({
        audioBlob,
        history: historyPayload,
        currentLocation: currentLocation || undefined,
        activeRequestId: activeRequest?.id || localStorage.getItem('stride_active_sos_id') || undefined,
        sessionId,
        clientRequestId,
      });

      const transcriptText =
        res.transcript && res.transcript.trim() !== ''
          ? `🎙️ "${res.transcript.trim()}"`
          : '🎙️ [Emergency voice message]';

      setMessages((prev) =>
        prev.map((m) => (m.id === tempUserMsgId ? { ...m, content: transcriptText } : m))
      );

      setCurrentMode(res.mode);

      if (res.locationConflict) {
        setLocationConflict(true);
      }

      if (res.activeRequest) {
        setActiveRequest(res.activeRequest);
        localStorage.setItem('stride_active_sos_id', res.activeRequest.id);
        onSosUpdated?.(res.activeRequest);
      }

      const assistantMsg: MessageItem = {
        id: 'msg-asst-' + Date.now(),
        role: 'assistant',
        content: res.assistantResponse,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: res.mode,
        extractedFacts: res.extractedInformation,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setCurrentStatus('IDLE');
      speakText(res.assistantResponse);
    } catch (err: any) {
      console.error('Audio processing error:', err);
      setCurrentStatus('IDLE');
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempUserMsgId ? { ...m, content: '🎙️ [Audio recording could not be processed]' } : m
        )
      );

      const errorMsg: MessageItem = {
        id: 'msg-err-' + Date.now(),
        role: 'assistant',
        content:
          "I had difficulty processing your voice recording. If you are in immediate danger, please type your message below or press the emergency SOS beacon.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: 'ASSIST',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      isSubmittingAudioRef.current = false;
    }
  };

  const handleSendMessage = async (textToSend: string) => {
    if (
      !textToSend ||
      !textToSend.trim() ||
      isSubmittingTextRef.current ||
      currentStatus === 'PROCESSING'
    ) {
      return;
    }
    isSubmittingTextRef.current = true;

    const clientRequestId = 'req-txt-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);

    // Cancel speech if speaking
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    const trimmedText = textToSend.trim();
    const userMsg: MessageItem = {
      id: 'msg-' + Date.now(),
      role: 'user',
      content: trimmedText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputVal('');
    setCurrentStatus('PROCESSING');

    try {
      // Prepare history strictly excluding the welcome message, processing messages, and stripping voice prefixes
      const historyPayload = messages
        .filter(
          (m) =>
            m.id !== 'welcome-msg' &&
            !m.content.includes('[Analyzing') &&
            !m.content.includes('[Audio recording')
        )
        .map((m) => ({
          role: m.role,
          content: m.content.replace(/^🎙️\s*"?|"?$/g, '').trim(),
        }))
        .filter((m) => m.content.length > 0);

      const res = await duringApi.voiceEmergencyChat({
        message: trimmedText,
        history: historyPayload,
        currentLocation: currentLocation || undefined,
        activeRequestId: activeRequest?.id || localStorage.getItem('stride_active_sos_id') || undefined,
        sessionId,
        clientRequestId,
      });

      setCurrentMode(res.mode);

      if (res.locationConflict) {
        setLocationConflict(true);
      }

      if (res.activeRequest) {
        setActiveRequest(res.activeRequest);
        localStorage.setItem('stride_active_sos_id', res.activeRequest.id);
        onSosUpdated?.(res.activeRequest);
      }

      const assistantMsg: MessageItem = {
        id: 'msg-asst-' + Date.now(),
        role: 'assistant',
        content: res.assistantResponse,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: res.mode,
        extractedFacts: res.extractedInformation,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setCurrentStatus('IDLE');

      // Speak aloud
      speakText(res.assistantResponse);
    } catch (err: any) {
      console.error('Voice chat error:', err);
      setCurrentStatus('IDLE');
      const errorMsg: MessageItem = {
        id: 'msg-err-' + Date.now(),
        role: 'assistant',
        content:
          "I experienced a network difficulty connecting to the emergency voice service. If you are in immediate danger, please use the manual SOS form or call 112 directly.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: 'ASSIST',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      isSubmittingTextRef.current = false;
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputVal.trim()) {
      handleSendMessage(inputVal);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl border border-[#C8D9E6] shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden relative">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#C8D9E6]/80 flex items-center justify-between bg-[#F5EFEB]/50">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm ${
              currentMode === 'EMERGENCY'
                ? 'bg-red-600 text-white animate-pulse'
                : currentMode === 'ASSESS'
                ? 'bg-amber-500 text-white'
                : 'bg-[#2F4156] text-white'
            }`}>
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base font-['Space_Grotesk',sans-serif] text-[#2F4156]">
                  STRIDE Voice Emergency Assistant
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                  currentMode === 'EMERGENCY'
                    ? 'bg-red-100 text-red-800 border border-red-200'
                    : currentMode === 'ASSESS'
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-blue-100 text-blue-800 border border-blue-200'
                }`}>
                  {currentMode}
                </span>
              </div>
              <p className="text-[11px] text-[#567C8D]">
                Natural speech & conversational triage powered by Gemini & STRIDE
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetSession}
              title="Start a fresh conversation"
              className="p-2 rounded-xl border border-[#C8D9E6] hover:bg-[#F5EFEB] text-[#2F4156] transition cursor-pointer flex items-center gap-1.5 text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline font-medium">New Session</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const nextMuted = !isMuted;
                setIsMuted(nextMuted);
                if (nextMuted && 'speechSynthesis' in window) {
                  window.speechSynthesis.cancel();
                }
              }}
              title={isMuted ? 'Unmute voice' : 'Mute voice'}
              className="p-2 rounded-xl border border-[#C8D9E6] hover:bg-[#F5EFEB] text-[#2F4156] transition cursor-pointer"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-gray-500" /> : <Volume2 className="w-4 h-4 text-blue-600" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl border border-[#C8D9E6] hover:bg-red-50 text-[#567C8D] hover:text-red-600 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Active Emergency Beacon Banner (if SOS created/updated) */}
        {activeRequest && activeRequest.status !== 'CANCELLED' && (
          <div className="bg-red-50 px-6 py-3 border-b border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-extrabold text-red-900 uppercase tracking-wider">
                    ACTIVE RESCUE BEACON #{activeRequest.id.slice(0, 8)}
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-600 text-white">
                    SCORE: {activeRequest.priorityScore} ({activeRequest.priorityLevel})
                  </span>
                </div>
                <p className="text-[11px] text-red-800 mt-0.5">
                  Status: <strong>{activeRequest.status}</strong> • People: {activeRequest.peopleCount} • Water: {activeRequest.waterLevel}
                </p>
              </div>
            </div>
            {activeRequest.team ? (
              <div className="text-[11px] font-bold text-blue-900 bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-200 flex items-center gap-1.5 self-start sm:self-auto">
                <Users className="w-3.5 h-3.5 text-blue-700" />
                <span>Assigned: {activeRequest.team.name}</span>
              </div>
            ) : (
              <div className="text-[11px] text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200 flex items-center gap-1.5 self-start sm:self-auto">
                <Clock className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                <span>Command center triaging nearest boat...</span>
              </div>
            )}
          </div>
        )}

        {/* Location Discrepancy Alert */}
        {locationConflict && (
          <div className="bg-amber-50 px-6 py-2 border-b border-amber-200 text-xs text-amber-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>
              <strong>Location discrepancy flagged:</strong> Your spoken landmark differs from your detected device GPS. Both coordinates have been preserved for the rescue squad.
            </span>
          </div>
        )}

        {/* Mic Permission Warning */}
        {micError && (
          <div className="bg-amber-50 px-6 py-2 border-b border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2">
            <span>{micError}</span>
            <button
              type="button"
              onClick={() => setMicError(null)}
              className="text-amber-700 hover:text-amber-900 font-bold underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Chat History Transcript */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-white">
          {messages.map((m) => {
            const isAsst = m.role === 'assistant';
            return (
              <div
                key={m.id}
                className={`flex gap-3 ${isAsst ? 'items-start' : 'items-end justify-end'}`}
              >
                {isAsst && (
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-xs font-bold shadow-sm ${
                    m.mode === 'EMERGENCY'
                      ? 'bg-red-600'
                      : m.mode === 'ASSESS'
                      ? 'bg-amber-500'
                      : 'bg-[#2F4156]'
                  }`}>
                    <LifeBuoy className="w-4 h-4" />
                  </div>
                )}

                <div className={`max-w-[82%] rounded-2xl p-4 text-xs leading-relaxed space-y-1.5 shadow-sm ${
                  isAsst
                    ? 'bg-[#F5EFEB] text-[#2F4156] border border-[#C8D9E6]/60'
                    : 'bg-[#2F4156] text-white rounded-br-none'
                }`}>
                  <p className="font-medium whitespace-pre-wrap">{m.content}</p>

                  {/* Confirmed extraction details pill row if emergency info extracted */}
                  {isAsst && m.extractedFacts && Object.keys(m.extractedFacts).length > 0 && (
                    <div className="pt-2 border-t border-[#C8D9E6]/50 flex flex-wrap gap-1.5">
                      {m.extractedFacts.peopleCount && (
                        <span className="px-2 py-0.5 rounded bg-white text-[#2F4156] font-bold border border-[#C8D9E6] text-[10px]">
                          People: {m.extractedFacts.peopleCount}
                        </span>
                      )}
                      {m.extractedFacts.injuredCount > 0 && (
                        <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-bold border border-red-200 text-[10px]">
                          Injured: {m.extractedFacts.injuredCount}
                        </span>
                      )}
                      {m.extractedFacts.childrenCount > 0 && (
                        <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold border border-amber-200 text-[10px]">
                          Children: {m.extractedFacts.childrenCount}
                        </span>
                      )}
                      {m.extractedFacts.waterLevel && (
                        <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold border border-blue-200 text-[10px]">
                          Water: {m.extractedFacts.waterLevel}
                        </span>
                      )}
                      {m.extractedFacts.spokenLocation && (
                        <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-bold border border-purple-200 text-[10px]">
                          Loc: {m.extractedFacts.spokenLocation}
                        </span>
                      )}
                    </div>
                  )}

                  <div className={`text-[10px] text-right ${isAsst ? 'text-[#567C8D]' : 'text-gray-300'}`}>
                    {m.timestamp}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Active Microphone Audio Recording Visualizer */}
          {currentStatus === 'LISTENING' && (
            <div className="flex gap-3 items-end justify-end">
              <div className="max-w-[80%] rounded-2xl p-4 text-xs leading-relaxed bg-red-50 text-red-900 border border-red-200 shadow-sm animate-pulse">
                <div className="flex items-center gap-2 font-bold text-red-700 mb-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
                  <span>Recording microphone audio ({recordingSeconds}s / 30s)</span>
                </div>
                <p className="text-[11px] text-red-800">
                  Speak naturally about your emergency, trapped individuals, water level, or questions. Tap the button to finish and send.
                </p>
              </div>
            </div>
          )}

          {/* Processing indicator */}
          {currentStatus === 'PROCESSING' && (
            <div className="flex gap-3 items-start">
              <div className="w-8 h-8 rounded-xl bg-[#2F4156] text-white flex items-center justify-center flex-shrink-0 text-xs shadow-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
              <div className="rounded-2xl p-3.5 bg-[#F5EFEB] border border-[#C8D9E6]/60 text-xs text-[#567C8D] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                <span>STRIDE AI is assessing situation & calculating priority score...</span>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* State visualizer badge (Listening / Processing / Speaking / Idle) */}
        <div className="px-6 py-2.5 bg-[#F5EFEB]/40 border-t border-[#C8D9E6]/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {currentStatus === 'LISTENING' ? (
              <div className="flex items-center gap-2 text-red-600 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
                <span>Recording audio ({recordingSeconds}s / 30s max) — Tap button to finish</span>
              </div>
            ) : currentStatus === 'PROCESSING' ? (
              <div className="flex items-center gap-2 text-blue-600 font-bold">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                <span>Analyzing voice audio with Gemini & calculating emergency priority...</span>
              </div>
            ) : currentStatus === 'SPEAKING' ? (
              <div className="flex items-center gap-2 text-emerald-600 font-bold">
                <Volume2 className="w-3.5 h-3.5 text-emerald-600 animate-bounce" />
                <span>Assistant is speaking response...</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[#567C8D]">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Tap microphone to record voice, or type your message below.</span>
              </div>
            )}
          </div>

          <div className="text-[11px] text-[#567C8D] hidden sm:block">
            {currentLocation ? `GPS: ${currentLocation.latitude}, ${currentLocation.longitude}` : 'Bengaluru'}
          </div>
        </div>

        {/* Input & Mic Controls */}
        <div className="p-4 sm:p-5 border-t border-[#C8D9E6] bg-white">
          <form onSubmit={handleFormSubmit} className="flex items-center gap-2.5">
            {/* Big Mic Button (Push-to-talk / Tap-to-record) */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleRecording();
              }}
              disabled={currentStatus === 'PROCESSING' || isSubmittingAudioRef.current}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white transition shadow-md cursor-pointer flex-shrink-0 disabled:opacity-50 ${
                currentStatus === 'LISTENING'
                  ? 'bg-red-600 animate-pulse ring-4 ring-red-200'
                  : currentStatus === 'PROCESSING'
                  ? 'bg-amber-600'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
              title={
                currentStatus === 'LISTENING'
                  ? `Stop & Send recording (${30 - recordingSeconds}s remaining)`
                  : currentStatus === 'PROCESSING'
                  ? 'Processing recording...'
                  : 'Start voice recording'
              }
            >
              {currentStatus === 'LISTENING' ? (
                <Square className="w-5 h-5 fill-current" />
              ) : currentStatus === 'PROCESSING' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </button>

            {/* Text Input Fallback */}
            <div className="flex-1 relative">
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder={
                  currentStatus === 'LISTENING'
                    ? 'Recording voice audio... tap button to finish.'
                    : "Speak or type your message (e.g., We're trapped upstairs)..."
                }
                disabled={currentStatus === 'PROCESSING' || currentStatus === 'LISTENING'}
                className="w-full pl-4 pr-10 py-3 rounded-2xl border border-[#C8D9E6] focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none text-xs text-[#2F4156] placeholder-[#567C8D] transition disabled:bg-gray-50"
              />
            </div>

            {/* Send Button */}
            <button
              type="submit"
              disabled={!inputVal.trim() || currentStatus === 'PROCESSING' || currentStatus === 'LISTENING'}
              className="w-12 h-12 rounded-2xl bg-[#2F4156] hover:bg-[#1f2c3a] disabled:opacity-40 text-white flex items-center justify-center transition shadow-sm cursor-pointer flex-shrink-0"
              title="Send text message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
