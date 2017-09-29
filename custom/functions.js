var application = require('../routes/application')
    , db = require('../models')
    , schedule = require('../routes/schedule');
;

var main = {
    plataform: {
        model: {
            save: function (json, next) {
                db.getModel('model').find({ where: { id: { $ne: json.id }, name: json.data.name } }).then(register => {
                    if (register) {
                        return application.error(json.res, { msg: 'Já existe um modelo com este nome' });
                    } else {
                        next(json);
                    }
                });
            }
            , delete: function (json, next) {

                const queryInterface = db.sequelize.getQueryInterface();
                db.getModel('model').findAll({ where: { id: { $in: json.ids } } }).then(models => {

                    try {
                        for (var i = 0; i < models.length; i++) {
                            db.sequelize.modelManager.removeModel(db.sequelize.modelManager.getModel(models[i].name));
                            queryInterface.dropTable(models[i].name);
                        }
                    } catch (error) {
                    }

                    next(json);
                }).catch(err => {
                    application.fatal(json.res, err);
                });

            }
            , syncAll: function (json) {
                var models = {};
                db.sequelize.query("SELECT m.name as model, ma.* FROM model m INNER JOIN modelattribute ma ON (m.id = ma.idmodel) WHERE ma.type NOT IN ('virtual') ORDER by m.name", { type: db.sequelize.QueryTypes.SELECT }).then(results => {

                    var modelname;
                    var modelattributeobj = {};

                    //Create Attributes
                    for (var i = 0; i < results.length; i++) {
                        // Start
                        if (i == 0) {
                            modelname = results[i].model;
                            modelattributeobj = {};
                        }
                        if (modelname == results[i].model) {

                            modelattributeobj[results[i].name] = application.sequelize.decodeType(db.Sequelize, results[i].type);

                        } else {
                            models[modelname] = db.sequelize.define(modelname, modelattributeobj, {
                                freezeTableName: true
                                , timestamps: false
                            });

                            modelname = results[i].model;
                            modelattributeobj = {};
                            modelattributeobj[results[i].name] = application.sequelize.decodeType(db.Sequelize, results[i].type);
                        }

                        if (i == results.length - 1) {
                            models[modelname] = db.sequelize.define(modelname, modelattributeobj, {
                                freezeTableName: true
                                , timestamps: false
                            });
                        }
                    }

                    //Create References
                    for (var i = 0; i < results.length; i++) {
                        var j = {};
                        if (results[i].typeadd) {
                            j = application.modelattribute.parseTypeadd(results[i].typeadd);
                            var vas = j.as || j.model;
                        }
                        switch (results[i].type) {
                            case 'parent':
                                models[results[i].model].belongsTo(models[j.model], {
                                    as: vas
                                    , foreignKey: results[i].name
                                    , onDelete: 'cascade' in j && j['cascade'] ? 'CASCADE' : 'NO ACTION'
                                });
                                break;
                            case 'autocomplete':
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
                            return application.success(json.res, { msg: application.message.success });
                        }).catch(err => {
                            return application.fatal(json.res, err);
                        });
                    }).catch(err => {
                        return application.fatal(json.res, err);
                    });

                });

            }
        }
        , view: {
            save: function (json, next) {
                next(json, main.plataform.view.concatAll);
            }
            , concatAll: function () {
                db.getModel('view').findAll().then(views => {
                    views.map(view => {
                        db.getModel('module').find({ where: { id: view.idmodule } }).then(modulee => {
                            if (modulee) {
                                view.concat = modulee.description + ' - ' + view.name;
                            } else {
                                view.concat = view.name;
                            }
                            view.save();
                        });
                    });
                });

            }
        }
        , menu: {
            save: function (json, next) {
                next(json, main.plataform.menu.treeAll);
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
            save: function (json, next) {
                json.data.active = false;
                next(json, schedule.removeSchedule);
            }
            , active: function (json) {
                if (json.ids != null && json.ids.split(',').length <= 0) {
                    return application.error(json.res, { msg: application.message.selectOneEvent });
                }
                var ids = json.ids.split(',');

                db.getModel('schedule').findAll({ where: { id: { $in: ids } } }).then(scheds => {
                    scheds.map(sched => {
                        schedule.addSchedule(sched);
                        sched.active = true;
                        sched.save();
                    });
                });

                return application.success(json.res, { msg: application.message.success, reloadtables: true });
            }
            , desactive: function (json) {
                var ids = [];
                if (json.ids) {
                    ids = json.ids.split(',');
                }
                if (ids.length <= 0) {
                    return application.error(json.res, { msg: application.message.selectOneEvent });
                }

                db.getModel('schedule').findAll({ where: { id: { $in: ids } } }).then(scheds => {
                    scheds.map(sched => {
                        schedule.removeSchedule(sched);
                        sched.active = false;
                        sched.save();
                    });
                });

                return application.success(json.res, { msg: application.message.success, reloadtables: true });
            }
            , execute: function (json) {
                if (json.ids && json.ids.split(',').length <= 0) {
                    return application.error(json.res, { msg: application.message.selectOneEvent });
                }
                var ids = json.ids.split(',');

                db.getModel('schedule').findAll({ where: { id: { $in: ids } } }).then(scheds => {
                    scheds.map(sched => {
                        schedule.executeSchedule(sched);
                    });
                });

                return application.success(json.res, { msg: application.message.success });
            }
        }
    }

    , manutencao: {
        os: {
            save: function (json, next) {
                db.getModel('man_config').find().then(config => {

                    // Prioridades
                    if (config.idprioridadeurgente == json.data.idprioridade && !json.data.idmotivo) {
                        return application.error(json.res, { msg: 'Prioridade Urgente exige motivo', invalidfields: ['idmotivo'] });
                    } else if (config.idprioridadeate == json.data.idprioridade && !json.data.dataprioridade) {
                        return application.error(json.res, { msg: 'Prioridade Executar até exige Data Prioridade', invalidfields: ['dataprioridade'] });
                    } else if (config.idprioridadeapartir == json.data.idprioridade && !json.data.dataprioridade) {
                        return application.error(json.res, { msg: 'Prioridade Executar a Partir exige Data Prioridade', invalidfields: ['dataprioridade'] });
                    }

                    if (json.id == 0) {
                        json.data.idusuariorequisitante = json.req.user.id;
                        json.data.idestado = config.idestadoinicial;
                    } else {
                        if (!json.data.idestado) {
                            return application.error(json.res, { msg: 'Informe o Estado', invalidfields: ['idestado'] });
                        }
                    }

                    next(json);
                });
            }
        }
    }

    , carros: {
        printcontrato: function (json) {
            var PDFDocument = require('pdfkit');
            const doc = new PDFDocument();
            var fs = require('fs');
            var filename = process.hrtime()[1] + '.pdf';
            var stream = doc.pipe(fs.createWriteStream('tmp/' + filename));

            doc
                .fontSize(25)
                .text('Some text with an embedded fontasdasdas', 100, 100)


            doc.addPage()
                .fontSize(25)
                .text('Here is some vector graphics...', 100, 100)


            doc.save()
                .moveTo(100, 150)
                .lineTo(100, 250)
                .lineTo(200, 250)
                .fill("#FF3300")


            doc.scale(0.6)
                .translate(470, -380)
                .path('M 250,75 L 323,301 131,161 369,161 177,301 z')
                .fill('red', 'even-odd')
                .restore()


            doc.addPage()
                .fillColor("blue")
                .text('Here is a link!', 100, 100)
                .underline(100, 100, 160, 27, { color: "#0000FF" })
                .link(100, 100, 160, 27, 'http://google.com/')


            doc.end();
            stream.on('finish', function () {
                return application.success(json.res, {
                    modal: {
                        id: 'modalevt'
                        , title: '<div class="col-sm-12" style="text-align: center;">Visualização</div>'
                        , body: '<iframe src="/download/' + filename + '" style="width: 100%; height: 700px;"></iframe>'
                        , footer: '<button type="button" class="btn btn-default btn-sm" style="margin-right: 5px;" data-dismiss="modal">Voltar</button><a href="/download/' + filename + '" target="_blank"><button type="button" class="btn btn-primary btn-sm">Download do Arquivo</button></a>'
                    }
                });
            });
        }
        , changecolor: function (json) {

            if (json.req.method == 'GET') {
                var ids = [];
                if (json.ids) {
                    ids = json.ids.split(',');
                }
                if (ids.length <= 0) {
                    return application.error(json.res, { msg: application.message.selectOneEvent });
                }

                var body = '';
                body += application.components.html.hidden({ name: 'ids', value: json.ids });
                body += application.components.html.autocomplete({
                    width: 12
                    , label: 'Cor'
                    , name: 'cor'
                    , disabled: ''
                    , model: 'cor'
                    , attribute: 'descricao'
                    , datawhere: ''
                    , option: ''
                });

                return application.success(json.res, {
                    modal: {
                        form: true
                        , action: '/event/' + json.event.id
                        , id: 'modalevt'
                        , title: 'Teste modal'
                        , body: body
                        , footer: '<button type="submit" class="btn btn-primary btn-sm">Alterar</button>'
                    }
                });
            } else {
                db.getModel('carro').update({ idcor: json.req.body.cor }, { where: { id: { $in: json.req.body.ids.split(',') } } }).then(() => {
                    return application.success(json.res, {
                        msg: application.message.success
                        , reloadtables: true
                    });
                }).catch(err => {
                    return application.fatal(json.res, err);
                });
            }
        }
        , export: function (json) {
            json.res.download('todo.txt');
        }
    }

    , teste: {
        min: function (sch) {
            console.log('asdasdasd1');
        }
    }

    , plastrela: {
        pcp: {
            oprecurso: {
                save: function (obj, next) {
                    if (obj.id == 0) {
                        db.getModel('pcp_config').find().then(config => {
                            if (config && config.idestadoinicial) {
                                obj.data.idestado = config.idestadoinicial;
                                next(obj);
                            } else {
                                return application.error(obj.res, { msg: 'Falta configuração em: Estado Inicial da OP' });
                            }
                        });
                    } else {
                        next(obj);
                    }

                }
            }
        }
    }
}

module.exports = main;