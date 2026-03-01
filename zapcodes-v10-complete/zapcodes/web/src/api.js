import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.zapcodes.net';

const api = axios.create({
  baseURL: API_URL,
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
export { API_URL };

// ══════════ Socket.IO (optional real-time) ══════════
import { io } from 'socket.io-client';

let socket = null;

export function connectSocket(userId) {
  if (socket?.connected) return socket;
  try {
    socket = io(API_URL.replace('/api', '').replace('https://', 'wss://').replace('http://', 'ws://'), {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      timeout: 10000,
    });
    socket.on('connect', () => {
      console.log('[Socket] Connected:', socket.id);
      if (userId) socket.emit('join-user-room', userId);
    });
    socket.on('connect_error', (err) => {
      console.warn('[Socket] Connection failed (non-critical):', err.message);
    });
  } catch (err) {
    console.warn('[Socket] Init failed (non-critical):', err.message);
    // Socket is optional — app works fine without it
    socket = { on: () => {}, emit: () => {}, connected: false };
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    try { socket.disconnect(); } catch {}
    socket = null;
  }
}
