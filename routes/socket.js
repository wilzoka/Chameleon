module.exports = function (app) {
    app.io.on('connection', function (socket) {
        console.log(socket.request.isAuthenticated());
        for (var k in socket.request.isAuthenticated())
            console.log(k);
        console.log('a user connectedd');
        socket.on('disconnect', function () {
            console.log('user disconnected');
        });
    });
}