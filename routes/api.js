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
            let controller = require('../custom/' + config.customfile).api;
            if (controller) {
                res.header("Access-Control-Allow-Origin", "*");
                res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
                return controller({ req: req, res: res });
            } else {
                return application.error(res, {});
            }
        } catch (err) {
            return application.fatal(res, err);
        }
    });

}