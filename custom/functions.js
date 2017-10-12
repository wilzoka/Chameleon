var application = require('../routes/application')
    , db = require('../models')
    , schedule = require('../routes/schedule')
    , moment = require('moment')
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
                            queryInterface.dropTable(models[i].name, {
                                force: true,
                                cascade: false,
                            });
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
                    var defineModel = function (name, attr) {
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
            save: async function (obj, next) {
                await next(obj);
                main.plataform.view.concatAll();
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
        , viewevent: {
            _incrementorder: function (obj) {
                if (obj.ids != null && obj.ids.split(',').length <= 0) {
                    return application.error(obj.res, { msg: application.message.selectOneEvent });
                }
                var ids = obj.ids.split(',');

                db.getModel('viewfield').findAll({ where: { id: { $in: ids } } }).then(viewfields => {
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
                if (obj.ids != null && obj.ids.split(',').length <= 0) {
                    return application.error(obj.res, { msg: application.message.selectOneEvent });
                }
                var ids = obj.ids.split(',');

                db.getModel('viewfield').findAll({ where: { id: { $in: ids } } }).then(viewfields => {
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
                if (obj.ids != null && obj.ids.split(',').length <= 0) {
                    return application.error(obj.res, { msg: application.message.selectOneEvent });
                }
                var ids = obj.ids.split(',');

                db.getModel('viewtable').findAll({ where: { id: { $in: ids } } }).then(viewtables => {
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
                if (obj.ids != null && obj.ids.split(',').length <= 0) {
                    return application.error(obj.res, { msg: application.message.selectOneEvent });
                }
                var ids = obj.ids.split(',');

                db.getModel('viewtable').findAll({ where: { id: { $in: ids } } }).then(viewtables => {
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
            save: async function (obj, next) {
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
            save: async function (obj, next) {
                obj.data.active = false;
                await next(obj);
                schedule.removeSchedule();
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

    , erp: {
        financeiro: {

            _realizarPagamento: function (obj) {
                if (obj.req.method == 'GET') {
                    if (obj.ids == null) {
                        return application.error(obj.res, { msg: application.message.selectOneEvent });
                    }
                    let ids = obj.ids.split(',');


                    let body = '';
                    body += application.components.html.hidden({ name: 'ids', value: obj.ids });
                    body += application.components.html.date({
                        width: 12
                        , label: 'Data de Pagamento'
                        , name: 'datapgto'
                        , value: application.formatters.fe.date(moment())
                    });
                    body += application.components.html.autocomplete({
                        width: 12
                        , label: 'Forma de Pagamento'
                        , name: 'idformapgto'
                        , disabled: ''
                        , model: 'fin_formapgto'
                        , attribute: 'descricao'
                        , datawhere: ''
                        , option: ''
                    });

                    return application.success(obj.res, {
                        modal: {
                            form: true
                            , action: '/event/' + obj.event.id
                            , id: 'modalevt'
                            , title: 'Realizar Pagamento'
                            , body: body
                            , footer: '<button type="button" class="btn btn-default btn-sm" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary btn-sm">Pagar</button>'
                        }
                    });
                } else {

                    let fieldsrequired = ['ids', 'datapgto', 'idformapgto'];
                    let invalidfields = [];

                    for (var i = 0; i < fieldsrequired.length; i++) {
                        if (!(fieldsrequired[i] in obj.req.body && obj.req.body[fieldsrequired[i]])) {
                            invalidfields.push(fieldsrequired[i]);
                        }
                    }
                    if (invalidfields.length > 0) {
                        return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                    }

                    db.getModel('fin_mov').update({
                        datapgto: obj.req.body.datapgto
                        , idformapgto: obj.req.body.idformapgto
                    }, {
                            where: {
                                id: { $in: obj.req.body.ids.split(',') }
                            }
                        }).then(() => {
                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }).catch(err => {
                            return application.fatal(obj.res, err);
                        });
                }

            }

            , _estornarPagamento: function (obj) {
                if (obj.ids == null) {
                    return application.error(obj.res, { msg: application.message.selectOneEvent });
                }

                let ids = obj.ids.split(',');

                db.getModel('fin_mov').update({
                    datapgto: null
                }, {
                        where: {
                            id: { $in: ids }
                        }
                    }).then(() => {
                        return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                    }).catch(err => {
                        return application.fatal(obj.res, err);
                    });
            }

            , mov: {
                onsave: function (obj, next) {

                    if (obj.id == 0) {
                        if ([68, 69].indexOf(obj.view.id) >= 0) { // Contas a Pagar
                            obj.data.dc = 1;
                        } else {
                            obj.data.dc = 2;
                        }
                    }

                    next(obj);
                }
            }

            , categoria: {
                onsave: async function (obj, next) {
                    await next(obj)
                    main.erp.financeiro.categoria.treeAll();
                }
                , treeAll: function () {

                    var getChildren = function (current, childs) {
                        for (var i = 0; i < childs.length; i++) {
                            if (current.idcategoriapai == childs[i].id) {
                                if (childs[i].idcategoriapai) {
                                    return getChildren(childs[i], childs) + childs[i].descricao + ' - ';
                                } else {
                                    return childs[i].descricao + ' - ';
                                }
                            }
                        }
                    }

                    db.getModel('fin_categoria').findAll().then(categorias => {
                        categorias.map(categoria => {
                            if (categoria.idcategoriapai) {
                                categoria.descricaocompleta = getChildren(categoria, categorias) + categoria.descricao;
                            } else {
                                categoria.descricaocompleta = categoria.descricao;
                            }

                            categoria.save();
                        });
                    });

                }
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
            console.log('a');
        }
    }

    , plastrela: {
        manutencao: {
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

        , estoque: {


            transferencia: function (obj) {

                if (obj.req.method == 'GET') {

                    let body = '';
                    body += application.components.html.autocomplete({
                        width: 12
                        , label: 'Produto'
                        , name: 'idversao'
                        , model: 'pcp_versao'
                        , attribute: 'descricaocompleta'
                    });
                    body += application.components.html.decimal({
                        width: 4
                        , label: 'Quantidade'
                        , name: 'qtd'
                        , precision: 4
                    });
                    body += application.components.html.autocomplete({
                        width: 4
                        , label: 'Depósito Origem'
                        , name: 'iddepositode'
                        , model: 'est_deposito'
                        , attribute: 'descricao'
                    });
                    body += application.components.html.autocomplete({
                        width: 4
                        , label: 'Depósito Destino'
                        , name: 'iddepositopara'
                        , model: 'est_deposito'
                        , attribute: 'descricao'
                    });

                    return application.success(obj.res, {
                        modal: {
                            form: true
                            , action: '/event/' + obj.event.id
                            , id: 'modalevt'
                            , title: 'Transferência'
                            , body: body
                            , footer: '<button type="button" class="btn btn-default btn-sm" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary btn-sm">Transferir</button>'
                        }
                    });
                } else {

                    let fieldsrequired = ['idversao', 'qtd', 'iddepositode', 'iddepositopara'];
                    let invalidfields = [];

                    for (var i = 0; i < fieldsrequired.length; i++) {
                        if (!(fieldsrequired[i] in obj.req.body && obj.req.body[fieldsrequired[i]])) {
                            invalidfields.push(fieldsrequired[i]);
                        }
                    }
                    if (invalidfields.length > 0) {
                        return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                    }

                    return application.success(obj.res, { msg: 'ok' });
                }

            }

            , _getOperacaoES: function (idoperacao) {
                return new Promise((resolve, reject) => {

                    db.getModel('est_config').find().then(config => {

                        db.getModel('est_operacao').find({ where: { id: idoperacao }, include: [{ all: true }] }).then(operacao => {
                            if (operacao && operacao.est_operacaotipo.id == config.idoperacaotipoentrada) {
                                resolve('E');
                            } else if (operacao && operacao.est_operacaotipo.id == config.idoperacaotiposaida) {
                                resolve('S');
                            } else {
                                reject('Tipo de Operação Inválido');
                            }
                        });

                    });

                });
            }

            , _getSaldoAnterior: function (idversao, iddeposito) {
                return new Promise((resolve, reject) => {

                    db.getModel('est_saldo').find({
                        where: {
                            idversao: idversao
                            , iddeposito: iddeposito
                            , datafechamento: { $ne: null }
                        }
                        , order: [['datafechamento', 'desc']]
                    }).then(saldo => {

                        resolve(saldo);

                    }).catch(err => {

                        reject(err);

                    });

                });
            }

            , _getSaldoAtual: function (idversao, iddeposito) {
                return new Promise((resolve, reject) => {

                    db.getModel('est_saldo').findOrCreate({
                        where: {
                            idversao: idversao
                            , iddeposito: iddeposito
                            , datafechamento: null
                        }
                    }).spread((saldo, created) => {
                        if (created) {
                            saldo.qtd = 0;
                            saldo.save();
                        }

                        resolve(saldo);

                    }).catch(err => {

                        reject(err);

                    });

                });
            }

            , _recalcularSaldoIndividual: async function (idversao, iddeposito) {
                const f = main.plastrela.estoque;
                try {
                    let saldoanterior = await f._getSaldoAnterior(idversao, iddeposito);
                    let saldoatual = await f._getSaldoAtual(idversao, iddeposito);

                    if (!saldoanterior) {
                        saldoanterior = { qtd: 0, datafechamento: '1900-01-01' };
                    }

                    db.sequelize.query(
                        " select"
                        + " sum(case when tipomov = 'S' then qtd * -1 else qtd end) as qtd"
                        + " from "
                        + " (select"
                        + " m.*"
                        + " , case when ce.id is null then 'S' else 'E' end as tipomov"
                        + " from"
                        + " est_mov m"
                        + " left join est_operacao o on (m.idoperacao = o.id)"
                        + " left join est_operacaotipo ot on (o.idoperacaotipo = ot.id)"
                        + " left join est_config ce on (ot.id = ce.idoperacaotipoentrada)"
                        + " where"
                        + " m.datahora > :datahora and idversao = :idversao and iddeposito = :iddeposito) as x"
                        , {
                            type: db.sequelize.QueryTypes.SELECT
                            , replacements: {
                                datahora: saldoanterior.datafechamento
                                , idversao: idversao
                                , iddeposito, iddeposito
                            }
                        })
                        .then(result => {

                            if (result.length > 0) {
                                saldoatual.qtd = (parseFloat(result[0].qtd) + parseFloat(saldoanterior.qtd)).toFixed(4);
                                saldoatual.save();
                            }

                        }).catch(err => {
                            console.error(err);
                        });

                } catch (err) {
                    console.error(err);
                }
            }

            , _estoqueLiberado: function (iddeposito, datahora) {
                return new Promise((resolve) => {

                    db.getModel('est_saldo').count({
                        where: {
                            bloqueado: true
                            , iddeposito: iddeposito
                            , datafechamento: { $gt: datahora }
                        }
                    }).then(c => {
                        return c == 0 ? resolve(true) : resolve(false);
                    })

                });
            }

            , _movimentar: async function (obj) {//datahora iduser idoperacao, idversao, iddeposito, qtd
                return new Promise((resolve) => {

                    const f = main.plastrela.estoque;

                    let invalidfields = application.functions.getEmptyFields(obj, ['datahora', 'idoperacao', 'idversao', 'iddeposito', 'qtd']);
                    if (invalidfields.length > 0) {
                        return resolve({ success: false, invalidfields: invalidfields });
                    }


                    f._estoqueLiberado(obj.iddeposito, obj.datahora).then(liberado => {
                        if (liberado) {
                            f._getOperacaoES(obj.idoperacao).then(operacao => {
                                f._getSaldoAtual(obj.idversao, obj.iddeposito).then(saldoatual => {

                                    if (operacao == 'S' && obj.qtd > saldoatual.qtd) {
                                        return resolve({ success: false, msg: 'Saldo Insuficiente' });
                                    }

                                    db.getModel('est_mov').create(obj).then(mov => {
                                        f._recalcularSaldoIndividual(mov.idversao, mov.iddeposito);
                                        return resolve({ success: true, register: mov });
                                    }).catch(err => {
                                        return resolve({ success: false, msg: err });
                                    });

                                });
                            });
                        } else {
                            return resolve({ success: false, msg: 'Estoque fechado' });
                        }

                    });
                });
            }

            , est_mov: {
                onsave: async function (obj, next) {
                    const f = main.plastrela.estoque;
                    if (obj.id == 0) {
                        obj.data.iduser = obj.req.user.id;
                    }

                    let movimentar = await f._movimentar(obj.data);

                    if (movimentar.success) {
                        return application.success(obj.res, {
                            msg: application.message.success
                            , data: movimentar.register
                            , redirect: '/view/' + obj.view.id + '/' + movimentar.register.id
                        });
                    } else {
                        return application.error(obj.res, { msg: movimentar.msg, invalidfields: movimentar.invalidfields || [] });
                    }

                }
            }
        }
        , pcp: {
            apparada: {
                onsave: function (obj, next) {
                    var dataini = moment(obj.data.dataini);
                    var datafim = moment(obj.data.datafim);
                    var duracao = datafim.diff(dataini, 'm');

                    obj.data.duracao = duracao;

                    next(obj);
                }
            }
            , oprecurso: {
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