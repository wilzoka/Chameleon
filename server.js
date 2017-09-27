var express = require('express')
    , passport = require('passport')
    , bodyParser = require('body-parser')
    , cookieParser = require('cookie-parser')
    , session = require('express-session')
    ;

var app = express();

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
app.use('/public', express.static(__dirname + '/public'));
app.use('/uploads', express.static(__dirname + '/uploads'));

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


// var MailListener = require("mail-listener2");

// var mailListener = new MailListener({
//     username: "williamb@plastrela.com.br",
//     password: "wb1015$$",
//     host: "imap.plastrela.com.br",
//     port: 993,
//     tls: true,
//     // debug: console.log, // Or your custom function with only one incoming argument. Default: null 
//     tlsOptions: { rejectUnauthorized: false },
//     mailbox: "INBOX", // mailbox to monitor 
//     // searchFilter: ["UNSEEN", "FLAGGED"], // the search filter being used after an IDLE notification has been retrieved 
//     markSeen: true, // all fetched email willbe marked as seen and not fetched next time 
//     fetchUnreadOnStart: true, // use it only if you want to get all unread email on lib start. Default is `false`, 
//     mailParserOptions: { streamAttachments: true }, // options to be passed to mailParser lib. 
//     attachments: false, // download attachments as they are encountered to the project directory 
//     attachmentOptions: { directory: "attachments/" } // specify a download directory for attachments 
// });

// mailListener.start(); // start listening 

// // stop listening 
// //mailListener.stop(); 

// mailListener.on("server:connected", function () {
//     console.log("imapConnected");
// });

// mailListener.on("server:disconnected", function () {
//     console.log("imapDisconnected");
// });

// mailListener.on("error", function (err) {
//     console.log(err);
// });

// mailListener.on("mail", function (mail, seqno, attributes) {
//     // do something with mail object including attachments 
//     for (var k in mail) {
//         // console.log(k);
//     }
//     console.log("emailParsed", mail.attachments);
//     // mail processing code goes here 
// });

// mailListener.on("attachment", function (attachment) {
//     console.log(attachment.path);
// });