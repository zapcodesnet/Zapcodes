# ZapCodes v14 — Fix Guide

## What Was Fixed (7 Bugs)

### Why Claude Opus 4.6 & Haiku 4.5 Silently Failed

**Bug 1: Groq Fallback Got Wrong `max_tokens`**
When Claude errors out, it falls back to Groq. But the code passed Claude's `max_tokens` (64,000 for Opus / 16,384 for Haiku) to Groq, which only supports 8,192. Groq also rejected the request → zero output, no error shown.
- **Fix**: Groq fallback now always uses `GROQ_MAX_OUTPUT` (8192) instead of passing through Claude's limit.

**Bug 2: SSE Connection Dropped During AI Generation**
Claude Opus takes 2-4 minutes per call. During generation, zero heartbeat messages were sent. Render/Cloudflare proxies kill idle SSE connections after 30-100 seconds → browser silently loses the stream.
- **Fix**: Added 15-second keepalive heartbeats (`: keepalive\n\n`) during generation. Properly cleaned up on all exit paths.

**Bug 3: Opus Thinking Used Deprecated `type: "enabled"`**
Opus 4.6 should use `type: "adaptive"` for thinking. The old `type: "enabled"` with `budget_tokens` is deprecated for Opus 4.6 and will be removed.
- **Fix**: Changed to `thinking: { type: 'adaptive' }` for Opus 4.6.

### Why Deployed Sites Show "Site Can't Be Reached"

**Bug 4: No Wildcard DNS or Subdomain Routing**
The deploy endpoint returns `https://nursetools.zapcodes.net`, but there was no wildcard DNS record and no server listening for subdomain requests. The HTML was stored in MongoDB but nothing served it.
- **Fix**: Created a Cloudflare Worker (`cloudflare-worker/worker.js`) that intercepts `*.zapcodes.net` and proxies to the backend API.

### Other Fixes

**Bug 5**: Frontend timeout increased from 5 → 8 minutes (Opus + verifyAndFix can take 6+ minutes)
**Bug 6**: SSE parser catch blocks now log errors instead of swallowing them silently
**Bug 7**: Mobile timeout increased from 3 → 8 minutes

---

## Cloudflare Worker Setup (REQUIRED for Live Sites)

### Step 1: Add Wildcard DNS Record
1. Go to **Cloudflare Dashboard** → your `zapcodes.net` zone → **DNS**
2. Add a new record:
   - **Type**: `AAAA`
   - **Name**: `*`
   - **Content**: `100::`
   - **Proxy**: ON (orange cloud icon)
3. Click **Save**

### Step 2: Create the Worker
1. Go to **Workers & Pages** → **Create** → **Create Worker**
2. Name it `zapcodes-subdomain-router`
3. Click **Deploy** (creates a blank worker)
4. Click **Edit Code**
5. Paste the ENTIRE contents of `cloudflare-worker/worker.js`
6. Click **Deploy**

### Step 3: Add Environment Variable
1. In the Worker → **Settings** → **Variables and Secrets**
2. Add variable:
   - **Name**: `BACKEND_API_URL`
   - **Value**: `https://api.zapcodes.net` (or your Render backend URL)

### Step 4: Add the Route
1. Go to **your zapcodes.net zone** → **Workers Routes** (under Websites, not Workers & Pages)
2. Add route:
   - **Route**: `*.zapcodes.net/*`
   - **Worker**: `zapcodes-subdomain-router`
3. Add exclusion routes (Worker: None):
   - `api.zapcodes.net/*`
   - `www.zapcodes.net/*`
   - `zapcodes.net/*`

### Step 5: Test
Visit any deployed subdomain like `https://nursetools.zapcodes.net` — it should now load!

---

## Files Changed
- `backend/services/ai.js` — Bugs 1, 3 (Groq fallback + adaptive thinking)
- `backend/routes/build.js` — Bug 2 (SSE keepalive)
- `web/src/pages/Build.jsx` — Bugs 5, 6 (timeout + error handling)
- `mobile/src/api.js` — Bug 7 (mobile timeout)
- `cloudflare-worker/worker.js` — Bug 4 (NEW: subdomain router)
- `cloudflare-worker/wrangler.toml` — Bug 4 (NEW: worker config)
