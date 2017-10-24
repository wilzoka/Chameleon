var application = require('./application')
    , db = require('../models')
    , moment = require('moment')
    , lodash = require('lodash')
    ;

var fixResults = function (registers, modelattributes) {

    for (var i = 0; i < registers.rows.length; i++) {
        registers.rows[i]['DT_RowId'] = registers.rows[i].id;
    }

    var json;
    for (var i = 0; i < modelattributes.length; i++) {

        if (modelattributes[i].typeadd) {
            json = application.modelattribute.parseTypeadd(modelattributes[i].typeadd);
        }

        switch (modelattributes[i].type) {
            case 'autocomplete':
                let vas = json.as || json.model;
                for (var x = 0; x < registers.rows.length; x++) {
                    if (registers.rows[x][modelattributes[i].name]) {
                        registers.rows[x][modelattributes[i].name] = registers.rows[x][vas + '.' + json.attribute];
                    }
                }
                break;
            case 'date':
                for (var x = 0; x < registers.rows.length; x++) {
                    if (registers.rows[x][modelattributes[i].name]) {
                        registers.rows[x][modelattributes[i].name] = application.formatters.fe.date(registers.rows[x][modelattributes[i].name]);
                    }
                }
                break;
            case 'datetime':
                for (var x = 0; x < registers.rows.length; x++) {
                    if (registers.rows[x][modelattributes[i].name]) {
                        registers.rows[x][modelattributes[i].name] = application.formatters.fe.datetime(registers.rows[x][modelattributes[i].name]);
                    }
                }
                break;
            case 'decimal':
                for (var x = 0; x < registers.rows.length; x++) {
                    if (registers.rows[x][modelattributes[i].name]) {
                        registers.rows[x][modelattributes[i].name] = application.formatters.fe.decimal(registers.rows[x][modelattributes[i].name], json.precision);
                    }
                }
                break;
            case 'time':
                for (var x = 0; x < registers.rows.length; x++) {
                    if (registers.rows[x][modelattributes[i].name]) {
                        registers.rows[x][modelattributes[i].name] = application.formatters.fe.time(registers.rows[x][modelattributes[i].name]);
                    }
                }
                break;
            case 'virtual':
                for (var x = 0; x < registers.rows.length; x++) {
                    registers.rows[x][modelattributes[i].name] = registers.rows[x][json.field];
                }
                break;
        }

    }

    return registers;
}

