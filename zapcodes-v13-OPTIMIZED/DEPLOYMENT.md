# ZapCodes — Deployment Guide, Security Checklist & API Docs

## 📁 Project Structure (Git Repo Layout)

```
zapcodes/
├── backend/                    # Node.js + Express API
│   ├── middleware/
│   │   ├── admin.js           # Admin auth, RBAC, 2FA enforcement
│   │   ├── auth.js            # JWT auth, banned/suspended checks
│   │   └── passport.js        # OAuth strategies (Google, GitHub)
│   ├── models/
│   │   ├── User.js            # User model with roles, permissions, 2FA
│   │   ├── Repo.js            # Scanned repo model
│   │   ├── AdminLog.js        # Immutable audit trail
│   │   └── SecurityFlag.js    # Security threat flags
│   ├── routes/
│   │   ├── admin.js           # Admin panel API (users, security, AI, logs)
│   │   ├── auth.js            # Login, register, OAuth callbacks
│   │   ├── build.js           # AI project builder
│   │   ├── scan.js            # Code scanning
│   │   ├── fix.js             # ZapCodes AI PR fixes
│   │   ├── stripe.js          # Payment processing
│   │   ├── tutorial.js        # Help chat
│   │   └── user.js            # User profile
│   ├── services/
│   │   ├── ai.js              # AI scanning engine (Groq API)
│   │   ├── github.js          # GitHub API integration
│   │   └── security.js        # Automated threat detection
│   ├── server.js              # Express server, Socket.IO, middleware
│   ├── package.json
│   └── .env                   # Environment variables (DO NOT COMMIT)
├── web/                        # React + Vite frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Landing.jsx    # Public homepage (Build + Repair)
│   │   │   ├── Build.jsx      # AI website/app builder wizard
│   │   │   ├── Dashboard.jsx  # Code repair dashboard
│   │   │   ├── Admin.jsx      # Hidden admin panel (/admin)
│   │   │   ├── Pricing.jsx    # Subscription plans
│   │   │   ├── Login.jsx      # Login with OAuth
│   │   │   ├── Register.jsx   # Registration
│   │   │   ├── Privacy.jsx    # Privacy policy
│   │   │   └── Terms.jsx      # Terms of service
│   │   ├── components/
│   │   │   ├── Sidebar.jsx    # Dashboard navigation
│   │   │   └── TutorialChat.jsx # Help chatbot
│   │   ├── context/
│   │   │   └── AuthContext.jsx # Auth state + force-logout listener
│   │   ├── api.js             # Axios API client
│   │   └── App.jsx            # Router
│   └── package.json
├── mobile/                     # React Native + Expo app
│   ├── src/
│   │   ├── screens/
│   │   │   ├── DashboardScreen.js  # Repair tab
│   │   │   ├── BuildScreen.js      # Build tab
│   │   │   ├── TutorialScreen.js   # Help tab
│   │   │   ├── ProfileScreen.js    # Profile/settings
│   │   │   ├── LoginScreen.js      # Login
│   │   │   └── RegisterScreen.js   # Register
│   │   ├── context/AuthContext.js
│   │   └── api.js
│   ├── App.js                 # Navigation (4 tabs)
│   └── package.json
└── DEPLOYMENT.md              # This file
```

---

## 🚀 Deployment Guide

### Backend → Render (Free tier → $7/mo for always-on)

1. **Go to** https://render.com → Sign up with GitHub
2. **New → Web Service** → Connect your `zapcodes` repo
3. **Settings:**
   - Root Directory: `backend`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: Node
4. **Environment Variables** (Settings → Environment):

