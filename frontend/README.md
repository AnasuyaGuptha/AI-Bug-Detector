# RepoBug AI — Frontend

React 19 + TypeScript + Vite + Tailwind CSS v4 + React Router 7.
Icons: lucide-react. Code highlighting: prism-react-renderer. Fonts: Inter and JetBrains Mono (bundled, no CDN).

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173.

Other scripts: `npm run build`, `npm run lint`, `npm run preview`.

## Pages

| Route | Page |
| --- | --- |
| `/` | Repository scanner. Accepts `owner/repo`, `github.com/owner/repo`, or a full URL. `?repo=` pre-fills the input. |
| `/scan/:scanId` | Scanning progress. Polls every second, shows each step, then opens the findings. |
| `/scan/:scanId/findings` | Findings dashboard. Severity filter, category filter, sort, and search. Filters are kept in the URL. Press `/` to search. |
| `/scan/:scanId/findings/:findingId` | Bug detail. Plain-English explanation, highlighted evidence, and the fix as a diff or as full code. Use `←` / `→` to move between findings. |

## Sample mode vs real data

The app uses sample data by default. While sample mode is on, the header, the scan page, the dashboard, and each finding show a "Sample" label so demo data is never mistaken for a real analysis.

Sample mode tips for demos:

- Any repo URL returns the same 10 sample findings.
- A repo URL that contains `fail` (for example `octo/fail-demo`) stops at 40% to show the error state.

To use the real backend:

1. Copy `.env.example` to `.env` and set `VITE_USE_MOCK=false`.
2. Run the backend on `http://localhost:8000`. Vite forwards `/api/*` there (see `vite.config.ts`).

## API contract

All network calls are in `src/api/client.ts`. Data shapes are in `src/types.ts`. Pages never call `fetch` directly.

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| `POST` | `/api/scans` | `{ "repoUrl": "https://github.com/owner/repo" }` | `Scan` |
| `GET` | `/api/scans/:id` | – | `Scan` |
| `GET` | `/api/scans/:id/findings` | – | `Finding[]` |
| `GET` | `/api/scans/:id/findings/:findingId` | – | `Finding` |

Notes for the backend:

- `Scan.status` is one of `queued`, `cloning`, `analyzing`, `completed`, `failed`. Set `error` when it fails.
- `Scan.stepIndex` (0–4) picks the active step in the progress list. If it is missing, the UI works it out from `progress`.
- `Finding.summary`, `explanation`, and `fixExplanation` are shown to beginners as "What's wrong", "Why it matters", and "How to fix it". Keep them short and plain.
- `Finding.evidence` and `suggestedFix` are code snippets that both start at `evidenceStartLine`. `line` is the line to highlight.
- `language` and `confidence` (0–1) are optional.
- Error responses may include `{ "detail": "..." }` or `{ "message": "..." }`. The UI shows that text.

## Project layout

```
src/
  api/          client.ts (API boundary), mock.ts (sample data)
  components/   Layout, CodeBlock, SeverityBadge, SeverityIcon, SampleBadge, CopyButton, GitHubIcon, States
  hooks/        useDocumentTitle
  lib/          code.ts (language + diff), findings.ts (filter/sort), repo.ts, scanSteps.ts
  pages/        Scanner, ScanProgress, Findings, BugDetail, NotFound
  severity.ts   severity order, colours, and descriptions
  index.css     theme tokens (@theme) and shared component classes
```

## Theme

Colours live in `src/index.css` under `@theme`: charcoal surfaces (`bg`, `surface`, `raised`), off-white text (`fg`, `muted`, `faint`), a lavender accent, and pastel severity colours (`sev-critical` … `sev-info`).
