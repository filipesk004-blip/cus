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
        rotation: 0,
        kills: 0,
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
        const victim = players[data.hitPlayerId];
        if (victim && victim.hp > 0) {
            victim.hp -= data.damage;
            
            // Informujeme střelce o platném zásahu pro Hitmark
            socket.emit('hitConfirmed', { damage: data.damage, hitPlayerId: data.hitPlayerId });
            
            // Informujeme zasaženého hráče
            io.to(data.hitPlayerId).emit('takeDamage', { damage: data.damage, shooterId: socket.id });

            // Zpracování killu
            if (victim.hp <= 0) {
                if (players[socket.id]) {
                    players[socket.id].kills += 1;
                }
                io.emit('scoreUpdate', { players });
            }
        }
    });

    socket.on('respawnRequest', () => {
        if (players[socket.id]) {
            players[socket.id].hp = 100;
            players[socket.id].x = (Math.random() - 0.5) * 20;
            players[socket.id].z = (Math.random() - 0.5) * 20;
            io.emit('scoreUpdate', { players });
        }
    });

    socket.on('throwFlashbang', (data) => {
        socket.broadcast.emit('spawnFlashbang', data);
    });

    socket.on('flashbangExploded', (data) => {
        io.emit('flashbangDetonated', data);
    });

    socket.on('disconnect', () => {
        console.log('Hráč odpojen:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
        io.emit('scoreUpdate', { players });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server běží na portu ${PORT}`);
});
