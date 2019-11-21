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
            const custom = require('../custom/' + config.customfile);
            const obj = {
                name: req.body.name
                , data: req.body.data
                , res: res
                , req: req
            };
            const realfunction = application.functions.getRealReference(custom, obj.name);
            if (realfunction) {
                realfunction(obj);
            } else {
                application.error(res, { success: false, msg: 'Função não encontrada' });
            }
        } catch (err) {
            application.fatal(res, err);
        }
    });

}