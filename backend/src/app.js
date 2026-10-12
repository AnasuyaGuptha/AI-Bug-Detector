import express from 'express';
import cors from 'cors';
import scanRoutes from './routes/scanRoutes.js';
import scanJobRoutes from './routes/scanJobRoutes.js';
import analyzeRoutes from './routes/analyzeRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Origins allowed to call the API. Set CORS_ORIGIN (comma-separated) to override;
// by default any http://localhost:<port> or http://127.0.0.1:<port> frontend is allowed.
function corsOrigin() {
  const configured = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean);
  if (configured?.length) return configured;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
}

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: corsOrigin() }));
  // /api/analyze has its own, larger body limit, so it is mounted before the default parser.
  app.use('/api', analyzeRoutes);
  app.use(express.json({ limit: '10kb' }));

  // Opening http://localhost:5000/ in a browser shows what the API offers.
  app.get('/', (req, res) => {
    res.json({
      success: true,
      service: 'RepoBug AI - repository scanner and Gemma 4 bug analysis',
      endpoints: {
        health: 'GET /api/health',
        scan: 'POST /api/scan with JSON body { "repoUrl": "https://github.com/owner/repo" }',
        analyze: 'POST /api/analyze with the POST /api/scan response as the body',
        frontendScanJobs: 'POST /api/scans, GET /api/scans/:id, GET /api/scans/:id/files, GET /api/scans/:id/findings, GET /api/scans/:id/analysis',
      },
    });
  });

  // scanJobRoutes is mounted first so its error handler (which adds `message`
  // for the frontend) never sees errors from the main /api/scan route.
  app.use('/api', scanJobRoutes);
  app.use('/api', scanRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
