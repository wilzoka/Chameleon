const application = require('./application')
    , db = require('../models')
    ;

let config;

module.exports = function (app) {

    app.post('/jsfunction', application.IsAuthenticated, async (req, res) => {
        try {
            if (!config) {
                config = await db.getModel('config').findOne();
            }
            let custom = require('../custom/' + config.customfile);
            let obj = {
                name: req.body.name
                , data: req.body.data
                , res: res
                , req: req
            };
            let realfunction = application.functions.getRealReference(custom, obj.name);
            if (realfunction) {
                return realfunction(obj);
            } else {
                return application.error(res, { success: false, msg: 'Função não encontrada' });
            }
        } catch (err) {
            return application.fatal(res, err);
        }
    });

}