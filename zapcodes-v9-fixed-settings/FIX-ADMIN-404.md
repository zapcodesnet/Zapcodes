# 🚨 FIX: zapcodes.net/admin 404 Error

## What's Wrong
Vercel doesn't know `/admin` is a React Router page. It looks for an actual file called `admin`, can't find one, and shows its own 404 page.

## The Fix
The file `vercel.json` tells Vercel: "For ANY URL, serve index.html and let React handle routing."

## How to Deploy (3 steps)

### Step 1: Push code to GitHub
```bash
# In your local project folder:
git add .
git commit -m "Fix /admin 404 - add vercel.json SPA rewrites"
git push origin main
```

### Step 2: Vercel auto-deploys
Vercel watches your GitHub repo. After pushing, it will automatically rebuild and deploy. Wait ~60 seconds.

### Step 3: Verify
Go to https://zapcodes.net/admin — you should now see the admin verification screen (not the Vercel 404).

## If Still Broken: Check Vercel Settings
1. Go to https://vercel.com/dashboard
2. Click on your zapcodes project
3. Go to **Settings → General**
4. Check **"Root Directory"**:
   - If it's empty or `/` → the root `vercel.json` is used ✅
   - If it's `web` → the `web/vercel.json` is used ✅ (we've placed one there too)
5. Check **"Framework Preset"** → Should be "Vite"
6. Check **"Build Command"** → Should be `npm run build` (or auto-detected)

## If STILL Broken: Manual Override
In your Vercel project dashboard:
1. Settings → General → **Override** Build & Output settings:
   - Build Command: `cd web && npm install && npm run build`
   - Output Directory: `web/dist`
2. Then go to **Settings → Rewrites**:
   - Add: Source `/(.*)`  →  Destination `/index.html`
3. Click **Redeploy** from the Deployments tab

## Files That Fix This
- `/vercel.json` — Root config with SPA rewrites
- `/web/vercel.json` — Backup config (if Root Directory = web)
- `/web/public/404.html` — Fallback redirect for edge cases
