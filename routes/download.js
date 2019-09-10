const fs = require('fs-extra')
    , mime = require('mime-types')
    ;

module.exports = function (app) {

    app.get('/download/:filename', function (req, res) {
        let filename = req.params.filename;
        let fsplited = filename.split('.');
        let type = fsplited[fsplited.length - 1];
        let filepath = `${__dirname}/../tmp/${process.env.NODE_APPNAME}/${filename}`;
        if (fs.existsSync(filepath)) {
            let filestream = fs.createReadStream(filepath);
            res.setHeader('Content-Length', fs.statSync(filepath).size);
            res.setHeader('Content-Type', mime.lookup(type));
            res.setHeader('Content-Disposition', `;filename=${filename}`);
            let stream = filestream.pipe(res);
            stream.on('finish', function () {
                setTimeout(function () {
                    if (fs.existsSync(filepath))
                        fs.unlinkSync(filepath);
                }, 10 * 1000);
            });
        } else {
            res.send('Arquivo inexistente');
        }
    });

}