| Variable | Value | Required |
|---|---|---|
| `MONGODB_URI` | `mongodb+srv://...` (from MongoDB Atlas) | ✅ |
| `JWT_SECRET` | Random 64-char string | ✅ |
| `BACKEND_URL` | `https://your-app.onrender.com` | ✅ |
| `WEB_URL` | `https://zapcodes.net` or Vercel URL | ✅ |
| `GROQ_API_KEY` | From https://console.groq.com | For AI scans |
| `STRIPE_SECRET_KEY` | `sk_live_...` or `sk_test_...` | For payments |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_...` or `pk_test_...` | For payments |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | For payments |
| `STRIPE_STARTER_PRICE_ID` | `price_...` | For payments |
| `STRIPE_PRO_PRICE_ID` | `price_...` | For payments |
| `GITHUB_CLIENT_ID` | From GitHub OAuth app | For GitHub login |
| `GITHUB_CLIENT_SECRET` | From GitHub OAuth app | For GitHub login |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console | For Google login |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console | For Google login |

### Frontend → Vercel (Free)

1. **Go to** https://vercel.com → Sign up with GitHub
2. **Add New Project** → Select `zapcodes` repo
3. **Settings:**
   - Root Directory: `web`
   - Framework: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. **Environment Variables:**

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://your-app.onrender.com/api` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_live_...` or `pk_test_...` |

5. **Custom Domain:** Vercel → Settings → Domains → Add `zapcodes.net`

### Database → MongoDB Atlas (Free, 500MB)

1. https://cloud.mongodb.com → Create free cluster
2. Create database user (strong password)
3. Network Access → Allow `0.0.0.0/0` (for Render)
4. Copy connection string → Add to Render env as `MONGODB_URI`

### Mobile App → Expo (Free)

1. Install: `npm install -g eas-cli`
2. Login: `eas login`
3. In `mobile/` directory: `eas build --platform all`
4. Submit to stores: `eas submit --platform ios` / `eas submit --platform android`

---

## 🔐 Security Checklist

### Authentication & Authorization
- [x] JWT tokens with expiry (7 days)
- [x] Password hashing with bcrypt (12 rounds)
- [x] Banned/suspended users blocked on every authenticated request
- [x] Account status checked at login (banned, suspended with auto-expire)
- [x] Login metadata tracking (IP, device, timestamp, count)
- [x] Force logout via Socket.IO (real-time across web + mobile)

### Admin Panel Security
- [x] Hidden at `/admin` — no visible links anywhere
- [x] Returns HTTP 404 (not 403) for unauthorized access — hides existence
- [x] Role-based access control (RBAC) with granular permissions
- [x] Super admin locked to `zapcodesnet@gmail.com` — cannot be demoted
- [x] Google Authenticator 2FA required for AI commands
- [x] 2FA sessions expire after 5 minutes of inactivity
- [x] Fresh 2FA code required after session expiry

### API Security
- [x] Helmet.js for security headers (CSP, HSTS, etc.)
- [x] CORS with origin validation
- [x] Rate limiting (100 req/15min general, 20 req/15min auth, 60 req/15min admin)
- [x] Brute-force detection → auto-creates security flags
- [x] Stripe webhook signature verification
- [x] Input validation on all routes
- [x] Express.json body size limit (10MB)

### Data Security
- [x] Passwords never returned in API responses (select: false)
- [x] 2FA secrets never returned in API responses (select: false)
- [x] GitHub tokens never returned in API responses (select: false)
- [x] Immutable audit logs (AdminLog model — no update/delete operations)
- [x] Cascade delete on permanent user deletion

### Monitoring
- [x] Failed login tracking per IP with threshold alerts
- [x] Security flags with severity levels (low/medium/high/critical)
- [x] Full audit trail: who, when, what, before/after state
- [x] Real-time Socket.IO for admin-to-user actions

### Recommended (Post-Launch)
- [ ] Enable HTTPS redirect (Render/Vercel do this automatically)
- [ ] Set `JWT_SECRET` to a cryptographically random 64+ char string
- [ ] Enable MongoDB Atlas IP allowlist (restrict to Render IPs)
- [ ] Set up Stripe webhook endpoint for live payments
- [ ] Configure Google Cloud Console for OAuth
- [ ] Enable email alerts for critical security flags
- [ ] Set up automated MongoDB backups (Atlas does this on paid tier)
- [ ] Add CSP nonces for inline scripts
- [ ] Regular dependency audits: `npm audit`

---

## 📡 API Documentation

### Authentication

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | None | Register new user |
| POST | `/api/auth/login` | None | Login (returns JWT) |
| GET | `/api/auth/me` | JWT | Get current user |
| GET | `/api/auth/providers` | None | Available OAuth providers |

### Build (AI Website Builder)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/build/templates` | None | List all templates |
| POST | `/api/build/generate` | Optional | Generate a project |
| GET | `/api/build/deploy-guide/:template` | None | Deployment instructions |

