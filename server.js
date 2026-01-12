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

  socket.on('join-room', ({ room, username }) => {
    socket.join(room);
    socket.data.username = username;

    console.log(`${username} joined ${room}`);

    // Send existing users to the new user
    const usersInRoom = [];
    const roomSet = io.sockets.adapter.rooms.get(room) || new Set();
    for (const clientId of roomSet) {
      if (clientId !== socket.id) {
        const client = io.sockets.sockets.get(clientId);
        if (client) {
          usersInRoom.push({
            id: clientId,
            username: client.data.username || 'User'
          });
        }
      }
    }
    socket.emit('existing-users', usersInRoom);

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

  // Mute state relay
  socket.on('mute-changed', ({ muted }) => {
    socket.rooms.forEach((room) => {
      if (room === socket.id) return;
      socket.to(room).emit('user-muted', {
        id: socket.id,
        muted
      });
    });
  });

  socket.on('disconnect', () => {
    console.log("User disconnected:", socket.id);

    socket.rooms.forEach((room) => {
      if (room === socket.id) return;
      socket.to(room).emit('user-left', socket.id);
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
