var application = require('../../routes/application')
    , db = require('../../models')
    , schedule = require('../../routes/schedule')
    , moment = require('moment')
    , fs = require('fs')
    , lodash = require('lodash');
;

var main = {
    plataform: {
        model: {
            onsave: async function (obj, next) {
                try {

                    let register = await db.getModel('model').find({ where: { id: { $ne: obj.id }, name: obj.register.name } })
                    if (register) {
                        return application.error(obj.res, { msg: 'Já existe um modelo com este nome' });
                    } else {
                        next(obj);
                    }

                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , ondelete: async function (obj, next) {
                try {

                    const queryInterface = db.sequelize.getQueryInterface();
                    let models = await db.getModel('model').findAll({ where: { id: { $in: obj.ids } } })

                    for (var i = 0; i < models.length; i++) {
                        if (db.sequelize.modelManager.getModel(models[i].name)) {
                            db.sequelize.modelManager.removeModel(db.sequelize.modelManager.getModel(models[i].name));
                            queryInterface.dropTable(models[i].name, {
                                force: true,
                                cascade: false,
                            });
                        }
                    }

                    next(obj);
                } catch (err) {
                    return application.error(obj.res, { msg: err });
                }
            }
            , syncAll: function (obj) {
                var models = {};
                db.sequelize.query("SELECT m.name as model, ma.* FROM model m INNER JOIN modelattribute ma ON (m.id = ma.idmodel) WHERE ma.type NOT IN ('virtual') ORDER by m.name", { type: db.sequelize.QueryTypes.SELECT }).then(results => {

                    let modelname;
                    let modelattributeobj = {};
                    let defineModel = function (name, attr) {
                        models[name] = db.sequelize.define(name, attr, {
                            freezeTableName: true
                            , timestamps: false
                        });
                    }

                    //Create Attributes
                    for (var i = 0; i < results.length; i++) {
                        // Startf
                        if (i == 0) {
                            modelname = results[i].model;
                            modelattributeobj = {};
                        }
                        if (modelname == results[i].model) {

                            modelattributeobj[results[i].name] = application.sequelize.decodeType(db.Sequelize, results[i].type);

                        } else {

                            defineModel(modelname, modelattributeobj);

                            modelname = results[i].model;
                            modelattributeobj = {};
                            modelattributeobj[results[i].name] = application.sequelize.decodeType(db.Sequelize, results[i].type);
                        }

                        if (i == results.length - 1) {
                            defineModel(modelname, modelattributeobj);
                        }
                    }

                    //Create References
                    for (var i = 0; i < results.length; i++) {
                        let j = {};
                        if (results[i].typeadd) {
                            j = application.modelattribute.parseTypeadd(results[i].typeadd);
                        }
                        switch (results[i].type) {
                            case 'parent':
                                models[results[i].model].belongsTo(models[j.model], {
                                    as: j.model
                                    , foreignKey: results[i].name
                                    , onDelete: 'cascade' in j && j['cascade'] ? 'CASCADE' : 'NO ACTION'
                                });
                                break;
                            case 'autocomplete':
                                let vas = j.as || j.model;
                                models[results[i].model].belongsTo(models[j.model], {
                                    as: vas
                                    , foreignKey: results[i].name
                                    , onDelete: 'cascade' in j && j['cascade'] ? 'CASCADE' : 'NO ACTION'
                                });
                                break;
                        }
                    }

                    db.setModels(models);

                    db.dropForeignKeyConstraints().then(() => {
                        db.sequelize.sync({ alter: true }).then(() => {
                            return application.success(obj.res, { msg: application.message.success });
                        }).catch(err => {
                            return application.fatal(obj.res, err);
                        });
                    }).catch(err => {
                        return application.fatal(obj.res, err);
                    });

                });

            }
        }
        , view: {
            onsave: async function (obj, next) {
                await next(obj);
                main.plataform.view.concatAll();
            }
            , concatAll: function () {
                db.getModel('view').findAll().then(views => {
                    views.map(view => {
                        db.getModel('module').find({ where: { id: view.idmodule } }).then(modulee => {
                            if (modulee) {
                                view.namecomplete = modulee.description + ' - ' + view.name;
                            } else {
                                view.namecomplete = view.name;
                            }
                            view.save();
                        });
                    });
                });
            }
        }
        , viewfield: {
            changezone: async function (obj) {
                try {
                    if (obj.req.method == 'GET') {
                        if (obj.ids.length == 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }

                        let viewfield = await db.getModel('viewfield').find({ where: { id: { $in: obj.ids } }, include: [{ all: true }] });

                        let body = '';
                        body += application.components.html.hidden({ name: 'ids', value: obj.ids.join(',') });
                        body += application.components.html.autocomplete({
                            width: 12
                            , label: 'Zona'
                            , name: 'zona'
                            , model: 'templatezone'
                            , attribute: 'name'
                            , datawhere: 'idtemplate = ' + viewfield.view.idtemplate
                        });

                        return application.success(obj.res, {
                            modal: {
                                form: true
                                , action: '/event/' + obj.event.id
                                , id: 'modalevt'
                                , title: obj.event.description
                                , body: body
                                , footer: '<button type="button" class="btn btn-default btn-sm" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary btn-sm">Alterar</button>'
                            }
                        });
                    } else {

                        let invalidfields = application.functions.getEmptyFields(obj.req.body, ['ids', 'zona']);
                        if (invalidfields.length > 0) {
                            return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                        }

                        await db.getModel('viewfield').update({ idtemplatezone: obj.req.body.zona }, { where: { id: { $in: obj.req.body.ids.split(',') } } });

                        return application.success(obj.res, { msg: application.message.success, reloadtables: true });

                    }
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
        }
        , viewevent: {
            _incrementorder: function (obj) {
                if (obj.ids.length == 0) {
                    return application.error(obj.res, { msg: application.message.selectOneEvent });
                }

                db.getModel('viewfield').findAll({ where: { id: { $in: obj.ids } } }).then(viewfields => {
                    viewfields.map(viewfield => {
                        viewfield.order++;
                        viewfield.save();
                    });
                    return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                }).catch(err => {
                    return application.fatal(obj.res, err);
                });
            }
            , _decrementorder: function (obj) {
                if (obj.ids.length == 0) {
                    return application.error(obj.res, { msg: application.message.selectOneEvent });
                }

                db.getModel('viewfield').findAll({ where: { id: { $in: obj.ids } } }).then(viewfields => {
                    viewfields.map(viewfield => {
                        viewfield.order--;
                        viewfield.save();
                    });
                    return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                }).catch(err => {
                    return application.fatal(obj.res, err);
                });
            }
        }
        , viewtable: {
            _incrementorder: function (obj) {
                if (obj.ids.length == 0) {
                    return application.error(obj.res, { msg: application.message.selectOneEvent });
                }

                db.getModel('viewtable').findAll({ where: { id: { $in: obj.ids } } }).then(viewtables => {
                    viewtables.map(viewtable => {
                        viewtable.ordertable++;
                        viewtable.save();
                    });
                    return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                }).catch(err => {
                    return application.fatal(obj.res, err);
                });
            }
            , _decrementorder: function (obj) {
                if (obj.ids.length == 0) {
                    return application.error(obj.res, { msg: application.message.selectOneEvent });
                }

                db.getModel('viewtable').findAll({ where: { id: { $in: obj.ids } } }).then(viewtables => {
                    viewtables.map(viewtable => {
                        viewtable.ordertable--;
                        viewtable.save();
                    });
                    return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                }).catch(err => {
                    return application.fatal(obj.res, err);
                });
            }
        }
        , menu: {
            onsave: async function (obj, next) {
                await next(obj);
                main.plataform.menu.treeAll();
            }
            , treeAll: function () {

                var getChildren = function (current, childs) {

                    for (var i = 0; i < childs.length; i++) {
                        if (current.idmenuparent == childs[i].id) {

                            if (childs[i].idmenuparent) {
                                return getChildren(childs[i], childs) + childs[i].description + ' - ';
                            } else {
                                return childs[i].description + ' - ';
                            }

                        }
                    }

                }

                db.getModel('menu').findAll().then(menus => {
                    menus.map(menu => {
                        if (menu.idmenuparent) {
                            menu.tree = getChildren(menu, menus) + menu.description;
                        } else {
                            menu.tree = menu.description;
                        }

                        menu.save();
                    });
                });

            }
        }
        , schedule: {
            onsave: async function (obj, next) {
                try {
                    obj.register.active = false;
                    await next(obj);
                    schedule.removeSchedule(obj.register);
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , _active: async function (obj) {
                try {

                    if (obj.ids.length == 0) {
                        return application.error(obj.res, { msg: application.message.selectOneEvent });
                    }

                    let scheds = await db.getModel('schedule').findAll({ where: { id: { $in: obj.ids } } });
                    scheds.map(sched => {
                        schedule.addSchedule(sched);
                        sched.active = true;
                        sched.save();
                    });

                    return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , _desactive: async function (obj) {
                try {

                    if (obj.ids.length == 0) {
                        return application.error(obj.res, { msg: application.message.selectOneEvent });
                    }

                    let scheds = await db.getModel('schedule').findAll({ where: { id: { $in: obj.ids } } });
                    scheds.map(sched => {
                        schedule.removeSchedule(sched);
                        sched.active = false;
                        sched.save();
                    });

                    return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , _execute: async function (obj) {
                try {

                    if (obj.ids.length == 0) {
                        return application.error(obj.res, { msg: application.message.selectOneEvent });
                    }

                    let scheds = await db.getModel('schedule').findAll({ where: { id: { $in: obj.ids } } })
                    scheds.map(sched => {
                        schedule.executeSchedule(sched);
                    });

                    return application.success(obj.res, { msg: application.message.success });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
        }
        , config: {
            __getGoogleMapsKey: async function (obj) {
                try {
                    let config = await db.getModel('config').find();
                    return application.success(obj.res, { data: config.googlemapskey });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
        }
        , mail: {
            f_sendmail: function (obj) {
                let nodemailer = require('nodemailer');
                let transporter = nodemailer.createTransport({
                    host: 'smtp.plastrela.com.br'
                    , port: 587
                    , tls: { rejectUnauthorized: false }
                    , auth: {
                        user: 'plastrela@plastrela.com.br'
                        , pass: 'Pl3678#$'
                    }
                });
                let mailOptions = {
                    from: '"Plastrela" <plastrela@plastrela.com.br>'
                    , to: obj.to.join(',')
                    , subject: obj.subject
                    , html: obj.html
                };
                transporter.sendMail(mailOptions, (err, info) => {
                    if (err) {
                        return console.log(err);
                    }
                });
            }
        }
        , kettle: {
            f_path: 'C:\\data-integration'
            , f_runTransformation: function (filepath) {
                let nrc = require('node-run-cmd');
                if (application.functions.isWindows()) {
                    nrc.run('Pan.bat /file:' + __dirname + '/' + filepath
                        , { cwd: main.plataform.kettle.f_path });
                } else {
                    nrc.run('pan.sh -file=' + __dirname + '/' + filepath
                        , { cwd: main.plataform.kettle.f_path });
                }
            }
            , f_runJob: function (filepath) {
                let nrc = require('node-run-cmd');
                if (application.functions.isWindows()) {
                    nrc.run('Kitchen.bat /file:' + __dirname + '/' + filepath
                        , {
                            cwd: main.plataform.kettle.f_path
                            // , onData: function (data) {
                            //     console.log('data', data);
                            // }
                            // , onDone: function (data) {
                            //     console.log('done', data);
                            // }
                            // , onError: function (data) {
                            //     console.log('err', data);
                            // }
                        });
                } else {
                    nrc.run('kitchen.sh -file=' + __dirname + '/' + filepath
                        , { cwd: main.plataform.kettle.f_path });
                }
            }
        }
    }

    , igoon: {
        handler: async function (obj) {
            try {
                return application.success(obj.res, {msg: 'olá'})
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , lugar: {
            onsave: async function(obj, next){
                try {

                    if(obj.register.id==0){
                        obj.register.iduser = obj.req.user.id;
                    }

                    if(obj.register.iduser != obj.req.user.id){
                        return application.error(obj.res, {msg: 'Você não é o proprietário deste lugar'});
                    }

                    next(obj);
                    
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
        }
    }
}

module.exports = main;