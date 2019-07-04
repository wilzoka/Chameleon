const express = require('express')
    , passport = require('passport')
    , bodyParser = require('body-parser')
    , cookieParser = require('cookie-parser')
    , compression = require('compression')
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
        , name: `connect.sid.${process.env.NODE_PORT}`
    });
//Express Settings
app.disable('x-powered-by');
//Session
sequelizeStore.sync();
app.use(appSession);
//Middlewares
app.use(compression());
app.use(cookieParser());
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ limit: '1mb', extended: true }));
app.use(passport.initialize());
app.use(passport.session());
//Socket
io = require('socket.io')(http).use(function (socket, next) {
    appSession(socket.request, {}, next);
});
//Static Content
app.use('/public', express.static(__dirname + '/public', {
    maxAge: 3600000
}));
//Routes
require('./routes')(app);
//Schedule
require('./routes/schedule');
//Messenger
require('./routes/messenger');
//Server
http.listen(process.env.NODE_PORT, function () {
    console.log('Server UP', 'PID ' + process.pid);
});