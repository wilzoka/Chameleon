const application = require('./application')
    , db = require('../models')
    , MailListener = require('mail-listener2-updated')
    , lodash = require('lodash')
    ;

// SMTP Config Example
// {	
//     "host": "smtp.plastrela.com.br"
//     , "port": 587
//     , "tls": { "rejectUnauthorized": false }
//     , "auth": {
//         "user": "sip@plastrela.com.br"
//         , "pass": "sip#$2016Pls!@"
//     }
// }

// Messenger Config Example
// {
//     "username": "williamb@plastrela.com.br",
//     "password": "wb1015$$",
//     "host": "imap.plastrela.com.br",
//     "port": 993,
//     "tls": true,
//     "tlsOptions": { "rejectUnauthorized": false }          
// }

let messengers = {};

const activeMessenger = async function (mes) {
    try {
        switch (mes.type) {
            case 'E-Mail':
                messengers[mes.id] = new MailListener(lodash.extend({
                    mailbox: "INBOX",
                    // debug: console.log,
                    searchFilter: ["UNSEEN"],
                    markSeen: true,
                    fetchUnreadOnStart: true,
                    mailParserOptions: { streamAttachments: false },
                    attachments: false,
                    attachmentOptions: { directory: "files/" }
                }, JSON.parse(mes.conf)));
                messengers[mes.id].start();
                messengers[mes.id].on("server:connected", function () {
                    console.log(`Messenger ${mes.description} Connected`);
                });
                messengers[mes.id].on("server:disconnected", function () {
                    if (this._desactive) {
                        console.log(`Messenger ${mes.description} Disconnected`);
                    } else {// Reconnect
                        console.log(`Reconnecting ${mes.description}`);
                        setTimeout(() => {
                            this.restart();
                        }, 60000);
                    }
                });
                messengers[mes.id].on("error", function (err) {
                    console.error(`Messenger ${mes.description} Error: ${err}`);
                });
                messengers[mes.id].on("mail", async function (mail, seqno, attributes) {
                    let config = (await db.sequelize.query("SELECT * FROM config", { type: db.sequelize.QueryTypes.SELECT }))[0];
                    let custom = require(__dirname + '/../custom/' + config.customfile);
                    let realfunction = application.functions.getRealReference(custom, mes.ongathering);
                    if (!realfunction) {
                        return console.error('Function not found');
                    }
                    mail._messenger = mes;
                    realfunction(mail);
                });
                break;
        }
    } catch (err) {
        console.error(err);
    }
}

const desactiveMessenger = function (mes) {
    if (messengers[mes.id]) {
        messengers[mes.id]._desactive = true;
        messengers[mes.id].stop();
        delete messengers[mes.id];
    }
}

db.sequelize.query("SELECT * FROM messenger where active", { type: db.sequelize.QueryTypes.SELECT }).then(messengers => {
    messengers.map(mes => {
        activeMessenger(mes);
    });
});

module.exports = {
    activeMessenger: activeMessenger
    , desactiveMessenger: desactiveMessenger
}