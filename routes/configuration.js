const db = require('../models')
    , application = require('./application')
    , platform = require("../custom/platform")
    ;

module.exports = function (app) {

    app.get('/config/menu', application.IsAuthenticated, async (req, res) => {
        application.success(res, { menu: await platform.menu.f_getMenu(req.user) });
    });

}