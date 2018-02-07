const express = require('express')
    , passport = require('passport')
    , bodyParser = require('body-parser')
    , cookieParser = require('cookie-parser')
    , session = require('express-session')
    , app = express()
    , http = require('http').Server(app)
    , db = require('./models')
    , SequelizeStore = require('connect-session-sequelize')(session.Store)
    , sequelizeStore = new SequelizeStore({
        db: db.sequelize
        , table: 'session'
    })
    , appSession = session({
        store: sequelizeStore
        , resave: false
        , saveUninitialized: false
        , secret: 'makebettersecurity'
    })
    // , cluster = require('cluster')
    ;

// let workers = [];
// if (cluster.isMaster) {
//     let cpus = require('os').cpus();
//     for (let i = 0; i < cpus.length; i++) {
//         workers.push(cluster.fork());
//     }
//     for (let i = 0; i < workers.length; i++) {
//         workers[i].on('message', message => {
//             console.log(message);
//             for (let z = 0; z < workers.length; z++) {
//                 workers[z].send(message);
//             }
//         });
//     }
// } else {
    //Express Settings
    app.disable('x-powered-by');
    //Session
    sequelizeStore.sync();
    app.use(appSession);
    //Middlewares
    app.use(cookieParser());
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(passport.initialize());
    app.use(passport.session());
    //Socket
    app.io = require('socket.io')(http).use(function (socket, next) {
        appSession(socket.request, {}, next);
    });
    //Static Content
    app.use('/public', express.static(__dirname + '/public', {
        maxAge: 120000
    }));
    app.use('/files', express.static(__dirname + '/files', {
        maxAge: 3600000
    }));
    //Routes
    require('./routes')(app);
    //Schedule
    require('./routes/schedule');
    //Server
    http.listen(8080, function () {
        console.log('Server UP', 'PID ' + process.pid);
    });
// }