var application = require('./application')
    , db = require('../models')
    , reload = require('require-reload')(require)
    ;

module.exports = function (app) {

    app.all('/event/:id', application.IsAuthenticated, async (req, res) => {

        try {

            let viewevent = await db.getModel('viewevent').find({
                where: { id: req.params.id }
                , include: { all: true }
            })

            let config = await db.getModel('config').find();
            let custom = reload('../custom/' + config.customfile);

            var realfunction = application.functions.getRealReference(custom, viewevent.function);

            if (realfunction) {
                return realfunction({
                    req: req
                    , res: res
                    , ids: req.query.ids || null
                    , id: req.query.id || null
                    , parent: req.query.parent || null
                    , event: viewevent
                });
            } else {
                return application.fatal(res, 'Custom function not found');
            }

        } catch (err) {
            return application.fatal(res, err);
        }

    });

}