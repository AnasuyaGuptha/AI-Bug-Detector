import 'dotenv/config';
import { createApp } from './app.js';
import { getModelId } from './services/gemmaService.js';

const PORT = Number(process.env.PORT) || 5000;

const app = createApp();

app.listen(PORT, () => {
  console.log(`RepoBug AI backend running on http://localhost:${PORT}`);
  console.log(`GitHub token: ${process.env.GITHUB_TOKEN?.trim() ? 'configured' : 'not set (60 GitHub API requests/hour)'}`);
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const hasGeminiKey = geminiKey && geminiKey !== 'your_api_key_here';
  try {
    console.log(`AI model: ${getModelId()} via Gemini API, key ${hasGeminiKey ? 'configured' : 'NOT SET (AI analysis disabled)'}`);
  } catch (error) {
    console.log(`AI model: invalid GEMMA_MODEL. ${error.message}`);
  }
});
