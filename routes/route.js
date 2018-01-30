const application = require('./application')
    , db = require('../models')
    , reload = require('require-reload')(require)
    , fs = require('fs')
    ;

module.exports = function (app) {

    app.get('/route/:id', async (req, res) => {
        try {
            let route = await db.getModel('route').find({ where: { id: req.params.id } });
            if (route.needauth) {
                if (req.isAuthenticated()) {
                    return application.render(res, __dirname + '/../views/templates/routeauth.html', {
                        title: route.description
                        , template: fs.readFileSync(__dirname + '/../custom/' + route.file, 'utf8')
                    });
                } else {
                    return res.redirect('/login');
                }
            } else {
                if (req.isAuthenticated()) {
                    return application.render(res, __dirname + '/../views/templates/routeauth.html', {
                        title: route.description
                        , template: fs.readFileSync(__dirname + '/../custom/' + route.file, 'utf8')
                    });
                } else {
                    return application.render(res, __dirname + '/../views/templates/routeunauth.html', {
                        title: route.description
                        , template: fs.readFileSync(__dirname + '/../custom/' + route.file, 'utf8')
                    });
                }
            }
        } catch (err) {
            return application.fatal(res, err);
        }
    });

    app.post('/route/:id', async (req, res) => {
        try {
            let route = await db.getModel('route').find({ where: { id: req.params.id } });
            if (route) {
                let config = await db.getModel('config').find();
                let custom = reload('../custom/' + config.customfile);
                return application.functions.getRealReference(custom, route.function)({
                    route: route
                    , req: req
                    , res: res
                });
            } else {
                return application.error(res, { msg: 'Route not found' });
            }
        } catch (err) {
            return application.fatal(res, err);
        }
    });

}