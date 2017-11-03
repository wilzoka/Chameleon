var application = require('./application')
    , db = require('../models')
    , moment = require('moment')
    , lodash = require('lodash')
    ;

var fixResults = function (registers, modelattributes) {

    for (let i = 0; i < registers.rows.length; i++) {
        registers.rows[i]['DT_RowId'] = registers.rows[i].id;
    }

    let json = {};
    for (let i = 0; i < modelattributes.length; i++) {

        if (modelattributes[i].typeadd) {
            json = application.modelattribute.parseTypeadd(modelattributes[i].typeadd);
        }

        switch (modelattributes[i].type) {
            case 'autocomplete':
                let vas = json.as || json.model;
                for (let x = 0; x < registers.rows.length; x++) {
                    if (registers.rows[x][modelattributes[i].name]) {
                        registers.rows[x][modelattributes[i].name] = registers.rows[x][vas + '.' + json.attribute];
                    }
                }
                break;
            case 'date':
                for (let x = 0; x < registers.rows.length; x++) {
                    if (registers.rows[x][modelattributes[i].name]) {
                        registers.rows[x][modelattributes[i].name] = application.formatters.fe.date(registers.rows[x][modelattributes[i].name]);
                    }
                }
                break;
            case 'datetime':
                for (let x = 0; x < registers.rows.length; x++) {
                    if (registers.rows[x][modelattributes[i].name]) {
                        registers.rows[x][modelattributes[i].name] = application.formatters.fe.datetime(registers.rows[x][modelattributes[i].name]);
                    }
                }
                break;
            case 'decimal':
                for (let x = 0; x < registers.rows.length; x++) {
                    if (registers.rows[x][modelattributes[i].name]) {
                        registers.rows[x][modelattributes[i].name] = application.formatters.fe.decimal(registers.rows[x][modelattributes[i].name], json.precision);
                    }
                }
                break;
            case 'time':
                for (let x = 0; x < registers.rows.length; x++) {
                    if (registers.rows[x][modelattributes[i].name]) {
                        registers.rows[x][modelattributes[i].name] = application.formatters.fe.time(registers.rows[x][modelattributes[i].name]);
                    }
                }
                break;
        }

    }

    // for (let i = 0; i < registers.rows.length; i++) {
    //     for (var k in registers.rows[i]) {
    //         if (k.indexOf('.') >= 0) {
    //             delete registers.rows[i][k];
    //         }
    //     }
    // }

    return registers;
}

var getFilter = function (cookie, modelattributes) {
    var obj = {};

    cookie = JSON.parse(cookie);

    let m;
    let v;

    for (let i = 0; i < cookie.length; i++) {

        for (let k in cookie[i]) {

            let field = k.split('+');

            switch (field[1]) {
                case 'date':
                    m = moment(cookie[i][k], 'DD/MM/YYYY');
                    cookie[i][k] = m.format('YYYY-MM-DD');
                    break;
                case 'datetime':
                    m = moment(cookie[i][k], 'DD/MM/YYYY HH:mm');
                    cookie[i][k] = m.format('YYYY-MM-DD HH:mm');
                    break;
                case 'time':
                    cookie[i][k] = application.formatters.be.time(cookie[i][k]);
                    break;
                case 'text':
                    cookie[i][k] = '%' + cookie[i][k] + '%';
                    break;
                case 'decimal':
                    v = cookie[i][k];
                    v = v.replace(/\./g, "");
                    v = v.replace(/\,/g, ".");
                    let precision = v.split('.')[1].length;
                    v = parseFloat(v).toFixed(precision);
                    cookie[i][k] = v;
                    break;
            }

            let o = {};
            switch (field[2]) {
                case 's':
                    o['$iLike'] = cookie[i][k];
                    break;
                case 'b':
                    o['$gte'] = cookie[i][k];
                    break;
                case 'e':
                    o['$lte'] = cookie[i][k];
                    break;
                case 'i':
                    o['$in'] = cookie[i][k].val;
                    break;
                case 'r':
                    o['$eq'] = cookie[i][k];
                    break;

                // Virtuals
                case 'rv':
                    for (let z = 0; z < modelattributes.length; z++) {
                        if (field[0] == modelattributes[z].name) {
                            o = db.Sequelize.literal(application.modelattribute.parseTypeadd(modelattributes[z].typeadd).subquery + " = " + cookie[i][k]);
                        }
                    }
                    break;
                case 'sv':
                    for (let z = 0; z < modelattributes.length; z++) {
                        if (field[0] == modelattributes[z].name) {
                            o = db.Sequelize.literal(application.modelattribute.parseTypeadd(modelattributes[z].typeadd).subquery + "::text ilike '" + cookie[i][k] + "'");
                        }
                    }
                    break;
                case 'bv':
                    for (let z = 0; z < modelattributes.length; z++) {
                        if (field[0] == modelattributes[z].name) {
                            o = db.Sequelize.literal(application.modelattribute.parseTypeadd(modelattributes[z].typeadd).subquery + " >= " + cookie[i][k]);
                        }
                    }
                    break;
                case 'ev':
                    for (let z = 0; z < modelattributes.length; z++) {
                        if (field[0] == modelattributes[z].name) {
                            o = db.Sequelize.literal(application.modelattribute.parseTypeadd(modelattributes[z].typeadd).subquery + " <= " + cookie[i][k]);
                        }
                    }
                    break;
            }

            if (o && obj[field[0]]) {
                obj[field[0]] = lodash.extend(obj[field[0]], o);
            } else if (o) {
                obj[field[0]] = o;
            }

        }

    }

    return obj;
}

