const application = require('./application')
    , db = require('../models')
    , fs = require('fs')
    ;

let routes = {}
    , config;

const hasPermission = function (iduser, url) {
    return new Promise((resolve) => {
        db.sequelize.query(`
        select
            p.id
        from
            permission p
        left join menu m on (p.idmenu = m.id)
        where
            p.iduser = :iduser
            and m.url = :url
        `, {
                replacements: { iduser: iduser, url: url }
                , type: db.sequelize.QueryTypes.SELECT
            }).then(permission => {
                resolve(permission.length > 0);
            });
    });
}

module.exports = function (app) {

    app.get('/r/:route', async (req, res) => {
        try {
            if (!(req.params.route in routes)) {
                routes[req.params.route] = await db.getModel('route').findOne({ raw: true, where: { url: req.params.route } });
            }
            if (!routes[req.params.route]) {
                return application.notFound(res);
            }
            if (routes[req.params.route].needauth) {
                if (req.isAuthenticated()) {
                    if (routes[req.params.route].needperm && (!await hasPermission(req.user.id, req.url))) {
                        return application.forbidden(res);
                    }
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
                routes[req.params.route] = await db.getModel('route').findOne({ raw: true, where: { url: req.params.route } });
            }
            if (!routes[req.params.route]) {
                return application.error(res, {});
            }
            if (!config) {
                config = await db.getModel('config').findOne();
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