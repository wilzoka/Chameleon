const application = require('../../../routes/application')
    , db = require(application.functions.rootDir() + 'models')
    , fs = require('fs-extra')
    , nodemailer = require('nodemailer')
    , file = require('./file')
    , moment = require('moment')
    ;

const secondsInterval = 60;

let config, transporter, interval;

const main = {
    f_sendmail: async (obj) => {
        console.log('Deprecation function at', new Error().stack);
        const config = await db.getModel('config').findOne();
        if (!config.emailconf) {
            return console.error('E-mail sent configuration missing');
        }
        const transportConfig = JSON.parse(config.emailconf)
        const transporter = nodemailer.createTransport(transportConfig);
        const mailOptions = {
            from: transportConfig.auth.user
            , to: obj.to && Array.isArray(obj.to) ? obj.to.join(',') : []
            , cc: obj.cc && Array.isArray(obj.cc) ? obj.cc.join(',') : []
            , subject: obj.subject
            , html: obj.html
            , attachments: obj.attachments || []
        };

        if (config.emailsignature) {
            mailOptions.html += '</br></br><img src="cid:unique@signature"/>';
            const signature = JSON.parse(config.emailsignature);
            const path = file.f_getPath(signature[0]);
            if (fs.existsSync(path)) {
                mailOptions.attachments.push({
                    filename: signature[0].filename,
                    path: path,
                    cid: 'unique@signature'
                });
            }
        }
        mailOptions.html = `<div class="system_content">${mailOptions.html}</div>`;
        transporter.sendMail(mailOptions, (err, info) => {
            if (err) {
                return console.error(err);
            }
        });
    }
    , f_send: async (iduser, to, subject, body, cc, files) => {
        try {
            const m = await db.getModel('mail').create({
                datetime: moment()
                , iduser: iduser
                , to: to
                , subject: subject
                , body: body
                , cc: cc || null
                , files: files || null
                , sent: false
            });
        } catch (err) {
            console.error(err, new Error().stack);
        }
    }
    , scheduler: async () => {
        try {
            clearInterval(interval);
            const mails = await db.findAll('mail', { sent: false });
            if (!config || !transporter) {
                config = await db.findOne('config', {});
                if (!config.emailconf) {
                    return console.error('E-mail sent configuration missing');
                }
                transporter = nodemailer.createTransport(JSON.parse(config.emailconf));
            }
            for (const m of mails) {
                const attachments = [];
                if (m.files) {
                    const files = m.files.split(',');
                    for (const f of files) {
                        if (f.toString().includes('.')) {
                            const path = application.functions.tmpDir() + f;
                            if (fs.existsSync(path))
                                attachments.push({
                                    path: path
                                });
                        } else {
                            const ff = await db.findById('file', f, true);
                            const path = file.f_getPath(ff);
                            if (fs.existsSync(path))
                                attachments.push({
                                    filename: ff.filename
                                    , path: path
                                });
                        }
                    }
                }
                const mailOptions = {
                    from: transporter.options.auth.user
                    , to: m.to
                    , cc: m.cc || null
                    , subject: m.subject || 'Sem Assunto'
                    , html: `<div class="system_content">${m.body || ''}</div>`
                    , attachments: attachments
                };
                transporter.sendMail(mailOptions, async function (err, info) {
                    this.sent = err ? false : true;
                    this.log = err ? JSON.stringify(err) + ' ' + JSON.stringify(info) : null;
                    await this.save();
                }.bind(m));
            }
            interval = setInterval(main.scheduler, secondsInterval * 1000);
        } catch (err) {
            console.log(err, new Error().stack);
        }
    }
}

interval = setInterval(main.scheduler, secondsInterval * 1000);

module.exports = main;