import { Router } from 'express';
import { AppError } from '../utils/AppError.js';
import { startScanJob, getScanJob, getScanJobResult, getScanJobAnalysis, getScanJobFindings } from '../services/scanJobService.js';

// Routes in the shape the frontend (frontend/src/api/client.ts) calls.
// They run POST /api/scan and then POST /api/analyze (Gemma 4) as one background job.
const router = Router();

function findJob(id) {
  const scan = getScanJob(id);
  if (!scan) throw new AppError(404, 'SCAN_NOT_FOUND', 'This scan does not exist. Scans are kept in memory and are lost when the backend restarts.');
  return scan;
}

router.post('/scans', (req, res) => {
  res.status(202).json(startScanJob(req.body?.repoUrl));
});

router.get('/scans/:id', (req, res) => {
  res.json(findJob(req.params.id));
});

// The scanned files with line numbers, for the AI module or for checking the output.
router.get('/scans/:id/files', (req, res) => {
  findJob(req.params.id);
  const result = getScanJobResult(req.params.id);
  if (!result) throw new AppError(409, 'SCAN_NOT_FINISHED', 'The scan has not finished fetching files yet.');
  res.json(result);
});

/** Findings in the frontend's Finding shape, once the job has completed. */
function completedFindings(id) {
  const scan = findJob(id);
  if (scan.status === 'failed') throw new AppError(409, 'SCAN_FAILED', scan.error ?? 'This scan failed.');
  const findings = getScanJobFindings(id);
  if (!findings) throw new AppError(409, 'SCAN_NOT_FINISHED', 'The scan is still running.');
  return findings;
}

router.get('/scans/:id/findings', (req, res) => {
  res.json(completedFindings(req.params.id));
});

router.get('/scans/:id/findings/:findingId', (req, res) => {
  const finding = completedFindings(req.params.id).find((f) => f.id === req.params.findingId);
  if (!finding) throw new AppError(404, 'FINDING_NOT_FOUND', 'This finding does not exist.');
  res.json(finding);
});

// The full POST /api/analyze-style result (model, summary, warnings, findings).
router.get('/scans/:id/analysis', (req, res) => {
  completedFindings(req.params.id);
  res.json(getScanJobAnalysis(req.params.id));
});

// The frontend shows `message` from error responses, so add it next to the standard `error` object.
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  // Errors from other routes can pass through this router; leave those alone.
  if (!(err instanceof AppError) || !req.path.startsWith('/scans')) return next(err);
  res.status(err.status).json({ success: false, error: { code: err.code, message: err.message }, message: err.message });
});

export default router;
