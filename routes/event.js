var application = require('./application')
    , db = require('../models')
    , reload = require('require-reload')(require)
    ;

module.exports = function (app) {

    app.all('/event/:id', application.IsAuthenticated, function (req, res) {

        db.getModel('modelevent').find({
            where: { id: req.params.id }
            , include: { all: true }
        }).then(modelevent => {

            var custom = reload('../custom/functions');

            var realfunction = application.functions.getRealReference(custom, modelevent.function);

            if (realfunction) {
                return realfunction({
                    req: req
                    , res: res
                    , ids: req.query.ids || null
                    , event: modelevent
                });
            } else {
                return application.fatal(res, 'Custom function not found');
            }

        });

    });

}