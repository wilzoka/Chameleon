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
        filestream.pipe(res);
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
                , image: user.image ? JSON.parse(user.image)[0] : null
            }
        });
    });

    app.get('/icon/marker', application.IsAuthenticated, async (req, res) => {
        const marker = __dirname + '/../public/images/map_marker.png';
        if (!req.query.color) {
            return fs.createReadStream(marker).pipe(res);
        }
        const Jimp = require('jimp');
        Jimp.read(marker, (err, img) => {
            if (err) throw err;
            const color = Jimp.cssColorToHex(req.query.color);
            for (let w = 0; w < img.bitmap.width; w++) {
                for (let h = 0; h < img.bitmap.height; h++) {
                    const cip = img.getPixelColor(w, h);
                    if (cip == 255) {
                        img.setPixelColor(color, w, h);
                    }
                }
            }
            img.getBufferAsync(Jimp.MIME_PNG).then((buffer) => {
                res.setHeader('Content-Type', 'image/png');
                res.setHeader('Content-Length', buffer.length);
                res.send(buffer);
            });
        });
    });

}