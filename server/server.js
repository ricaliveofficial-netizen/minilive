// server/index.js
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const zegoToken = require('./zego_token');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } // if frontend hosted separately, add its URL here
});

const PORT = process.env.PORT || 3000;

// Serve client static files
app.use(express.static(path.join(__dirname, '..', 'client')));
app.use(express.json());

// Catch-all for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// Endpoint to generate token
app.get('/token', (req, res) => {
  const { userID = 'user_' + Date.now(), roomID = 'room' } = req.query;
  const tokenInfo = zegoToken.getTokenFor(userID, roomID);
  res.json(tokenInfo);
});

// Socket.io logic
const rooms = {}; // { roomId: { broadcaster: socketId, viewers: Set } }

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('join-room', ({ roomId, role, userName }) => {
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.role = role;
    socket.data.name = userName || 'Guest';

    if (!rooms[roomId]) rooms[roomId] = { broadcaster: null, viewers: new Set() };

    if (role === 'broadcaster') {
      rooms[roomId].broadcaster = socket.id;
      io.to(roomId).emit('room-state', { broadcasterId: socket.id });
    } else {
      rooms[roomId].viewers.add(socket.id);
      const b = rooms[roomId].broadcaster;
      if (b) {
        io.to(b).emit('viewer-joined', { viewerId: socket.id, viewerName: socket.data.name });
      }
    }
  });

  socket.on('offer', ({ to, sdp }) => {
    if (to) io.to(to).emit('offer', { from: socket.id, sdp });
  });

  socket.on('answer', ({ to, sdp }) => {
    if (to) io.to(to).emit('answer', { from: socket.id, sdp });
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    if (to) io.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  socket.on('chat-message', ({ roomId, message }) => {
    const payload = { ts: Date.now(), from: socket.data.name || socket.id, message };
    io.to(roomId).emit('chat-message', payload);
  });

  socket.on('gift', ({ roomId, giftType }) => {
    const g = { from: socket.data.name || socket.id, giftType };
    io.to(roomId).emit('gift', g);
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      if (rooms[roomId].broadcaster === socket.id) {
        rooms[roomId].broadcaster = null;
        io.to(roomId).emit('broadcaster-offline');
      } else {
        rooms[roomId].viewers.delete(socket.id);
      }
    }
    console.log('Socket disconnected:', socket.id);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});