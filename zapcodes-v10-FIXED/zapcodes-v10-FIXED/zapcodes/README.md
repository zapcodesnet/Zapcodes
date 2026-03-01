# ZapCodes — AI-Powered Code Repair Platform

Full-stack application that scans GitHub repos for bugs and auto-creates fix PRs using AI.

## Architecture

```
zapcodes/
├── backend/          # Node.js/Express API + Socket.IO
├── web/              # React + Vite (dark cyber-terminal UI)
├── mobile/           # React Native + Expo
└── vercel.json       # Web deployment config
```

## Quick Start

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env   # Fill in your keys
npm run dev             # Starts on :5001
```

**Required env vars:** `MONGODB_URI`, `JWT_SECRET`
**Optional:** `GROQ_API_KEY`, `GITHUB_CLIENT_ID/SECRET`, `STRIPE_SECRET_KEY`, etc.

### 2. Web Frontend

```bash
cd web
npm install
# Create .env with: VITE_API_URL=http://localhost:5001/api
npm run dev             # Starts on :5173
```

### 3. Mobile App

```bash
cd mobile
npm install
npx expo start          # Scan QR with Expo Go
```

Update `app.json` → `extra.apiUrl` to your backend URL.

## Features

| Feature | Description |
|---------|-------------|
| **AI Scan** | Analyzes GitHub repos via Groq API (llama-3.1) for bugs, security issues, performance problems |
| **Auto-Fix** | Creates GitHub PRs with fixes via Moltbot agent |
| **Real-Time Sync** | Socket.IO keeps web + mobile in sync |
| **Payments** | Stripe subscriptions (Free / $9 Starter / $29 Pro) |
| **OAuth** | GitHub + Google authentication |
| **AI Tutorials** | Context-aware help chat powered by AI |

## Deployment

- **Web → Vercel:** `vercel --prod` (uses included vercel.json)
- **Backend → Render:** Connect repo, set env vars, deploy
- **Mobile → App Stores:** `eas build --platform all` then `eas submit`

## Tech Stack

**Backend:** Express, MongoDB/Mongoose, Passport.js, Socket.IO, Stripe, Groq AI
**Web:** React 18, Vite, React Router, CSS custom properties
**Mobile:** React Native, Expo SDK 50, React Navigation, AsyncStorage

## Design

Dark cyber-terminal aesthetic with accent color `#00e5a0`. Monospace code blocks, severity-colored badges, glassmorphism cards.
  
