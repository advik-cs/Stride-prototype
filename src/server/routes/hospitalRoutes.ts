import { Router } from 'express';
import { getHospitals, getHospitalById } from '../controllers/hospitalController.ts';
import { requireAuth } from '../middleware/auth.ts';

const router = Router();

// Hospital Information Directory (Canonical, Shared, Role-Aware)
router.get('/hospitals', requireAuth, getHospitals);
router.get('/hospitals/:id', requireAuth, getHospitalById);

export default router;
