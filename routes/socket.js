let application = require('./application')
    , db = require('../models')
    ;

let users = {};
let sockets = {};

module.exports = function (app) {
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


        console.log('users connected ' + JSON.stringify(users));



        // console.log(socket.request.isAuthenticated());
        // for (var k in socket.request.isAuthenticated())
        //     console.log(k);
        // console.log('a user connectedd');
        socket.on('disconnect', function () {
            users[sockets[socket.id]].sockets.splice(users[sockets[socket.id]].sockets.indexOf(socket.id), 1);
            if (users[sockets[socket.id]].sockets.length <= 0) {
                delete users[sockets[socket.id]];
            }
            delete sockets[socket.id];
            console.log('users connected ' + JSON.stringify(users));
        });
    });
}