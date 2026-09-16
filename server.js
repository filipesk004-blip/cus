const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const players = {};

io.on('connection', (socket) => {
    console.log('Hráč připojen:', socket.id);

    players[socket.id] = {
        x: (Math.random() - 0.5) * 20,
        z: (Math.random() - 0.5) * 20,
        rotation: 0
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
        io.emit('playerShot', { shooterId: socket.id, hitPlayerId: data.hitPlayerId, damage: data.damage });
    });

    socket.on('throwFlashbang', (data) => {
        // Předání dat o vrhnutém granátu všem ostatním klientům
        socket.broadcast.emit('spawnFlashbang', data);
    });

    socket.on('flashbangExploded', (data) => {
        io.emit('flashbangDetonated', data);
    });

    socket.on('disconnect', () => {
        console.log('Hráč odpojen:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server běží na portu ${PORT}`);
});
