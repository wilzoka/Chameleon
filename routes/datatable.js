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
            json = JSON.parse(modelattributes[i].typeadd);
        }

        let m;
        let v;

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
                        m = moment(registers.rows[x][modelattributes[i].name], 'YYYY-MM-DD');
                        value = m.format('DD/MM/YYYY');
                        registers.rows[x][modelattributes[i].name] = value;
                    }
                }
                break;
            case 'datetime':
                for (var x = 0; x < registers.rows.length; x++) {
                    if (registers.rows[x][modelattributes[i].name]) {
                        m = moment(registers.rows[x][modelattributes[i].name], 'YYYY-MM-DD HH:mm');
                        value = m.format('DD/MM/YYYY HH:mm');
                        registers.rows[x][modelattributes[i].name] = value;
                    }
                }
                break;
            case 'decimal':
                for (var x = 0; x < registers.rows.length; x++) {
                    if (registers.rows[x][modelattributes[i].name]) {
                        v = registers.rows[x][modelattributes[i].name];
                        v = parseFloat(v);

                        var reg = '\\d(?=(\\d{3})+\\D)';
                        v = v.toFixed(json.precision).replace('.', ',').replace(new RegExp(reg, 'g'), '$&.');

                        registers.rows[x][modelattributes[i].name] = v;
                    }
                }
                break;
        }

    }

    return registers;
}

var getFilter = function (cookie) {
    var obj = {};

    cookie = JSON.parse(cookie);

    let m;
    let v;

    for (var i = 0; i < cookie.length; i++) {

        for (var k in cookie[i]) {

            var field = k.split('.');

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

    app.get('/datatables', application.IsAuthenticated, function (req, res) {

        db.getModel('view').find({ where: { id: req.query.view }, include: { all: true } }).then(view => {

            db.getModel('modelattribute').findAll({ where: { idmodel: view.model.id } }).then(modelattributes => {

                var where = {};

                if (view.wherefixed) {
                    where['$col'] = db.Sequelize.literal(view.wherefixed.replace(/\$user/g, req.user.id));
                }
                if ('tableview' + view.id + 'filter' in req.cookies) {
                    where['$and'] = getFilter(req.cookies['tableview' + view.id + 'filter']);
                }

                var ordercolumn = req.query.columns[req.query.order[0].column].data;
                var orderdir = req.query.order[0].dir;
                for (var i = 0; i < modelattributes.length; i++) {
                    if (modelattributes[i].name == ordercolumn && modelattributes[i].type == 'autocomplete') {
                        let json = JSON.parse(modelattributes[i].typeadd);
                        let vas = json.as || json.model;
                        ordercolumn = db.Sequelize.literal(vas + '.' + json.attribute);
                    }
                }

                if (req.query.subview == 'true') {

                    db.getModel('modelattribute').find({
                        where: { idmodel: view.model.id, type: 'parent' }
                    }).then(modelattributeparent => {

                        where[modelattributeparent.name] = req.query.id;

                        db.getModel(view.model.name).findAndCountAll({
                            offset: req.query.start
                            , limit: req.query.length
                            , raw: true
                            , include: [{ all: true, nested: true }]
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
                        offset: req.query.start
                        , limit: req.query.length
                        , raw: true
                        , include: [{ all: true }]
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

    app.get('/datatables/sum', application.IsAuthenticated, function (req, res) {

        db.getModel('view').find({ where: { id: req.query.idview }, include: { all: true } }).then(view => {

            db.getModel('modelattribute').find({ where: { id: req.query.idmodelattribute }, include: { all: true } }).then(modelattribute => {

                var where = {};

                if (view.wherefixed) {
                    where['$col'] = db.Sequelize.literal(view.wherefixed.replace(/\$user/g, req.user.id));
                }
                if ('tableview' + view.id + 'filter' in req.cookies) {
                    where['$and'] = getFilter(req.cookies['tableview' + view.id + 'filter']);
                }

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

            });

        });

    });

}