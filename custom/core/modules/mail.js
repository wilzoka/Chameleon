const application = require('../../../routes/application')
    , db = require(application.functions.rootDir() + 'models')
    , fs = require('fs-extra')
    , nodemailer = require('nodemailer');
    ;

const main = {
    f_sendmail: async (obj) => {
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
            if (fs.existsSync(`${__dirname}/../files/${process.env.NODE_APPNAME}/${signature[0].id}.${signature[0].type}`)) {
                mailOptions.attachments.push({
                    filename: signature[0].filename,
                    path: `${__dirname}/../files/${process.env.NODE_APPNAME}/${signature[0].id}.${signature[0].type}`,
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
}

module.exports = main;