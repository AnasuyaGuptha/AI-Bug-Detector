import { analyzeRepositoryFiles } from '../services/analysisService.js';

// Express 5 forwards rejected promises to the error handler automatically.
export async function analyzeFiles(req, res) {
  const result = await analyzeRepositoryFiles(req.body);
  res.json(result);
}
