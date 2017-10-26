var application = require('./application')
    , db = require('../models')
    , reload = require('require-reload')(require)
    ;

module.exports = function (app) {

    app.all('/event/:id', application.IsAuthenticated, function (req, res) {

        db.getModel('viewevent').find({
            where: { id: req.params.id }
            , include: { all: true }
        }).then(viewevent => {

            var custom = reload('../custom/functions');

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

        });

    });

}