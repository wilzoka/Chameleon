const application = require('./application')
    , db = require('../models')
    ;

module.exports = function (app) {

    app.all('/event/:id', application.IsAuthenticated, async (req, res) => {
        try {
            const viewevent = await db.getModel('viewevent').findOne({ where: { id: req.params.id }, include: { all: true } });
            const config = await db.getModel('config').findOne();
            const custom = require('../custom/' + config.customfile);
            const realfunction = application.functions.getRealReference(custom, viewevent.function);
            const ids = req.query.ids ? req.query.ids.split(',') : [];
            if (realfunction) {
                const obj = {
                    req: req
                    , res: res
                    , ids: ids
                    , id: req.query.id || null
                    , parent: req.query.parent || null
                    , event: viewevent
                };
                if (viewevent.selectionmode == 'atLeastOne' && ids.length <= 0) {
                    return application.error(res, { msg: application.message.selectOneEvent });
                } else if (viewevent.selectionmode == 'onlyOne' && ids.length != 1) {
                    return application.error(res, { msg: application.message.selectOnlyOneEvent });
                }
                await realfunction(obj);
            } else {
                application.fatal(res, `Evento ${viewevent.function} não encontrado`);
            }
        } catch (err) {
            application.fatal(res, err);
        }
    });

}