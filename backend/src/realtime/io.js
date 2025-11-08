import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io = null;

export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*'},
  });

  io.on('connection', (socket) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');
      if (!token) {
        socket.disconnect(true);
        return;
      }
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret_change_me');
      const room = `user:${payload.sub}`;
      socket.join(room);
      socket.data.userId = payload.sub;
    } catch (e) {
      socket.disconnect(true);
    }
  });
}

export function emitToUser(userId, event, payload) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

