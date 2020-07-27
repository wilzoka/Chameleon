const application = require('./application')
    , db = require('../models')
    , platform = require('../custom/platform')
    , moment = require('moment')
    ;

module.exports = function (app) {

    app.post('/datasource', application.IsAuthenticated, async (req, res) => {
        try {
            const view = await db.getModel('view').findOne({ where: { url: req.body.view || null }, include: [{ all: true }] });
            if (!view)
                return application.error(res, {});
            const bodyID = req.body.id || 0;
            if (view.type == 'Calendar') {
                const j = application.modelattribute.parseTypeadd(view.add);
                const start = await db.getModel('modelattribute').findOne({ where: { idmodel: view.model.id, name: j.attribute_start } });
                const end = j.attribute_end ? await db.getModel('modelattribute').findOne({ where: { idmodel: view.model.id, name: j.attribute_end } }) : null;
                let where = {};
                if (view.wherefixed) {
                    Object.assign(where, { [db.Op.col]: db.Sequelize.literal(`(${view.wherefixed.replace(/\$user/g, req.user.id).replace(/\$id/g, req.body.id)})`) });
                }
                Object.assign(where, await platform.view.f_getFilter(req, view), {
                    [j.attribute_start]: {
                        [db.Op.or]: {
                            [db.Op.and]: {
                                [db.Op.gte]: req.body.start
                                , [db.Op.lte]: req.body.end
                            }
                            , [db.Op.is]: null
                        }

                    }
                });
                const registers = await platform.model.findAll(view.model.name, { iduser: req.user.id, where: where });
                const events = [];
                for (let i = 0; i < registers.rows.length; i++) {
                    events.push({
                        id: registers.rows[i].id
                        , title: registers.rows[i][j.attribute_title]
                        , start: registers.rows[i][start.name] ? moment(registers.rows[i][start.name], application.formatters.fe.datetime_format).format(application.formatters.be.datetime_format) : moment().format(application.formatters.be.datetime_format)
                        , end: end ? moment(registers.rows[i][end.name], application.formatters.fe.datetime_format).format(application.formatters.be.datetime_format) : null
                        , backgroundColor: registers.rows[i][start.name] ? (j.attribute_bgcolor ? registers.rows[i][j.attribute_bgcolor] : null) : 'red'
                    });
                }
                application.success(res, { events: events });
            } else {
                const viewtables = await db.getModel('viewtable').findAll({ where: { idview: view.id }, include: [{ all: true }] });
                const modelattributes = await db.getModel('modelattribute').findAll({ where: { idmodel: view.model.id } });
                let where = {};
                if (view.wherefixed) {
                    Object.assign(where, {
                        [db.Op.col]: db.Sequelize.literal(`(${view.wherefixed
                            .replace(/\$user/g, req.user.id)
                            .replace(/\$id/g, bodyID)})`)
                    });
                }
                Object.assign(where, await platform.view.f_getFilter(req, view));
                let ordercolumn = 'id';
                let orderdir = 'desc';
                if (view.orderfixed) {
                    ordercolumn = view.orderfixed.split(',')[0];
                    orderdir = view.orderfixed.split(',')[1];
                } else if (req.body.order) {
                    ordercolumn = req.body.columns[req.body.order[0].column].data;
                    orderdir = req.body.order[0].dir;
                }
                const attributes = ['id'];
                for (let i = 0; i < modelattributes.length; i++) {
                    const j = application.modelattribute.parseTypeadd(modelattributes[i].typeadd);
                    switch (modelattributes[i].type) {
                        case 'parent':
                            if (req.body.issubview == 'true') {
                                where[modelattributes[i].name] = bodyID;
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
                                    const vas = j.as || j.model;
                                    ordercolumn = db.Sequelize.literal(vas + '.' + j.attribute);
                                }
                                break;
                            case 'virtual':
                                ordercolumn = db.Sequelize.literal(modelattributes[i].name);
                                break;
                        }
                    }
                }
                let pagination = {
                    limit: 100
                };
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
                registers = platform.view.f_fixResults(registers, viewtables);
                application.success(res, {
                    recordsTotal: registers.count
                    , recordsFiltered: registers.count
                    , data: registers.rows
                    , table: req.body.table
                });
            }
        } catch (err) {
            application.fatal(res, err);
        }
    });

    app.post('/datasource/sum', application.IsAuthenticated, async (req, res) => {
        try {
            const view = await db.getModel('view').findOne({ where: { url: req.body.view || null }, include: [{ all: true }] });
            if (!view)
                return application.error(res, {});
            const bodyID = req.body.id || 0
            const modelattribute = await db.getModel('modelattribute').findOne({ where: { id: req.body.idmodelattribute || 0 }, include: [{ all: true }] });
            let where = {};
            if (view.wherefixed) {
                Object.assign(where, { [db.Op.col]: db.Sequelize.literal(`(${view.wherefixed.replace(/\$user/g, req.user.id).replace(/\$id/g, bodyID)})`) });
            }
            Object.assign(where, await platform.view.f_getFilter(req, view));
            if (req.body.issubview == 'true') {
                const modelattributeparent = await db.getModel('modelattribute').findOne({
                    where: { idmodel: view.model.id, type: 'parent' }
                });
                if (modelattributeparent) {
                    where[modelattributeparent.name] = bodyID;
                }
            }
            const register = await db.getModel(view.model.name).findOne({
                raw: true
                , attributes: [
                    [db.Sequelize.literal('sum(' + (modelattribute.type == 'virtual' ? application.modelattribute.parseTypeadd(modelattribute.typeadd).subquery : view.model.name + '.' + modelattribute.name) + ')'), 'sum']
                ]
                , include: [{ all: true, attributes: [] }]
                , where: where
            });
            if (register.sum) {
                const j = application.modelattribute.parseTypeadd(modelattribute.typeadd);
                switch (j.type || modelattribute.type) {
                    case 'decimal':
                        register.sum = application.formatters.fe.decimal(register.sum, application.modelattribute.parseTypeadd(modelattribute.typeadd).precision);
                        break;
                    case 'time':
                        register.sum = application.formatters.fe.time(register.sum);
                        break;
                }
            }
            application.success(res, { data: register.sum, view: req.body.view, attribute: req.body.idmodelattribute });
        } catch (err) {
            application.fatal(res, err);
        }
    });

}