import { Router } from 'express';
import { getHealth, scanRepo } from '../controllers/scanController.js';

const router = Router();

router.get('/health', getHealth);
router.post('/scan', scanRepo);

export default router;
