import { io } from 'socket.io-client';
import { emit } from './bus';
import { API_BASE } from '../lib/api';

let socket;

export function connectSocket(token) {
  try {
    if (socket) {
      try { socket.disconnect(); } catch (_) {}
      socket = null;
    }
    socket = io(API_BASE, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000
    });
    socket.on('connect', () => emit('socket:status', { status: 'connected' }));
    socket.on('disconnect', () => emit('socket:status', { status: 'disconnected' }));
    socket.io.on('reconnect_attempt', (n) => emit('socket:status', { status: 'reconnecting', attempt: n }));
    socket.io.on('reconnect_error', () => emit('socket:status', { status: 'reconnecting' }));
    socket.io.on('reconnect_failed', () => emit('socket:status', { status: 'offline' }));
    socket.on('groups:refresh', (payload) => {
      emit('groups:refresh', payload);
    });
    socket.on('groups:added', (payload) => {
      emit('groups:added', payload);
    });
    socket.on('expenses:refresh', (payload) => {
      emit('expenses:refresh', payload);
    });
  } catch (_) {}
}

export function disconnectSocket() {
  try { if (socket) socket.disconnect(); } catch (_) {}
  socket = null;
}
