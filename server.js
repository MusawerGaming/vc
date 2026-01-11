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
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    socket.to(roomId).emit('user-joined', socket.id);

    socket.on('signal', (data) => {
      io.to(data.target).emit('signal', {
        from: socket.id,
        signal: data.signal
      });
    });

    socket.on('disconnect', () => {
      socket.to(roomId).emit('user-left', socket.id);
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
