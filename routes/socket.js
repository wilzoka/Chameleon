const application = require('./application')
    , db = require('../models')
    ;

let users = {}
    , sockets = {};

module.exports = function (app) {
    process.on('message', message => {
        console.log(message);
        switch (message.type) {
            case 'socket:disconnect':
                if (!users[sockets[message.socket]]) {
                    return;
                }
                users[sockets[message.socket]].sockets.splice(users[sockets[message.socket]].sockets.indexOf(message.socket), 1);
                if (users[sockets[message.socket]].sockets.length <= 0) {
                    delete users[sockets[message.socket]];
                }
                delete sockets[message.socket];
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
            // console.log(process);
            // process.send({
            //     pid: process.pid
            //     , type: 'socket:disconnect'
            //     , socket: socket.id
            // });
        });
    });
}


