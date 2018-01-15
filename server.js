var express = require('express')
    , passport = require('passport')
    , bodyParser = require('body-parser')
    , cookieParser = require('cookie-parser')
    , session = require('express-session')
    ;

var app = express();
app.disable('x-powered-by');

//Middleware
app.use(cookieParser());
app.use(session({
    resave: true
    , saveUninitialized: true
    , secret: 'makebettersecurity'
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(passport.initialize());
app.use(passport.session());

//Static Content
app.use('/public', express.static(__dirname + '/public', {
    maxAge: 120000
}));
app.use('/files', express.static(__dirname + '/files', {
    maxAge: 3600000
}));

//View Path and Engine
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

//Routes
require('./routes')(app);

//Schedule
require('./routes/schedule');

// catch 404
app.use(function (req, res) {
    res.status(404).render('404');
});

app.listen(8080, function () {
    console.log('Server UP');
});