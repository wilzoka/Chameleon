// const
//     db = require('../models')
//     ;

module.exports = function (app) {
    io.on('connection', function (socket) {
        if (!socket.request.session.passport || !socket.request.session.passport.user) {
            return socket.disconnect(true);
        }
        const user = socket.request.session.passport.user;
        // socket.on('view:register', function (viewurl) {
        //     db.getModel('view').findOne({
        //         raw: true
        //         , where: { url: viewurl }
        //         , include: [{ all: true }]
        //     }).then(view => {
        //         socket.join('M' + view['model.name']);
        //     });
        // });
        console.log(user.fullname, socket.request.headers.host, socket.request.headers['x-real-ip'], socket.request.ip);
        socket.join(user.id);
        socket.on('disconnect', function () {
        });
    });
}