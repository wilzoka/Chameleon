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
let fileupload = multer({ storage: storage }).single('file');

const hasPermission = function (iduser, idview) {
    return new Promise((resolve) => {
        let permissionquery = 'select p.*, v.id as idview from permission p left join menu m on (p.idmenu = m.id) left join view v on (m.idview = v.id) where p.iduser = :iduser';
        let getChilds = function (idview, subviews) {
            let returnsubviews = [];
            for (let i = 0; i < subviews.length; i++) {
                if (idview == subviews[i].idview) {
                    returnsubviews.push(subviews[i].idsubview);
                    let moresubviews = getChilds(subviews[i].idsubview, subviews);
                    for (let z = 0; z < moresubviews.length; z++) {
                        returnsubviews.push(moresubviews[z]);
                    }
                }
            }
            return returnsubviews;
        }
        db.sequelize.query(permissionquery, {
            replacements: { iduser: iduser }
            , type: db.sequelize.QueryTypes.SELECT
        }).then(permissions => {
            for (let i = 0; i < permissions.length; i++) {
                if (permissions[i].idview == idview) {
                    return resolve(permissions[i]);
                }
            }
            db.getModel('viewsubview').findAll({ raw: true }).then(subviews => {
                for (let i = 0; i < permissions.length; i++) {
                    permissions[i].childs = getChilds(permissions[i].idview, subviews);
                    for (let x = 0; x < permissions[i].childs.length; x++) {
                        if (permissions[i].childs[x] == idview) {
                            return resolve(permissions[i]);
                        }
                    }
                }
                return resolve(false);
            });
        });
    });
}

const findView = function (url) {
    return db.getModel('view').findOne({ include: [{ all: true }], where: { url: url } });
}

module.exports = function (app) {

    app.get('/file/:id', application.IsAuthenticated, async (req, res) => {
        try {
            if (isNaN(req.params.id)) {
                return res.send('Arquivo inválido');
            }
            let viewparam = req.query.view ? req.query.view.split('/') : [];
            if (viewparam.length != 4) {
                return application.forbidden(res);
            }
            let view = await findView(viewparam[2]);
            if (!view) {
                return application.forbidden(res);
            }
            const permission = await hasPermission(req.user.id, view.id);
            if (!permission.visible) {
                return application.forbidden(res);
            }
            if (view.wherefixed) {
                let wherefixed = view.wherefixed.replace(/\$user/g, req.user.id).replace(/\$id/g, req.query.parent || null);
                let exists = await db.getModel(view.model.name).count({ raw: true, include: [{ all: true }], where: { id: viewparam[3], $col: db.Sequelize.literal(wherefixed) } });
                if (exists <= 0) {
                    return application.forbidden(res);
                }
            }
            let file = await db.getModel('file').findOne({ where: { id: req.params.id } });
            if (!file) {
                return res.send('Arquivo inválido');
            }
            if (file.idmodel != view.idmodel) {
                return application.forbidden(res);
            }
            let filepath = `${__dirname}/../files/${process.env.NODE_APPNAME}/${file.id}.${file.type}`;
            if (fs.existsSync(filepath)) {
                let filestream = fs.createReadStream(filepath);
                res.setHeader('Content-Length', file.size);
                res.setHeader('Content-type', file.mimetype);
                res.setHeader('Content-Disposition', `;filename=${file.filename}`);
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
                let path = `${__dirname}/../files/${process.env.NODE_APPNAME}/${file.id}.${file.type}`;
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