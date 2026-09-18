import { Router } from 'express';
import { getAnalyticsSummary } from '../controllers/analyticsController.ts';
import { requireAuth, requireRole } from '../middleware/auth.ts';

const router = Router();

// Only AUTHORITY and RESCUER are authorized to access Live Analytics
router.get('/analytics/summary', requireAuth, requireRole(['AUTHORITY', 'RESCUER']), getAnalyticsSummary);
router.get('/analytics', requireAuth, requireRole(['AUTHORITY', 'RESCUER']), getAnalyticsSummary);

export default router;
