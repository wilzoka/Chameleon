const application = require('./application')
    , fs = require('fs-extra')
    ;

module.exports = function (app) {

    app.get('/download/:filename', application.IsAuthenticated, function (req, res) {
        let filename = req.params.filename;
        let fsplited = filename.split('.');
        let type = fsplited[fsplited.length - 1];
        let filepath = __dirname + '/../tmp/' + filename;
        if (fs.existsSync(filepath)) {
            switch (type) {
                case 'pdf':
                    let file = fs.readFileSync(filepath);
                    res.setHeader('Content-type', 'application/pdf');
                    res.send(file);
                    break;
                default:
                    res.download(filepath);
                    break;
            }
            fs.unlinkSync(filepath);
        } else {
            res.send('Arquivo inexistente');
        }
    });

}