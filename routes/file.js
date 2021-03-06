const application = require('./application')
    , db = require('../models')
    , platform = require('../custom/platform')
    , multer = require('multer')
    , fs = require('fs-extra')
    , moment = require('moment')
    , sharp = require('sharp')
    , mime = require('mime-types')
    , md5File = require('md5-file')
    ;

sharp.cache(false);

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, `${__dirname}/../tmp/${process.env.NODE_APPNAME}/`);
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});
const basepath = __dirname + '/..';
const requiredFolders = [
    `${basepath}/tmp/${process.env.NODE_APPNAME}`
    , `${basepath}/files/${process.env.NODE_APPNAME}`
];
for (let i = 0; i < requiredFolders.length; i++) {
    if (!fs.existsSync(requiredFolders[i])) {
        fs.mkdirSync(requiredFolders[i]);
    }
}
const fileupload = multer({ storage: storage }).single('file');

module.exports = function (app) {

    app.get('/file/:id', async (req, res) => {
        try {
            if (isNaN(req.params.id)) {
                return res.send('Arquivo inválido');
            }
            let file = await db.getModel('file').findOne({ raw: true, where: { id: req.params.id } });
            if (!file) {
                return res.send('Arquivo inválido');
            }
            if (!file.public) {
                if (!req.isAuthenticated()) {
                    application.jwt(req);
                }
                if (!req.user) {
                    return application.forbidden(res);
                }
                const views = await db.getModel('view').findAll({ include: [{ all: true }], where: { idmodel: file.idmodel } });
                const viewfile = await db.getModel('view').findOne({ include: [{ all: true }], where: { url: 'arquivo' } });
                if (viewfile) {
                    views.unshift(viewfile);
                }
                let allow = false;
                for (let i = 0; i < views.length; i++) {
                    const permission = await platform.view.f_hasPermission(req.user.id, views[i].id);
                    if (permission.visible) {
                        if (views[i].wherefixed) {
                            const wherefixed = views[i].wherefixed.replace(/\$user/g, req.user.id).replace(/\$id/g, file.modelid);
                            const exists = await db.getModel(views[i].model.name).count({ include: [{ all: true }], where: { id: file.modelid, [db.Op.col]: db.Sequelize.literal(wherefixed) } });
                            if (exists > 0) {
                                allow = true;
                                break;
                            }
                        } else {
                            allow = true;
                            break;
                        }
                    }
                }
                if (!allow) {
                    return application.forbidden(res);
                }
            }
            const realname = file.filename;
            if (file.idfileref)
                file = await db.getModel('file').findOne({ raw: true, where: { id: file.idfileref } });
            const filepath = `${application.functions.filesDir()}${file.id}.${file.type}`;
            if (fs.existsSync(filepath)) {
                res.setHeader('Content-Length', file.size);
                res.setHeader('Content-Type', file.mimetype);
                res.setHeader('Content-Disposition', `;filename=${realname}`);
                let f;
                if (file.mimetype.match(/video.*/)) {
                    const range = req.headers.range;
                    if (range) {
                        const parts = range.replace(/bytes=/, "").split("-");
                        const start = parseInt(parts[0], 10);
                        const end = parts[1] ? parseInt(parts[1], 10) : file.size - 1;
                        const chunksize = (end - start) + 1;
                        res.setHeader('Content-Range', `bytes ${start}-${end}/${file.size}`);
                        res.setHeader('Accept-Ranges', `bytes`);
                        res.setHeader('Content-Length', chunksize);
                        res.writeHead(206);
                        f = fs.createReadStream(filepath, { start, end });
                    }
                }
                if (!f)
                    f = fs.createReadStream(filepath);
                f.pipe(res);
            } else {
                res.send('Arquivo inexistente');
            }
        } catch (err) {
            application.fatal(res, err);
        }
    });

    app.post('/file', application.IsAuthenticated, async (req, res) => {
        try {
            fileupload(req, res, async (err) => {
                if (err)
                    return application.fatal(res, err);
                if (!req.file)
                    return application.fatal(res, 'No file given');
                const filename = application.functions.removeSpecialCharacters(application.functions.singleSpace(req.file.filename))
                    .replace(/\,/g, '')
                    .replace(/[\u{0080}-\u{FFFF}]/gu, "");
                const filenamesplited = filename.split('.');
                const type = filenamesplited[filenamesplited.length - 1].toLowerCase();
                const mimetype = mime.lookup(type) || '';
                const file = await db.getModel('file').create({
                    filename: filename
                    , mimetype: mimetype
                    , size: req.file.size
                    , type: type
                    , bounded: false
                    , datetime: moment()
                    , iduser: req.user.id
                });
                let path = application.functions.filesDir();
                if (mimetype.match(/image.*/)) {
                    const quality = 80;
                    const maxwh = parseInt(req.body.maxwh || 0);
                    const forcejpg = req.body.forcejpg == 'true' ? true : false;
                    const sharped = sharp(req.file.path, { failOnError: false });
                    if (maxwh > 0) {
                        sharped.resize(maxwh, maxwh, { fit: 'inside' });
                    }
                    if (forcejpg) {
                        let newfilename = file.filename.split('.');
                        newfilename.splice(newfilename.length - 1, 1);
                        file.filename = `${newfilename.join('.')}.jpg`;
                        file.type = 'jpg';
                        file.mimetype = 'image/jpeg';
                    }
                    sharped.rotate();
                    if (['jpeg', 'jpg'].indexOf(file.type) >= 0) {
                        sharped.jpeg({ quality: quality, chromaSubsampling: '4:4:4' });
                    } else if (['png'].indexOf(file.type) >= 0) {
                        sharped.png({ quality: quality });
                    }
                    path += `${file.id}.${file.type}`;
                    const fileinfo = await sharped.toFile(path);
                    file.size = fileinfo.size;
                    fs.unlinkSync(req.file.path);
                } else {
                    path += `${file.id}.${file.type}`;
                    fs.renameSync(req.file.path, path);
                }
                const hash = md5File.sync(path);
                const fileref = await db.findOne('file', { hash: hash });
                if (fileref) {
                    file.idfileref = fileref.id;
                    fs.unlinkSync(path);
                } else {
                    file.hash = hash;
                }
                await file.save({ iduser: req.user.id });
                res.json({ success: true, data: file });
            });
        } catch (err) {
            application.fatal(res, err);
        }
    });
}