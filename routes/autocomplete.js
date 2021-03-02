const application = require('./application')
    , db = require('../models')
    ;

module.exports = function (app) {

    app.get('/autocomplete', application.IsAuthenticated, async (req, res) => {
        try {
            const f = req.query.query || req.query.attribute;
            const q = req.query.q || '';
            const m = req.query.model;
            const w = (`where ${req.query.where || '1=1'}`)
                .replace(/\$user/g, req.user.id);
            const query = `
            (SELECT id, ${f} as text FROM ${m} ${w} and ${f}::text ilike '${q}' ORDER BY ${f})
            union all
            (SELECT id, ${f} as text FROM ${m} ${w} and ${f}::text ilike '${q}%' and ${f}::text not ilike '${q}' ORDER BY ${f} LIMIT 100)
            union all
            (SELECT id, ${f} as text FROM ${m} ${w} and ${f}::text ilike '%${q}%' and ${f}::text not ilike '${q}' and ${f}::text not ilike '${q}%' ORDER BY ${f} LIMIT 100)
            `;
            const r = await db.query(query);
            application.success(res, { data: r });
        } catch (err) {
            application.fatal(res, err);
        }
    });

}