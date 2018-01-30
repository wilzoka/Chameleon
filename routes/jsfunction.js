const application = require('./application')
    , db = require('../models')
    , reload = require('require-reload')(require)
    ;

module.exports = function (app) {

    app.post('/jsfunction', application.IsAuthenticated, async (req, res) => {
        try {
            let config = await db.getModel('config').find();
            let custom = reload('../custom/' + config.customfile);
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