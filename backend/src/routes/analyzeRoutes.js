import { Router } from 'express';
import express from 'express';
import { analyzeFiles } from '../controllers/analyzeController.js';
import { ANALYZE_BODY_LIMIT } from '../config/analysisConfig.js';

const router = Router();

// /api/analyze receives whole source files, so it accepts a larger body than the other routes.
router.post('/analyze', express.json({ limit: ANALYZE_BODY_LIMIT }), analyzeFiles);

export default router;
