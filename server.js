const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Nastavení statické složky pro HTML
app.use(express.static(path.join(__dirname, 'public')));

let players = {};

io.on('connection', (socket) => {
    console.log('Hráč připojen:', socket.id);

    // Vytvoření hráče s unikatní pozicí
    const isFirst = Object.keys(players).length === 0;
    players[socket.id] = {
        x: isFirst ? 0 : 0,
        z: isFirst ? 20 : -20,
        rotation: 0,
        hp: 100
    };

    // Odeslání stávajících hráčů nováčkovi
    socket.emit('currentPlayers', players);
    // Oznámení ostatním o novém hráči
    socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });

    // Příjem pohybu od hráče a synchronizace
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].z = data.z;
            players[socket.id].rotation = data.rotation;
            socket.broadcast.emit('playerMoved', { id: socket.id, player: players[socket.id] });
        }
    });

    // Příjem informace o výstřelu
    socket.on('shoot', (data) => {
        socket.broadcast.emit('playerShot', { id: socket.id, hitPlayerId: data.hitPlayerId });
    });

    // Odpojení
    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

// Railway automaticky přiděluje port přes process.env.PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server běží na portu ${PORT}`));