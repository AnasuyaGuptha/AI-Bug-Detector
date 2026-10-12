# RepoBug AI — Backend

RepoBug AI scans public GitHub repositories for bugs using AI. The backend has two parts:

- **Repository scanner** (`POST /api/scan`). It takes a GitHub URL, downloads the most
  relevant source files, adds line numbers, and returns them as JSON.
- **AI bug detection engine** (`POST /api/analyze`). It sends those files to **Gemma 4**
  through the **Google Gemini API** and returns evidence-based bug findings. Every finding
  is checked against the submitted source before it is returned.

The backend only **reads text**. It never executes repository code, installs the
repository's dependencies, or runs its scripts. AI findings are always marked
`"status": "potential"`, because nothing is executed or tested.

## Requirements

- Node.js **18.17 or newer** (tested on Node 24). The backend uses the built-in `fetch` and `node:test`.
- Internet access to `api.github.com`, `raw.githubusercontent.com` and `generativelanguage.googleapis.com`.
- A Gemini API key for AI analysis (see [AI bug analysis](#ai-bug-analysis-post-apianalyze)). The scanner works without one.

## Setup

```bash
npm install
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
```

Optionally edit `.env` (see [Environment variables](#environment-variables)).

## Run

```bash
npm start        # start the server on http://localhost:5000
npm run dev      # start with nodemon (restarts automatically when files change)
npm test         # run the automated tests
```

## Environment variables

| Variable       | Required | Default | Description |
|----------------|----------|---------|-------------|
| `PORT`         | No       | `5000`  | Port the server listens on. |
| `GITHUB_TOKEN` | No       | –       | GitHub personal access token, sent as a Bearer token to the GitHub API. Without it, GitHub allows **60 API requests per hour per IP**; with it, 5,000. Read-only access to public repositories is enough. Create one at https://github.com/settings/tokens. |
| `CORS_ORIGIN`  | No       | any `http://localhost:<port>` / `http://127.0.0.1:<port>` | Comma-separated list of frontend origins allowed to call the API, e.g. `https://repobug.example.com`. |
| `GEMINI_API_KEY` | For AI analysis | – | Google Gemini API key. Get one at https://aistudio.google.com/apikey. Without it, `/api/analyze` returns `503 AI_NOT_CONFIGURED`. |
| `GEMMA_MODEL`  | No       | `gemma-4-26b-a4b-it` | `gemma-4-26b-a4b-it` (faster, Mixture-of-Experts) or `gemma-4-31b-it` (larger). Any other value is rejected, so the engine can never silently use a non-Gemma model. |
| `GEMINI_INPUT_TOKENS_PER_MINUTE` | No | `16000` | Your tier's input-token limit per minute. The free tier allows 16,000 for Gemma 4 26B. The engine paces requests to stay under it. |
| `GEMMA_MAX_BATCHES` | No | `4` | Max model requests per analysis, each about 9,000 tokens of code. The default of 4 takes about 2–3 minutes on the free tier. Raise it (up to 20) on a paid tier to analyze more files. |

Tokens and keys are never included in API responses or logs. `.env` is ignored by Git.

## Endpoints

`GET /` (http://localhost:5000/ in a browser) lists the endpoints below.

### `GET /api/health`

```bash
curl http://localhost:5000/api/health
```

```json
{ "success": true, "status": "ok", "service": "repobug-ai-scanner", "timestamp": "2026-10-12T06:26:31.018Z" }
```

### `POST /api/scan`

Request body:

```json
{ "repoUrl": "https://github.com/expressjs/express" }
```

```bash
curl -X POST http://localhost:5000/api/scan \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://github.com/expressjs/express"}'
```

PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/scan `
  -ContentType "application/json" `
  -Body '{"repoUrl": "https://github.com/expressjs/express"}'
```

Successful response (`200`):

```json
{
  "success": true,
  "repository": {
    "owner": "expressjs",
    "name": "express",
    "branch": "master",
    "url": "https://github.com/expressjs/express"
  },
  "filesScanned": 20,
  "files": [
    {
      "path": "lib/application.js",
      "language": "javascript",
      "lineCount": 631,
      "content": "/*!\n * express\n ...",
      "numberedContent": "1: /*!\n2:  * express\n..."
    }
  ],
  "warnings": [
    "Found 140 supported source files; only the 20 most relevant were scanned."
  ]
}
```

Response fields:

| Field | Description |
|-------|-------------|
| `repository.branch` | The repository's default branch, read from GitHub (never assumed to be `main`). |
| `filesScanned` | Number of entries in `files`. |
| `files[].path` | Path in the repository, unchanged. |
| `files[].language` | One of `javascript`, `typescript`, `python`, `java`, `c`, `cpp`, `go`, `dart`. |
| `files[].lineCount` | Number of lines. A trailing newline at the end of the file does not count as an extra line. |
| `files[].content` | The original file content, unchanged. |
| `files[].numberedContent` | The same content with `N: ` before each line. Use these line numbers when reporting bugs. |
| `warnings` | Human-readable strings. Empty when nothing was skipped. A scan that finds no supported files still returns `200`, with `files: []` and a warning. |

Accepted URL forms: `https://github.com/owner/repo`, with an optional trailing `/`
or `.git`, and optionally `www.`. Everything else is rejected, including other hosts,
`http://`, sub-paths such as `/tree/main`, URLs with credentials, and URLs with a custom port.

### AI bug analysis: `POST /api/analyze`

**Model and API:** Gemma 4 (`gemma-4-26b-a4b-it` by default, or `gemma-4-31b-it`) through
the Google Gemini API, using the official `@google/genai` SDK and `models.generateContent`.
These model IDs come from Google's guide
[Run Gemma with the Gemini API](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api).

**Getting a key:** sign in at https://aistudio.google.com/apikey, click **Create API key**,
and put it in `.env` as `GEMINI_API_KEY=...`. Restart the server. The startup log then shows
`AI model: gemma-4-26b-a4b-it via Gemini API, key configured`.

**Request:** the body is the `POST /api/scan` response, or any object with `repository` and
`files`. Only `path` and `content` are required for each file. Line numbers are recomputed
from `content`.

```json
{
  "repository": { "owner": "example", "name": "demo-project", "branch": "main", "url": "https://github.com/example/demo-project" },
  "files": [
    {
      "path": "src/example.js",
      "language": "javascript",
      "content": "function divide(a, b) {\n  return a / b;\n}\nconsole.log(divide(10, 0));"
    }
  ]
}
```

To scan and analyze in one go (PowerShell):

```powershell
$scan = Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/scan -ContentType "application/json" -Body '{"repoUrl": "https://github.com/pallets/flask"}'
$analysis = Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/analyze -ContentType "application/json" -Body ($scan | ConvertTo-Json -Depth 10)
$analysis.summary; $analysis.findings | Select-Object severity, filePath, startLine, title
```

**Response (`200`):**

```json
{
  "success": true,
  "repository": { "owner": "example", "name": "demo-project", "branch": "main", "url": "https://github.com/example/demo-project" },
  "model": { "provider": "Google Gemini API", "name": "gemma-4-26b-a4b-it" },
  "summary": { "filesAnalyzed": 1, "findingsCount": 1, "critical": 0, "high": 0, "medium": 1, "low": 0 },
  "coverage": { "filesSubmitted": 1, "filesAnalyzed": 1, "filesSkipped": 0, "filesFailed": 0 },
  "findings": [
    {
      "id": "finding-1",
      "title": "Division by zero when b is 0",
      "severity": "medium",
      "confidence": 0.85,
      "filePath": "src/example.js",
      "startLine": 4,
      "endLine": 4,
      "evidence": "console.log(divide(10, 0));",
      "explanation": "divide() does not check b, so divide(10, 0) returns Infinity ...",
      "suggestedFix": "Validate the denominator before dividing.",
      "fixedCode": "",
      "category": "runtime-error",
      "status": "potential"
    }
  ],
  "warnings": []
}
```

| Field | Notes |
|-------|-------|
| `severity` | `critical`, `high`, `medium` or `low`. |
| `confidence` | 0–1. This is the model's own estimate, not a calibrated probability. |
| `status` | Always `potential`. The engine never executes or tests code, so it never claims `verified`. |
| `evidence` | The **exact source text** at the finding's lines, copied from the submitted file and not from the model's answer. |
| `fixedCode` | Extra field: the corrected replacement for lines `startLine`–`endLine`, or `""`. |
| `category` | `logic`, `null-reference`, `runtime-error`, `error-handling`, `type-error`, `resource-leak`, `security`, `edge-case`, `control-flow`, `concurrency` or `other`. |
| `summary` | Always recounted from the accepted findings. Counts written by the model are ignored. |
| `coverage` | Extra field showing how much code was reviewed. `filesSkipped` means a file was empty, too large, or over the batch limit. `filesFailed` means the model call for its batch failed. |
| `warnings` | Skipped files, discarded or corrected findings, truncated answers, and failed batches. |

**How a model answer becomes findings:**

1. **Prompt.** A dedicated system instruction (`backend/src/prompts/bugAnalysisPrompt.js`)
   asks Gemma 4 for evidence-based static review with exact paths, line numbers and quotes, and
   tells it to return only JSON. File content is wrapped in markers that contain a random token
   and is declared untrusted, so instructions hidden in comments are not followed.
2. **Batches and rate limits.** Files, in the scanner's relevance order, are packed into
   batches of about 9,000 tokens of code (about 65% of the per-minute budget, counting the
   system instruction). On the free tier (16,000 input tokens per minute), batches are sent one
   at a time so they don't compete for quota. Token counts are estimated at 2.2 characters per
   token, which is slightly pessimistic: the real figure, measured with `countTokens`, is
   2.35–2.55 for code.
   Small files stay whole. A file larger than one batch is split at a natural boundary
   (before a top-level `def`/`class`/`function`, or at a blank line), and every part keeps the
   original line numbers. Up to `GEMMA_MAX_BATCHES` (default 4) batches are sent. A shared
   token limiter waits for quota instead of failing. If the API still returns `429` with a
   short retry delay (90s or less), the engine waits that long and retries, up to 3 times.
   Files that are not analyzed are listed in `warnings`, and `summary.filesAnalyzed` counts
   only the files that were analyzed completely.
3. **Parsing** (`utils/parseModelOutput.js`). It accepts plain JSON, ```` ```json ```` fences,
   and text around the JSON. For a truncated answer, the complete findings are recovered and a
   warning is added.
4. **Validation** (`utils/validateFindings.js`). Each finding must reference a submitted file
   and have a start line inside it, a valid severity and confidence, and evidence that really
   appears in the file. If the evidence is a few lines away from the reported line, the line
   number is corrected and a warning is added. Anything else is discarded, and the number of
   discarded findings is reported as a warning.
5. **Deduplication.** Findings that overlap in the same file and describe the same problem are
   merged. The most severe and most confident one is kept.

If every batch fails or returns unusable output, the endpoint returns an error, never empty or
invented findings.

### Scan jobs for the frontend: `/api/scans`

The frontend (`frontend/src/api/client.ts`) starts a scan, then polls it for progress.
A job runs the scanner and then the Gemma 4 analysis in the background.

| Method | Path | Returns |
|--------|------|---------|
| `POST` | `/api/scans` with body `{ "repoUrl": "..." }` | `202` and a `Scan` object (see `frontend/src/types.ts`) |
| `GET`  | `/api/scans/:id` | The `Scan` object, with real `status`, `progress`, `filesScanned` and `totalFiles` |
| `GET`  | `/api/scans/:id/files` | The same JSON as `POST /api/scan`, available after the files are fetched |
| `GET`  | `/api/scans/:id/findings` | Findings in the frontend's `Finding` shape, available after the job completes |
| `GET`  | `/api/scans/:id/findings/:findingId` | One finding |
| `GET`  | `/api/scans/:id/analysis` | The full `POST /api/analyze` response (model, summary, warnings) |

For the frontend, each finding's `evidence` and `suggestedFix` are the same code snippet,
with 2 lines of context, before and after the fix. That lets the frontend show a diff. If
the scan or the AI analysis fails, for example because `GEMINI_API_KEY` is missing, the job
ends with `status: "failed"` and a readable `error`. Jobs are kept in memory, at most 50,
and are lost when the server restarts. Error responses on these routes also include a
top-level `message`, because the frontend displays that field.

### Running with the frontend

The frontend's dev server forwards `/api` requests to `http://localhost:8000` (see
`frontend/vite.config.ts`), so run the backend on port 8000:

```powershell
# terminal 1 - backend
$env:PORT=8000; npm start

# terminal 2 - frontend (uses real data when frontend/.env.local contains VITE_USE_MOCK=false)
cd frontend; npm run dev
```

Then open http://localhost:5173.

### Errors

All errors use the same shape:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REPOSITORY_URL",
    "message": "Please provide a valid public GitHub repository URL, for example https://github.com/owner/repo."
  }
}
```

| HTTP | `code` | When |
|------|--------|------|
| 400 | `INVALID_REPOSITORY_URL` | `repoUrl` is missing or is not a valid GitHub repository URL. |
| 400 | `INVALID_JSON` | The request body is not valid JSON. |
| 403 | `PRIVATE_REPOSITORY` | The repository is private. |
| 403 | `REPOSITORY_ACCESS_DENIED` | GitHub refused access, for example because the repository was blocked. |
| 404 | `REPOSITORY_NOT_FOUND` | The repository does not exist, or it is private and not visible. |
| 404 | `BRANCH_NOT_FOUND` | The default branch could not be read. |
| 404 | `ROUTE_NOT_FOUND` | Unknown API route. |
| 413 | `PAYLOAD_TOO_LARGE` | The request body is larger than 10 KB. |
| 429 | `GITHUB_RATE_LIMITED` | The GitHub API rate limit was reached. The message says when to retry. |
| 502 | `GITHUB_UNREACHABLE` | A network error occurred while connecting to GitHub. |
| 502 | `GITHUB_AUTH_FAILED` | The configured `GITHUB_TOKEN` is invalid. |
| 502 | `GITHUB_API_ERROR` | GitHub returned an unexpected error. |
| 504 | `GITHUB_TIMEOUT` | GitHub did not respond within 10 seconds. |
| 500 | `INTERNAL_ERROR` | An unexpected server error occurred. Details are logged on the server only. |

If a single file fails to download, the scan does **not** fail. That file is skipped
and a warning is added instead.

Errors from `POST /api/analyze`:

| HTTP | `code` | When |
|------|--------|------|
| 400 | `INVALID_ANALYSIS_REQUEST` | The body has no `files` array, or a file is missing `path` or `content`, or a path appears twice. |
| 400 | `NO_FILES_TO_ANALYZE` | `files` is empty, or every file is empty or too large. |
| 413 | `TOO_MANY_FILES` | More than 30 files. |
| 413 | `PAYLOAD_TOO_LARGE` | More than 1,000,000 characters of code, or a body over 5 MB. |
| 429 | `AI_RATE_LIMITED` | The Gemini API quota or rate limit was reached. |
| 500 | `AI_MODEL_NOT_SUPPORTED` | `GEMMA_MODEL` is not one of the two Gemma 4 IDs. |
| 502 | `AI_AUTH_FAILED` | The Gemini API rejected `GEMINI_API_KEY`. |
| 502 | `AI_MODEL_UNAVAILABLE` | The Gemma 4 model is not available to this key. |
| 502 | `AI_INVALID_OUTPUT` | Every batch returned output that could not be parsed. |
| 502 | `AI_SERVICE_UNREACHABLE` | A network error occurred while connecting to the Gemini API. |
| 502 | `AI_ANALYSIS_FAILED` | Any other Gemini API failure. |
| 503 | `AI_NOT_CONFIGURED` | `GEMINI_API_KEY` is not set. |
| 503 | `AI_SERVICE_UNAVAILABLE` | The Gemini API returned a temporary server error (one retry is made first). |
| 504 | `AI_TIMEOUT` | The model did not answer within 120 seconds. |

If only some batches fail, the response is still `200` with the findings from the other
batches. The files that were not analyzed are listed in `warnings`, and `summary.filesAnalyzed`
counts only the files that were analyzed.

## How a scan works

1. Validate the URL and extract `owner` and `repo` (`utils/validateRepoUrl.js`).
2. `GET https://api.github.com/repos/{owner}/{repo}` to read metadata and the default branch.
3. `GET https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1` to read the full file list.
4. Filter and rank the files (`utils/filterFiles.js`):
   - Only `.js .jsx .mjs .cjs .ts .tsx .py .java .c .cpp .h .hpp .go .dart` files are kept.
   - Excluded: dependency, build and tool folders (`node_modules`, `vendor`, `dist`, `build`, `coverage`, `target`, `__pycache__`, `venv`, …) and every folder starting with `.` (`.git`, `.next`, `.venv`, …).
   - Also excluded: lock files, minified files and bundles (`*.min.js`, `*.bundle.js`), and generated code (`*.d.ts`, `*.pb.go`, `*_pb2.py`, `*.g.dart`, `*.generated.*`).
   - Excluded as well: symlinks, submodules, and files larger than **100 KB**.
   - Application code (`src/`, `lib/`, `app/`, `cmd/`, …) is ranked first. Tests, examples, docs, scripts and config files are ranked last.
   - The top **20** files are scanned.
5. Download each file from `https://raw.githubusercontent.com/...`, 5 files at a time. Binary files (containing NUL bytes) are skipped.
6. Add line numbers and return the JSON response.

A scan uses only **2 GitHub API requests**. File downloads from `raw.githubusercontent.com`
do not count against the API rate limit.

Limits are defined in `backend/src/config/limits.js`.

## Project structure

```text
├── package.json
├── .env.example
├── backend/
│   ├── src/
│   │   ├── server.js                  # loads .env, starts the server
│   │   ├── app.js                     # Express app: CORS, JSON body, routes, error handler
│   │   ├── config/
│   │   │   ├── limits.js              # scanner: file count, file size, timeouts
│   │   │   └── analysisConfig.js      # AI: Gemma 4 model IDs, batch sizes, limits
│   │   ├── prompts/bugAnalysisPrompt.js  # system instruction, prompt builder
│   │   ├── routes/
│   │   │   ├── scanRoutes.js          # GET /api/health, POST /api/scan
│   │   │   ├── analyzeRoutes.js       # POST /api/analyze
│   │   │   └── scanJobRoutes.js       # /api/scans/... for the frontend
│   │   ├── controllers/               # scanController.js, analyzeController.js
│   │   ├── services/
│   │   │   ├── scanService.js         # runs a scan from start to finish
│   │   │   ├── githubService.js       # all GitHub HTTP calls (timeouts, error mapping)
│   │   │   ├── gemmaService.js        # all Gemini API calls (model check, errors, JSON mode)
│   │   │   ├── analysisService.js     # validate -> batch -> Gemma -> parse -> validate -> dedupe
│   │   │   └── scanJobService.js      # background scan + analysis jobs for the frontend
│   │   ├── utils/
│   │   │   ├── validateRepoUrl.js
│   │   │   ├── filterFiles.js
│   │   │   ├── addLineNumbers.js
│   │   │   ├── validateAnalyzeRequest.js
│   │   │   ├── parseModelOutput.js
│   │   │   ├── validateFindings.js
│   │   │   ├── toFrontendFinding.js
│   │   │   ├── mapWithConcurrency.js
│   │   │   └── AppError.js
│   │   └── middleware/errorHandler.js
│   └── tests/                         # node:test unit tests
```

## Tests

`npm test` runs offline unit and HTTP tests:

- **Scanner:** URL validation, file filtering, line numbering, and GitHub error handling
  (rate limits, network failures, timeouts, missing or private or empty repositories, binary
  files). GitHub is replaced by a stubbed `fetch`.
- **AI engine:** request validation, batching, parsing (plain, fenced, surrounded, truncated
  and malformed JSON), finding validation (invalid severity or confidence, unknown paths,
  out-of-range lines, evidence mismatches, line correction), deduplication, recalculated
  summaries, Gemini API error mapping, the structured-output fallback, and the
  `GEMMA_MODEL` allowlist. **The Gemma model is mocked in these tests.** They do not prove
  that the real model works.
- **HTTP:** `/api/analyze` is registered, uses its own body limit, and doesn't change `/api/scan`.

To test against the real Gemma 4 model, set `GEMINI_API_KEY` and run the PowerShell example in
[AI bug analysis](#ai-bug-analysis-post-apianalyze), or scan a repository in the frontend.

## Known limitations

- **Rate limit without a token:** about 30 scans per hour per IP, because each scan uses 2 API requests out of 60. Set `GITHUB_TOKEN` for demos.
- **Public repositories only.** Private repositories are rejected, even if the token could read them.
- **Default branch only.** URLs pointing at another branch, tag or sub-folder (`/tree/...`) are rejected.
- **Very large repositories:** GitHub truncates recursive trees above about 100,000 entries or 7 MB. If that happens, the scan uses the partial tree and returns a warning.
- **20 files × 100 KB maximum** per scan. The ranking is a heuristic and may sometimes miss the most interesting file.
- **Commits during a scan:** files are downloaded by branch name, so a commit pushed in the middle of a scan could produce a mix of old and new files.
- `.h` files are always reported as `c`, even in C++ projects.
- Files are decoded as UTF-8. Files in other encodings may contain replacement characters.

AI analysis:

- **Findings are potential bugs.** They come from static reading by a language model. Expect some false positives and missed bugs. Confidence values are the model's own estimates.
- **No cross-file context beyond each batch.** The model only sees the files in the same batch, so bugs that depend on code in other files may be missed or reported with lower confidence.
- **Model settings come from testing, not documentation.** On 2026-10-12, `gemma-4-26b-a4b-it` was tested on a file with 5 planted bugs:
  - *Schema-constrained output* (`responseMimeType` + `responseJsonSchema`): the API accepts it, but the model then always answered `{"findings":[]}` (0/5 found). **It is not used.** The engine asks for JSON in the prompt and parses it robustly.
  - *Default or high thinking:* the model sometimes spent its whole output budget thinking (about 175s) and returned nothing. **Thinking is set to `MINIMAL`.**
  - *Prompt-only JSON with minimal thinking:* 3–4 of 5 planted bugs found, in about 17s per batch, with sensible severities.
- **Occasional `500 Internal error` from the Gemini API** for Gemma (2 of 4 test calls). These are retried twice, after about 5s and 15s. If a batch still fails, its files are listed in `warnings` and `coverage.filesFailed`.
- **Free-tier speed and coverage.** Gemma 4's limits are not listed on the Gemini rate-limits page. A real `429` on 2026-10-12 showed **16,000 input tokens per minute** for the free tier, so a scan can send about 1.5 batches of 9,000 code tokens per minute. With the default of 4 batches, a scan takes about 2–3 minutes and covers about 36,000 tokens (about 85 KB) of the most relevant code. For a large repository like Flask or Express, that's roughly the top 6–12 of the 20 scanned files. The frontend's "Files" counter shows how many were analyzed. Enable billing and raise `GEMINI_INPUT_TOKENS_PER_MINUTE` and `GEMMA_MAX_BATCHES` for full coverage.
- **Daily quota:** if the free tier's daily limit is reached, the API asks you to wait hours, not seconds. The engine does not wait that long; it returns `AI_RATE_LIMITED`.
- **Pieces of large files** are reviewed separately, so a bug that spans two parts of the same file may be missed.
- Analysis jobs and their findings are kept in memory and are lost when the server restarts.
