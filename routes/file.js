const application = require('./application')
    , db = require('../models')
    , multer = require('multer')
    , mv = require('mv')
    , fs = require('fs')
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

    app.get('/file/preview/:id', application.IsAuthenticated, function (req, res) {

        db.getModel('file').findOne({ where: { id: req.params.id } }).then(file => {
            if (file) {
                let body = '';
                if (file.mimetype.match(/image.*/)) {
                    body = '<div class="text-center"><img src="/files/' + file.id + '.' + file.type + ' " style="max-width: 100%;"></div>';
                } else if (file.mimetype == 'application/pdf') {
                    body = '<iframe src="/file/download/' + file.id + '" style="width: 100%; height: 400px;"></iframe>';
                } else {
                    body = '<div class="text-center"><i class="fa fa-3x fa-eye-slash" aria-hidden="true"></i></div>';
                }
                return application.success(res, {
                    modal: {
                        id: 'modalpreview'
                        , fullscreen: true
                        , title: '<div class="col-sm-12" style="text-align: center;">' + file.filename + '</div>'
                        , body: body
                        , footer: '<button type="button" class="btn btn-default" style="margin-right: 5px;" data-dismiss="modal">Voltar</button><a href="/file/download/' + file.id + '" target="_blank"><button type="button" class="btn btn-primary">Download do Arquivo</button></a>'
                    }
                });
            } else {
                return application.error(res, { msg: 'Arquivo não encontrado' });
            }
        });

    });

    app.get('/file/download/:id', application.IsAuthenticated, async (req, res) => {
        try {
            if (isNaN(req.params.id)) {
                return res.send('Arquivo inválido');
            }
            let file = await db.getModel('file').findOne({ where: { id: req.params.id } })
            if (!file) {
                return res.send('Arquivo inválido');
            }
            let filepath = __dirname + '/../files/' + file.id + '.' + file.type;
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
                let path = __dirname + '/../files/' + file.id + '.' + file.type;
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