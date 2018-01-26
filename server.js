let express = require('express')
    , passport = require('passport')
    , bodyParser = require('body-parser')
    , cookieParser = require('cookie-parser')
    , session = require('express-session')
    , app = express()
    , http = require('http').Server(app)
    ;

//Express Settings
app.disable('x-powered-by');
//Middlewares
app.use(cookieParser());
app.use(session({
    resave: false
    , saveUninitialized: false
    , secret: 'makebettersecurity'
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(passport.initialize());
app.use(passport.session());
//Socket
app.io = require('socket.io')(http);
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

http.listen(8080, function () {
    console.log('Server UP');
});