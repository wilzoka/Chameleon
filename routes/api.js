const application = require('./application')
    , db = require('../models')
    ;

let config;

module.exports = function (app) {

    app.all('/api/:function', async (req, res) => {
        try {
            if (!config) {
                config = await db.getModel('config').findOne();
            }
            const controller = require('../custom/' + config.customfile).api;
            if (controller && controller[req.params.function]) {
                res.header("Access-Control-Allow-Origin", "*");
                res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
                controller[req.params.function]({ req: req, res: res });
            } else {
                application.error(res, {});
            }
        } catch (err) {
            application.fatal(res, err);
        }
    });

}