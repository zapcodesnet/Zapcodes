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

const app = express();
const httpServer = createServer(app);

// Socket.IO for real-time sync between web & mobile
const io = new Server(httpServer, {
  cors: {
    origin: [
      process.env.WEB_URL || 'http://localhost:5173',
      'http://localhost:3000',
      'http://localhost:19006',
      /\.vercel\.app$/,
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('combined'));
app.use(cors({
  origin: [
    process.env.WEB_URL || 'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:19006',
    /\.vercel\.app$/,
  ],
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
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
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    if (process.env.MONGODB_URI) {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log('Connected to MongoDB Atlas');
    } else {
      console.warn('No MONGODB_URI set — running without database');
    }

    httpServer.listen(PORT, () => {
      console.log(`RepairBot API running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();

module.exports = app;
