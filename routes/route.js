const application = require('./application')
    , db = require('../models')
    , fs = require('fs')
    ;

let routes = {}
    , config;

module.exports = function (app) {

    app.get('/r/:route', async (req, res) => {
        try {
            if (!(req.params.route in routes)) {
                routes[req.params.route] = await db.getModel('route').find({ raw: true, where: { url: req.params.route } });
            }
            if (!routes[req.params.route]) {
                return application.notFound(res);
            }
            if (routes[req.params.route].needauth) {
                if (req.isAuthenticated()) {
                    return application.render(res, __dirname + '/../views/templates/routeauth.html', {
                        title: routes[req.params.route].description
                        , template: fs.readFileSync(__dirname + '/../custom/' + routes[req.params.route].file, 'utf8')
                    });
                } else {
                    return res.redirect('/login');
                }
            } else {
                if (req.isAuthenticated()) {
                    return application.render(res, __dirname + '/../views/templates/routeauth.html', {
                        title: routes[req.params.route].description
                        , template: fs.readFileSync(__dirname + '/../custom/' + routes[req.params.route].file, 'utf8')
                    });
                } else {
                    return application.render(res, __dirname + '/../views/templates/routeunauth.html', {
                        title: routes[req.params.route].description
                        , template: fs.readFileSync(__dirname + '/../custom/' + routes[req.params.route].file, 'utf8')
                    });
                }
            }
        } catch (err) {
            return application.fatal(res, err);
        }
    });

    app.post('/r/:route', async (req, res) => {
        try {
            if (!(req.params.route in routes)) {
                routes[req.params.route] = await db.getModel('route').find({ raw: true, where: { url: req.params.route } });
            }
            if (!routes[req.params.route]) {
                return application.error(res, {});
            }
            if (!config) {
                config = await db.getModel('config').find();
            }
            let custom = require('../custom/' + config.customfile);
            return application.functions.getRealReference(custom, routes[req.params.route].function)({
                route: routes[req.params.route]
                , req: req
                , res: res
            });
        } catch (err) {
            return application.fatal(res, err);
        }
    });

}