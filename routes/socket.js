const application = require('./application')
    , db = require('../models')
    ;

let users = {}
    , sockets = {};

module.exports = function (app) {
    process.on('message', message => {
        switch (message.type) {
            case 'socket:disconnect':
                if (!users[sockets[message.data.socket]]) {
                    return;
                }
                users[sockets[message.data.socket]].sockets.splice(users[sockets[message.data.socket]].sockets.indexOf(message.data.socket), 1);
                if (users[sockets[message.data.socket]].sockets.length <= 0) {
                    delete users[sockets[message.data.socket]];
                }
                delete sockets[message.data.socket];
                break;
        }
    });

    app.io.on('connection', function (socket) {
        if (!socket.request.session.passport) {
            return socket.disconnect(true);
        }
        let user = socket.request.session.passport.user;
        sockets[socket.id] = user.id;
        if (!(user.id in users)) {
            users[user.id] = {
                sockets: [socket.id]
            }
        } else {
            users[user.id].sockets.push(socket.id);
        }

        socket.on('disconnect', function () {
            process.send({
                pid: process.pid
                , type: 'socket:disconnect'
                , data: {
                    socket: socket.id
                }
            });
        });
    });
}


