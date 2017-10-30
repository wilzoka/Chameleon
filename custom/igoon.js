var application = require('../routes/application')
    , db = require('../models')
    , schedule = require('../routes/schedule')
    , moment = require('moment')
    , fs = require('fs')
    ;

var main = {
    plataform: {
        model: {
            save: function (obj, next) {
                db.getModel('model').find({ where: { id: { $ne: obj.id }, name: obj.register.name } }).then(register => {
                    if (register) {
                        return application.error(obj.res, { msg: 'Já existe um modelo com este nome' });
                    } else {
                        next(obj);
                    }
                });
            }
            , delete: function (obj, next) {

                const queryInterface = db.sequelize.getQueryInterface();
                db.getModel('model').findAll({ where: { id: { $in: obj.ids } } }).then(models => {

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

                    next(obj);
                }).catch(err => {
                    application.fatal(obj.res, err);
                });

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
                        if (obj.ids == null) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }
                        let ids = obj.ids.split(',');

                        let viewfield = await db.getModel('viewfield').find({ where: { id: { $in: ids } }, include: [{ all: true }] });

                        let body = '';
                        body += application.components.html.hidden({ name: 'ids', value: obj.ids });
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
                obj.register.active = false;
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
    }

    , plastrela: {
        compra: {
            cmp_solicitacaoitem: {
                onsave: async function (obj, next) {
                    try {

                        if (obj.id == 0) {
                            obj.register.iduser = obj.req.user.id;

                            let config = await db.getModel('cmp_config').find();

                            if (!obj.register.idestado) {
                                obj.register.idestado = config.idsolicitacaoestadoinicial;
                            }
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }

                    next(obj);
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

        , estoque: {

            criarNotaChaveAcesso: async function (obj) {
                if (obj.req.method == 'GET') {
                    let body = '';

                    body += application.components.html.autocomplete({
                        width: '12'
                        , label: 'Depósito'
                        , name: 'deposito'
                        , model: 'est_deposito'
                        , attribute: 'descricao'
                    });
                    body += application.components.html.text({
                        width: 12
                        , label: 'Chave de Acesso'
                        , name: 'chave'
                    });

                    return application.success(obj.res, {
                        modal: {
                            form: true
                            , action: '/event/' + obj.event.id
                            , id: 'modalevt'
                            , title: 'Criar Nota'
                            , body: body
                            , footer: '<button type="button" class="btn btn-default btn-sm" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary btn-sm">Gerar</button>'
                        }
                    });
                } else {

                    let invalidfields = application.functions.getEmptyFields(obj.req.body, ['chave', 'deposito']);
                    if (invalidfields.length > 0) {
                        return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                    }

                    let count = await db.getModel('est_nfentrada').count({
                        where: {
                            chave: obj.req.body.chave
                        }
                    });
                    if (count > 0) {
                        return application.error(obj.res, { msg: 'Nota já importada' });
                    }

                    try {

                        let spednf = await db.getModel('sped_nfentrada').find({
                            where: {
                                chave_nfe: obj.req.body.chave
                            }
                            , raw: true
                        });
                        if (!spednf) {
                            return application.error(obj.res, { msg: 'Chave de acesso não encontrada' });
                        }
                        let spednfitem = await db.getModel('sped_nfentradait').findAll({
                            where: {
                                chave_nfe: obj.req.body.chave
                            }
                            , raw: true
                        });
                        if (!spednfitem) {
                            return application.error(obj.res, { msg: 'Esta nota não possui itens' });
                        }

                        let nf = await db.getModel('est_nfentrada').create({
                            chave: spednf.chave_nfe
                            , finalizado: false
                            , dataemissao: spednf.data_emissao
                            , documento: spednf.docto + '/' + spednf.serie
                            , cnpj: spednf.cnpj_emitente
                            , razaosocial: spednf.nome_emitente
                            , datainclusao: moment()
                            , iddeposito: obj.req.body.deposito
                        });

                        let bulkitens = [];
                        for (var i = 0; i < spednfitem.length; i++) {

                            let sql = await db.sequelize.query("select v.id from pcp_versao v left join cad_item i on (v.iditem = i.id) where i.codigo = :item and v.codigo = :versao", {
                                type: db.sequelize.QueryTypes.SELECT
                                , replacements: { item: spednfitem[i].produto, versao: spednfitem[i].versao }
                            });

                            if (sql.length == 0) {
                                nf.destroy();
                                return application.error(obj.res, { msg: 'Não foi encontrado o cadastro do produto: ' + spednfitem[i].produto + '/' + spednfitem[i].versao });
                            }

                            bulkitens.push({
                                codigoviniflex: 1
                                , idnfentrada: nf.id
                                , sequencial: spednfitem[i].item
                                , codigo: spednfitem[i].codigo_produto
                                , descricao: spednfitem[i].nome_produto
                                , qtd: spednfitem[i].quantidade
                                , oc: spednfitem[i].ordem_compra
                                , idversao: sql[0].id
                                , qtdvolumes: 0
                            });

                        }

                        let nfitem = await db.getModel('est_nfentradaitem').bulkCreate(bulkitens);

                        return application.success(obj.res, { msg: application.message.success, reloadtables: true });

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }

                }
            }

            , transferencia: function (obj) {

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

            , est_volume: {

                imprimirEtiqueta: async function (obj) {
                    let f = application.functions;
                    let pdfkit = require('pdfkit');
                    let barcode = require('barcode-2-svg');
                    let svgtopdfkit = require('svg-to-pdfkit');

                    if (obj.ids == null) {
                        return application.error(obj.res, { msg: application.message.selectOneEvent });
                    }
                    let ids = obj.ids.split(',');

                    const doc = new pdfkit({
                        autoFirstPage: false
                    });

                    let config = await db.getModel('config').find({ raw: true });
                    let image = JSON.parse(config.imagemrelatorio)[0];
                    var filename = process.hrtime()[1] + '.pdf';
                    var stream = doc.pipe(fs.createWriteStream('tmp/' + filename));

                    let volumes = await db.getModel('est_volume').findAll({ where: { id: { $in: ids } }, include: [{ all: true, nested: true }], raw: true });
                    for (var i = 0; i < volumes.length; i++) {
                        let volume = volumes[i];

                        doc.addPage({ margin: 30 });

                        doc.moveTo(25, 25)
                            .lineTo(589, 25) //top
                            .lineTo(589, 445) //right
                            .lineTo(25, 445) //bottom
                            .lineTo(25, 25) //bottom
                            .stroke();

                        doc.image('files/' + image.id + '.' + image.type, 35, 33, { width: 100 });

                        doc.moveTo(25, 75)
                            .lineTo(589, 75) // Cabeçalho
                            .stroke();

                        // Title

                        doc
                            .font('Courier-Bold')
                            .fontSize(11)
                            .text('IDENTIFICAÇÃO E STATUS DA BOBINA Nº ' + volume.id, 165, 47);


                        doc
                            .fontSize(7.5)
                            .text('Anexo - 03', 500, 40)
                            .text('Nº PPP - 05 Revisão: 09', 460, 55);

                        // Body
                        let width1 = 27;
                        let width1val = 20;

                        let width2 = 24;
                        let width2val = 25;

                        let width3 = 5;
                        let width3val = 21;

                        let padstr = ' ';
                        let md = 0.65;

                        doc
                            .font('Courier-Bold').text(f.lpad('Pedido: ', width1, padstr), 30, 82, { continued: true })
                            .font('Courier').text(f.rpad('', width1val, padstr), { continued: true })
                            .font('Courier-Bold').text(f.lpad('Ordem de Compra: ', width2, padstr), { continued: true })
                            .font('Courier').text(f.rpad(volume['est_nfentradaitem.oc'], width2val, padstr), { continued: true })
                            .font('Courier-Bold').text(f.lpad('OP: ', width3, padstr), { continued: true })
                            .font('Courier').text(f.rpad('', width3val, padstr))
                            .moveDown(md);

                        doc
                            .moveTo(240, 75)
                            .lineTo(240, 91)
                            .stroke()
                            .moveTo(460, 75)
                            .lineTo(460, 91)
                            .stroke();

                        doc
                            .font('Courier-Bold').text(f.lpad('Cliente: ', width1, padstr), { continued: true })
                            .font('Courier').text(f.rpad('AB BRASIL', 87, padstr))
                            .moveDown(md);

                        doc
                            .font('Courier-Bold').text(f.lpad('Produto: ', width1, padstr), { continued: true })
                            .font('Courier').text(f.rpad('(63,50x0,0035) PELICULA 7376 PAPEL HIGIENICO CLARA PREMIUM FOLHA DUPLA 4 X 30 M (T100)', 87, padstr))
                            .moveDown(md);

                        doc
                            .font('Courier-Bold').text(f.lpad('Formato: ', width1, padstr), { continued: true })
                            .font('Courier').text(f.rpad('1760,00mmX0,0200mm', width1val, padstr), { continued: true })
                            .font('Courier-Bold').text(f.lpad('Peso: ', width2, padstr), { continued: true })
                            .font('Courier').text(f.rpad('253,0000 KG', width2val, padstr), { continued: true })
                            .font('Courier-Bold').text(f.lpad('Mts: ', width3, padstr), { continued: true })
                            .font('Courier').text(f.rpad('18.391,97 M', width3val, padstr))
                            .moveDown(md);

                        doc
                            .font('Courier-Bold').text(f.lpad('Formato após Revisão: ', width1, padstr), { continued: true })
                            .font('Courier').text(f.rpad('', width1val, padstr), { continued: true })
                            .font('Courier-Bold').text(f.lpad('Peso após Revisão: ', width2, padstr), { continued: true })
                            .font('Courier').text(f.rpad('', width2val, padstr), { continued: true })
                            .font('Courier-Bold').text(f.lpad('Mts: ', width3, padstr), { continued: true })
                            .font('Courier').text(f.rpad('', width3val, padstr))
                            .moveDown(md);

                        doc
                            .font('Courier-Bold').text(f.lpad('Formato após Laminação: ', width1, padstr), { continued: true })
                            .font('Courier').text(f.rpad('', width1val, padstr), { continued: true })
                            .font('Courier-Bold').text(f.lpad('Peso após Laminação: ', width2, padstr), { continued: true })
                            .font('Courier').text(f.rpad('', width2val, padstr), { continued: true })
                            .font('Courier-Bold').text(f.lpad('Mts: ', width3, padstr), { continued: true })
                            .font('Courier').text(f.rpad('', width3val, padstr))
                            .moveDown(md);

                        doc
                            .font('Courier-Bold').text(f.lpad('Formato após 2ª Laminação: ', width1, padstr), { continued: true })
                            .font('Courier').text(f.rpad('', width1val, padstr), { continued: true })
                            .font('Courier-Bold').text(f.lpad('Peso após 2ª Laminação: ', width2, padstr), { continued: true })
                            .font('Courier').text(f.rpad('', width2val, padstr), { continued: true })
                            .font('Courier-Bold').text(f.lpad('Mts: ', width3, padstr), { continued: true })
                            .font('Courier').text(f.rpad('', width3val, padstr))
                            .moveDown(md);

                        doc
                            .font('Courier-Bold')
                            .text(
                            f.lpad('Tratamento', 15, padstr) +
                            f.lpad('Turno', 16, padstr) +
                            f.lpad('Nº da', 13, padstr) +
                            f.lpad('Operador', 14, padstr) +
                            f.lpad('Hora', 11, padstr) +
                            f.lpad('Hora', 13, padstr) +
                            f.lpad('Data', 10, padstr) +
                            f.lpad('Aprovado /', 15, padstr) +
                            f.lpad('Aprovado /', 14, padstr)
                            )
                            .moveDown(md);

                        doc
                            .font('Courier-Bold').fontSize(6.5)
                            .text(f.lpad('[ ]Interno [ ]Externo', 21, padstr), { continued: true })
                            .fontSize(7.5)
                            .text(
                            f.lpad('Máquina', 27, padstr) +
                            f.lpad('Inicial', 25, padstr) +
                            f.lpad('Final', 12, padstr) +
                            f.lpad('Reprovado', 24, padstr) +
                            f.lpad('Reprovado', 14, padstr)
                            )
                            .moveDown(md);

                        doc
                            .font('Courier-Bold')
                            .text(
                            f.lpad('Operador', 106, padstr) +
                            f.lpad('C/Q', 11, padstr)
                            )
                            .moveDown(md);

                        doc
                            .font('Courier-Bold')
                            .text(
                            f.lpad('Extrusão:', 14, padstr) +
                            f.lpad('[ ]A [ ]B [ ]C', 21, padstr) +
                            f.lpad('[ ] A [ ] R', 72, padstr) +
                            f.lpad('[ ] A [ ] R', 14, padstr)
                            )
                            .moveDown(md);

                        doc
                            .font('Courier-Bold')
                            .text(
                            f.lpad('Impressão:', 14, padstr) +
                            f.lpad('[ ]A [ ]B [ ]C', 21, padstr) +
                            f.lpad('[ ] A [ ] R', 72, padstr) +
                            f.lpad('[ ] A [ ] R', 14, padstr)
                            )
                            .moveDown(md);

                        doc
                            .font('Courier-Bold')
                            .text(
                            f.lpad('Laminação:', 14, padstr) +
                            f.lpad('[ ]A [ ]B [ ]C', 21, padstr) +
                            f.lpad('[ ] A [ ] R', 72, padstr) +
                            f.lpad('[ ] A [ ] R', 14, padstr)
                            )
                            .moveDown(md);

                        doc
                            .font('Courier-Bold')
                            .text(
                            f.lpad('2ª Laminação:', 14, padstr) +
                            f.lpad('[ ]A [ ]B [ ]C', 21, padstr) +
                            f.lpad('[ ] A [ ] R', 72, padstr) +
                            f.lpad('[ ] A [ ] R', 14, padstr)
                            )
                            .moveDown(md);

                        doc
                            .moveTo(117, 169)
                            .lineTo(117, 260)
                            .stroke()
                            .moveTo(195, 169)
                            .lineTo(195, 260)
                            .stroke()
                            .moveTo(240, 117)
                            .lineTo(240, 260)
                            .stroke()
                            .moveTo(303, 169)
                            .lineTo(303, 260)
                            .stroke()
                            .moveTo(358, 169)
                            .lineTo(358, 260)
                            .stroke()
                            .moveTo(415, 169)
                            .lineTo(415, 260)
                            .stroke()
                            .moveTo(460, 117)
                            .lineTo(460, 260)
                            .stroke()
                            .moveTo(523, 169)
                            .lineTo(523, 260)
                            .stroke()
                            ;

                        doc
                            .font('Courier-Bold')
                            .text(
                            'Visto do Encarregado:' +
                            f.lpad('Visto do C/Q:', 66, padstr)
                            )
                            .moveDown(md);

                        doc
                            .font('Courier-Bold')
                            .text('Observações:')
                            .moveDown(md).text(' ')
                            .moveDown(md);

                        doc
                            .font('Courier-Bold')
                            .text(
                            'Fornecedor:' +
                            f.lpad('Código do Produto:', 55, padstr)
                            )
                            .moveDown(md);

                        doc
                            .font('Courier-Bold')
                            .text('Motivo da Reprovação:')
                            .moveDown(md).text(' ')
                            .moveDown(md);

                        // Lines
                        doc.y = 78;

                        let nolines = [7, 8, 15];
                        for (var z = 0; z < 20; z++) {
                            doc.y = doc.y + 13;
                            if (nolines.indexOf(z) < 0) {
                                doc
                                    .moveTo(25, doc.y)
                                    .lineTo(589, doc.y)
                                    .stroke();
                            }
                        }

                        doc
                            .font('Courier-Bold')
                            .text('Observações da Bobina:', 30, 342);

                        doc
                            .font('Courier')
                            .text(f.rpad('obsasd as d', 700), 131, 342, { width: 450, height: 70, underline: true });

                        doc
                            .font('Courier-Bold')
                            .text('ATENÇÃO: O ESTORNO DEVERÁ RETORNAR AO DEPÓSITO COM ESTA ETIQUETA', 227, 398);

                        svgtopdfkit(
                            doc
                            , barcode("-10-000002952", "code39", { width: 380, barHeight: 40, toFile: false })
                            , 230, 405
                        );
                        doc
                            .font('Courier')
                            .text('-10-000002952', 345, 438);

                        doc
                            .font('Courier-Bold')
                            .text('Data Inc.:', 530, 410, { width: 50 })
                            .font('Courier')
                            .text('23/10/2017', 530, 420, { width: 50 });

                        doc
                            .font('Courier-Bold')
                            .fontSize(9)
                            .text('1', 76, 355)
                            .text('2', 76, 363)
                            .text('3', 76, 371)
                            .text('4', 76, 379)
                            .text('5', 76, 387)
                            ;
                        doc.circle(78, 398, 45)
                            .stroke()
                            .circle(78, 398, 5)
                            .stroke();

                        // Part 2

                        doc.moveTo(25, 460)
                            .lineTo(589, 460) //top
                            .lineTo(589, 623) //right
                            .lineTo(25, 623) //bottom
                            .lineTo(25, 460) //left
                            .stroke()
                            ;

                        // Title

                        doc.image('files/' + image.id + '.' + image.type, 35, 467, { width: 100 });

                        doc.moveTo(25, 510)
                            .lineTo(589, 510) // Cabeçalho
                            .stroke();

                        doc
                            .font('Courier-Bold')
                            .fontSize(11)
                            .text('IDENTIFICAÇÃO E STATUS DA BOBINA Nº ' + volume.id, 165, 480);

                        width1 = 15;
                        width1val = 107;

                        doc
                            .fontSize(7.5)
                            .font('Courier-Bold').text(f.lpad('Fornecedor: ', width1, padstr), 30, 515, { continued: true })
                            .font('Courier').text(f.rpad('27578', width1val, padstr))
                            .moveDown(md);

                        doc
                            .font('Courier-Bold').text(f.lpad('Produto: ', width1, padstr), { continued: true })
                            .font('Courier').text(f.rpad('27578', width1val, padstr))
                            .moveDown(md);

                        doc
                            .font('Courier-Bold').text(f.lpad('Observação: ', width1, padstr), { continued: true })
                            .font('Courier').text(f.rpad('27578', width1val, padstr))
                            .moveDown(md);

                        width1 = 15;
                        width1val = 15;
                        width2 = 25;
                        width2val = 15;
                        width3 = 25;
                        width3val = 25;

                        doc
                            .font('Courier-Bold').text(f.lpad('Nota Fiscal: ', width1, padstr), { continued: true })
                            .font('Courier').text(f.rpad('27578', width1val, padstr), { continued: true })
                            .font('Courier-Bold').text(f.lpad('Data Emi.: ', width1, padstr), { continued: true })
                            .font('Courier').text(f.rpad('27578', width1val, padstr), { continued: true })
                            .font('Courier-Bold').text(f.lpad('Data Inc.: ', width1, padstr), { continued: true })
                            .font('Courier').text(f.rpad('27578', width1val, padstr))
                            .moveDown(md);

                        doc
                            .font('Courier-Bold').text(f.lpad('Qtde: ', width1, padstr), { continued: true })
                            .font('Courier').text(f.rpad('27578', width1val, padstr), { continued: true })
                            .font('Courier-Bold').text(f.lpad('OC: ', width1, padstr), { continued: true })
                            .font('Courier').text(f.rpad('27578', width1val, padstr), { continued: true })
                            .font('Courier-Bold').text(f.lpad('Vol.: ', width1, padstr), { continued: true })
                            .font('Courier').text(f.rpad('27578', width1val, padstr))
                            .moveDown(md);

                        doc.moveTo(25, 578)
                            .lineTo(589, 578)
                            .stroke();

                        svgtopdfkit(
                            doc
                            , barcode("-10-000002952", "code39", { width: 380, barHeight: 40, toFile: false })
                            , 170, 582
                        );
                        doc
                            .font('Courier')
                            .text('-10-000002952', 285, 615);

                        doc
                            .font('Courier')
                            .fontSize(120)
                            .text('2952363', 25, 630);
                    }

                    doc.end();
                    stream.on('finish', function () {
                        return application.success(obj.res, {
                            modal: {
                                id: 'modalevt'
                                , fullscreen: true
                                , title: '<div class="col-sm-12" style="text-align: center;">Visualização</div>'
                                , body: '<iframe src="/download/' + filename + '" style="width: 100%; height: 700px;"></iframe>'
                                , footer: '<button type="button" class="btn btn-default btn-sm" style="margin-right: 5px;" data-dismiss="modal">Voltar</button><a href="/download/' + filename + '" target="_blank"><button type="button" class="btn btn-primary btn-sm">Download do Arquivo</button></a>'
                            }
                        });
                    });
                }

                , gerarVolumes: async function (obj) {
                    if (obj.req.method == 'GET') {
                        if (obj.ids == null) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }
                        let ids = obj.ids.split(',');
                        if (ids.length != 1) {
                            return application.error(obj.res, { msg: 'Selecione apenas 1 item para gerar volumes' });
                        }

                        let body = '';
                        body += application.components.html.hidden({ name: 'ids', value: obj.ids });
                        body += application.components.html.integer({
                            width: 6
                            , label: 'Volumes a serem Gerados'
                            , name: 'qtd'
                        });
                        body += application.components.html.decimal({
                            width: 6
                            , label: 'Quantidade por Volume'
                            , name: 'qtdvolume'
                            , precision: 4
                        });

                        return application.success(obj.res, {
                            modal: {
                                form: true
                                , action: '/event/' + obj.event.id
                                , id: 'modalevt'
                                , title: 'Gerar Volume'
                                , body: body
                                , footer: '<button type="button" class="btn btn-default btn-sm" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary btn-sm">Gerar</button>'
                            }
                        });
                    } else {

                        let invalidfields = application.functions.getEmptyFields(obj.req.body, ['ids', 'qtd']);
                        if (invalidfields.length > 0) {
                            return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                        }

                        try {

                            let bulkvolume = [];
                            let nfitem = await db.getModel('est_nfentradaitem').find({
                                where: {
                                    id: obj.req.body.ids
                                }
                            });
                            let nf = await db.getModel('est_nfentrada').find({
                                where: {
                                    id: nfitem.idnfentrada
                                }
                            });

                            if (nf.finalizado) {
                                return application.error(obj.res, { msg: 'Não é possível gerar volumes de uma nota finalizada' });
                            }

                            let qtdvolume = 0;
                            if (obj.req.body.qtdvolume) {
                                qtdvolume = application.formatters.be.decimal(obj.req.body.qtdvolume, 4);
                            } else {
                                qtdvolume = (nfitem.qtd / obj.req.body.qtd).toFixed(4);
                            }

                            for (var i = 0; i < obj.req.body.qtd; i++) {
                                bulkvolume.push({
                                    idversao: nfitem.idversao
                                    , iddeposito: nf.iddeposito
                                    , iduser: obj.req.user.id
                                    , datahora: moment()
                                    , qtd: qtdvolume
                                    , qtddisponivel: qtdvolume
                                    , consumido: false
                                    , idnfentradaitem: nfitem.id
                                });
                            }

                            await db.getModel('est_volume').bulkCreate(bulkvolume);

                            nfitem.qtdvolumes = await db.getModel('est_volume').count({ where: { idnfentradaitem: nfitem.id } });
                            await nfitem.save();

                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });

                        } catch (err) {
                            return application.fatal(obj.res, err);
                        }

                    }
                }

                , removerVolume: async function (obj) {
                    if (obj.ids == null) {
                        return application.error(obj.res, { msg: application.message.selectOneEvent });
                    }
                    let ids = obj.ids.split(',');

                    try {

                        let volumes = await db.getModel('est_volume').findAll({
                            where: {
                                id: { $in: ids }
                            }
                        });

                        let nfitem = await db.getModel('est_nfentradaitem').find({
                            where: {
                                id: volumes[0].idnfentradaitem
                            }
                        });

                        let nf = await db.getModel('est_nfentrada').find({
                            where: {
                                id: nfitem.idnfentrada
                            }
                        });

                        if (nf.finalizado) {
                            return application.error(obj.res, { msg: 'Não é possível remover volumes de uma nota finalizada' });
                        }

                        nfitem.qtdvolumes = nfitem.qtdvolumes - ids.length;

                        await db.getModel('est_volume').destroy({
                            where: {
                                id: { $in: ids }
                            }
                        });
                        await nfitem.save();

                        //unbound files
                        let filestounbound = [];
                        for (var i = 0; i < volumes.length; i++) {
                            if (volumes[i].fotos) {
                                let j = JSON.parse(volumes[i].fotos);
                                for (var z = 0; z < j.length; z++) {
                                    filestounbound.push(j[z].id);
                                }
                            }
                        }
                        if (filestounbound.length > 0) {
                            await db.getModel('file').update({
                                bounded: false
                            }, {
                                    where: {
                                        id: { $in: filestounbound }
                                    }
                                });
                        }

                        return application.success(obj.res, { msg: application.message.success, reloadtables: true });

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }


                }

                , onsave: async function (obj, next) {
                    try {

                        if (obj.view.id == 66) {
                            let volume = await db.getModel('est_volume').find({
                                where: {
                                    id: obj.id
                                }
                            });
                            let nfitem = await db.getModel('est_nfentradaitem').find({
                                where: {
                                    id: volume.idnfentradaitem
                                }
                            });
                            let nf = await db.getModel('est_nfentrada').find({
                                where: {
                                    id: nfitem.idnfentrada
                                }
                            });
                            if (nf.finalizado) {
                                return application.error(obj.res, { msg: 'Não é possível alterar volumes de uma nota finalizada' });
                            }
                        }

                        let save = await next(obj);

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }

            }

            , est_mov: {
                onsave: async function (obj, next) {
                    const f = main.plastrela.estoque;
                    if (obj.id == 0) {
                        obj.register.iduser = obj.req.user.id;
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
            approducao: {
                _recalcula: function (id) {
                    return new Promise((resolve, reject) => {
                        db.getModel('pcp_approducao').find({ where: { id: id } }).then(approducao => {

                            db.getModel('pcp_approducaovolume').findAll({
                                where: { idapproducao: approducao.id }
                            }).then(volumes => {

                                db.getModel('pcp_approducaotempo').findAll({
                                    where: { idapproducao: approducao.id }
                                    , order: [['dataini', 'desc']]
                                }).then(tempos => {

                                    let intervalos = [];
                                    let pesoliquido = 0;
                                    let qtd = 0;

                                    for (var i = 0; i < tempos.length; i++) {
                                        intervalos.push(moment(tempos[i].dataini).format('DD/MM HH:mm') + ' - ' + moment(tempos[i].datafim).format('DD/MM HH:mm'));
                                    }

                                    for (var i = 0; i < volumes.length; i++) {
                                        pesoliquido += parseFloat(volumes[i].pesoliquido);
                                        qtd += parseFloat(volumes[i].qtd);
                                    }

                                    approducao.intervalo = intervalos.join('<br>');
                                    approducao.qtd = qtd.toFixed(4);
                                    approducao.pesoliquido = pesoliquido.toFixed(4);
                                    approducao.save().then(() => {
                                        resolve(true);
                                    });

                                });
                            });
                        });
                    });
                }

                , adicionar: async function (obj) {
                    try {
                        let oprecurso = await db.getModel('pcp_oprecurso').find({ where: { id: obj.id } });
                        let approducoes = await db.getModel('pcp_approducao').findAll({ where: { idoprecurso: oprecurso.id } });

                        if (approducoes.length > 0) {

                            return application.success(obj.res, { redirect: '/view/74/' + approducoes[0].id + '?parent=' + oprecurso.id });

                        } else {

                            let newapproducao = await db.getModel('pcp_approducao').create({ idoprecurso: oprecurso.id });
                            return application.success(obj.res, { redirect: '/view/74/' + newapproducao.id + '?parent=' + oprecurso.id });

                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , approducaotempo: {

                onsave: async function (obj, next) {
                    try {
                        let dataini = moment(obj.register.dataini);
                        let datafim = moment(obj.register.datafim);
                        let duracao = datafim.diff(dataini, 'm');

                        if (duracao <= 0) {
                            return application.error(obj.res, { msg: 'Datas incorretas, verifique' });
                        }
                        obj.register.duracao = duracao;

                        let save = await next(obj);
                        if (save.success) {
                            main.plastrela.pcp.approducao._recalcula(save.register.idapproducao);
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , approducaovolume: {
                onsave: async function (obj, next) {
                    try {
                        obj.register.pesoliquido = (obj.register.pesobruto - obj.register.tara).toFixed(4);

                        await next(obj);

                        let save = await next(obj);
                        if (save.success) {
                            main.plastrela.pcp.approducao._recalcula(save.register.idapproducao);
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , apparada: {
                onsave: function (obj, next) {
                    let dataini = moment(obj.register.dataini);
                    let datafim = moment(obj.register.datafim);
                    let duracao = datafim.diff(dataini, 'm');

                    if (duracao <= 0) {
                        return application.error(obj.res, { msg: 'Datas incorretas, verifique' });
                    }

                    obj.register.duracao = duracao;

                    next(obj);
                }
            }
            , apinsumo: {
                __adicionarModal: function (obj) {
                    let body = '';

                    body += application.components.html.autocomplete({
                        width: 12
                        , label: 'Operador'
                        , name: 'iduser'
                        , model: 'users'
                        , attribute: 'fullname'
                    });

                    body += application.components.html.text({
                        width: 12
                        , label: 'Código de Barra'
                        , name: 'codigodebarra'
                    });

                    body += application.components.html.text({
                        width: '4'
                        , name: 'idvolume'
                        , label: 'ID Volume'
                        , disabled: 'disabled="disabled"'
                    });

                    body += application.components.html.decimal({
                        width: '4'
                        , label: 'Quantidade Disponível'
                        , name: 'qtddisponivel'
                        , precision: '4'
                        , disabled: 'disabled="disabled"'
                    });

                    body += application.components.html.decimal({
                        width: '4'
                        , label: 'Quantidade para Consumir'
                        , name: 'qtd'
                        , precision: '4'
                    });

                    return application.success(obj.res, {
                        modal: {
                            id: 'apinsumoAdicionarModal'
                            , title: 'Apontamento de Insumo'
                            , body: body
                            , footer: '<button type="button" class="btn btn-default btn-sm" data-dismiss="modal">Cancelar</button> <button id="apontar" type="button" class="btn btn-primary btn-sm">Apontar</button>'
                        }
                    });
                }
                , __pegarVolume: async function (obj) {
                    if (!obj.data.codigodebarra) {
                        return application.error(obj.res, { msg: 'Informe o código de barra' });
                    }

                    let codigodebarra = obj.data.codigodebarra.split('-');
                    codigodebarra = parseInt(codigodebarra[codigodebarra.length - 1]);

                    let volume = await db.getModel('est_volume').find({ where: { id: codigodebarra } });
                    if (volume) {
                        if (volume.consumido) {
                            return application.error(obj.res, { msg: 'Volume já se encontra consumido' });
                        } else {
                            return application.success(obj.res, {
                                data: {
                                    id: volume.id
                                    , qtddisponivel: application.formatters.fe.decimal(volume.qtddisponivel, 4)
                                }
                            });
                        }
                    } else {
                        return application.error(obj.res, { msg: 'Volume não encontrado' });
                    }
                }
                , __apontarVolume: async function (obj) {
                    let invalidfields = application.functions.getEmptyFields(obj.data, ['idoprecurso', 'idvolume', 'iduser', 'qtd']);
                    if (invalidfields.length > 0) {
                        return application.error(obj.res, { invalidfields: invalidfields });
                    }

                    let volume = await db.getModel('est_volume').find({ where: { id: obj.data.idvolume } });


                    return application.success(obj.res, { msg: 'apontado' });
                }
            }
            , oprecurso: {
                save: function (obj, next) {
                    if (obj.id == 0) {
                        db.getModel('pcp_config').find().then(config => {
                            if (config && config.idestadoinicial) {
                                obj.register.idestado = config.idestadoinicial;
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