var getFilter = function (cookie) {
    var obj = {};

    var getVirtualField = function (value) {
        value = value.split('.');
        var last = value[value.length - 1];
        value.splice(value.length - 1, 1);
        return '"' + value.join('->') + '"."' + last + '"';
    }

    cookie = JSON.parse(cookie);

    let m;
    let v;

    for (var i = 0; i < cookie.length; i++) {

        for (var k in cookie[i]) {

            var field = k.split('+');

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

            var o = {};
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
                    o = db.Sequelize.literal(getVirtualField(field[0]) + " = " + cookie[i][k]);
                    break;
                case 'sv':
                    o = db.Sequelize.literal(getVirtualField(field[0]) + "::text ilike '%" + cookie[i][k] + "%'");
                    break;
                case 'bv':
                    o = db.Sequelize.literal(getVirtualField(field[0]) + " >= " + cookie[i][k]);
                    break;
                case 'ev':
                    o = db.Sequelize.literal(getVirtualField(field[0]) + " <= " + cookie[i][k]);
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

var replaceWhereFixed = function (value) {

}

module.exports = function (app) {

    app.post('/datatables', application.IsAuthenticated, function (req, res) {

        db.getModel('view').find({ where: { id: req.body.idview }, include: { all: true } }).then(view => {

            db.getModel('modelattribute').findAll({ where: { idmodel: view.model.id } }).then(modelattributes => {

                var where = {};

                if (view.wherefixed) {
                    view.wherefixed = view.wherefixed.replace(/\$user/g, req.user.id);
                    view.wherefixed = view.wherefixed.replace(/\$id/g, req.body.id);
                    where['$col'] = db.Sequelize.literal(view.wherefixed);
                }
                if ('tableview' + view.id + 'filter' in req.cookies) {
                    where['$and'] = getFilter(req.cookies['tableview' + view.id + 'filter']);
                }

                var ordercolumn = req.body.columns[req.body.order[0].column].data;
                var orderdir = req.body.order[0].dir;
                for (var i = 0; i < modelattributes.length; i++) {
                    if (modelattributes[i].name == ordercolumn && modelattributes[i].type == 'autocomplete') {
                        let json = application.modelattribute.parseTypeadd(modelattributes[i].typeadd);
                        let vas = json.as || json.model;
                        ordercolumn = db.Sequelize.literal(vas + '.' + json.attribute);
                    }
                }

                if (req.body.issubview == 'true') {

                    db.getModel('modelattribute').find({
                        where: { idmodel: view.model.id, type: 'parent' }
                    }).then(modelattributeparent => {

                        if (modelattributeparent) {
                            where[modelattributeparent.name] = req.body.id;
                        }

                        db.getModel(view.model.name).findAndCountAll({
                            offset: req.body.start
                            , limit: req.body.length
                            , raw: true
                            , include: [{ all: true, nested: view.virtual }]
                            , where: where
                            , order: [[ordercolumn, orderdir]]
                        }).then(registers => {

                            registers = fixResults(registers, modelattributes);

                            return application.success(res, {
                                recordsTotal: registers.count,
                                recordsFiltered: registers.count,
                                data: registers.rows
                            });

                        }).catch(err => {
                            return application.fatal(res, err);
                        });

                    }).catch(err => {
                        return application.fatal(res, err);
                    });

                } else {

                    db.getModel(view.model.name).findAndCountAll({
                        offset: req.body.start
                        , limit: req.body.length
                        , raw: true
                        , include: [{ all: true, nested: view.virtual }]
                        , where: where
                        , order: [[ordercolumn, orderdir]]
                    }).then(registers => {

                        registers = fixResults(registers, modelattributes);

                        return application.success(res, {
                            recordsTotal: registers.count,
                            recordsFiltered: registers.count,
                            data: registers.rows
                        });

                    }).catch(err => {
                        return application.fatal(res, err);
                    });

                }

            }).catch(err => {
                return application.fatal(res, err);
            });

        }).catch(err => {
            return application.fatal(res, err);
        });

    });

    app.post('/datatables/sum', application.IsAuthenticated, function (req, res) {

        db.getModel('view').find({ where: { id: req.body.idview }, include: { all: true } }).then(view => {

            db.getModel('modelattribute').find({ where: { id: req.body.idmodelattribute }, include: { all: true } }).then(modelattribute => {

                var where = {};

                if (view.wherefixed) {
                    view.wherefixed = view.wherefixed.replace(/\$user/g, req.user.id);
                    view.wherefixed = view.wherefixed.replace(/\$id/g, req.body.id);
                    where['$col'] = db.Sequelize.literal(view.wherefixed);
                }
                if ('tableview' + view.id + 'filter' in req.cookies) {
                    where['$and'] = getFilter(req.cookies['tableview' + view.id + 'filter']);
                }

                if (req.body.issubview == 'true') {

                    db.getModel('modelattribute').find({
                        where: { idmodel: view.model.id, type: 'parent' }
                    }).then(modelattributeparent => {

                        if (modelattributeparent) {
                            where[modelattributeparent.name] = req.body.id;
                        }

                        db.getModel(view.model.name).sum(modelattribute.name, { where: where }).then(sum => {

                            if (sum) {
                                switch (modelattribute.type) {
                                    case 'decimal':
                                        sum = application.formatters.fe.decimal(sum, application.modelattribute.parseTypeadd(modelattribute.typeadd).precision);
                                        break;
                                    case 'time':
                                        sum = application.formatters.fe.time(sum);
                                        break;
                                }
                            }

                            return application.success(res, { data: sum });

                        }).catch(err => {
                            return application.fatal(res, err);
                        });

                    });


                } else {

                    db.getModel(view.model.name).sum(modelattribute.name, { where: where }).then(sum => {

                        if (sum) {
                            switch (modelattribute.type) {
                                case 'decimal':
                                    sum = application.formatters.fe.decimal(sum, JSON.parse(modelattribute.typeadd).precision);
                                    break;
                            }
                        }

                        return application.success(res, { data: sum });

                    }).catch(err => {
                        return application.fatal(res, err);
                    });

                }

            });

        });

    });

}