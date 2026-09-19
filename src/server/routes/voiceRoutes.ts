import { Router } from 'express';
import multer from 'multer';
import {
  handleVoiceEmergencyChat,
  handleVoiceEmergencyAudio,
  handleResetTestBeacon,
  handleGetSessionToken,
  handleDeepgramStt,
  handleDeepgramTts,
} from '../controllers/voiceEmergencyController.ts';
import { requireAuth } from '../middleware/auth.ts';

const router = Router();

// Defensive 25 MB upload limit for audio recordings (V1 typical duration: 15-30s WebM/Opus)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

const safeAudioUpload = (req: any, res: any, next: any) => {
  const contentType = (req.headers && req.headers['content-type']) || '';
  if (contentType.includes('multipart/form-data')) {
    upload.single('audio')(req, res, (err: any) => {
      if (err) {
        console.warn('[STRIDE Voice] Multer parse warning/error:', err?.message || err);
        req.multerError = err?.message || 'Multipart parse error';
      }
      next();
    });
  } else {
    // Non-multipart (e.g., application/json with base64 audio), bypass multer
    next();
  }
};

// Deepgram Turn-Based Speech Services (Server-Side Secret DEEPGRAM_API_KEY)
router.post('/voice/deepgram-stt', requireAuth, safeAudioUpload, handleDeepgramStt);
router.post('/deepgram-stt', requireAuth, safeAudioUpload, handleDeepgramStt);
router.post('/voice/deepgram-tts', requireAuth, handleDeepgramTts);
router.post('/deepgram-tts', requireAuth, handleDeepgramTts);

// Ephemeral session token endpoint for Gemini Live API
router.post('/voice/session-token', requireAuth, handleGetSessionToken);
router.get('/voice/session-token', requireAuth, handleGetSessionToken);

// Text / transcribed chat endpoint
router.post('/voice/emergency-chat', requireAuth, handleVoiceEmergencyChat);
router.post('/emergency-chat', requireAuth, handleVoiceEmergencyChat);

// Audio recording upload endpoint (multipart/form-data primary, json fallback supported)
router.post('/voice/emergency-audio', requireAuth, safeAudioUpload, handleVoiceEmergencyAudio);
router.post('/emergency-audio', requireAuth, safeAudioUpload, handleVoiceEmergencyAudio);

// Safe test beacon reset endpoint (Rule 7)
router.post('/voice/reset-test-beacon', requireAuth, handleResetTestBeacon);
router.post('/voice-emergency/reset-test-beacon', requireAuth, handleResetTestBeacon);
router.post('/reset-test-beacon', requireAuth, handleResetTestBeacon);

export default router;
