const application = require('./application')
    , db = require('../models')
    , moment = require('moment')
    , lodash = require('lodash')
    ;

const fixResults = function (registers, modelattributes, viewtables) {
    let j = {};
    for (let i = 0; i < modelattributes.length; i++) {
        if (modelattributes[i].typeadd) {
            j = application.modelattribute.parseTypeadd(modelattributes[i].typeadd);
        }
        switch (j.type || modelattributes[i].type) {
            case 'autocomplete':
                let vas = j.as || j.model;
                for (let x = 0; x < registers.rows.length; x++) {
                    if (registers.rows[x][modelattributes[i].name]) {
                        if (j.attribute && registers.rows[x][vas + '.' + j.attribute]) {
                            registers.rows[x][modelattributes[i].name] = registers.rows[x][vas + '.' + j.attribute];
                        }
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
                        registers.rows[x][modelattributes[i].name] = application.formatters.fe.decimal(registers.rows[x][modelattributes[i].name], j.precision);
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
    let keys = ['id'];
    for (let i = 0; i < viewtables.length; i++) {
        keys.push(viewtables[i].modelattribute.name);
    }
    for (let i = 0; i < registers.rows.length; i++) {
        for (let k in registers.rows[i]) {
            if (keys.indexOf(k) < 0) {
                delete registers.rows[i][k];
            }
        }
    }
    return registers;
}
const getFilter = function (cookie, modelattributes) {
    let obj = {};
    cookie = JSON.parse(cookie);
    let m;
    let v;
    let f;
    for (let i = 0; i < cookie.length; i++) {
        for (let k in cookie[i]) {
            let field = k.split('+');
            switch (field[1]) {
                case 'date':
                    m = moment(cookie[i][k], application.formatters.fe.date_format);
                    cookie[i][k] = m.format(application.formatters.be.date_format);
                    break;
                case 'datetime':
                    m = moment(cookie[i][k], application.formatters.fe.datetime_format);
                    cookie[i][k] = m.format(application.formatters.be.datetime_format + (field[2] == 'b' ? ':00' : ':59'));
                    break;
                case 'time':
                    cookie[i][k] = application.formatters.be.time(cookie[i][k]);
                    break;
                case 'text':
                    cookie[i][k] = '%' + cookie[i][k] + '%';
                    break;
                case 'textarea':
                    cookie[i][k] = '%' + cookie[i][k] + '%';
                    break;
                case 'decimal':
                    cookie[i][k] = application.formatters.be.decimal(cookie[i][k]);
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
                            f = application.modelattribute.parseTypeadd(modelattributes[z].typeadd).field;
                            if (f && f.indexOf('$value') > 0) {
                                o = db.Sequelize.literal(application.modelattribute.parseTypeadd(modelattributes[z].typeadd).field.replace('$value', cookie[i][k]));
                            } else {
                                o = db.Sequelize.literal(application.modelattribute.parseTypeadd(modelattributes[z].typeadd).subquery + " = " + cookie[i][k]);
                            }
                        }
                    }
                    break;
                case 'sv':
                    for (let z = 0; z < modelattributes.length; z++) {
                        if (field[0] == modelattributes[z].name) {
                            f = application.modelattribute.parseTypeadd(modelattributes[z].typeadd).field;
                            if (f && f.indexOf('$value') > 0) {
                                o = db.Sequelize.literal(application.modelattribute.parseTypeadd(modelattributes[z].typeadd).field.replace('$value', cookie[i][k]));
                            } else {
                                o = db.Sequelize.literal(application.modelattribute.parseTypeadd(modelattributes[z].typeadd).subquery + "::text ilike '" + cookie[i][k] + "'");
                            }
                        }
                    }
                    break;
                case 'bv':
                    for (let z = 0; z < modelattributes.length; z++) {
                        if (field[0] == modelattributes[z].name) {
                            f = application.modelattribute.parseTypeadd(modelattributes[z].typeadd).field;
                            if (f && f.indexOf('$value') > 0) {
                                o = db.Sequelize.literal(application.modelattribute.parseTypeadd(modelattributes[z].typeadd).field.replace('$value', cookie[i][k]));
                            } else {
                                o = db.Sequelize.literal(application.modelattribute.parseTypeadd(modelattributes[z].typeadd).subquery + "::decimal >= " + cookie[i][k]);
                            }
                        }
                    }
                    break;
                case 'ev':
                    for (let z = 0; z < modelattributes.length; z++) {
                        if (field[0] == modelattributes[z].name) {
                            f = application.modelattribute.parseTypeadd(modelattributes[z].typeadd).field;
                            if (f && f.indexOf('$value') > 0) {
                                o = db.Sequelize.literal(application.modelattribute.parseTypeadd(modelattributes[z].typeadd).field.replace('$value', cookie[i][k]));
                            } else {
                                o = db.Sequelize.literal(application.modelattribute.parseTypeadd(modelattributes[z].typeadd).subquery + "::decimal <= " + cookie[i][k]);
                            }
                        }
                    }
                    break;
                case 'iv':
                    for (let z = 0; z < modelattributes.length; z++) {
                        if (field[0] == modelattributes[z].name) {
                            f = application.modelattribute.parseTypeadd(modelattributes[z].typeadd).field;
                            if (f && f.indexOf('$value') > 0) {
                                o = db.Sequelize.literal(application.modelattribute.parseTypeadd(modelattributes[z].typeadd).field.replace('$value', cookie[i][k].val));
                            } else {
                                o = db.Sequelize.literal(application.modelattribute.parseTypeadd(modelattributes[z].typeadd).field + ' in (' + cookie[i][k].val + ')');
                            }
                        }
                    }
                    break;
            }
            if (o && obj[field[0]]) {
                if (obj[field[0]] && 'val' in obj[field[0]]) {//Virtual concatenation
                    obj[field[0]].val += ' and ' + o.val;
                } else {
                    obj[field[0]] = lodash.extend(obj[field[0]], o);
                }
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
            const view = await db.getModel('view').find({ where: { url: req.body.view }, include: [{ all: true }] });
            const viewtables = await db.getModel('viewtable').findAll({ where: { idview: view.id }, include: [{ all: true }] });
            const modelattributes = await db.getModel('modelattribute').findAll({ where: { idmodel: view.model.id } });
            let where = { '$and': {} };
            if (view.wherefixed) {
                view.wherefixed = view.wherefixed.replace(/\$user/g, req.user.id).replace(/\$id/g, req.body.id);
                where['$col'] = db.Sequelize.literal(view.wherefixed);
            }
            if ('tableview' + view.url + 'filter' in req.cookies) {
                where['$and'] = getFilter(req.cookies['tableview' + view.url + 'filter'], modelattributes);
            }
            if (view.idfastsearch && req.body.search.value) {
                let j = application.modelattribute.parseTypeadd(view.fastsearch.typeadd);
                switch (view.fastsearch.type) {
                    case 'autocomplete':
                        if (j.query) {
                            where['$and'][view.fastsearch.name] = db.Sequelize.literal(j.query + "::text ilike '%" + req.body.search.value + "%'");
                        } else {
                            where['$and'][view.fastsearch.name] = db.Sequelize.literal((j.as || j.model) + '.' + j.attribute + "::text ilike '%" + req.body.search.value + "%'");
                        }
                        break;
                    case 'virtual':
                        where['$and'][view.fastsearch.name] = db.Sequelize.literal(j.subquery + "::text ilike '%" + req.body.search.value + "%'");
                        break;
                    default:
                        where['$and'][view.fastsearch.name] = db.Sequelize.literal(view.model.name + '.' + view.fastsearch.name + "::text ilike '%" + req.body.search.value + "%'");
                        break;
                }
            }
            let ordercolumn = view.orderfixed ? view.orderfixed.split(',')[0] : req.body.columns[req.body.order[0].column].data;
            let orderdir = view.orderfixed ? view.orderfixed.split(',')[1] : req.body.order[0].dir;
            let attributes = ['id'];
            for (let i = 0; i < modelattributes.length; i++) {
                let j = application.modelattribute.parseTypeadd(modelattributes[i].typeadd);
                switch (modelattributes[i].type) {
                    case 'parent':
                        if (req.body.issubview == 'true') {
                            where[modelattributes[i].name] = req.body.id;
                        }
                        attributes.push(modelattributes[i].name);
                        break;
                    case 'autocomplete':
                        if (j.query) {
                            attributes.push([db.Sequelize.literal(j.query), modelattributes[i].name]);
                        } else {
                            attributes.push(modelattributes[i].name);
                        }
                        break;
                    case 'virtual':
                        attributes.push([db.Sequelize.literal(j.subquery), modelattributes[i].name]);
                        break;
                    default:
                        attributes.push(modelattributes[i].name);
                        break;
                }
                // Order
                if (modelattributes[i].name == ordercolumn) {
                    switch (modelattributes[i].type) {
                        case 'autocomplete':
                            if (j.query) {
                                ordercolumn = db.Sequelize.literal(j.query);
                            } else {
                                let vas = j.as || j.model;
                                ordercolumn = db.Sequelize.literal(vas + '.' + j.attribute);
                            }
                            break;
                        case 'virtual':
                            ordercolumn = db.Sequelize.literal(modelattributes[i].name);
                            break;
                    }
                }
            }
            let pagination = {};
            if (req.body.length > 0) {
                pagination = {
                    limit: req.body.length
                    , offset: req.body.start
                }
            }
            let registers = await db.getModel(view.model.name).findAndCountAll(lodash.extend(pagination, {
                attributes: attributes
                , raw: true
                , include: [{ all: true }]
                , where: where
                , order: [[ordercolumn, orderdir], ['id', orderdir]]
            }));
            registers = fixResults(registers, modelattributes, viewtables);
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
            const view = await db.getModel('view').find({ where: { url: req.body.view }, include: [{ all: true }] });
            let modelattributes = await db.getModel('modelattribute').findAll({ where: { idmodel: view.model.id } });
            let modelattribute = await db.getModel('modelattribute').find({ where: { id: req.body.idmodelattribute }, include: [{ all: true }] });

            let where = {};

            if (view.wherefixed) {
                view.wherefixed = view.wherefixed.replace(/\$user/g, req.user.id);
                view.wherefixed = view.wherefixed.replace(/\$id/g, req.body.id);
                where['$col'] = db.Sequelize.literal(view.wherefixed);
            }
            if ('tableview' + view.url + 'filter' in req.cookies) {
                where['$and'] = getFilter(req.cookies['tableview' + view.url + 'filter'], modelattributes);
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
                    case 'virtual':
                        switch (application.modelattribute.parseTypeadd(modelattribute.typeadd).type) {
                            case 'decimal':
                                register.sum = application.formatters.fe.decimal(register.sum, application.modelattribute.parseTypeadd(modelattribute.typeadd).precision);
                                break;
                        }
                        break;
                }
            }

            return application.success(res, { data: register.sum });

        } catch (err) {
            return application.fatal(res, err);
        }
    });

}