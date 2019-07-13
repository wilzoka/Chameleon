const application = require('./application')
    , db = require('../models')
    , multer = require('multer')
    , fs = require('fs-extra')
    , moment = require('moment')
    , sharp = require('sharp')
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

module.exports = function (app) {

    app.get('/file/:id', async (req, res) => {
        try {
            if (isNaN(req.params.id)) {
                return res.send('Arquivo inválido');
            }
            let file = await db.getModel('file').findOne({ where: { id: req.params.id } });
            if (!file) {
                return res.send('Arquivo inválido');
            }
            if (!file.public) {
                if (!req.isAuthenticated()) {
                    return application.forbidden(res);
                }
                let views = await db.getModel('view').findAll({ include: [{ all: true }], where: { idmodel: file.idmodel } });
                let viewfile = await db.getModel('view').findOne({ include: [{ all: true }], where: { url: 'arquivo' } });
                if (viewfile) {
                    views.unshift(viewfile);
                }
                let allow = false;
                for (let i = 0; i < views.length; i++) {
                    const permission = await hasPermission(req.user.id, views[i].id);
                    if (permission.visible) {
                        if (views[i].wherefixed) {
                            let wherefixed = views[i].wherefixed.replace(/\$user/g, req.user.id).replace(/\$id/g, file.modelid);
                            let exists = await db.getModel(views[i].model.name).count({ include: [{ all: true }], where: { id: file.modelid, [db.Op.col]: db.Sequelize.literal(wherefixed) } });
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
                let type = filenamesplited[filenamesplited.length - 1].toLowerCase();
                let file = await db.getModel('file').create({
                    filename: req.file.filename
                    , mimetype: req.file.mimetype
                    , size: req.file.size
                    , type: type
                    , bounded: false
                    , datetime: moment()
                    , iduser: req.user.id
                });
                let path = `${__dirname}/../files/${process.env.NODE_APPNAME}/`;
                if (file.mimetype.match(/image.*/)) {
                    const quality = 80;
                    let maxwh = parseInt(req.body.maxwh || 0);
                    let forcejpg = req.body.forcejpg == 'true' ? true : false;
                    let sharped = sharp(req.file.path);
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
                    if (['jpeg', 'jpg'].indexOf(file.type) >= 0) {
                        sharped.jpeg({ quality: quality, chromaSubsampling: '4:4:4' });
                    } else if (['png'].indexOf(file.type) >= 0) {
                        sharped.png({ quality: quality });
                    }
                    path += `${file.id}.${file.type}`;
                    let fileinfo = await sharped.toFile(path);
                    file.size = fileinfo.size;
                    fs.unlinkSync(req.file.path);
                } else {
                    path += `${file.id}.${file.type}`;
                    fs.renameSync(req.file.path, path);
                }
                await file.save();
                return res.json({ success: true, data: file });
            });
        } catch (err) {
            return application.fatal(res, err);
        }
    });
}