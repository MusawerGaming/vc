const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log("User connected:", socket.id);

  // FIXED JOIN HANDLER
  socket.on('join-room', ({ room, username }) => {
    socket.join(room);
    socket.data.username = username;

    console.log(`${username} joined ${room}`);

    // Tell others someone joined
    socket.to(room).emit('user-joined', {
      id: socket.id,
      username
    });
  });

  // WebRTC signaling
  socket.on('signal', (data) => {
    io.to(data.target).emit('signal', {
      from: socket.id,
      signal: data.signal
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log("User disconnected:", socket.id);

    // Notify all rooms this user was in
    socket.rooms.forEach((room) => {
      socket.to(room).emit('user-left', socket.id);
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
