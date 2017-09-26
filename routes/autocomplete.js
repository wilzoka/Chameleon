var application = require('./application')
    , db = require('../models')
    ;

module.exports = function (app) {

    app.get('/autocomplete', application.IsAuthenticated, function (req, res) {

        var model = req.query.model;
        var attribute = req.query.attribute;
        var where = [];
        var q = req.query.q || '';

        if (req.query.where) {
            where.push(req.query.where);
        }

        if (req.query.q) {
            where.push(attribute + "::text ilike '%" + req.query.q + "%'");
        }

        var wherestr = '';
        if (where.length > 0) {
            wherestr = ' where ' + where.join(' and ');
        }

        var query = 'SELECT id, ' + attribute + ' as text FROM ' + model + wherestr + ' order by ' + attribute + ' limit 100';
        db.sequelize.query(query, { type: db.sequelize.QueryTypes.SELECT }).then(results => {
            return application.success(res, { data: results });
        }).catch(err => {
            return application.fatal(res, err);
        });

    });

}