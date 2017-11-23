var application = require('../../routes/application')
    , db = require('../../models')
    , schedule = require('../../routes/schedule')
    , moment = require('moment')
    , fs = require('fs')
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

    , sipfinancas: {
        financeiro: {
            categoria: {
                __getDC: async function (obj) {
                    try {
                        let categoria = await db.getModel('fin_categoria').find({ where: { id: obj.data.id } });
                        return application.success(obj.res, { data: categoria.dc });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , onsave: async function (obj, next) {
                    try {

                        if (obj.register.id == 0) {
                            if (obj.register.idcategoriapai) {
                                let categoriapai = await db.getModel('fin_categoria').find({ where: { id: obj.register.idcategoriapai } });
                                obj.register.dc = categoriapai.dc;
                            } else {
                                obj.register.dc = parseInt(obj.req.body.dc);
                            }
                        }

                        await next(obj);
                        main.sipfinancas.financeiro.categoria.treeAll();
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
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
            , movparc: {
                onsave: async function (obj, next) {
                    try {

                        let mov = await db.getModel('fin_mov').find({ where: { id: obj.register.idmov } });
                        let sql = await db.sequelize.query(`
                            select
                                fin_mov.valor - coalesce(
                                    (select
                                        sum(mp.valor)
                                    from fin_movparc mp where fin_mov.id = mp.idmov and mp.id != :v2)                                        
                                , 0) as valoraberto
                            from
                                fin_mov
                            where
                                id = :v1
                            `
                            , {
                                type: db.sequelize.QueryTypes.SELECT
                                , replacements: {
                                    v1: mov.id
                                    , v2: obj.register.id
                                }
                            });
                        sql = parseFloat(sql[0].valoraberto) - parseFloat(obj.register.valor);
                        if (sql <= 0) {
                            mov.quitado = true;
                        } else {
                            mov.quitado = false;
                        }
                        await mov.save();

                        next(obj);

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , ondelete: async function (obj, next) {
                    try {

                        let movparcs = await db.getModel('fin_movparc').findAll({ where: { id: { $in: obj.ids } } });
                        let ids = [];
                        for (let i = 0; i < movparcs.length; i++) {
                            ids.push(movparcs[i].idmov);
                        }
                        let movs = await db.getModel('fin_mov').findAll({ where: { id: { $in: ids } } });

                        next(obj);

                        for (let i = 0; i < movs.length; i++) {
                            movs[i].quitado = false;
                            movs[i].save();
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , __venda_adicionarModal: async function (obj) {
                    try {

                        let body = '';
                        body += application.components.html.hidden({ name: 'idpedido', value: obj.data.id });
                        body += application.components.html.integer({
                            width: '4'
                            , label: 'Quantidade de Parcelas'
                            , name: 'qtd'
                        });
                        body += application.components.html.date({
                            width: '4'
                            , label: 'Data da Primeira Parcela'
                            , name: 'data'
                            , value: moment().format('DD/MM/YYYY')
                        });
                        body += application.components.html.integer({
                            width: '4'
                            , label: 'Dias entre Parcelas'
                            , name: 'dias'
                            , value: '30'
                        });

                        return application.success(obj.res, {
                            modal: {
                                form: true
                                , id: 'venda_adicionarModal_modal'
                                , title: 'Adicionar Parcelas'
                                , body: body
                                , footer: '<button type="button" class="btn btn-default btn-sm" data-dismiss="modal">Cancelar</button> <button id="venda_adicionarModal_submit" type="button" class="btn btn-primary btn-sm">Adicionar</button>'
                            }
                        });

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , __venda_adicionar: async function (obj) {
                    try {

                        let invalidfields = application.functions.getEmptyFields(obj.data, ['idpedido', 'qtd', 'data', 'dias']);
                        if (invalidfields.length > 0) {
                            return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                        }

                        let pedido = await db.getModel('ven_pedido').find({ where: { id: obj.data.idpedido } });
                        let sum = await db.sequelize.query(
                            `select round(sum(qtd * unitario), 3) as sum from ven_pedidoitem where idpedido = :v1`
                            , {
                                type: db.sequelize.QueryTypes.SELECT
                                , replacements: {
                                    v1: pedido.id
                                }
                            });
                        sum = parseFloat(sum[0].sum);
                        if (sum <= 0) {
                            return application.error(obj.res, { msg: 'A soma valor dos itens é menor ou igual a 0' });
                        }

                        let bulkmov = [];

                        for (let i = 1; i <= obj.data.qtd; i++) {
                            bulkmov.push({
                                parcela: i + '/' + obj.data.qtd
                                , datavcto: i == 1 ? application.formatters.be.date(obj.data.data) : obj.data.dias == 30 ? moment(obj.data.data, 'DD/MM/YYYY').add(i - 1, 'M').format('YYYY-MM-DD') : moment(obj.data.data, 'DD/MM/YYYY').add((i - 1) * obj.data.dias, 'day').format('YYYY-MM-DD')
                                , idpedido: obj.data.idpedido
                                , idcategoria: pedido.nfe ? 3 : 2
                                , valor: (sum / parseInt(obj.data.qtd)).toFixed(2)
                                , idcorr: pedido.idcliente
                                , detalhes: 'Venda ' + pedido.id + ' NF ' + pedido.nfe
                                , quitado: false
                            });
                        }

                        await db.getModel('fin_mov').bulkCreate(bulkmov);

                        return application.success(obj.res, { msg: application.message.success, reloadtables: true });

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , mov: {
                e_baixarTitulos: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {
                            if (obj.ids.length <= 0) {
                                return application.error(obj.res, { msg: application.message.selectOneEvent });
                            }

                            let body = '';
                            body += '<div class="row no-margin">';
                            body += application.components.html.hidden({ name: 'ids', value: obj.ids.join(',') });
                            body += application.components.html.autocomplete({
                                width: '2'
                                , label: 'Conta*'
                                , name: 'idconta'
                                , model: 'fin_conta'
                                , attribute: 'descricao'
                            });
                            body += application.components.html.date({
                                width: '3'
                                , label: 'Data Recebimento/Pagamento*'
                                , name: 'data'
                            });
                            body += '</div><hr>';

                            let valortotalselecionado = 0;
                            for (let i = 0; i < obj.ids.length; i++) {

                                let mov = await db.getModel('fin_mov').find({ where: { id: obj.ids[i] }, include: [{ all: true }] });
                                let valoraberto = application.formatters.fe.decimal((await db.sequelize.query(`
                                    select
                                        m.valor - coalesce(
                                            (select
                                            sum(mp.valor)
                                            from fin_movparc mp where m.id = mp.idmov)                                        
                                        , 0) as valoraberto
                                    from
                                        fin_mov m
                                    where m.id = :v1
                                    `
                                    , {
                                        type: db.sequelize.QueryTypes.SELECT
                                        , replacements: {
                                            v1: mov.id
                                        }
                                    }))[0].valoraberto, 2);
                                valortotalselecionado += parseFloat(application.formatters.be.decimal(valoraberto, 2))

                                body += '<div class="row no-margin">';

                                body += application.components.html.integer({
                                    width: '1'
                                    , label: 'ID'
                                    , name: 'id' + obj.ids[i]
                                    , value: mov.id
                                    , disabled: 'disabled="disabled"'
                                });

                                body += application.components.html.text({
                                    width: '3'
                                    , label: 'Correntista'
                                    , name: 'cliente' + obj.ids[i]
                                    , value: mov.cad_corr.nome
                                    , disabled: 'disabled="disabled"'
                                });

                                body += application.components.html.autocomplete({
                                    width: '2'
                                    , label: 'Forma de Pagamento*'
                                    , name: 'idformapgto' + obj.ids[i]
                                    , model: 'fin_formapgto'
                                    , attribute: 'descricao'
                                });

                                body += application.components.html.decimal({
                                    width: '2'
                                    , label: 'Valor*'
                                    , name: 'valor' + obj.ids[i]
                                    , precision: 2
                                    , value: valoraberto
                                });

                                body += application.components.html.decimal({
                                    width: '2'
                                    , label: 'Juro'
                                    , name: 'juro' + obj.ids[i]
                                    , precision: 2
                                });

                                body += application.components.html.decimal({
                                    width: '2'
                                    , label: 'Desconto'
                                    , name: 'desconto' + obj.ids[i]
                                    , precision: 2
                                });

                                body += '</div><hr>';

                            }

                            body += '<div class="row no-margin">';
                            body += application.components.html.decimal({
                                width: '2 col-md-offset-6'
                                , label: 'Total Valor'
                                , name: 'valortotal'
                                , precision: 2
                                , disabled: 'disabled="disabled"'
                                , value: application.formatters.fe.decimal(valortotalselecionado, 2)
                            });
                            body += '</div>';

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , fullscreen: true
                                    , id: 'modalevt'
                                    , action: '/event/' + obj.event.id
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default btn-sm" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary btn-sm">Baixar</button>'
                                }
                            });

                            return application.success(obj.res, { msg: 'aa' });

                        } else {

                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['ids', 'idconta', 'data']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }
                            let ids = obj.req.body.ids.split(',');
                            let requiredFields = [];
                            for (let i = 0; i < ids.length; i++) {
                                requiredFields = requiredFields.concat(application.functions.getEmptyFields(obj.req.body, [
                                    'idformapgto' + ids[i]
                                    , 'valor' + ids[i]
                                ]));
                            }
                            if (requiredFields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: requiredFields });
                            }

                            let bulkmovparc = [];
                            for (let i = 0; i < ids.length; i++) {
                                bulkmovparc.push({
                                    valor: application.formatters.be.decimal(obj.req.body['valor' + ids[i]], 2)
                                    , idmov: ids[i]
                                    , idformapgto: obj.req.body['idformapgto' + ids[i]]
                                    , idconta: obj.req.body.idconta
                                    , desconto: obj.req.body['desconto' + ids[i]] ? application.formatters.be.decimal(obj.req.body['desconto' + ids[i]], 2) : null
                                    , juro: obj.req.body['juro' + ids[i]] ? application.formatters.be.decimal(obj.req.body['juro' + ids[i]], 2) : null
                                    , data: application.formatters.be.date(obj.req.body.data)
                                });
                            }
                            await db.getModel('fin_movparc').bulkCreate(bulkmovparc);

                            for (let i = 0; i < ids.length; i++) {
                                let valoraberto = parseFloat((await db.sequelize.query(`
                                select
                                    m.valor - coalesce(
                                        (select
                                        sum(mp.valor)
                                        from fin_movparc mp where m.id = mp.idmov)                                        
                                    , 0) as valoraberto
                                from
                                    fin_mov m
                                where m.id = :v1
                                `
                                    , {
                                        type: db.sequelize.QueryTypes.SELECT
                                        , replacements: {
                                            v1: ids[i]
                                        }
                                    }))[0].valoraberto);
                                if (valoraberto <= 0) {
                                    let mov = await db.getModel('fin_mov').find({ where: { id: ids[i] } });
                                    mov.quitado = true;
                                    await mov.save();
                                }
                            }

                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
        }
        , venda: {

        }
    }
}

module.exports = main;