const db = require('../models')
    , application = require('./application')
    , platform = require("../custom/platform")
    , fs = require('fs-extra')
    ;

module.exports = function (app) {

    app.get('/config/loginimage', async (req, res) => {
        let config = await db.getModel('config').findOne();
        let filestream;
        if (config && config.loginimage) {
            let file = JSON.parse(config.loginimage)[0];
            let filepath = `${__dirname}/../files/${process.env.NODE_APPNAME}/${file.id}.${file.type}`;
            if (fs.existsSync(filepath)) {
                filestream = fs.createReadStream(filepath);
                res.setHeader('Content-Length', file.size);
                res.setHeader('Content-Type', file.mimetype);
                res.setHeader('Content-Disposition', `;filename=${file.filename}`);
                return filestream.pipe(res);
            }
        }
        filestream = fs.createReadStream(`${__dirname}/../public/images/loginimage.png`);
        return filestream.pipe(res);
    });

    app.get('/config/menu', application.IsAuthenticated, async (req, res) => {
        application.success(res, { menu: await platform.menu.f_getMenu(req.user) });
    });

    app.get('/config/profile', application.IsAuthenticated, async (req, res) => {
        let user = await db.getModel('users').findOne({ where: { id: req.user.id } });
        application.success(res, {
            profile: {
                id: user.id
                , fullname: user.fullname
                , email: user.email
            }
        });
    });

}