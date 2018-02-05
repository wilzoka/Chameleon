const application = require('./application')
    , db = require('../models')
    , fs = require('fs')
    ;

let routes = {}
    , config;

module.exports = function (app) {

    app.get('/route/:id', async (req, res) => {
        try {
            if (!(req.params.id in routes)) {
                routes[req.params.id] = await db.getModel('route').find({ raw: true, where: { id: req.params.id } });
            }
            if (routes[req.params.id].needauth) {
                if (req.isAuthenticated()) {
                    return application.render(res, __dirname + '/../views/templates/routeauth.html', {
                        title: routes[req.params.id].description
                        , template: fs.readFileSync(__dirname + '/../custom/' + routes[req.params.id].file, 'utf8')
                    });
                } else {
                    return res.redirect('/login');
                }
            } else {
                if (req.isAuthenticated()) {
                    return application.render(res, __dirname + '/../views/templates/routeauth.html', {
                        title: routes[req.params.id].description
                        , template: fs.readFileSync(__dirname + '/../custom/' + routes[req.params.id].file, 'utf8')
                    });
                } else {
                    return application.render(res, __dirname + '/../views/templates/routeunauth.html', {
                        title: routes[req.params.id].description
                        , template: fs.readFileSync(__dirname + '/../custom/' + routes[req.params.id].file, 'utf8')
                    });
                }
            }
        } catch (err) {
            return application.fatal(res, err);
        }
    });

    app.post('/route/:id', async (req, res) => {
        try {
            if (!(req.params.id in routes)) {
                routes[req.params.id] = await db.getModel('route').find({ raw: true, where: { id: req.params.id } });
            }
            if (!config) {
                config = await db.getModel('config').find();
            }
            let custom = require('../custom/' + config.customfile);
            return application.functions.getRealReference(custom, routes[req.params.id].function)({
                route: routes[req.params.id]
                , req: req
                , res: res
            });
        } catch (err) {
            return application.fatal(res, err);
        }
    });

}