module.exports = function (app) {

    app.post('/datatables', application.IsAuthenticated, async (req, res) => {
        try {

            let view = await db.getModel('view').find({ where: { id: req.body.idview }, include: [{ all: true }] });
            let modelattributes = await db.getModel('modelattribute').findAll({ where: { idmodel: view.model.id } });

            var where = {};
            if (view.wherefixed) {
                view.wherefixed = view.wherefixed.replace(/\$user/g, req.user.id);
                view.wherefixed = view.wherefixed.replace(/\$id/g, req.body.id);
                where['$col'] = db.Sequelize.literal(view.wherefixed);
            }
            if ('tableview' + view.id + 'filter' in req.cookies) {
                where['$and'] = getFilter(req.cookies['tableview' + view.id + 'filter'], modelattributes);
            }

            var ordercolumn = req.body.columns[req.body.order[0].column].data;
            var orderdir = req.body.order[0].dir;

            let attributes = ['id'];
            for (var i = 0; i < modelattributes.length; i++) {

                switch (modelattributes[i].type) {
                    case 'parent':
                        if (req.body.issubview == 'true') {
                            where[modelattributes[i].name] = req.body.id;
                        }
                        attributes.push(modelattributes[i].name);
                        break;
                    case 'virtual':
                        attributes.push([db.Sequelize.literal(application.modelattribute.parseTypeadd(modelattributes[i].typeadd).subquery), modelattributes[i].name]);
                        break;
                    default:
                        attributes.push(modelattributes[i].name);
                        break;
                }

                // Order
                if (modelattributes[i].name == ordercolumn) {
                    switch (modelattributes[i].type) {
                        case 'autocomplete':
                            let json = application.modelattribute.parseTypeadd(modelattributes[i].typeadd);
                            let vas = json.as || json.model;
                            ordercolumn = db.Sequelize.literal(vas + '.' + json.attribute);
                            break;
                        case 'virtual':
                            ordercolumn = db.Sequelize.literal(modelattributes[i].name);
                            break;
                    }
                }
            }

            let registers = await db.getModel(view.model.name).findAndCountAll({
                attributes: attributes
                , raw: true
                , include: [{ all: true }]
                , where: where
                , order: [[ordercolumn, orderdir]]
                , limit: req.body.length
                , offset: req.body.start
            });

            registers = fixResults(registers, modelattributes);

            return application.success(res, {
                recordsTotal: registers.count,
                recordsFiltered: registers.count,
                data: registers.rows
            });

        } catch (err) {
            return application.fatal(res, err);
        }
    });

    app.post('/datatables/sum', application.IsAuthenticated, async (req, res) => {
        try {

            let view = await db.getModel('view').find({ where: { id: req.body.idview }, include: [{ all: true }] });
            let modelattributes = await db.getModel('modelattribute').findAll({ where: { idmodel: view.model.id } });
            let modelattribute = await db.getModel('modelattribute').find({ where: { id: req.body.idmodelattribute }, include: [{ all: true }] });

            var where = {};

            if (view.wherefixed) {
                view.wherefixed = view.wherefixed.replace(/\$user/g, req.user.id);
                view.wherefixed = view.wherefixed.replace(/\$id/g, req.body.id);
                where['$col'] = db.Sequelize.literal(view.wherefixed);
            }
            if ('tableview' + view.id + 'filter' in req.cookies) {
                where['$and'] = getFilter(req.cookies['tableview' + view.id + 'filter'], modelattributes);
            }

            if (req.body.issubview == 'true') {
                let modelattributeparent = await db.getModel('modelattribute').find({
                    where: { idmodel: view.model.id, type: 'parent' }
                });
                if (modelattributeparent) {
                    where[modelattributeparent.name] = req.body.id;
                }
            }

            let register = await db.getModel(view.model.name).find({
                raw: true
                , attributes: [
                    [db.Sequelize.literal('sum(' + (modelattribute.type == 'virtual' ? application.modelattribute.parseTypeadd(modelattribute.typeadd).subquery : view.model.name + '.' + modelattribute.name) + ')'), 'sum']
                ]
                , include: [{ all: true, attributes: [] }]
                , where: where
            });

            if (register.sum) {
                switch (modelattribute.type) {
                    case 'decimal':
                        register.sum = application.formatters.fe.decimal(register.sum, application.modelattribute.parseTypeadd(modelattribute.typeadd).precision);
                        break;
                    case 'time':
                        register.sum = application.formatters.fe.time(register.sum);
                        break;
                }
            }

            return application.success(res, { data: register.sum });

        } catch (err) {
            return application.fatal(res, err);
        }
    });

}