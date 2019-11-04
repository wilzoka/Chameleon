const application = require('./application')
    , db = require('../models')
    ;

module.exports = function (app) {

    app.get('/autocomplete', application.IsAuthenticated, async (req, res) => {
        try {
            let field = req.query.query || req.query.attribute;
            let where = [];
            if (req.query.where) {
                where.push(req.query.where);
            }
            if (req.query.q) {
                where.push(field + "::text ilike '%" + req.query.q + "%'");
            }
            let wherestr = '';
            if (where.length > 0) {
                wherestr = 'where ' + where.join(' and ');
                wherestr = wherestr.replace(/\$user/g, req.user.id);
            }
            let query = `SELECT id, ${field} as text FROM ${req.query.model} ${wherestr} ORDER BY ${field} LIMIT 100`;
            let results = await db.sequelize.query(query, { type: db.sequelize.QueryTypes.SELECT });
            return application.success(res, { data: results });
        } catch (err) {
            return application.fatal(res, err);
        }
    });

}