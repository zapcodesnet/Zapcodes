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
const buildRoutes = require('./routes/build');
const adminRoutes = require('./routes/admin');

const app = express();
const httpServer = createServer(app);

// Socket.IO for real-time sync between web & mobile
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('combined'));
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow all vercel.app, onrender.com, and localhost origins
    if (
      origin.includes('vercel.app') ||
      origin.includes('onrender.com') ||
      origin.includes('localhost') ||
      origin.includes('zapcodes') ||
      origin === process.env.WEB_URL
    ) {
      return callback(null, true);
    }
    callback(null, true); // Allow all for now during setup
  },
  credentials: true,
}));

// Stripe webhook needs raw body
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// Stricter rate limit for auth (anti-brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  handler: async (req, res) => {
    // Log brute force attempt
    try {
      const SecurityFlag = require('./models/SecurityFlag');
      await SecurityFlag.create({
        type: 'brute_force',
        severity: 'high',
        description: `Rate limit exceeded on auth route from IP ${req.ip} — possible credential stuffing`,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
    } catch (e) {}
    res.status(429).json({ error: 'Too many login attempts. Please try again in 15 minutes.' });
  },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Very strict rate limit for admin
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Admin rate limit exceeded.' },
});
app.use('/api/admin', adminLimiter);

// Passport
app.use(passport.initialize());
require('./middleware/passport')(passport);

// Make io accessible to routes
app.set('io', io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/fix', fixRoutes);
app.use('/api/tutorial', tutorialRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/user', userRoutes);
app.use('/api/build', buildRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// OAuth config endpoint — tells frontend which providers are available
app.get('/api/auth/providers', (req, res) => {
  res.json({
    github: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'ZapCodes API',
    version: '1.0.0',
    status: 'running',
    docs: '/api/health',
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('join-user-room', (userId) => {
    socket.join(`user-${userId}`);
    console.log(`Socket ${socket.id} joined room user-${userId}`);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// MongoDB connection & server start
const PORT = process.env.PORT || 10000;

const startServer = async () => {
  try {
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('Connected to MongoDB Atlas');
      // Ensure super admin exists
      const { ensureSuperAdmin } = require('./middleware/admin');
      await ensureSuperAdmin();
    } else {
      console.warn('No MONGODB_URI set — running without database');
    }

    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`ZapCodes API running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
  }
};

startServer();

module.exports = app;
