const application = require('./application')
    , db = require('../models')
    ;

module.exports = function (app) {
    process.on('message', function (message) {
        switch (message.type) {
            case 'socket:notification':
                io.to(message.data.iduser).emit('notification', message.data);
                break;
            case 'socket:notification:read':
                io.to(message.data.iduser).emit('notification:read');
                break;
        }
    });

    io.on('connection', function (socket) {
        if (!socket.request.session.passport) {
            return socket.disconnect(true);
        }
        const user = socket.request.session.passport.user;
        socket.join(user.id);
        socket.on('disconnect', function () {
        });
    });
}


