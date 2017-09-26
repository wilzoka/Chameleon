var application = require('./application')
    , fs = require('fs')
    ;

module.exports = function (app) {

    app.get('/download/:filename', application.IsAuthenticated, function (req, res) {

        var filename = req.params.filename;
        var fsplited = filename.split('.');
        var type = fsplited[fsplited.length - 1];
        var filepath = __dirname + '/../tmp/' + filename;

        if (fs.existsSync(filepath)) {
            switch (type) {
                case 'pdf':
                    var file = fs.readFileSync(filepath);
                    res.setHeader('Content-type', 'application/pdf');
                    res.send(file);
                    break;
                default:
                    res.download(filepath);
                    break;
            }
        } else {
            res.send('Arquivo inexistente');
        }


    });

}