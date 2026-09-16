const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Servíruje statické soubory ze složky 'public'
app.use(express.static('public'));

// Načte index.html ze složky 'public' při přístupu na hlavní stránku
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let players = {};

io.on('connection', (socket) => {
    players[socket.id] = {
        x: (Math.random() - 0.5) * 60,
        z: (Math.random() - 0.5) * 60,
        rotation: 0,
        kills: 0,
        isCrouching: false,
        name: 'Hráč'
    };

    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });

    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].z = data.z;
            players[socket.id].rotation = data.rotation;
            players[socket.id].isCrouching = data.isCrouching;
            if (data.name) players[socket.id].name = data.name;
            socket.broadcast.emit('playerMoved', { id: socket.id, player: players[socket.id] });
        }
    });

    socket.on('shoot', (data) => {
        const targetId = data.hitPlayerId;
        if (players[targetId]) {
            io.to(targetId).emit('takeDamage', { damage: data.damage, attackerId: socket.id });
            socket.emit('hitConfirmed');
        }
    });

    socket.on('throwFlashbang', (data) => socket.broadcast.emit('spawnFlashbang', data));
    socket.on('flashbangExploded', (data) => io.emit('flashbangDetonated', data));

    socket.on('respawnRequest', () => {
        if (players[socket.id]) {
            players[socket.id].x = (Math.random() - 0.5) * 60;
            players[socket.id].z = (Math.random() - 0.5) * 60;
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server běží na portu ${PORT}`);
});
