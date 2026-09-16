const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

let players = {};

io.on('connection', (socket) => {
    console.log('Hráč připojen:', socket.id);

    // První hráč se objeví na jedné straně, druhý na druhé
    const isFirst = Object.keys(players).length === 0;
    players[socket.id] = {
        x: 0,
        z: isFirst ? 20 : -20,
        rotation: isFirst ? 0 : Math.PI,
        hp: 100
    };

    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });

    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].z = data.z;
            players[socket.id].rotation = data.rotation;
            socket.broadcast.emit('playerMoved', { id: socket.id, player: players[socket.id] });
        }
    });

    socket.on('shoot', (data) => {
        socket.broadcast.emit('playerShot', { id: socket.id, hitPlayerId: data.hitPlayerId });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server běží na portu ${PORT}`));
