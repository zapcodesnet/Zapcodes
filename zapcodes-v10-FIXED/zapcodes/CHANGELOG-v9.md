# ZapCodes v9 — Feature Update Changelog

## Date: 2026-02-27

## Summary
5 new features implemented across web, mobile, and backend with 100% cross-platform sync.

---

## Features Implemented

### 1. AI Selection Dropdown (Ollama vs Claude Opus 4.6)
**Files modified:** `backend/models/User.js`, `backend/routes/user.js`, `backend/services/ai.js`, `backend/routes/files.js`, `web/src/pages/Build.jsx`, `mobile/src/screens/BuildScreen.js`

- Added `preferredAI` field to User model (`ollama` | `claude`)
- New API endpoints: `GET /api/user/ai-preference`, `PUT /api/user/ai-preference`
- Claude requires Starter ($9/mo) or Pro ($29/mo) — free users default to Ollama
- Preference persists across sessions and syncs via Socket.IO across devices
- Web: `<select>` dropdown in FileUploadChat header
- Mobile: Toggle buttons (Ollama/Claude) above the upload area
- ZapCodes AI is restricted to applying fixes only — never analyzes or suggests

### 2. Enlarged Prompt/Text Input
**Files modified:** `web/src/pages/Build.jsx`, `mobile/src/screens/BuildScreen.js`

- Web: Replaced `<input>` with resizable `<textarea>` (80px min, 300px max)
- Line numbers gutter appears when prompt contains newlines
- Auto-detects code-like input and switches to monospace font
- Preview button for long prompts (>50 chars)
- Shift+Enter for newlines, Enter to send
- Mobile: Multi-line `TextInput` with min 60px/max 160px height
- Touch-friendly: no keyboard overlap, expandable field

### 3. Full-File ZIP Generation
**Files modified:** `backend/routes/files.js`, `web/src/pages/Build.jsx`, `mobile/src/screens/BuildScreen.js`

- New API endpoint: `POST /api/files/generate-zip`
- Server-side ZIP creation using `adm-zip` (already a dependency)
- Returns base64-encoded ZIP with proper directory structure
- Web: "📦 Download ZIP" button decodes base64 → Blob → download
- Mobile: "📦 Share All Files" button shares combined content via native Share API
- Falls back to individual file downloads if ZIP generation fails
- Complete files only — never snippets, diffs, or partial code

### 4. Deployment Configuration & Instructions
**Files modified:** `backend/routes/files.js`, `backend/routes/user.js`, `web/src/pages/Build.jsx`, `mobile/src/screens/BuildScreen.js`

- New `DeploymentGuide` component (web) and `MobileDeployGuide` (mobile)
- Step-by-step instructions for Vercel (frontend) and Render (backend)
- Platform selector: Both / Vercel only / Render only
- Numbered steps with beginner-friendly language
- Environment variables checklist (MONGODB_URI, JWT_SECRET, GROQ_API_KEY, ANTHROPIC_API_KEY, etc.)
- Pro tips and warnings (cache clearing, log checking)
- Collapsible/dismissible UI
- `deployPlatform` field added to User model for remembering platform choice
- New endpoint: `PUT /api/user/deploy-platform`

### 5. Image Upload for Issue Reporting
**Files modified:** `backend/routes/files.js`, `backend/services/ai.js`, `web/src/pages/Build.jsx`, `mobile/src/screens/BuildScreen.js`

- New API endpoints: `POST /api/files/upload-images`, `POST /api/files/analyze-with-images`
- Web: 📷 button + drag-and-drop overlay for image uploads
- Accepts PNG, JPG, JPEG, GIF, WebP, BMP (max 10MB per image)
- Image thumbnails with remove (✕) button
- Required: describe the issue (min 10 chars) before sending with images
- Claude engine can analyze images natively via Anthropic multipart API
- Ollama falls back to text-only analysis with image metadata
- Mobile: `expo-image-picker` integration for gallery/camera
- Permissions handling for photo library access
- Same UI flow: preview → describe → send

---

## New API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/user/ai-preference` | Required | Get AI preference + effective engine |
| PUT | `/api/user/ai-preference` | Required | Set preferred AI (ollama/claude) |
| PUT | `/api/user/deploy-platform` | Required | Set deployment platform preference |
| POST | `/api/files/upload-images` | Optional | Upload screenshot(s) for analysis |
| POST | `/api/files/analyze-with-images` | Optional | Analyze code + images together |
| POST | `/api/files/generate-zip` | Optional | Generate ZIP from file array |
| GET | `/api/files/ai-status` | None | Check Groq + Anthropic key status |

---

## New Environment Variable (Required for Claude)

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

Add this to your Render backend environment variables to enable Claude Opus 4.6.

---

## Dependencies

No new npm packages required. All features use existing dependencies:
- `adm-zip` (already installed) — ZIP generation
- `multer` (already installed) — image uploads
- `axios` (already installed) — Anthropic API calls

Mobile may need:
- `expo-image-picker` — for camera/gallery access (install if not present: `npx expo install expo-image-picker`)

---

## Deployment Steps

### After replacing files in your repo:

1. `git add .`
2. `git commit -m "feat: add AI selection, enlarged prompt, ZIP generation, deploy instructions, image upload"`
3. `git push`

### On Render (Backend):
4. Add `ANTHROPIC_API_KEY` to Environment Variables
5. Click "Manual Deploy" → "Deploy latest commit"
6. Wait ~2-3 minutes

### On Vercel (Frontend):
7. Vercel auto-deploys on push (~60 seconds)
8. Clear browser cache and test

### Mobile:
9. `cd mobile && npx expo install expo-image-picker` (if not already installed)
10. `npx expo start` to test locally
