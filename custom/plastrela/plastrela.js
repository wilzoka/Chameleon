var application = require('../../routes/application')
    , db = require('../../models')
    , schedule = require('../../routes/schedule')
    , moment = require('moment')
    , fs = require('fs')
    , lodash = require('lodash');
;

var main = {
    plataform: {
        config: {
            __getGoogleMapsKey: async function (obj) {
                try {
                    let config = await db.getModel('config').find();
                    return application.success(obj.res, { data: config.googlemapskey });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
        }
        , kettle: {
            f_runTransformation: function (filepath) {
                db.getModel('config').find().then(config => {
                    let nrc = require('node-run-cmd');
                    if (application.functions.isWindows()) {
                        nrc.run('Pan.bat /file:' + __dirname + '/' + filepath
                            , { cwd: config.kettlepath });
                    } else {
                        nrc.run('pan.sh -file=' + __dirname + '/' + filepath
                            , { cwd: config.kettlepath });
                    }
                });
            }
            , f_runJob: function (filepath) {
                db.getModel('config').find().then(config => {
                    let nrc = require('node-run-cmd');
                    if (application.functions.isWindows()) {
                        nrc.run('Kitchen.bat /file:' + __dirname + '/' + filepath
                            , {
                                cwd: config.kettlepath
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
                        nrc.run(config.kettlepath + '/kitchen.sh -file=' + __dirname + '/' + filepath
                            , {
                                // onData: function (data) {
                                //     console.log('data', data);
                                // }
                                // , onDone: function (data) {
                                //     console.log('done', data);
                                // }
                                // , onError: function (data) {
                                //     console.log('err', data);
                                // }
                            });
                    }
                });
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
                        return console.error(err);
                    }
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
        , model: {
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
        , permission: {
            onsave: async function (obj, next) {
                try {

                    let permission = await db.getModel('permission').find({
                        where: {
                            id: { $ne: obj.register.id }
                            , iduser: obj.register.iduser
                            , idmenu: obj.register.idmenu
                        }
                    });

                    if (permission) {
                        return application.error(obj.res, { msg: 'Este usuário já possui acesso a este menu' });
                    }

                    next(obj);
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
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
    }

    , plastrela: {
        sync: function () {
            main.plataform.kettle.f_runJob('sync/Job.kjb');
        }
        , schedule: {
            integracaoApontamentos: function () {
                main.plataform.kettle.f_runJob('pcp/ap/integracaoIniflex/Job.kjb');
            }
            , integracaoVolumes: function () {
                main.plataform.kettle.f_runJob('estoque/integracaovolumes/Job.kjb');
            }
        }
        , compra: {
            solicitacaoitem: {
                onsave: async function (obj, next) {
                    try {

                        let config = await db.getModel('cmp_config').find();

                        if (obj.id == 0) {
                            obj.register.iduser = obj.req.user.id;
                            obj.register.datainclusao = moment();

                            if (!obj.register.idestado) {
                                obj.register.idestado = config.idsolicitacaoestadoinicial;
                            }
                        } else {
                            if (obj.register._previousDataValues.idestado == config.idsolicitacaoestadofinal) {
                                return application.error(obj.res, { msg: 'Não é possivel modificar uma solicitação finalizada' });
                            }
                        }

                        next(obj);

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , _dividir: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {
                            if (obj.ids.length != 1) {
                                return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                            }

                            let body = '';
                            body += application.components.html.hidden({ name: 'id', value: obj.ids[0] });
                            body += application.components.html.decimal({
                                width: '12'
                                , label: 'Quantidade'
                                , name: 'qtd'
                                , precision: '4'
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt'
                                    , title: 'Dividir Solicitação'
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default btn-sm" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary btn-sm">Dividir</button>'
                                }
                            });
                        } else {

                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['id', 'qtd']);
                            let qtd = parseFloat(application.formatters.be.decimal(obj.req.body.qtd, 4));
                            let solicitacaoitem = await db.getModel('cmp_solicitacaoitem').find({ where: { id: obj.req.body.id } });
                            let config = await db.getModel('cmp_config').find();

                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }
                            if (qtd > parseFloat(solicitacaoitem.qtd)) {
                                return application.error(obj.res, { msg: 'A quantidade informada excede a quantidade da solicitação' });
                            }
                            if (solicitacaoitem.idestado == config.idsolicitacaoestadofinal) {
                                return application.error(obj.res, { msg: 'Não é possível dividir solicitação finalizada' });
                            }

                            await db.getModel('cmp_solicitacaoitem').create({
                                iduser: solicitacaoitem.iduser,
                                idversao: solicitacaoitem.idversao,
                                idpedidoitem: solicitacaoitem.idpedidoitem,
                                idestado: solicitacaoitem.idestado,
                                ociniflex: solicitacaoitem.ociniflex,
                                dataprevisao: solicitacaoitem.dataprevisao,
                                qtd: qtd.toFixed(4)
                            });

                            solicitacaoitem.qtd = (parseFloat(solicitacaoitem.qtd) - qtd).toFixed(4);
                            await solicitacaoitem.save();

                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , _alterarEstado: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {
                            if (obj.ids.length <= 0) {
                                return application.error(obj.res, { msg: application.message.selectOneEvent });
                            }

                            let body = '';
                            body += application.components.html.hidden({ name: 'ids', value: obj.ids.join(',') });
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'Estado'
                                , name: 'idestado'
                                , model: 'cmp_solicitacaoestado'
                                , attribute: 'descricao'
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt'
                                    , title: 'Alterar Estado'
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default btn-sm" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary btn-sm">Alterar</button>'
                                }
                            });
                        } else {

                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['ids', 'idestado']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }
                            let config = await db.getModel('cmp_config').find();
                            let sql = await db.getModel('cmp_solicitacaoitem').findAll({
                                where: {
                                    id: { $in: obj.req.body.ids.split(',') }
                                    , idestado: config.idsolicitacaoestadofinal
                                }
                            });
                            if (sql.length > 0) {
                                return application.error(obj.res, { msg: 'Não é possível alterar o estado de solicitações finalizadas' });
                            }

                            await db.getModel('cmp_solicitacaoitem').update({ idestado: obj.req.body.idestado }, { where: { id: { $in: obj.req.body.ids.split(',') } } });

                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , _imprimir: async function (obj) {
                    try {

                        let f = application.functions;
                        let pdfkit = require('pdfkit');

                        if (obj.ids.length == 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }

                        const doc = new pdfkit({
                            autoFirstPage: false
                        });

                        let config = await db.getModel('config').find({ raw: true });
                        let image = JSON.parse(config.imagemrelatorio)[0];
                        var filename = process.hrtime()[1] + '.pdf';
                        var stream = doc.pipe(fs.createWriteStream('tmp/' + filename));

                        doc.addPage({
                            margin: 30
                        });

                        doc.moveTo(25, 25)
                            .lineTo(569, 25) //top
                            .lineTo(569, 75) //right
                            .lineTo(25, 75) //bottom
                            .lineTo(25, 25) //bottom
                            .stroke();

                        doc.image('files/' + image.id + '.' + image.type, 35, 33, { width: 100 });

                        // Title
                        doc
                            .font('Courier-Bold')
                            .fontSize(11)
                            .text('ITENS PARA COMPRA', 265, 47);


                        doc
                            .fontSize(7.5)
                            .text(moment().format('DD/MM/YYYY'), 510, 40)
                            .text(moment().format('HH:mm'), 522, 55);

                        let padstr = ' ';
                        let w = [11, 33, 15, 15, 31, 10]
                        let basew = 4.72;
                        let mdt = 10;
                        let mdb = 11;
                        let md = 0.6;

                        let results = await db.sequelize.query(`
                            select
                                si.id
                                , c.descricao as tipo
                                , si.qtd
                                , (select f.valor from pcp_ficha f left join pcp_atribficha af on (f.idatributo = af.id) where f.valor is not null and f.idversao = v.id and af.codigo in (15028, 176, 150028, 150038, 22)) as espessura
                                , (select f.valor from pcp_ficha f left join pcp_atribficha af on (f.idatributo = af.id) where f.valor is not null and f.idversao = v.id and af.codigo in (15046, 175, 150029, 150039, 20)) as largura
                                , u.unidade
                            from
                                cmp_solicitacaoitem si
                            left join pcp_versao v on (si.idversao = v.id)
                            left join cad_item i on (v.iditem = i.id)
                            left join est_classe c on (i.idclasse = c.id)
                            left join cad_unidade u on (i.idunidade = u.id)
                            where
                                si.id in ( ` + obj.ids.join(',') + ` )
                            `
                            , {
                                type: db.sequelize.QueryTypes.SELECT
                            });

                        let sum = 25;
                        for (let i = 0; i < results.length; i++) {
                            sum = 25;
                            if (i == 0) {

                                doc.y = 85;
                                // top
                                doc.moveTo(25, doc.y - 6)
                                    .lineTo(569, doc.y - 6)
                                    .stroke();
                                // bottom
                                doc.moveTo(25, doc.y + 7)
                                    .lineTo(569, doc.y + 7)
                                    .stroke();

                                // first
                                doc.moveTo(25, doc.y - (md * mdt))
                                    .lineTo(25, doc.y + (md * mdb))
                                    .stroke();
                                // last
                                doc.moveTo(569, doc.y - (md * mdt))
                                    .lineTo(569, doc.y + (md * mdb))
                                    .stroke();

                                for (let z = 0; z < w.length - 1; z++) {
                                    doc.moveTo(sum + (basew * w[z]), doc.y - (md * mdt))
                                        .lineTo(sum + (basew * w[z]), doc.y + (md * mdb))
                                        .stroke();
                                    sum += (basew * w[z]);
                                }

                                doc
                                    .font('Courier-Bold')
                                    .text(
                                    f.lpad(' OC ', w[0], padstr) + ' '
                                    + f.rpad('Tipo', w[1], padstr) + ' '
                                    + f.lpad('Largura(mm)', w[2], padstr) + ' '
                                    + f.lpad('Espessura(mm)', w[3], padstr) + ' '
                                    + f.lpad('Quantidade', w[4], padstr) + ' '
                                    + f.rpad('Unidade', w[5], padstr)
                                    , 27, 85)
                                    .moveDown(md);

                            }

                            // bottom
                            doc.moveTo(25, doc.y + 7)
                                .lineTo(569, doc.y + 7)
                                .stroke();

                            // first
                            doc.moveTo(25, doc.y - (md * mdt))
                                .lineTo(25, doc.y + (md * mdb))
                                .stroke();
                            // last
                            doc.moveTo(569, doc.y - (md * mdt))
                                .lineTo(569, doc.y + (md * mdb))
                                .stroke();
                            sum = 25;
                            for (let z = 0; z < w.length - 1; z++) {
                                doc.moveTo(sum + (basew * w[z]), doc.y - (md * mdt))
                                    .lineTo(sum + (basew * w[z]), doc.y + (md * mdb))
                                    .stroke();
                                sum += (basew * w[z]);
                            }

                            doc
                                .font('Courier')
                                .text(
                                f.lpad(results[i].id, w[0] - 1, padstr) + '  '
                                + f.rpad(results[i].tipo, w[1], padstr) + ' '
                                + f.lpad(application.formatters.fe.decimal(results[i].largura, 2), w[2], padstr) + ' '
                                + f.lpad(application.formatters.fe.decimal(results[i].espessura, 4), w[3], padstr) + ' '
                                + f.lpad(application.formatters.fe.decimal(results[i].qtd, 4), w[4], padstr) + ' '
                                + f.rpad(results[i].unidade, w[5], padstr)
                                )
                                .moveDown(md);
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
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
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
                        for (var i = 0; i < spednfitem.length; i++) {
                            if (!spednfitem[i].ordem_compra) {
                                return application.error(obj.res, { msg: 'Existe algum item desta nota sem ordem de compra vinculado' });
                            }
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
                                codigoviniflex: null
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
            , _finalizarEntrada: async function (obj) {
                try {

                    if (obj.ids.length != 1) {
                        return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                    }

                    let nfentrada = await db.getModel('est_nfentrada').find({ where: { id: obj.ids[0] } });
                    if (nfentrada.finalizado) {
                        return application.error(obj.res, { msg: 'Não é possível finalizar uma nota já finalizada' });
                    }

                    let results = await db.sequelize.query(`
                    select * from (select
                        ni.sequencial
                        , ni.qtd
                        , (select sum(v.qtd) from est_volume v where v.idnfentradaitem = ni.id) as totalgerado
                    from
                        est_nfentrada n
                    left join est_nfentradaitem ni on (n.id = ni.idnfentrada)
                    where
                        n.id = :v1) as x
                    where qtd != totalgerado
                    `, { type: db.sequelize.QueryTypes.SELECT, replacements: { v1: nfentrada.id } });
                    if (results.length > 0) {
                        return application.error(obj.res, { msg: 'O peso gerado do item com sequencial ' + results[0].sequencial + ' não bate com o da nota, verifique' });
                    }

                    let config = await db.getModel('cmp_config').find();
                    let nfentradaitens = await db.getModel('est_nfentradaitem').findAll({ where: { idnfentrada: nfentrada.id } });
                    let bulkreservas = [];
                    let solicitacoesfinalizadas = [];

                    for (var i = 0; i < nfentradaitens.length; i++) {
                        let solicitacaoitem = await db.getModel('cmp_solicitacaoitem').find({
                            where: {
                                idversao: nfentradaitens[i].idversao
                                , ociniflex: nfentradaitens[i].oc
                                , idestado: config.idsolicitacaoestadocomprado
                            }
                        });
                        if (solicitacaoitem) {

                            // Reservas
                            let pesorestante = parseFloat(solicitacaoitem.qtd);
                            let volumes = await db.getModel('est_volume').findAll({ where: { idnfentradaitem: nfentradaitens[i].id } });
                            for (var z = 0; z < volumes.length; z++) {
                                let qtd = parseFloat(volumes[z].qtd);
                                if (pesorestante < parseFloat(volumes[z].qtd)) {
                                    qtd = pesorestante;
                                } else {
                                    pesorestante -= qtd;
                                }
                                bulkreservas.push({
                                    idvolume: volumes[z].id
                                    , idpedidoitem: solicitacaoitem.idpedidoitem
                                    , idop: solicitacaoitem.idop
                                    , qtd: qtd.toFixed(4)
                                    , apontado: false
                                });
                            }

                            // Finalizar OC
                            solicitacaoitem.idestado = config.idsolicitacaoestadofinal;
                            await solicitacaoitem.save();
                            solicitacoesfinalizadas.push(solicitacaoitem);
                        } else {

                            for (var i = 0; i < solicitacoesfinalizadas.length; i++) {
                                solicitacoesfinalizadas[i].idestado = config.idsolicitacaoestadocomprado;
                                await solicitacoesfinalizadas[i].save();
                            }

                            return application.error(obj.res, { msg: 'Solicitação de compra não encontrado para o item com sequencial ' + nfentradaitens[i].sequencial })
                        }
                    }

                    if (bulkreservas.length > 0) {
                        await db.getModel('est_volumereserva').bulkCreate(bulkreservas);
                    }

                    nfentrada.integrado = 'P';
                    nfentrada.finalizado = true;
                    await nfentrada.save();

                    return application.success(obj.res, { msg: application.message.success, reloadtables: true });

                } catch (err) {
                    return application.fatal(obj.res, err);
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

                _imprimirEtiqueta: async function (obj) {
                    try {

                        let f = application.functions;
                        let pdfkit = require('pdfkit');
                        let barcode = require('barcode-2-svg');
                        let svgtopdfkit = require('svg-to-pdfkit');

                        if (obj.ids.length == 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }

                        const doc = new pdfkit({
                            autoFirstPage: false
                        });

                        let config = await db.getModel('config').find({ raw: true });
                        let image = JSON.parse(config.imagemrelatorio)[0];
                        var filename = process.hrtime()[1] + '.pdf';
                        var stream = doc.pipe(fs.createWriteStream('tmp/' + filename));

                        let volumes = await db.getModel('est_volume').findAll({ where: { id: { $in: obj.ids } }, include: [{ all: true }], raw: true });
                        for (var i = 0; i < volumes.length; i++) {
                            let volume = volumes[i];
                            let versao = await db.getModel('pcp_versao').find({ where: { id: volume.idversao } });
                            let item = await db.getModel('cad_item').find({ where: { id: versao.iditem } });
                            let grupo = await db.getModel('est_grupo').find({ where: { id: item.idgrupo } });

                            let nfentradaitem = await db.getModel('est_nfentradaitem').find({ where: { id: volume.idnfentradaitem } });
                            let nfentrada = await db.getModel('est_nfentrada').find({ where: { id: nfentradaitem ? nfentradaitem.idnfentrada : 0 } });
                            let approducaovolume = await db.getModel('pcp_approducaovolume').find({ where: { id: volume.idapproducaovolume } });
                            let approducao = await db.getModel('pcp_approducao').find({ where: { id: approducaovolume ? approducaovolume.idapproducao : 0 } });
                            let approducaotempos = await db.getModel('pcp_approducaotempo').findAll({ where: { idapproducao: approducao ? approducao.id : 0 }, order: [['dataini', 'asc']] });
                            let oprecurso = await db.getModel('pcp_oprecurso').find({ where: { id: approducao ? approducao.idoprecurso : 0 } });
                            let oprecurso_recurso = await db.getModel('pcp_recurso').find({ where: { id: oprecurso ? oprecurso.idrecurso : 0 } });
                            let opetapa = await db.getModel('pcp_opetapa').find({ where: { id: oprecurso ? oprecurso.idopetapa : 0 } });
                            let op = await db.getModel('pcp_op').find({ where: { id: opetapa ? opetapa.idop : 0 } });

                            doc.addPage({ margin: 30 });

                            let width1 = 27;
                            let width1val = 20;

                            let width2 = 24;
                            let width2val = 25;

                            let width3 = 5;
                            let width3val = 21;

                            let padstr = ' ';
                            let md = 0.65;

                            if (grupo.codigo != 533 && grupo.codigo != 502) {

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
                                    .text('IDENTIFICAÇÃO E STATUS DO VOLUME Nº ' + volume.id, 165, 47);


                                doc
                                    .fontSize(7.5)
                                    .text('Anexo - 03', 500, 40)
                                    .text('Nº PPP - 05 Revisão: 09', 460, 55);

                                doc
                                    .font('Courier-Bold').text(f.lpad('Pedido: ', width1, padstr), 30, 82, { continued: true })
                                    .font('Courier').text(f.rpad('', width1val, padstr), { continued: true })
                                    .font('Courier-Bold').text(f.lpad('Ordem de Compra: ', width2, padstr), { continued: true })
                                    .font('Courier').text(f.rpad(nfentradaitem ? nfentradaitem.oc : '', width2val, padstr), { continued: true })
                                    .font('Courier-Bold').text(f.lpad('OP: ', width3, padstr), { continued: true })
                                    .font('Courier').text(f.rpad(op ? op.codigo : '', width3val, padstr))
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
                                    .font('Courier').text(f.rpad('', 87, padstr))
                                    .moveDown(md);

                                doc
                                    .font('Courier-Bold').text(f.lpad('Produto: ', width1, padstr), { continued: true })
                                    .font('Courier').text(f.rpad(versao.descricaocompleta, 87, padstr))
                                    .moveDown(md);

                                doc
                                    .font('Courier-Bold').text(f.lpad('Formato: ', width1, padstr), { continued: true })
                                    .font('Courier').text(f.rpad('', width1val, padstr), { continued: true })
                                    .font('Courier-Bold').text(f.lpad('Peso: ', width2, padstr), { continued: true })
                                    .font('Courier').text(f.rpad(application.formatters.fe.decimal(volume.qtdreal, 4) + ' KG', width2val, padstr), { continued: true })
                                    .font('Courier-Bold').text(f.lpad('Mts: ', width3, padstr), { continued: true })
                                    .font('Courier').text(f.rpad(application.formatters.fe.decimal(volume.metragem || 0, 4) + ' M', width3val, padstr))
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

                                let str = '';
                                if (approducaotempos.length > 0) {
                                    let hora = application.formatters.fe.datetime(approducaotempos[0].dataini);
                                    hora = hora.split(' ')[1].split(':');
                                    let horaint = parseInt((hora[0] * 60)) + parseInt(hora[1]);
                                    if (horaint >= 415 && horaint <= 915) {
                                        str = '[x]A [ ]B [ ]C';
                                    } else if (horaint >= 916 && horaint <= 1400) {
                                        str = '[ ]A [x]B [ ]C';
                                    } else {
                                        str = '[ ]A [ ]B [x]C';
                                    }
                                } else {
                                    str = '[ ]A [ ]B [ ]C';
                                }
                                doc
                                    .font('Courier-Bold')
                                    .text(
                                    f.lpad('Impressão:', 14, padstr) +
                                    f.lpad(str, 21, padstr) +
                                    f.lpad(oprecurso_recurso ? oprecurso_recurso.codigo : '', 8, padstr) +
                                    f.lpad('', 13, padstr) +
                                    f.lpad(approducaotempos.length > 0 ? moment(approducaotempos[0].dataini, 'YYYY-MM-DD HH:mm').format('HH:mm') : '', 13, padstr) +
                                    f.lpad(approducaotempos.length > 0 ? moment(approducaotempos[approducaotempos.length - 1].datafim, 'YYYY-MM-DD HH:mm').format('HH:mm') : '', 13, padstr) +
                                    f.lpad(approducaotempos.length > 0 ? moment(approducaotempos[approducaotempos.length - 1].datafim, 'YYYY-MM-DD HH:mm').format('DD/MM/YY') : '', 13, padstr) +
                                    f.lpad('[ ] A [ ] R', 12, padstr) +
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
                                    f.rpad(nfentrada ? nfentrada.razaosocial : '', 35, padstr) +
                                    '  Código do Produto: ' +
                                    f.rpad(versao.descricaocompleta, 55, padstr)
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
                                    .text('Observações do Volume:', 30, 342);

                                str = [];
                                if (approducaotempos.length > 0) {
                                    let paradas = await db.getModel('pcp_apparada').findAll({
                                        where: {
                                            idoprecurso: oprecurso.id
                                            , dataini: { $gte: approducaotempos[0].dataini }
                                            , datafim: { $lte: approducaotempos[approducaotempos.length - 1].datafim }
                                        }
                                        , include: [{ all: true }]
                                        , order: [['dataini', 'desc']]
                                    });
                                    for (var z = 0; z < paradas.length; z++) {
                                        str.push('(' + (z + 1) + ') ' + (paradas[z].emenda ? 'EMENDA ' : '') + paradas[i].pcp_motivoparada.codigo + '-' + paradas[i].pcp_motivoparada.descricao + (paradas[i].observacao ? ' (' + paradas[i].observacao + ') ' : ''));
                                    }
                                }

                                doc
                                    .font('Courier')
                                    .text(f.rpad(str.join(', ') + (volume.observacao || ''), 700), 131, 342, { width: 450, height: 70, underline: true });

                                doc
                                    .font('Courier-Bold')
                                    .text('ATENÇÃO: O ESTORNO DEVERÁ RETORNAR AO DEPÓSITO COM ESTA ETIQUETA', 227, 398);

                                svgtopdfkit(
                                    doc
                                    , barcode('-10-' + f.lpad(volume.id, 9, '0'), 'code39', { width: 380, barHeight: 40, toFile: false })
                                    , 230, 405
                                );
                                doc
                                    .font('Courier')
                                    .text('-10-' + f.lpad(volume.id, 9, '0'), 345, 438);

                                doc
                                    .font('Courier-Bold')
                                    .text('Data Inc.:', 530, 410, { width: 50 })
                                    .font('Courier')
                                    .text(application.formatters.fe.date(volume.datahora), 530, 420, { width: 50 });

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
                            }

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
                                .text('IDENTIFICAÇÃO E STATUS DO VOLUME Nº ' + volume.id, 165, 480);

                            width1 = 15;
                            width1val = 107;

                            doc
                                .fontSize(7.5)
                                .font('Courier-Bold').text(f.lpad('Fornecedor: ', width1, padstr), 30, 515, { continued: true })
                                .font('Courier').text(f.rpad(nfentrada ? nfentrada.razaosocial : '', width1val, padstr))
                                .moveDown(md);

                            doc
                                .font('Courier-Bold').text(f.lpad('Produto: ', width1, padstr), { continued: true })
                                .font('Courier').text(f.rpad(versao.descricaocompleta, width1val, padstr))
                                .moveDown(md);

                            doc
                                .font('Courier-Bold').text(f.lpad('Observação: ', width1, padstr), { continued: true })
                                .font('Courier').text(f.rpad(application.functions.singleSpace(volume.observacao || ''), width1val, padstr))
                                .moveDown(md);

                            width1 = 15;
                            width1val = 15;
                            width2 = 25;
                            width2val = 15;
                            width3 = 25;
                            width3val = 25;

                            doc
                                .font('Courier-Bold').text(f.lpad('Nota Fiscal: ', width1, padstr), { continued: true })
                                .font('Courier').text(f.rpad(nfentrada ? nfentrada.documento : '', width1val, padstr), { continued: true })
                                .font('Courier-Bold').text(f.lpad('Data Emi.: ', width1, padstr), { continued: true })
                                .font('Courier').text(f.rpad(nfentrada ? application.formatters.fe.date(nfentrada.dataemissao) : '', width1val, padstr), { continued: true })
                                .font('Courier-Bold').text(f.lpad('Data Inc.: ', width1, padstr), { continued: true })
                                .font('Courier').text(f.rpad(application.formatters.fe.date(volume.datahora), width1val, padstr))
                                .moveDown(md);

                            doc
                                .font('Courier-Bold').text(f.lpad('Qtde: ', width1, padstr), { continued: true })
                                .font('Courier').text(f.rpad(application.formatters.fe.decimal(volume.qtd, 4), width1val, padstr), { continued: true })
                                .font('Courier-Bold').text(f.lpad('OC: ', width1, padstr), { continued: true })
                                .font('Courier').text(f.rpad(nfentradaitem ? nfentrada.oc : '', width1val, padstr), { continued: true })
                                .font('Courier-Bold').text(f.lpad('Vol.: ', width1, padstr), { continued: true })
                                .font('Courier').text(f.rpad(volume.id, width1val, padstr))
                                .moveDown(md);

                            doc.moveTo(25, 578)
                                .lineTo(589, 578)
                                .stroke();

                            svgtopdfkit(
                                doc
                                , barcode('-10-' + f.lpad(volume.id, 9, '0'), 'code39', { width: 380, barHeight: 40, toFile: false })
                                , 170, 582
                            );
                            doc
                                .font('Courier')
                                .text('-10-' + f.lpad(volume.id, 9, '0'), 285, 615);

                            doc
                                .font('Courier')
                                .fontSize(120)
                                .text(volume.id, 25, 630);
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
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }

                , gerarVolumes: async function (obj) {
                    if (obj.req.method == 'GET') {
                        if (obj.ids.length == 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }
                        if (obj.ids.length > 1) {
                            return application.error(obj.res, { msg: 'Selecione apenas 1 item para gerar volumes' });
                        }

                        let body = '';
                        body += application.components.html.hidden({ name: 'ids', value: obj.ids.join(',') });
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
                                    , qtdreal: qtdvolume
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

                , _removerVolume: async function (obj) {
                    try {

                        if (obj.ids.length == 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }

                        let volumes = await db.getModel('est_volume').findAll({
                            where: {
                                id: { $in: obj.ids }
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

                        nfitem.qtdvolumes = nfitem.qtdvolumes - obj.ids.length;

                        await db.getModel('est_volume').destroy({
                            where: {
                                id: { $in: obj.ids }
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

                        if (obj.view.id == 66) { // Geração de Volume - Item - Volume
                            let volume = await db.getModel('est_volume').find({ where: { id: obj.id } });
                            let nfitem = await db.getModel('est_nfentradaitem').find({ where: { id: volume.idnfentradaitem } });
                            let nf = await db.getModel('est_nfentrada').find({ where: { id: nfitem.idnfentrada } });
                            if (nf.finalizado) {
                                return application.error(obj.res, { msg: 'Não é possível alterar volumes de uma nota finalizada' });
                            }
                            obj.register.qtdreal = obj.register.qtd;
                        }

                        let saved = await next(obj);
                        if (saved.success) {
                            let results = await db.sequelize.query(`
                            select
                                *
                                , round(qtd / (largura::decimal / 10) / (espessura::decimal / 10) / (densidade / 10), 2) as metragem
                            from
                                (select
                                    ev.id
                                    , ev.qtd
                                    , (select f.valor from pcp_ficha f left join pcp_atribficha af on (f.idatributo = af.id) where f.valor is not null and f.idversao = v.id and af.codigo in (15028, 176, 150028, 150038, 22)) as espessura
                                    , (select f.valor from pcp_ficha f left join pcp_atribficha af on (f.idatributo = af.id) where f.valor is not null and f.idversao = v.id and af.codigo in (15046, 175, 150029, 150039, 20)) as largura
                                    , c.densidade
                                from
                                    est_volume ev
                                left join pcp_versao v on (ev.idversao = v.id)
                                left join cad_item i on (v.iditem = i.id)
                                left join est_classe c on (i.idclasse = c.id)
                                left join cad_unidade u on (i.idunidade = u.id)
                                where
                                    ev.id = :v1
                                ) as x
                            `
                                , {
                                    type: db.sequelize.QueryTypes.SELECT
                                    , replacements: { v1: saved.register.id }
                                });

                            if (results.length > 0) {
                                saved.register.metragem = results[0].metragem;
                                saved.register.save();
                            }
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_movimentar: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {
                            if (obj.ids.length <= 0) {
                                return application.error(obj.res, { msg: application.message.selectOneEvent });
                            }

                            let volumes = await db.getModel('est_volume').findAll({ where: { id: { $in: obj.ids } } });
                            for (let i = 0; i < volumes.length; i++) {
                                if (volumes[i].consumido) {
                                    return application.error(obj.res, { msg: 'Não é possível movimentar volumes consumidos' });
                                }
                            }

                            let body = '';
                            body += application.components.html.hidden({ name: 'ids', value: obj.ids.join(',') });
                            body += application.components.html.autocomplete({
                                width: 12
                                , label: 'Depósito'
                                , name: 'iddeposito'
                                , model: 'est_deposito'
                                , attribute: 'descricao'
                            });
                            body += application.components.html.checkbox({
                                width: 12
                                , name: 'consumido'
                                , checked: ''
                                , label: 'Consumido?'
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt'
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default btn-sm" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary btn-sm">Movimentar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['ids', 'iddeposito']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }
                            let consumido = 'consumido' in obj.req.body;
                            let changes = { iddeposito: obj.req.body.iddeposito, consumido: consumido };
                            if (consumido) {
                                changes = lodash.extend(changes, { qtdreal: '0.0000' });
                            }
                            await db.getModel('est_volume').update(changes, { where: { id: { $in: obj.req.body.ids.split(',') } } });
                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_estornar: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {
                            if (obj.ids.length != 1) {
                                return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                            }

                            let volume = await db.getModel('est_volume').find({ where: { id: { $in: obj.ids } } });
                            if (!volume.consumido) {
                                return application.error(obj.res, { msg: 'Não é possível estornar um volume que não foi consumido' });
                            }
                            let apinsumo = await db.getModel('pcp_apinsumo').find({ where: { idvolume: volume.id } });
                            if (apinsumo) {
                                return application.error(obj.res, { msg: 'Não é possível estornar um volume que foi consumido por um apontamento' });
                            }

                            let body = '';
                            body += application.components.html.hidden({ name: 'id', value: obj.ids[0] });
                            body += application.components.html.decimal({
                                width: 12
                                , label: 'Quantidade'
                                , name: 'qtd'
                                , precision: '4'
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt'
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default btn-sm" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary btn-sm">Movimentar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['id', 'qtd']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }

                            let volume = await db.getModel('est_volume').find({ where: { id: obj.req.body.id } });
                            volume.consumido = false;
                            volume.qtdreal = application.formatters.be.decimal(obj.req.body.qtd, 4);

                            if (parseFloat(volume.qtdreal) > parseFloat(volume.qtd)) {
                                return application.error(obj.res, { msg: 'O peso do estorno é maior que o peso original do volume' });
                            }
                            await volume.save();

                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_reservar: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {
                            if (obj.ids.length <= 0) {
                                return application.error(obj.res, { msg: application.message.selectOneEvent });
                            }

                            let body = '';
                            body += application.components.html.hidden({ name: 'ids', value: obj.ids.join(',') });
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'OP'
                                , name: 'idop'
                                , model: 'pcp_op'
                                , attribute: 'codigo'
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt'
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default btn-sm" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary btn-sm">Reservar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['ids', 'idop']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }

                            bulkreservas = [];
                            let volumes = await db.getModel('est_volume').findAll({ where: { id: { $in: obj.req.body.ids.split(',') } } });
                            for (let i = 0; i < volumes.length; i++) {
                                if (parseFloat(volumes[i].qtdreal) > 0) {
                                    let sum = (await db.getModel('est_volumereserva').sum('qtd', { where: { idvolume: volumes[i].id } })) || 0;
                                    bulkreservas.push({
                                        idvolume: volumes[i].id
                                        , idpedidoitem: null
                                        , qtd: (parseFloat(volumes[i].qtdreal) - sum).toFixed(4)
                                        , idop: obj.req.body.idop
                                        , apontado: false
                                    });
                                }
                            }
                            if (bulkreservas.length > 0) {
                                await db.getModel('est_volumereserva').bulkCreate(bulkreservas);
                            }


                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_requisitar: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {
                            if (obj.ids.length <= 0) {
                                return application.error(obj.res, { msg: application.message.selectOneEvent });
                            }

                            let volumes = await db.getModel('est_volume').findAll({
                                where: {
                                    id: { $in: obj.ids }
                                }
                            });

                            let body = '';
                            body += application.components.html.hidden({ name: 'ids', value: obj.ids.join(',') });
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'Depósito*'
                                , name: 'iddeposito'
                                , model: 'est_deposito'
                                , attribute: 'descricao'
                            });
                            body += application.components.html.datetime({
                                width: '12'
                                , label: 'Data/Hora para Atender'
                                , name: 'datahora'
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt'
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default btn-sm" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary btn-sm">Requisitar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['ids', 'iddeposito', 'datahora']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }

                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , volumereserva: {
                onsave: async function (obj, next) {
                    try {

                        let volume = await db.getModel('est_volume').find({ where: { id: obj.register.idvolume } });
                        let qtdreservada = parseFloat(await db.getModel('est_volumereserva').sum('qtd', {
                            where: {
                                id: { $ne: obj.register.id }
                                , idvolume: volume.id
                            }
                        })) || 0;

                        if ((qtdreservada + parseFloat(obj.register.qtd)) > parseFloat(volume.qtdreal)) {
                            return application.error(obj.res, { msg: 'Este volume não possui essa quantidade para ser reservado' });
                        }

                        next(obj);

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

            , est_depositoendereco: {

                onsave: async function (obj, next) {
                    try {

                        let saved = await next(obj);
                        if (saved.success) {
                            db.sequelize.query("update est_depositoendereco set descricaocompleta = (select descricao from est_deposito where id = iddeposito) || '(' || descricao || ')';", { type: db.sequelize.QueryTypes.UPDATE });
                            if (saved.register.depositopadrao) {
                                db.sequelize.query("update est_depositoendereco set depositopadrao = false where id != :v1 and iddeposito = :v2", {
                                    type: db.sequelize.QueryTypes.UPDATE
                                    , replacements: {
                                        v1: saved.register.id
                                        , v2: saved.register.iddeposito
                                    }
                                });
                            }
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , nfentradaitem: {
                _imprimirEtiquetas: async function (obj) {
                    try {
                        if (obj.ids.length == 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }
                        let volumes = await db.getModel('est_volume').findAll({ where: { idnfentradaitem: { $in: obj.ids } } });
                        let ids = [];
                        for (let i = 0; i < volumes.length; i++) {
                            ids.push(volumes[i].id);
                        }
                        obj.ids = ids;
                        main.plastrela.estoque.est_volume._imprimirEtiqueta(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
        }
        , pcp: {
            ap: {
                f_dataUltimoAp: function (idoprecurso) {
                    return new Promise((resolve) => {
                        db.getModel('pcp_oprecurso').find({ where: { id: idoprecurso } }).then(oprecurso => {
                            db.sequelize.query(`
                                select
                                    max(datafim) as max
                                from
                                    (select
                                        apt.dataini
                                        , apt.datafim
                                        , opr.idrecurso
                                    from
                                        pcp_approducaotempo apt
                                    left join pcp_approducao app on (apt.idapproducao = app.id)
                                    left join pcp_oprecurso opr on (app.idoprecurso = opr.id)
                                    
                                    union all
                                    
                                    select
                                        app.dataini
                                        , app.datafim
                                        , opr.idrecurso
                                    from
                                        pcp_apparada app
                                    left join pcp_oprecurso opr on (app.idoprecurso = opr.id)
                                    ) as x
                                where
                                    idrecurso = :v1
                                `
                                , {
                                    replacements: { v1: oprecurso.idrecurso }
                                    , type: db.sequelize.QueryTypes.SELECT
                                }
                            ).then(results => {
                                resolve(results[0].max);
                            });
                        });
                    });
                }
                , js_dataUltimoAp: async function (obj) {
                    try {

                        let oprecurso = await db.getModel('pcp_oprecurso').find({ where: { id: obj.data.idoprecurso } });

                        let results = await db.sequelize.query(`
                            select
                                max(datafim) as max
                            from
                                (select
                                    apt.dataini
                                    , apt.datafim
                                    , opr.idrecurso
                                from
                                    pcp_approducaotempo apt
                                left join pcp_approducao app on (apt.idapproducao = app.id)
                                left join pcp_oprecurso opr on (app.idoprecurso = opr.id)
                                
                                union all
                                
                                select
                                    app.dataini
                                    , app.datafim
                                    , opr.idrecurso
                                from
                                    pcp_apparada app
                                left join pcp_oprecurso opr on (app.idoprecurso = opr.id)
                                ) as x
                            where
                                idrecurso = :v1
                            `
                            , {
                                replacements: { v1: oprecurso.idrecurso }
                                , type: db.sequelize.QueryTypes.SELECT
                            });
                        if (results[0].max) {
                            return application.success(obj.res, {
                                data: moment(results[0].max, 'YYYY-MM-DD HH:mm').add(1, 'minutes').format('DD/MM/YYYY HH:mm')
                            });
                        } else {
                            return application.success(obj.res, {
                                data: ''
                            });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , f_corrigeEstadoOps: function (idoprecurso) {
                    return new Promise((resolve) => {
                        db.getModel('pcp_config').find().then(config => {
                            db.getModel('pcp_oprecurso').find({ where: { id: idoprecurso } }).then(oprecurso => {

                                db.getModel('pcp_oprecurso').update({
                                    idestado: config.idestadoproducao
                                }, { where: { id: oprecurso.id } });

                                db.sequelize.query(`
                                select
                                    opr.id
                                from
                                    pcp_oprecurso opr
                                inner join pcp_config c on (opr.idestado = c.idestadoproducao)
                                where
                                    opr.idrecurso = :v1
                                    and opr.id != :v2
                                `
                                    , {
                                        replacements: {
                                            v1: oprecurso.idrecurso
                                            , v2: oprecurso.id
                                        }
                                        , type: db.sequelize.QueryTypes.SELECT
                                    }
                                ).then(results => {
                                    let ids = [];
                                    for (let i = 0; i < results.length; i++) {
                                        ids.push(results[i].id);
                                    }
                                    if (ids.length > 0) {
                                        db.getModel('pcp_oprecurso').update({
                                            idestado: config.idestadointerrompida
                                        }, { where: { id: { $in: ids } } });
                                    }
                                });
                            });
                        });
                    });
                }
            }
            , approducao: {
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

                , __adicionar: async function (obj) {
                    try {

                        let config = await db.getModel('pcp_config').find();
                        let oprecurso = await db.getModel('pcp_oprecurso').find({ where: { id: obj.data.idoprecurso } });

                        if (oprecurso.idestado == config.idestadoencerrada) {
                            return application.error(obj.res, { msg: 'Não é possível realizar apontamentos de OP encerrada' });
                        }

                        let results = await db.sequelize.query(
                            'select'
                            + ' ap.id'
                            + ' , (select sum(apv.qtd) from pcp_approducaovolume apv where ap.id = apv.idapproducao) as volumes'
                            + ' from'
                            + ' pcp_oprecurso opr'
                            + ' inner join pcp_approducao ap on (opr.id = ap.idoprecurso)'
                            + ' where opr.id = :v1'
                            , {
                                replacements: {
                                    v1: oprecurso.id
                                }
                                , type: db.sequelize.QueryTypes.SELECT
                            });

                        for (let i = 0; i < results.length; i++) {
                            if (!results[i].volumes) {
                                return application.success(obj.res, { redirect: '/view/74/' + results[i].id + '?parent=' + oprecurso.id });
                            }
                        }

                        let newapproducao = await db.getModel('pcp_approducao').create({ idoprecurso: oprecurso.id });
                        return application.success(obj.res, { redirect: '/view/74/' + newapproducao.id + '?parent=' + oprecurso.id });

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , approducaotempo: {
                onsave: async function (obj, next) {
                    try {

                        let config = await db.getModel('pcp_config').find();
                        let approducao = await db.getModel('pcp_approducao').find({ where: { id: obj.register.idapproducao } })
                        let oprecurso = await db.getModel('pcp_oprecurso').find({ where: { id: approducao.idoprecurso } });
                        if (oprecurso.idestado == config.idestadoencerrada) {
                            return application.error(obj.res, { msg: 'Não é possível realizar apontamentos de OP encerrada' });
                        }

                        let dataini = moment(obj.register.dataini);
                        let datafim = moment(obj.register.datafim);
                        let duracao = datafim.diff(dataini, 'm');
                        let minutosafrente = datafim.diff(moment(), 'm');
                        if (minutosafrente > 10) {
                            return application.error(obj.res, { msg: 'Verifique o dia e a hora da data final' });
                        }
                        if (duracao <= 0) {
                            return application.error(obj.res, { msg: 'Datas incorretas, verifique' });
                        }
                        obj.register.duracao = duracao;

                        let results = await db.sequelize.query(`
                            select
                                *
                            from
                                (select
                                    'produção' as tipo
                                    , apt.dataini
                                    , apt.datafim
                                from
                                    pcp_oprecurso opr
                                left join pcp_approducao ap on (opr.id = ap.idoprecurso)
                                left join pcp_approducaotempo apt on (ap.id = apt.idapproducao)
                                where
                                    opr.idrecurso = :v1 and apt.id != :v2
                                union all
                                select
                                    'parada' as tipo
                                    , app.dataini
                                    , app.datafim
                                from
                                    pcp_oprecurso opr
                                left join pcp_apparada app on (opr.id = app.idoprecurso)
                                where
                                    opr.idrecurso = :v1) as x
                            where 
                                (:v3::timestamp between dataini and datafim or :v4::timestamp between dataini and datafim) 
                                or
                                (dataini between :v3::timestamp and :v4::timestamp and datafim between :v3::timestamp and :v4::timestamp)
                            `
                            , {
                                replacements: {
                                    v1: oprecurso.idrecurso
                                    , v2: obj.register.id
                                    , v3: dataini.format('YYYY-MM-DD HH:mm')
                                    , v4: datafim.format('YYYY-MM-DD HH:mm')
                                }
                                , type: db.sequelize.QueryTypes.SELECT
                            });
                        if (results.length > 0) {
                            return application.error(obj.res, { msg: 'Existe um apontamento de ' + results[0].tipo + ' neste horário' });
                        }

                        next(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , ondelete: async function (obj, next) {
                    try {

                        let config = await db.getModel('pcp_config').find();
                        let tempos = await db.getModel('pcp_approducaotempo').findAll({ where: { id: { $in: obj.ids } }, include: [{ all: true }] });
                        for (let i = 0; i < tempos.length; i++) {
                            let oprecurso = await db.getModel('pcp_oprecurso').find({ where: { id: tempos[i].pcp_approducao.idoprecurso } })
                            if (oprecurso.idestado == config.idestadoencerrada) {
                                return application.error(obj.res, { msg: 'Não é possível apagar apontamentos de OP encerrada' });
                            }
                        }

                        next(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_dataUltimoAp: async function (obj) {
                    try {

                        let approducao = await db.getModel('pcp_approducao').find({ where: { id: obj.data.idapproducao } });
                        let dataUltimoAp = await main.plastrela.pcp.ap.f_dataUltimoAp(approducao.idoprecurso);

                        if (dataUltimoAp) {
                            return application.success(obj.res, { data: moment(dataUltimoAp, 'YYYY-MM-DD HH:mm').add(1, 'minutes').format('DD/MM/YYYY HH:mm') });
                        } else {
                            return application.success(obj.res, { data: '' });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , approducaovolume: {
                onsave: async function (obj, next) {
                    try {

                        let config = await db.getModel('pcp_config').find();
                        let approducao = await db.getModel('pcp_approducao').find({ where: { id: obj.register.idapproducao } });
                        let oprecurso = await db.getModel('pcp_oprecurso').find({ where: { id: approducao.idoprecurso } });
                        if (oprecurso.idestado == config.idestadoencerrada) {
                            return application.error(obj.res, { msg: 'Não é possível realizar apontamentos de OP encerrada' });
                        }

                        obj.register.pesoliquido = (obj.register.pesobruto - obj.register.tara).toFixed(4);

                        let qtdapinsumo = parseFloat((await db.sequelize.query('select sum(qtd) as sum from pcp_apinsumo where idoprecurso = ' + oprecurso.id, { type: db.sequelize.QueryTypes.SELECT }))[0].sum || 0);
                        let qtdapperda = parseFloat((await db.sequelize.query('select sum(app.peso) as sum from pcp_apperda app left join pcp_tipoperda tp on (app.idtipoperda = tp.id) where tp.codigo not in (300, 322) and app.idoprecurso = ' + oprecurso.id, { type: db.sequelize.QueryTypes.SELECT }))[0].sum || 0);
                        let qtdapproducaovolume = parseFloat((await db.sequelize.query('select sum(apv.pesoliquido) as sum from pcp_approducaovolume apv left join pcp_approducao ap on (apv.idapproducao = ap.id) where apv.id != ' + (obj.register.id || 0) + ' and ap.idoprecurso =' + oprecurso.id, { type: db.sequelize.QueryTypes.SELECT }))[0].sum || 0);

                        if ((qtdapinsumo * 1.15) - (qtdapperda + qtdapproducaovolume + parseFloat(obj.register.pesoliquido)) < 0) {
                            return application.error(obj.res, { msg: 'Insumos insuficientes para realizar este apontamento' });
                        }

                        // let sumqtdapinsumo = await db.getModel('pcp_apinsumo').sum('qtd', { where: { idoprecurso: oprecurso.id } });
                        // let qtdproducao = await db.getModel('pcp_approducaovolume').sum('qtd', { where: { idoprecurso: oprecurso.id } });


                        let saved = await next(obj);

                        if (saved.success) {

                            let opetapa = await db.getModel('pcp_opetapa').find({ where: { id: oprecurso.idopetapa } });
                            let etapa = await db.getModel('pcp_etapa').find({ where: { id: opetapa.idetapa } });
                            let tprecurso = await db.getModel('pcp_tprecurso').find({ where: { id: etapa.idtprecurso } });
                            let op = await db.getModel('pcp_op').find({ where: { id: opetapa.idop } });
                            let recurso = await db.getModel('pcp_recurso').find({ where: { id: oprecurso.idrecurso } });
                            let deposito = await db.getModel('est_deposito').find({ where: { id: recurso.iddepositoprodutivo } });

                            let qtd = saved.register.qtd;
                            let metragem = null;
                            if ([1, 2, 3].indexOf(tprecurso.codigo) >= 0) {
                                qtd = saved.register.pesoliquido;
                                metragem = saved.register.qtd;
                            }

                            let volume = await db.getModel('est_volume').find({
                                where: { idapproducaovolume: saved.register.id }
                            });
                            if (volume) {
                                volume.qtd = qtd;
                                volume.qtdreal = qtd;
                                volume.observacao = saved.register.observacao
                                volume.metragem = metragem
                                volume.save();
                            } else {

                                db.getModel('est_volume').create({
                                    idapproducaovolume: saved.register.id
                                    , idversao: op.idversao
                                    , iddeposito: deposito.id
                                    , iduser: obj.req.user.id
                                    , datahora: moment()
                                    , qtd: qtd
                                    , metragem: metragem
                                    , consumido: false
                                    , qtdreal: qtd
                                    , observacao: saved.register.observacao
                                });

                            }

                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , ondelete: async function (obj, next) {
                    try {

                        let config = await db.getModel('pcp_config').find();
                        let volumes = await db.getModel('est_volume').findAll({ where: { idapproducaovolume: { $in: obj.ids } }, include: [{ all: true }] });

                        for (let i = 0; i < volumes.length; i++) {
                            let approducao = await db.getModel('pcp_approducao').find({ where: { id: volumes[i].pcp_approducaovolume.idapproducao }, include: [{ all: true }] })
                            if (approducao.pcp_oprecurso.idestado == config.idestadoencerrada) {
                                return application.error(obj.res, { msg: 'Não é possível apagar apontamentos de OP encerrada' });
                            }
                        }

                        for (let i = 0; i < volumes.length; i++) {
                            if (volumes[i].consumido) {
                                return application.error(obj.res, { msg: 'O volume ' + volumes[i].id + ' se encontra consumido, verifique' });
                            } else if (volumes[i].qtd != volumes[i].qtdreal) {
                                return application.error(obj.res, { msg: 'O volume ' + volumes[i].id + ' se encontra parcialmente consumido, verifique' });
                            }
                        }

                        await next(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , _imprimirEtiqueta: async function (obj) {
                    if (obj.ids.length == 0) {
                        return application.error(obj.res, { msg: application.message.selectOneEvent });
                    }
                    let ids = [];

                    let volumes = await db.getModel('est_volume').findAll({ where: { idapproducaovolume: { $in: obj.ids } } })

                    for (let i = 0; i < volumes.length; i++) {
                        ids.push(volumes[i].id);
                    }
                    obj.ids = ids;
                    main.plastrela.estoque.est_volume._imprimirEtiqueta(obj);
                }
            }
            , apperda: {
                onsave: async function (obj, next) {
                    try {

                        let config = await db.getModel('pcp_config').find();
                        let oprecurso = await db.getModel('pcp_oprecurso').find({ where: { id: obj.register.idoprecurso } });
                        if (oprecurso.idestado == config.idestadoencerrada) {
                            return application.error(obj.res, { msg: 'Não é possível realizar apontamentos em OP encerrada' });
                        }
                        let tipoperda = await db.getModel('pcp_tipoperda').find({ where: { id: obj.register.idtipoperda } });

                        if ([300, 322].indexOf(tipoperda.codigo) >= 0) {
                            return next(obj);
                        }
                        let qtdapinsumo = parseFloat((await db.sequelize.query('select sum(qtd) as sum from pcp_apinsumo where idoprecurso = ' + oprecurso.id, { type: db.sequelize.QueryTypes.SELECT }))[0].sum || 0);
                        let qtdapperda = parseFloat((await db.sequelize.query('select sum(app.peso) as sum from pcp_apperda app left join pcp_tipoperda tp on (app.idtipoperda = tp.id) where tp.codigo not in (300, 322) and app.id != ' + obj.register.id + ' and app.idoprecurso = ' + oprecurso.id, { type: db.sequelize.QueryTypes.SELECT }))[0].sum || 0);
                        let qtdapproducaovolume = parseFloat((await db.sequelize.query('select sum(apv.pesoliquido) as sum from pcp_approducaovolume apv left join pcp_approducao ap on (apv.idapproducao = ap.id) where ap.idoprecurso = ' + oprecurso.id, { type: db.sequelize.QueryTypes.SELECT }))[0].sum || 0);

                        if ((qtdapinsumo * 1.15) - (qtdapperda + qtdapproducaovolume + parseFloat(obj.register.peso)) < 0) {
                            return application.error(obj.res, { msg: 'Insumos insuficientes para realizar este apontamento' });
                        }

                        next(obj);

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , ondelete: async function (obj, next) {
                    try {

                        let config = await db.getModel('pcp_config').find();
                        let apperdas = await db.getModel('pcp_apperda').findAll({ where: { id: { $in: obj.ids } }, include: [{ all: true }] });
                        for (let i = 0; i < apperdas.length; i++) {
                            if (apperdas[i].pcp_oprecurso.idestado == config.idestadoencerrada) {
                                return application.error(obj.res, { msg: 'Não é possível apagar apontamentos de OP encerrada' });
                            }
                        }

                        next(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , apparada: {
                onsave: async function (obj, next) {
                    try {

                        let config = await db.getModel('pcp_config').find();
                        let oprecurso = await db.getModel('pcp_oprecurso').find({ where: { id: obj.register.idoprecurso } });
                        if (oprecurso.idestado == config.idestadoencerrada) {
                            return application.error(obj.res, { msg: 'Não é possível realizar apontamentos em OP encerrada' });
                        }

                        let dataini = moment(obj.register.dataini);
                        let datafim = moment(obj.register.datafim);
                        let duracao = datafim.diff(dataini, 'm');

                        let minutosafrente = datafim.diff(moment(), 'm');
                        if (minutosafrente > 10) {
                            return application.error(obj.res, { msg: 'Verifique o dia e a hora da data final' });
                        }
                        if (duracao <= 0) {
                            return application.error(obj.res, { msg: 'Datas incorretas, verifique' });
                        }
                        obj.register.duracao = duracao;

                        let results = await db.sequelize.query(`
                            select
                                *
                            from
                                (select
                                    'produção' as tipo
                                    , apt.dataini
                                    , apt.datafim
                                from
                                    pcp_oprecurso opr
                                left join pcp_approducao ap on (opr.id = ap.idoprecurso)
                                left join pcp_approducaotempo apt on (ap.id = apt.idapproducao)
                                where
                                    opr.idrecurso = :v1
                                union all
                                select
                                    'parada' as tipo
                                    , app.dataini
                                    , app.datafim
                                from
                                    pcp_oprecurso opr
                                left join pcp_apparada app on (opr.id = app.idoprecurso)
                                where
                                    opr.idrecurso = :v1 and app.id != :v2) as x
                            where 
                                (:v3::timestamp between dataini and datafim or :v4::timestamp between dataini and datafim) 
                                or
                                (dataini between :v3::timestamp and :v4::timestamp and datafim between :v3::timestamp and :v4::timestamp)
                            `
                            , {
                                replacements: {
                                    v1: oprecurso.idrecurso
                                    , v2: obj.register.id
                                    , v3: dataini.format(application.formatters.be.datetime_format)
                                    , v4: datafim.format(application.formatters.be.datetime_format)
                                }
                                , type: db.sequelize.QueryTypes.SELECT
                            });
                        if (results.length > 0) {
                            return application.error(obj.res, { msg: 'Existe um apontamento de ' + results[0].tipo + ' neste horário' });
                        }


                        let dataUltimoAp = moment((await main.plastrela.pcp.ap.f_dataUltimoAp(oprecurso.id)), application.formatters.be.datetime_format).add(1, 'minutes');
                        duracao = dataini.diff(dataUltimoAp, 'm');
                        if (duracao > 0) {
                            // Precisa criar tempo
                            let sql = await db.sequelize.query(`
                                select
                                    app.id
                                    , (select max(apt.datafim) from pcp_approducaotempo apt where apt.idapproducao = app.id) as max
                                    , (select count(*) from pcp_approducaovolume apv where apv.idapproducao = app.id) as qtdvolume
                                from
                                    pcp_approducao app
                                where
                                    app.idoprecurso = :v1
                                order by 2 desc
                                limit 1
                                `
                                , {
                                    replacements: {
                                        v1: oprecurso.id
                                    }
                                    , type: db.sequelize.QueryTypes.SELECT
                                });
                            if (sql.length > 0 && parseInt(sql[0].qtdvolume) == 0) {
                                await db.getModel('pcp_approducaotempo').create({
                                    idapproducao: sql[0].id
                                    , duracao: duracao
                                    , dataini: dataUltimoAp.format(application.formatters.be.datetime_format)
                                    , datafim: dataini.format(application.formatters.be.datetime_format)
                                });
                            } else {
                                let approducao = await db.getModel('pcp_approducao').create({
                                    idoprecurso: oprecurso.id
                                });

                                await db.getModel('pcp_approducaotempo').create({
                                    idapproducao: approducao.id
                                    , duracao: duracao - 1
                                    , dataini: dataUltimoAp.format(application.formatters.be.datetime_format)
                                    , datafim: dataini.add(-1, 'minutes').format(application.formatters.be.datetime_format)
                                });
                            }
                        }

                        main.plastrela.pcp.ap.f_corrigeEstadoOps(obj.register.idoprecurso);
                        next(obj);

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , ondelete: async function (obj, next) {
                    try {

                        let config = await db.getModel('pcp_config').find();
                        let apparadas = await db.getModel('pcp_apparada').findAll({ where: { id: { $in: obj.ids } }, include: [{ all: true }] });
                        for (let i = 0; i < apparadas.length; i++) {
                            if (apparadas[i].pcp_oprecurso.idestado == config.idestadoencerrada) {
                                return application.error(obj.res, { msg: 'Não é possível apagar apontamentos de OP encerrada' });
                            }
                        }

                        next(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
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
                        , datawhere: 'active'
                    });

                    body += application.components.html.text({
                        width: 12
                        , label: 'Camada/Estação'
                        , name: 'recipiente'
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
                        , name: 'qtdreal'
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
                                    , qtdreal: application.formatters.fe.decimal(volume.qtdreal, 4)
                                }
                            });
                        }
                    } else {
                        return application.error(obj.res, { msg: 'Volume não encontrado' });
                    }
                }
                , __apontarVolume: async function (obj) {
                    try {
                        let invalidfields = application.functions.getEmptyFields(obj.data, ['idoprecurso', 'idvolume', 'iduser', 'qtd']);
                        if (invalidfields.length > 0) {
                            return application.error(obj.res, { invalidfields: invalidfields });
                        }

                        let config = await db.getModel('pcp_config').find();
                        let oprecurso = await db.getModel('pcp_oprecurso').find({ where: { id: obj.data.idoprecurso } });
                        let opetapa = await db.getModel('pcp_opetapa').find({ where: { id: oprecurso.idopetapa } });
                        let op = await db.getModel('pcp_op').find({ where: { id: opetapa.idop } });
                        let recurso = await db.getModel('pcp_recurso').find({ where: { id: oprecurso.idrecurso } });
                        let volume = await db.getModel('est_volume').find({ where: { id: obj.data.idvolume } });
                        let versao = await db.getModel('pcp_versao').find({ where: { id: volume.idversao } });
                        let volumereservas = await db.getModel('est_volumereserva').findAll({ where: { idvolume: volume.id } });
                        let deposito = await db.getModel('est_deposito').find({ where: { id: volume.iddeposito } });
                        let qtd = parseFloat(application.formatters.be.decimal(obj.data.qtd, 4));
                        let qtdreal = parseFloat(volume.qtdreal);
                        let apinsumo = await db.getModel('pcp_apinsumo').find({
                            where: {
                                idvolume: obj.data.idvolume
                                , idoprecurso: obj.data.idoprecurso
                            }
                        });

                        if (deposito.descricao == 'Almoxarifado') {
                            return application.error(obj.res, { msg: 'Não é possível consumir volumes que estão no almoxarifado' });
                        }
                        if (oprecurso.idestado == config.idestadoencerrada) {
                            return application.error(obj.res, { msg: 'Não é possível realizar apontamentos em OP encerrada' });
                        }
                        if (qtd > qtdreal) {
                            return application.error(obj.res, { msg: 'Verifique a quantidade apontada', invalidfields: ['qtd'] });
                        }
                        if (obj.data.recipiente != null && obj.data.recipiente.length > 1) {
                            return application.error(obj.res, { msg: 'A Camada/Estação deve conter apenas 1 caractere', invalidfields: ['recipiente'] });
                        }

                        if (volume.metragem) {
                            volume.metragem = (((qtdreal - qtd) * parseFloat(volume.metragem)) / qtdreal).toFixed(2);
                        }
                        volume.qtdreal = (qtdreal - qtd).toFixed(4);
                        if (parseFloat(volume.qtdreal) == 0) {
                            volume.consumido = true;
                        }
                        volume.iddeposito = recurso.iddepositoprodutivo;

                        if (apinsumo) {
                            apinsumo.iduser = obj.data.iduser;
                            apinsumo.datahora = moment();
                            apinsumo.qtd = (parseFloat(apinsumo.qtd) + qtd).toFixed(4);
                            await apinsumo.save();
                        } else {
                            await db.getModel('pcp_apinsumo').create({
                                iduser: obj.data.iduser
                                , idvolume: obj.data.idvolume
                                , idoprecurso: obj.data.idoprecurso
                                , datahora: moment()
                                , qtd: qtd
                                , produto: obj.data.idvolume + ' - ' + versao.descricaocompleta
                                , recipiente: obj.data.recipiente.toUpperCase()
                            });
                        }

                        await volume.save();

                        for (let i = 0; i < volumereservas.length; i++) {
                            if (volumereservas[i].idop = op.id) {
                                volumereservas[i].apontado = true;
                                volumereservas[i].save();
                            }
                        }

                        return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , ondelete: async function (obj, next) {
                    try {

                        let config = await db.getModel('pcp_config').find();
                        let apinsumos = await db.getModel('pcp_apinsumo').findAll({ where: { id: { $in: obj.ids } }, include: [{ all: true }] });
                        let oprecurso = await db.getModel('pcp_oprecurso').find({ where: { id: apinsumos[0].idoprecurso } });
                        let opetapa = await db.getModel('pcp_opetapa').find({ where: { id: oprecurso.idopetapa } });
                        let op = await db.getModel('pcp_op').find({ where: { id: opetapa.idop } });
                        for (let i = 0; i < apinsumos.length; i++) {
                            if (apinsumos[i].pcp_oprecurso.idestado == config.idestadoencerrada) {
                                return application.error(obj.res, { msg: 'Não é possível apagar apontamentos de OP encerrada' });
                            }
                            let apretorno = await db.getModel('pcp_apretorno').find({ where: { idoprecurso: apinsumos[i].idoprecurso, estacao: apinsumos[i].recipiente } });
                            if (apretorno) {
                                return application.error(obj.res, { msg: 'Não é possível apagar insumos com retornos gerados sobre este recipiente' });
                            }
                        }

                        let volumes = [];
                        let volumesreservas = [];
                        for (let i = 0; i < apinsumos.length; i++) {
                            let apinsumo = apinsumos[i];
                            let volume = await db.getModel('est_volume').find({ where: { id: apinsumo.idvolume } });
                            let volumereservas = await db.getModel('est_volumereserva').findAll({ where: { idvolume: volume.id } });

                            if (volume.metragem) {
                                volume.metragem = ((parseFloat(volume.qtdreal) + parseFloat(apinsumo.qtd)) * parseFloat(volume.metragem)) / parseFloat(volume.qtdreal).toFixed(2);
                            }

                            volume.qtdreal = (parseFloat(volume.qtdreal) + parseFloat(apinsumo.qtd)).toFixed(4);
                            volume.consumido = false;
                            volumes.push(volume);
                            volumesreservas = volumesreservas.concat(volumereservas);
                        }

                        await next(obj);

                        for (let i = 0; i < volumes.length; i++) {
                            volumes[i].save();
                            for (let i = 0; i < volumesreservas.length; i++) {
                                if (volumesreservas[i].idop = op.id) {
                                    volumesreservas[i].apontado = false;
                                    volumesreservas[i].save();
                                }
                            }
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , apretorno: {
                onsave: async function (obj, next) {
                    try {

                        if (obj.register.id == 0) {

                            let apinsumos = await db.getModel('pcp_apinsumo').findAll({
                                where: {
                                    idoprecurso: obj.register.idoprecurso
                                    , recipiente: obj.register.estacao
                                }
                            });

                            if (apinsumos.length <= 0) {
                                return application.error(obj.res, { msg: 'Esta estação não foi apontada nos insumos desta OP' });
                            } else {

                                let sum = 0;
                                for (let i = 0; i < apinsumos.length; i++) {
                                    sum += parseFloat(apinsumos[i].qtd);
                                }

                                let info = [];
                                for (let i = 0; i < apinsumos.length; i++) {
                                    let perc = parseFloat(apinsumos[i].qtd) / sum;
                                    let qtd = (parseFloat(obj.register.qtd) * perc).toFixed(4);
                                    apinsumos[i].qtd = (parseFloat(apinsumos[i].qtd) - parseFloat(qtd)).toFixed(4);
                                    info.push({ idinsumo: apinsumos[i].id, qtd: qtd })
                                    await apinsumos[i].save();
                                }
                                obj.register.info = JSON.stringify(info);
                            }

                            let saved = await next(obj);

                            let oprecurso = await db.getModel('pcp_oprecurso').find({ where: { id: obj.register.idoprecurso } });
                            let recurso = await db.getModel('pcp_recurso').find({ where: { id: oprecurso.idrecurso } });
                            let deposito = await db.getModel('est_deposito').find({ where: { id: recurso.iddepositoprodutivo } });

                            db.getModel('est_volume').create({
                                idapretorno: saved.register.id
                                , idversao: saved.register.idversao
                                , iddeposito: deposito.id
                                , iduser: obj.req.user.id
                                , datahora: moment()
                                , qtd: saved.register.qtd
                                , consumido: false
                                , qtdreal: saved.register.qtd
                            });
                        } else {
                            return application.error(obj.res, { msg: 'Não é permitido a edição em retornos, exclua se necessário' });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , ondelete: async function (obj, next) {
                    try {

                        if (obj.ids.length != 1) {
                            return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                        }

                        let apretorno = await db.getModel('pcp_apretorno').find({ where: { id: obj.ids[0] } });

                        let info = JSON.parse(apretorno.info);

                        for (let i = 0; i < info.length; i++) {
                            let apinsumo = await db.getModel('pcp_apinsumo').find({ where: { id: info[i].idinsumo } });
                            apinsumo.qtd = (parseFloat(apinsumo.qtd) + parseFloat(info[i].qtd)).toFixed(4);
                            await apinsumo.save();
                        }

                        let volume = await db.getModel('est_volume').find({ where: { idapretorno: obj.ids[0] } });
                        await volume.destroy();

                        next(obj);

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_imprimirEtiquetas: async function (obj) {
                    try {
                        if (obj.ids.length <= 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }
                        let ids = [];
                        let results = await db.sequelize.query('select v.id from pcp_apretorno apr left join est_volume v on (apr.id = v.idapretorno) where apr.id in (' + obj.ids.join(',') + ')', { type: db.sequelize.QueryTypes.SELECT });

                        for (let i = 0; i < results.length; i++) {
                            ids.push(results[i].id);
                        }
                        obj.ids = ids;
                        main.plastrela.estoque.est_volume._imprimirEtiqueta(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , apsobra: {
                onsave: async function (obj, next) {
                    try {

                        let config = await db.getModel('pcp_config').find();
                        let oprecurso = await db.getModel('pcp_oprecurso').find({ where: { id: obj.register.idoprecurso } });
                        if (oprecurso.idestado == config.idestadoencerrada) {
                            return application.error(obj.res, { msg: 'Não é possível realizar apontamentos em OP encerrada' });
                        }

                        let apinsumo = await db.getModel('pcp_apinsumo').find({ where: { id: obj.register.idapinsumo } });
                        let volume = await db.getModel('est_volume').find({ where: { id: apinsumo.idvolume } });

                        if (obj.id > 0) {
                            apinsumo.qtd = (parseFloat(apinsumo.qtd) + parseFloat(obj.register._previousDataValues.qtd)).toFixed(4);
                            volume.qtdreal = (parseFloat(volume.qtdreal) - parseFloat(obj.register._previousDataValues.qtd)).toFixed(4);
                        }

                        if (volume.metragem) {
                            volume.metragem = (((parseFloat(volume.qtdreal) + parseFloat(obj.register.qtd)) * parseFloat(volume.metragem)) / parseFloat(volume.qtdreal)).toFixed(2);
                        }

                        apinsumo.qtd = (parseFloat(apinsumo.qtd) - parseFloat(obj.register.qtd)).toFixed(4);
                        volume.qtdreal = (parseFloat(volume.qtdreal) + parseFloat(obj.register.qtd)).toFixed(4);
                        volume.consumido = false;

                        if (parseFloat(apinsumo.qtd) < 0) {
                            return application.error(obj.res, { msg: 'Não é possível sobrar mais do que o componente' });
                        }

                        // Valida Pesos

                        let qtdapinsumo = parseFloat((await db.sequelize.query('select sum(qtd) as sum from pcp_apinsumo where id != ' + obj.register.idapinsumo + ' and idoprecurso = ' + oprecurso.id, { type: db.sequelize.QueryTypes.SELECT }))[0].sum || 0);
                        let qtdapperda = parseFloat((await db.sequelize.query('select sum(app.peso) as sum from pcp_apperda app left join pcp_tipoperda tp on (app.idtipoperda = tp.id) where tp.codigo not in (300, 322) and app.idoprecurso = ' + oprecurso.id, { type: db.sequelize.QueryTypes.SELECT }))[0].sum || 0);
                        let qtdapproducaovolume = parseFloat((await db.sequelize.query('select sum(apv.pesoliquido) as sum from pcp_approducaovolume apv left join pcp_approducao ap on (apv.idapproducao = ap.id) where ap.idoprecurso = ' + oprecurso.id, { type: db.sequelize.QueryTypes.SELECT }))[0].sum || 0);

                        if (((qtdapinsumo + parseFloat(apinsumo.qtd) - parseFloat(obj.register.qtd)) * 1.15) - (qtdapperda + qtdapproducaovolume) < 0) {
                            return application.error(obj.res, { msg: 'Insumos insuficientes para realizar este apontamento' });
                        }
                        //


                        await next(obj);

                        apinsumo.save();
                        volume.save();
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , ondelete: async function (obj, next) {
                    try {

                        let config = await db.getModel('pcp_config').find();
                        let apsobras = await db.getModel('pcp_apsobra').findAll({ where: { id: { $in: obj.ids } }, include: [{ all: true }] });

                        for (let i = 0; i < apsobras.length; i++) {
                            if (apsobras[i].pcp_oprecurso.idestado == config.idestadoencerrada) {
                                return application.error(obj.res, { msg: 'Não é possível apagar apontamentos de OP encerrada' });
                            }
                        }

                        for (let i = 0; i < apsobras.length; i++) {
                            let apinsumo = await db.getModel('pcp_apinsumo').find({ where: { id: apsobras[i].idapinsumo } });
                            apinsumo.qtd = (parseFloat(apinsumo.qtd) + parseFloat(apsobras[i].qtd)).toFixed(4);
                            apinsumo.save();

                            let volume = await db.getModel('est_volume').find({ where: { id: apinsumo.idvolume } });

                            if (volume.metragem) {
                                volume.metragem = (((parseFloat(volume.qtdreal) - parseFloat(apsobras[i].qtd)) * parseFloat(volume.metragem)) / parseFloat(volume.qtdreal)).toFixed(2);
                            }

                            volume.qtdreal = (parseFloat(volume.qtdreal) - parseFloat(apsobras[i].qtd)).toFixed(4);
                            if (parseFloat(volume.qtdreal) == 0) {
                                volume.consumido = true;
                            }
                            volume.save();
                        }

                        next(obj);

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , _imprimirEtiqueta: async function (obj) {
                    try {
                        if (obj.ids.length == 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }
                        let ids = [];
                        let results = await db.sequelize.query('select v.id from pcp_apsobra aps left join pcp_apinsumo api on (aps.idapinsumo = api.id) left join est_volume v on (api.idvolume = v.id) where aps.id in (' + obj.ids.join(',') + ')', { type: db.sequelize.QueryTypes.SELECT });

                        for (let i = 0; i < results.length; i++) {
                            ids.push(results[i].id);
                        }
                        obj.ids = ids;
                        main.plastrela.estoque.est_volume._imprimirEtiqueta(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , oprecurso: {
                onsave: function (obj, next) {
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
                , js_encerrar: async function (obj) {
                    try {

                        let config = await db.getModel('pcp_config').find();
                        let oprecurso = await db.getModel('pcp_oprecurso').find({ where: { id: obj.data.idoprecurso } });
                        if (oprecurso.idestado == config.idestadoencerrada) {
                            return application.error(obj.res, { msg: 'OP já se encontra encerrada' });
                        }

                        let sql = await db.sequelize.query(`
                        select
                            sum(apv.pesoliquido) as sum
                        from
                            pcp_approducao ap
                        left join pcp_approducaovolume apv on (ap.id = apv.idapproducao)
                        where
                            ap.idoprecurso = :v1
                        `, {
                                type: db.sequelize.QueryTypes.SELECT
                                , replacements: { v1: oprecurso.id }
                            });
                        if (sql.length <= 0 || parseFloat(sql[0].sum) <= 0) {
                            return application.error(obj.res, { msg: 'OP sem produção' });
                        }

                        oprecurso.idestado = config.idestadoencerrada;
                        if (!oprecurso.integrado) {
                            oprecurso.integrado = 'P';
                        }
                        await oprecurso.save();

                        return application.success(obj.res, { msg: application.message.success, redirect: '/view/50' });

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_retornarProducao: async function (obj) {
                    try {

                        if (obj.ids.length <= 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }

                        let config = await db.getModel('pcp_config').find();

                        await db.getModel('pcp_oprecurso').update({
                            idestado: config.idestadoinicial
                        },
                            {
                                where: {
                                    id: { $in: obj.ids }
                                }
                            });

                        return application.success(obj.res, { msg: application.message.success, reloadtables: true });

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
        }
    }
}

module.exports = main;