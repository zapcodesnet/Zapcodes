import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { io } from 'socket.io-client';

const API_URL = Constants.expoConfig?.extra?.apiUrl || 'https://repairbot-api.onrender.com';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('repairbot_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      await AsyncStorage.removeItem('repairbot_token');
      await AsyncStorage.removeItem('repairbot_user');
    }
    return Promise.reject(err);
  }
);

export default api;

// Socket.IO
let socket = null;

export function connectSocket(userId) {
  if (!socket) {
    socket = io(API_URL, { transports: ['websocket', 'polling'] });
  }
  if (!socket.connected) {
    socket.connect();
    socket.emit('join-user-room', userId);
  }
  return socket;
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect();
}

export function getSocket() {
  return socket;
}
