var application = require('./application')
    , db = require('../models')
    , multer = require('multer')
    , upload = multer({ dest: 'uploads/' })
    , mv = require('mv')
    , fs = require('fs')
    , lodash = require('lodash')
    ;

var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/tmp/')
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname)
    }
});

var upload = multer({ storage: storage }).single('fileupload');

module.exports = function (app) {

    app.post('/upload', application.IsAuthenticated, function (req, res) {
        upload(req, res, function (err) {
            if (err) {
                console.error(err);
                return application.error(res);
            }
            if (!req.file) {
                return res.json({ success: false, message: 'No file given' });
            }

            let file = req.file;
            let type = file.originalname.substr(file.originalname.indexOf('.') + 1, file.originalname.length);

            db.upload.create({
                type: type.toLowerCase()
                , size: file.size
                , createdat: new Date()
            }).then(upload => {
                let path = 'uploads/' + upload.id + '.' + upload.type;
                mv(file.path, path, function (err) {
                    if (err) {
                        fs.unlink(file.path);
                        console.error(err);
                        return application.error(res);
                    }

                    //AutoRotate JPG images
                    if (lodash.indexOf(['jpg', 'jpeg'], upload.type) >= 0) {
                        console.log('is jpg and go rotate');

                    }

                    return res.json({ success: true, data: { id: upload.id, type: upload.type } });
                });
            }).catch(function (err) {
                fs.unlink(file.path);
                console.error(err);
                return application.error(res);
            });
        });
    });
}