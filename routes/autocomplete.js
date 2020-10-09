const application = require('./application')
    , db = require('../models')
    ;

module.exports = function (app) {

    app.get('/autocomplete', application.IsAuthenticated, async (req, res) => {
        try {
            const field = req.query.query || req.query.attribute;
            const where = [];
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
            const query = `SELECT id, ${field} as text FROM ${req.query.model} ${wherestr} ORDER BY ${field} LIMIT 100`;
            const results = await db.sequelize.query(query, { type: db.sequelize.QueryTypes.SELECT });
            application.success(res, { data: results });
        } catch (err) {
            application.fatal(res, err);
        }
    });

}