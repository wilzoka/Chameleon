const application = require('./application')
    , db = require('../models')
    ;

module.exports = function (app) {

    app.all('/event/:id', application.IsAuthenticated, async (req, res) => {
        try {
            let viewevent = await db.getModel('viewevent').findOne({ where: { id: req.params.id }, include: { all: true } });
            let config = await db.getModel('config').findOne();
            let custom = require('../custom/' + config.customfile);
            let realfunction = application.functions.getRealReference(custom, viewevent.function);
            let ids = [];
            if (req.query.ids) {
                ids = req.query.ids.split(',');
            }
            if (realfunction) {
                return realfunction({
                    req: req
                    , res: res
                    , ids: ids
                    , id: req.query.id || null
                    , parent: req.query.parent || null
                    , event: viewevent
                });
            } else {
                return application.fatal(res, `Evento ${viewevent.function} não encontrado`);
            }
        } catch (err) {
            return application.fatal(res, err);
        }
    });

}