### Scan & Fix (Code Repair)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/scan` | JWT | Scan a GitHub repo |
| POST | `/api/fix` | JWT | Apply ZapCodes AI fix |

### Payments

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/stripe/create-checkout` | JWT | Create Stripe checkout session |
| POST | `/api/stripe/portal` | JWT | Billing portal |
| POST | `/api/stripe/webhook` | Stripe sig | Webhook handler |

### Admin Panel (Hidden — requires admin role)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/me` | Admin JWT | Admin profile + 2FA status |
| GET | `/api/admin/dashboard` | Admin JWT | Dashboard stats |
| POST | `/api/admin/2fa/setup` | Admin JWT | Generate 2FA secret/QR |
| POST | `/api/admin/2fa/verify` | Admin JWT | Verify 2FA code → get session token |
| GET | `/api/admin/users` | Admin JWT + permission | List/search users |
| GET | `/api/admin/users/:id` | Admin JWT + permission | User detail + logs |
| POST | `/api/admin/users/:id/ban` | Admin JWT + permission | Ban user |
| POST | `/api/admin/users/:id/suspend` | Admin JWT + permission | Suspend user (N days) |
| POST | `/api/admin/users/:id/unban` | Admin JWT + permission | Unban/unsuspend |
| DELETE | `/api/admin/users/:id` | Admin JWT + deleteUsers | Permanently delete user |
| POST | `/api/admin/users/:id/force-logout` | Admin JWT + permission | Force logout via Socket.IO |
| POST | `/api/admin/users/:id/role` | Admin JWT + manageRoles | Change role & permissions |
| POST | `/api/admin/users/:id/subscription` | Admin JWT + adjustPricing | Override plan/price |
| GET | `/api/admin/security` | Admin JWT + permission | Security flags |
| POST | `/api/admin/security/:id/acknowledge` | Admin JWT + permission | Acknowledge flag |
| GET | `/api/admin/logs` | Admin JWT + permission | Audit logs |
| GET | `/api/admin/analytics` | Admin JWT + permission | Analytics data |
| POST | `/api/admin/ai/command` | Admin JWT + 2FA token | AI/ZapCodes AI command |

### Permission Matrix

| Permission | Super Admin | Co-Admin | Moderator | User |
|---|---|---|---|---|
| viewAnalytics | ✅ | Configurable | Configurable | ❌ |
| moderateUsers | ✅ | Configurable | Configurable | ❌ |
| viewFinancials | ✅ | Configurable | ❌ | ❌ |
| adjustPricing | ✅ | Configurable | ❌ | ❌ |
| viewSecurityLogs | ✅ | Configurable | Configurable | ❌ |
| manageAI | ✅ | Configurable | ❌ | ❌ |
| manageRoles | ✅ | Configurable | ❌ | ❌ |
| deleteUsers | ✅ | Configurable | ❌ | ❌ |
| globalSettings | ✅ | ❌ | ❌ | ❌ |

---

## 🗃️ Database Schema

### Users Collection
```
{
  email, password (hashed), name, avatar, provider, providerId, githubToken,
  role: 'user'|'moderator'|'co-admin'|'super-admin',
  permissions: { viewAnalytics, moderateUsers, viewFinancials, adjustPricing,
                 viewSecurityLogs, manageAI, manageRoles, deleteUsers, globalSettings },
  twoFactorSecret, twoFactorEnabled,
  plan, customPrice, stripeCustomerId, stripeSubscriptionId,
  scansUsed, scansLimit, buildsUsed, buildsLimit, fixesApplied,
  status: 'active'|'suspended'|'banned', suspendedUntil, suspendReason, banReason,
  lastLoginAt, lastLoginIP, lastLoginDevice, loginCount,
  repos[], createdAt, updatedAt
}
```

### AdminLog Collection (Immutable)
```
{
  actor, actorEmail, actorRole, action, targetUser, targetEmail,
  description, beforeState, afterState, metadata,
  ip, userAgent, severity, timestamp
}
```

### SecurityFlag Collection
```
{
  type, severity, description, ip, geoLocation{country, city, region},
  userAgent, affectedUser, affectedEmail,
  status: 'new'|'acknowledged'|'resolved'|'false_positive',
  acknowledgedBy, acknowledgedAt, resolution, aiAnalysis, autoAction,
  metadata, timestamp
}
```
