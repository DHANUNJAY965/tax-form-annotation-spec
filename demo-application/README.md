# Demo application (not part of the graded deliverable)

The assessment only asks for the spec, the docs, and worked examples (see the repo root
`README.md`, "Constraints honored") — this folder is extra: a small, real FastAPI + TypeScript
React app that proves the spec end-to-end. It starts from a blank form, lets you type a value
into each box, and only writes it onto the real reference form image once you click Submit.

```
demo-application/
  backend/    FastAPI -- resolves data_reference (incl. SUM aggregation across forms),
              evaluates condition, formats each value per format.type, serves it as JSON
  frontend/   React + TypeScript (Vite + Tailwind) -- generates one input per editable box
              straight from the annotation list, and on Submit overlays the resolved/formatted
              result on the reference form image at the exact position/size each box specifies
```

## Run it locally

**Backend** (from `demo-application/backend/`):

```bash
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

**Frontend** (from `demo-application/frontend/`, in a second terminal):

```bash
npm install
npm run dev        # or: npm run typecheck / npm run build
```

Then open **http://localhost:5173** — three tabs, each backed by the same shared taxpayer
record:

- **W-2 — Employer 1**: fill in wages, withholding, the retirement-plan checkbox, and both state
  rows, then click Submit — every value appears in its exact box on the real W-2 image.
- **W-2 — Employer 2**: a second, independent physical page (`employment[1]` instead of `[0]`) —
  proves the same schema handles a second document, not just a second row.
- **Form 1040 — Line 1a**: has no inputs of its own — it's `SUM(taxpayer.employment[*].wages.federal_taxable)`,
  so it updates automatically to reflect whatever was submitted on the two W-2 tabs, no separate
  submit needed there.

## Deploying to Vercel

Two separate Vercel projects, both pointed at this same GitHub repo:

### 1. Backend

1. New Project → import this repo.
2. **Root Directory**: leave as the repo root (top level, not `demo-application`) — the backend
   needs to read `examples/*` from the repo root, so the project root has to include it.
3. Framework Preset: **Other**. Vercel will pick up `vercel.json` at the repo root, which points
   the Python build at `demo-application/backend/api/index.py`.
4. Deploy. You'll get a URL like `https://your-backend.vercel.app` — test it by opening
   `https://your-backend.vercel.app/api/health`, which should return `{"status":"ok"}`.

### 2. Frontend

1. New Project → import the same repo again (a second, separate Vercel project).
2. **Root Directory**: `demo-application/frontend`.
3. Framework Preset: **Vite** (auto-detected).
4. Add an environment variable: `VITE_API_BASE_URL` = the backend URL from step 1
   (e.g. `https://your-backend.vercel.app`, no trailing slash).
5. Deploy.

Open the frontend's URL — it should talk to the deployed backend automatically. If you see a
"Failed to reach the backend" message, double check `VITE_API_BASE_URL` was set *before* the
build ran (Vite bakes env vars in at build time, so changing it later needs a redeploy).

## What it deliberately does not do

It only implements the algorithm already spelled out in prose in the root `README.md`'s "Proof
this can drive a rendering application" section — resolve, format, position, driven by real user
input. There's no tax calculation, no persistence (refreshing the page resets to blank), no PDF
export, no auth — none of that was asked for, and adding it would just be scope creep on top of
an already-answered assessment.
