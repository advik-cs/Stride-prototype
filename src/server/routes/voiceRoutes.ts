import { Router } from 'express';
import multer from 'multer';
import {
  handleVoiceEmergencyChat,
  handleVoiceEmergencyAudio,
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

// Text / transcribed chat endpoint
router.post('/voice/emergency-chat', requireAuth, handleVoiceEmergencyChat);
router.post('/emergency-chat', requireAuth, handleVoiceEmergencyChat);

// Audio recording upload endpoint (multipart/form-data)
router.post('/voice/emergency-audio', requireAuth, upload.single('audio'), handleVoiceEmergencyAudio);
router.post('/emergency-audio', requireAuth, upload.single('audio'), handleVoiceEmergencyAudio);

export default router;
