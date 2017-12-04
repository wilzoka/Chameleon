var application = require('./application')
    , db = require('../models')
    , reload = require('require-reload')(require)
    ;

module.exports = function (app) {

    app.get('/route/:id', async (req, res) => {

        try {

            let route = await db.getModel('route').find({ where: { id: req.params.id } });

            if (route.needauth) {

                if (req.isAuthenticated()) {

                    return application.render(res, 'templates/routeauth', {
                        title: route.description
                        , template: '../../custom/' + route.file
                    });

                } else {
                    return application.forbidden(res);
                }

            } else {

                if (req.isAuthenticated()) {

                    return application.render(res, 'templates/routeauth', {
                        title: route.description
                        , template: '../../custom/' + route.file
                    });

                } else {

                    return application.render(res, 'templates/routeunauth', {
                        title: route.description
                        , template: '../../custom/' + route.file
                    });

                }

            }

        } catch (err) {
            return application.fatal(res, err);
        }

    });

}