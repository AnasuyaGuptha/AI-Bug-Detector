import { scanRepository } from '../services/scanService.js';

export function getHealth(req, res) {
  res.json({
    success: true,
    status: 'ok',
    service: 'repobug-ai-scanner',
    timestamp: new Date().toISOString(),
  });
}

// Express 5 forwards rejected promises to the error handler automatically.
export async function scanRepo(req, res) {
  const result = await scanRepository(req.body?.repoUrl);
  res.json(result);
}
