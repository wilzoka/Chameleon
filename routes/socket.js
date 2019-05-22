module.exports = function (app) {
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