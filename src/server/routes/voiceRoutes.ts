import { Router } from 'express';
import { handleVoiceEmergencyChat } from '../controllers/voiceEmergencyController.ts';
import { requireAuth } from '../middleware/auth.ts';

const router = Router();

// Voice Emergency AI Assistant endpoint
router.post('/voice/emergency-chat', requireAuth, handleVoiceEmergencyChat);
router.post('/emergency-chat', requireAuth, handleVoiceEmergencyChat);

export default router;
