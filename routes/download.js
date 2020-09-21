const application = require('../routes/application')
    , fs = require('fs-extra')
    , mime = require('mime-types')
    ;

module.exports = function (app) {

    app.get('/download/:filename', function (req, res) {
        const filename = req.params.filename;
        const fsplited = filename.split('.');
        const type = fsplited[fsplited.length - 1];
        const filepath = `${application.functions.tmpDir()}${filename}`;
        if (fs.existsSync(filepath)) {
            res.setHeader('Content-Length', fs.statSync(filepath).size);
            res.setHeader('Content-Type', mime.lookup(type));
            res.setHeader('Content-Disposition', `;filename=${filename}`);
            const stream = fs.createReadStream(filepath).pipe(res);
            stream.on('finish', function () {
                setTimeout(function (fp) {
                    if (fs.existsSync(fp))
                        fs.unlinkSync(fp);
                }.bind(null, filepath), 10 * 1000);
            });
        } else {
            res.send('Arquivo inexistente');
        }
    });

}