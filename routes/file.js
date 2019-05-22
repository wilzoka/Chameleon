const application = require('./application')
    , db = require('../models')
    , multer = require('multer')
    , mv = require('mv')
    , fs = require('fs-extra')
    , lodash = require('lodash')
    , moment = require('moment')
    ;

let storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, __dirname + '/../tmp/');
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});
const basepath = __dirname + '/../';
const requiredFolders = [
    basepath + 'tmp'
    , basepath + 'files'
];
for (let i = 0; i < requiredFolders.length; i++) {
    if (!fs.existsSync(requiredFolders[i])) {
        fs.mkdirSync(requiredFolders[i]);
    }
}
let fileupload = multer({ storage: storage }).single('file');

module.exports = function (app) {

    app.get('/file/:id', application.IsAuthenticated, async (req, res) => {
        try {
            if (isNaN(req.params.id)) {
                return res.send('Arquivo inválido');
            }
            let file = await db.getModel('file').findOne({ where: { id: req.params.id } })
            if (!file) {
                return res.send('Arquivo inválido');
            }
            let filepath = `${__dirname}/../files/${file.id}.${file.type}`;
            if (fs.existsSync(filepath)) {
                let filestream = fs.createReadStream(filepath);
                let attachment = 'attachment';
                let previewTypes = [
                    'application/pdf'
                    , 'application/javascript'
                    , 'application/json'
                    , 'text/plain'
                    , 'image/'
                ];
                for (let i = 0; i < previewTypes.length; i++) {
                    if (file.mimetype.indexOf(previewTypes[i]) >= 0) {
                        attachment = '';
                        break;
                    }
                }
                res.setHeader('Content-type', file.mimetype);
                res.setHeader('Content-Disposition', attachment + ';filename=' + file.filename);
                return filestream.pipe(res);
            } else {
                res.send('Arquivo inexistente');
            }
        } catch (err) {
            return application.fatal(res, err);
        }
    });

    app.post('/file', application.IsAuthenticated, async (req, res) => {
        try {
            fileupload(req, res, async (err) => {
                if (err) {
                    return application.fatal(res, err);
                }
                if (!req.file) {
                    return application.fatal(res, 'No file given');
                }
                let filenamesplited = req.file.filename.split('.');
                let type = filenamesplited[filenamesplited.length - 1];
                let file = await db.getModel('file').create({
                    filename: req.file.filename
                    , mimetype: req.file.mimetype
                    , size: req.file.size
                    , type: type
                    , bounded: false
                    , datetime: moment()
                    , iduser: req.user.id
                });
                let path = `${__dirname}/../files/${file.id}.${file.type}`;
                mv(req.file.path, path, function (err) {
                    if (err) {
                        fs.unlink(req.file.path);
                        return application.fatal(res, err);
                    }
                    return res.json({ success: true, data: file });
                });
            });
        } catch (err) {
            return application.fatal(res, err);
        }
    });
}