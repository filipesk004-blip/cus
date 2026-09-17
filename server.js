const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static('public'));

let players = {};
let hunterId = null;

const PROP_TYPES = ['box', 'barrel', 'rock', 'pumpkin', 'haybale'];

io.on('connection', (socket) => {
    console.log('Hráč připojen:', socket.id);

    if (!hunterId) {
        hunterId = socket.id;
    }

    const isHunter = (socket.id === hunterId);
    players[socket.id] = {
        id: socket.id,
        x: (Math.random() - 0.5) * 30,
        y: 1.6,
        z: (Math.random() - 0.5) * 30,
        rotation: 0,
        role: isHunter ? 'hunter' : 'witch',
        propType: isHunter ? 'human' : 'barrel',
        hp: isHunter ? 100 : 3
    };

    socket.emit('initGame', { id: socket.id, players: players, propTypes: PROP_TYPES });
    socket.broadcast.emit('newPlayer', players[socket.id]);

    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            players[socket.id].rotation = data.rotation;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('changeProp', (newProp) => {
        if (players[socket.id] && players[socket.id].role === 'witch') {
            players[socket.id].propType = newProp;
            io.emit('propChanged', { id: socket.id, propType: newProp });
        }
    });

    socket.on('shoot', (data) => {
        socket.broadcast.emit('hunterShot', data);
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        if (hunterId === socket.id) {
            hunterId = Object.keys(players)[0] || null;
            if (hunterId && players[hunterId]) {
                players[hunterId].role = 'hunter';
                players[hunterId].propType = 'human';
            }
        }
        io.emit('playerDisconnected', socket.id);
    });
});

http.listen(3000, () => console.log('Server běží na http://localhost:3000'));
