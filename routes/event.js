const application = require('./application')
    , db = require('../models')
    ;

module.exports = function (app) {

    app.all('/event/:id', application.IsAuthenticated, async (req, res) => {
        // let t;
        try {
            const viewevent = await db.getModel('viewevent').findOne({ where: { id: req.params.id }, include: { all: true } });
            const config = await db.getModel('config').findOne();
            const custom = require('../custom/' + config.customfile);
            const realfunction = application.functions.getRealReference(custom, viewevent.function);
            const ids = req.query.ids ? req.query.ids.split(',') : [];
            if (realfunction) {
                // t = await db.sequelize.transaction();
                const obj = {
                    req: req
                    , res: res
                    , ids: ids
                    , id: req.query.id || null
                    , parent: req.query.parent || null
                    , event: viewevent
                    // , t: t
                };
                await realfunction(obj);
                // if (!obj.t.finished)
                //     obj.t.rollback();
            } else {
                application.fatal(res, `Evento ${viewevent.function} não encontrado`);
            }
        } catch (err) {
            application.fatal(res, err);
        }
    });

}