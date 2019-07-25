const application = require('./application')
    , db = require('../models')
    , moment = require('moment')
    , platform = require('../custom/platform')
    ;

const fixResults = function (registers, viewtables) {
    for (let i = 0; i < viewtables.length; i++) {
        let ma = viewtables[i].modelattribute;
        let j = application.modelattribute.parseTypeadd(ma.typeadd);
        switch (j.type || ma.type) {
            case 'text':
                for (let x = 0; x < registers.rows.length; x++) {
                    if (registers.rows[x][ma.name]) {
                        registers.rows[x][ma.name] = application.formatters.fe.text(registers.rows[x][ma.name], viewtables[i].charlimit);
                    }
                }
                break;
            case 'textarea':
                for (let x = 0; x < registers.rows.length; x++) {
                    if (registers.rows[x][ma.name]) {
                        registers.rows[x][ma.name] = application.formatters.fe.text(registers.rows[x][ma.name], viewtables[i].charlimit);
                    }
                }
                break;
            case 'autocomplete':
                let vas = j.as || j.model;
                for (let x = 0; x < registers.rows.length; x++) {
                    if (registers.rows[x][ma.name]) {
                        if (j.attribute && registers.rows[x][vas + '.' + j.attribute]) {
                            registers.rows[x][ma.name] = application.formatters.fe.text(registers.rows[x][vas + '.' + j.attribute], viewtables[i].charlimit);
                        } else {
                            registers.rows[x][ma.name] = application.formatters.fe.text(registers.rows[x][ma.name], viewtables[i].charlimit);
                        }
                    }
                }
                break;
            case 'date':
                for (let x = 0; x < registers.rows.length; x++) {
                    if (registers.rows[x][ma.name]) {
                        registers.rows[x][ma.name] = application.formatters.fe.date(registers.rows[x][ma.name]);
                    }
                }
                break;
            case 'datetime':
                for (let x = 0; x < registers.rows.length; x++) {
                    if (registers.rows[x][ma.name]) {
                        registers.rows[x][ma.name] = application.formatters.fe.datetime(registers.rows[x][ma.name]);
                    }
                }
                break;
            case 'decimal':
                for (let x = 0; x < registers.rows.length; x++) {
                    if (registers.rows[x][ma.name]) {
                        registers.rows[x][ma.name] = application.formatters.fe.decimal(registers.rows[x][ma.name], j.precision);
                    }
                }
                break;
            case 'time':
                for (let x = 0; x < registers.rows.length; x++) {
                    if (registers.rows[x][ma.name] != null) {
                        registers.rows[x][ma.name] = application.formatters.fe.time(registers.rows[x][ma.name]);
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

module.exports = function (app) {

    app.post('/datatables', application.IsAuthenticated, async (req, res) => {
        try {
            const view = await db.getModel('view').findOne({ where: { url: req.body.view }, include: [{ all: true }] });
            const viewtables = await db.getModel('viewtable').findAll({ where: { idview: view.id }, include: [{ all: true }] });
            const modelattributes = await db.getModel('modelattribute').findAll({ where: { idmodel: view.model.id } });
            let where = {};
            if (view.wherefixed) {
                Object.assign(where, { [db.Op.col]: db.Sequelize.literal(`(${view.wherefixed.replace(/\$user/g, req.user.id).replace(/\$id/g, req.body.id)})`) });
            }
            Object.assign(where, await platform.view.f_getFilter(req, view));
            let ordercolumn = view.orderfixed ? view.orderfixed.split(',')[0] : req.body.columns[req.body.order[0].column].data || 'id';
            let orderdir = view.orderfixed ? view.orderfixed.split(',')[1] : req.body.order[0].dir || 'desc';
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
                        attributes.push([db.Sequelize.literal(j.subquery.replace(/\$user/g, req.user.id)), modelattributes[i].name]);
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
            let registers = await db.getModel(view.model.name).findAndCountAll(Object.assign({}, pagination, {
                attributes: attributes
                , raw: true
                , include: [{ all: true }]
                , where: where
                , order: [[ordercolumn, orderdir], ['id', orderdir]]
            }));
            registers = fixResults(registers, viewtables);
            return application.success(res, {
                recordsTotal: registers.count
                , recordsFiltered: registers.count
                , data: registers.rows
                , table: req.body.table
            });
        } catch (err) {
            return application.fatal(res, err);
        }
    });

    app.post('/datatables/sum', application.IsAuthenticated, async (req, res) => {
        try {
            const view = await db.getModel('view').findOne({ where: { url: req.body.view }, include: [{ all: true }] });
            let modelattribute = await db.getModel('modelattribute').findOne({ where: { id: req.body.idmodelattribute }, include: [{ all: true }] });
            let where = {};
            if (view.wherefixed) {
                Object.assign(where, { [db.Op.col]: db.Sequelize.literal(`(${view.wherefixed.replace(/\$user/g, req.user.id).replace(/\$id/g, req.body.id)})`) });
            }
            Object.assign(where, await platform.view.f_getFilter(req, view));
            if (req.body.issubview == 'true') {
                let modelattributeparent = await db.getModel('modelattribute').findOne({
                    where: { idmodel: view.model.id, type: 'parent' }
                });
                if (modelattributeparent) {
                    where[modelattributeparent.name] = req.body.id;
                }
            }
            let register = await db.getModel(view.model.name).findOne({
                raw: true
                , attributes: [
                    [db.Sequelize.literal('sum(' + (modelattribute.type == 'virtual' ? application.modelattribute.parseTypeadd(modelattribute.typeadd).subquery : view.model.name + '.' + modelattribute.name) + ')'), 'sum']
                ]
                , include: [{ all: true, attributes: [] }]
                , where: where
            });
            if (register.sum) {
                let j = application.modelattribute.parseTypeadd(modelattribute.typeadd);
                switch (j.type || modelattribute.type) {
                    case 'decimal':
                        register.sum = application.formatters.fe.decimal(register.sum, application.modelattribute.parseTypeadd(modelattribute.typeadd).precision);
                        break;
                    case 'time':
                        register.sum = application.formatters.fe.time(register.sum);
                        break;
                }
            }
            return application.success(res, { data: register.sum, view: req.body.view, attribute: req.body.idmodelattribute });
        } catch (err) {
            return application.fatal(res, err);
        }
    });

}