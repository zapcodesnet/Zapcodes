require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const { createServer } = require('http');
const { Server } = require('socket.io');
const passport = require('passport');

const authRoutes = require('./routes/auth');
const scanRoutes = require('./routes/scan');
const fixRoutes = require('./routes/fix');
const tutorialRoutes = require('./routes/tutorial');
const stripeRoutes = require('./routes/stripe');
const userRoutes = require('./routes/user');
const fileRoutes = require('./routes/files');
const buildRoutes = require('./routes/build');
const adminRoutes = require('./routes/admin');
const coinRoutes = require('./routes/coins');
const helpRoutes = require('./routes/help');
const formsRoutes = require('./routes/forms');

// Zapcodes v15 routes
const blCoinsRoutes = require('./routes/blCoins');
const pricingRoutes = require('./routes/pricing');
const usageRoutes = require('./routes/usage');

// ── NEW: Guest builder + internal cross-platform API ──────────────────────
const guestRoutes = require('./routes/guest');
const internalRoutes = require('./routes/internal');

const app = express();
app.set('trust proxy', 1);
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'], credentials: true },
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('combined'));
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (
      origin.includes('vercel.app') || origin.includes('onrender.com') ||
      origin.includes('localhost') || origin.includes('zapcodes.net') ||
      origin.includes('zapcodes') || origin.includes('blendlink.net') ||
      origin.includes('blendlink') || origin === process.env.WEB_URL
    ) return callback(null, true);
    callback(null, true);
  },
  credentials: true,
}));

app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, message: { error: 'Too many requests, please try again later.' } });
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  handler: async (req, res) => {
    try { const SecurityFlag = require('./models/SecurityFlag'); await SecurityFlag.create({ type: 'brute_force', severity: 'high', description: `Rate limit exceeded on auth route from IP ${req.ip}`, ip: req.ip, userAgent: req.headers['user-agent'] }); } catch (e) {}
    res.status(429).json({ error: 'Too many login attempts. Please try again in 15 minutes.' });
  },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

const adminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, message: { error: 'Admin rate limit exceeded.' } });
app.use('/api/admin', adminLimiter);

app.use(passport.initialize());
require('./middleware/passport')(passport);
app.set('io', io);

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/fix', fixRoutes);
app.use('/api/tutorial', tutorialRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/user', userRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/build', buildRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/coins', coinRoutes);
app.use('/api/help', helpRoutes);
app.use('/api/forms', formsRoutes);
app.use('/api/bl-coins', blCoinsRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/usage', usageRoutes);

// ── NEW routes ────────────────────────────────────────────────────────────
app.use('/api/guest', guestRoutes);
app.use('/api/internal', internalRoutes);

// ── AI Widget — embeddable AI for user deployed sites ─────────────────────
const widgetRoutes = require('./routes/widget');
app.use('/api/widget', widgetRoutes);
// Serve zap-ai.js as a static file so user sites can load it
app.use('/widget', require('express').static(require('path').join(__dirname, '../public/widget')));

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '15.0.0' }));
app.get('/api/auth/providers', (req, res) => res.json({ github: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET), google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) }));
app.get('/', (req, res) => res.json({ name: 'ZapCodes API', version: '15.0.0', status: 'running' }));

// ── Socket.IO ─────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('join-user-room', (userId) => {
    socket.join(`user-${userId}`);
    console.log(`Socket ${socket.id} joined room user-${userId}`);
  });

  // ── NEW: Guest fingerprint room for pre-login sync ─────────────────────
  socket.on('join-guest-room', (fingerprintHash) => {
    if (fingerprintHash) {
      socket.join(`guest-${fingerprintHash}`);
      console.log(`Socket ${socket.id} joined guest room guest-${fingerprintHash}`);
    }
  });

  socket.on('disconnect', () => console.log(`Client disconnected: ${socket.id}`));
});

// ── MongoDB + server start ────────────────────────────────────────────────
const PORT = process.env.PORT || 10000;

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('ZapCodes API running on port ' + PORT);
});

const connectDB = async () => {
  if (!process.env.MONGODB_URI) { console.warn('No MONGODB_URI — running without database'); return; }
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000 });
    console.log('Connected to MongoDB Atlas (shared BlendLink cluster)');

    // ── Bootstrap super admin ──────────────────────────────────────────────
    try {
      const User = require('./models/User');
      const admin = await User.findOne({ email: 'zapcodesnet@gmail.com' });
      if (admin) {
        admin.role = 'super-admin'; admin.subscription_tier = 'diamond';
        admin.bl_coins = 999999999999; admin.signup_bonus_claimed = true;
        admin.is_admin = true;
        if (!admin.referral_code) admin.referral_code = 'zapcodes';
        await admin.save();
        console.log('[BOOTSTRAP] Super admin configured: diamond + infinite BL');
      }
    } catch (e) { console.error('[BOOTSTRAP] Admin setup failed:', e.message); }

    try {
      const { ensureSuperAdmin } = require('./middleware/admin');
      await ensureSuperAdmin();
    } catch (e) { console.error('[BOOTSTRAP] ensureSuperAdmin failed:', e.message); }

    // ── NEW: Start nightly guest cleanup cron (runs at 2AM UTC) ───────────
    try {
      const { startGuestCleanupCron } = require('./jobs/cleanupGuest');
      startGuestCleanupCron();
    } catch (e) { console.error('[BOOTSTRAP] Guest cleanup cron failed to start:', e.message); }

  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    console.log('Retrying in 10s...');
    setTimeout(connectDB, 10000);
  }
};

connectDB();

module.exports = app;
