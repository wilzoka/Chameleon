const db = require('../models')
    , moment = require('moment')
    , fs = require('fs-extra')
    , schedule = require('../routes/schedule')
    , messenger = require('../routes/messenger')
    , lodash = require('lodash')
    , application = require('../routes/application')
    , pdf = require('html-pdf')
    , Cyjs = require("crypto-js")
    ;

let platform = {
    config: {
        onsave: async (obj, next) => {
            try {
                let saved = await next(obj);
                if (saved.success) {
                    application.config.setPartials(saved.register);
                }
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , js_getGoogleMapsKey: async function (obj) {
            try {
                let config = await db.getModel('config').findOne();
                return application.success(obj.res, { data: config.googlemapskey });
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
    }
    , core_bi: require('./core-bi/bi.js')
    , file: {
        e_download: async function (obj) {
            try {
                if (obj.ids.length != 1) {
                    return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                }
                return application.success(obj.res, { openurl: `/file/${obj.ids[0]}` });
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
    }
    , kettle: {
        f_runTransformation: function (filepath) {
            db.getModel('config').findOne().then(config => {
                let nrc = require('node-run-cmd');
                if (application.functions.isWindows()) {
                    nrc.run('Pan.bat /file:' + config.kettlepath + '/' + filepath
                        , { cwd: config.kettlepath });
                } else {
                    nrc.run('pan.sh -file=' + config.kettlepath + '/' + filepath
                        , { cwd: config.kettlepath });
                }
            });
        }
        , f_runJob: function (filepath) {
            return new Promise((resolve) => {
                db.getModel('config').findOne().then(config => {
                    let nrc = require('node-run-cmd');
                    nrc.run(application.functions.isWindows() ?
                        `Kitchen.bat /file:${config.kettlepath}/${filepath}`
                        : `${config.kettlepath}/kitchen.sh -file=${config.kettlepath}/${filepath} -log=${config.kettlepath}/${filepath}.log`
                        , {
                            cwd: config.kettlepath
                            , onData: function (data) {
                                // console.log('data', data);
                            }
                            , onDone: function (data) {
                                // console.log('done', data);
                                resolve();
                            }
                            , onError: function (data) {
                                // console.log('err', data);
                            }
                        });

                });
            });
        }
    }
    , mail: {
        f_sendmail: async (obj) => {
            let config = await db.getModel('config').findOne();
            if (!config.emailconf) {
                return console.error('E-mail sent configuration missing');
            }
            let transportConfig = JSON.parse(config.emailconf)
            let nodemailer = require('nodemailer');
            let transporter = nodemailer.createTransport(transportConfig);
            let mailOptions = {
                from: transportConfig.auth.user
                , to: obj.to.join(',')
                , cc: obj.cc && Array.isArray(obj.cc) ? obj.cc : []
                , subject: obj.subject
                , html: obj.html
                , attachments: obj.attachments || []
            };
            if (config.emailsignature) {
                mailOptions.html += '</br></br><img src="cid:unique@signature"/>';
                let signature = JSON.parse(config.emailsignature);
                if (fs.existsSync(`${__dirname}/../files/${process.env.NODE_APPNAME}/${signature[0].id}.${signature[0].type}`)) {
                    mailOptions.attachments.push({
                        filename: signature[0].filename,
                        path: `${__dirname}/../files/${process.env.NODE_APPNAME}/${signature[0].id}.${signature[0].type}`,
                        cid: 'unique@signature'
                    });
                }
            }
            mailOptions.html = `<div class="system_content">${mailOptions.html}</div>`;
            transporter.sendMail(mailOptions, (err, info) => {
                if (err) {
                    return console.error(err);
                }
            });
        }
    }
    , maintenance: {
        f_clearUnboundFiles: function () {
            try {
                db.sequelize.query(`select * from file where datetime < now()::date -1 and bounded = false`
                    , { type: db.Sequelize.QueryTypes.SELECT }).then(sql => {
                        for (let i = 0; i < sql.length; i++) {
                            fs.unlinkSync(`${__dirname}/../files/${process.env.NODE_APPNAME}/${sql[i].id}.${sql[i].type}`);
                            db.getModel('file').destroy({ where: { id: sql[i].id } });
                        }
                    });
            } catch (err) {
                console.error(err);
            }
        }
    }
    , menu: {
        onsave: async function (obj, next) {
            await next(obj);
            platform.menu.treeAll();
        }
        , treeAll: function () {
            let getChildren = function (current, childs) {

                for (let i = 0; i < childs.length; i++) {
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
        , e_export: async function (obj) {
            try {
                let json = JSON.parse(obj.event.parameters || '{}');
                let menus = [];
                if (json.all) {
                    menus = await db.getModel('menu').findAll({ include: [{ all: true }], order: [['tree', 'asc']] });
                } else {
                    if (obj.ids.length <= 0) {
                        return application.error(obj.res, { msg: application.message.selectOneEvent });
                    }
                    menus = await db.getModel('menu').findAll({ include: [{ all: true }], where: { id: { $in: obj.ids } }, order: [['tree', 'asc']] });
                }
                let j = [];
                for (let i = 0; i < menus.length; i++) {
                    j.push({
                        description: menus[i].description
                        , icon: menus[i].icon
                        , menuparent: menus[i].idmenuparent ? menus[i].parentmenu.tree : null
                        , view: menus[i].idview ? menus[i].view.name : null
                        , url: menus[i].url
                        , tree: menus[i].tree
                    });
                }
                let filename = process.hrtime()[1] + '.json';
                fs.writeFile(`${__dirname}/../tmp/${process.env.NODE_APPNAME}/${filename}`, JSON.stringify(j), function (err) {
                    if (err) {
                        return application.error(obj.res, { msg: err });
                    }
                    return application.success(obj.res, { openurl: '/download/' + filename });
                });
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , e_import: async function (obj) {
            try {
                if (obj.req.method == 'GET') {
                    let body = '';
                    body += '<div class="row no-margin">';
                    body += application.components.html.file({
                        width: '12'
                        , name: 'file'
                        , label: 'Arquivo'
                        , maxfiles: '1'
                    });
                    body += '</div>';
                    return application.success(obj.res, {
                        modal: {
                            form: true
                            , id: 'modalevt'
                            , action: '/event/' + obj.event.id
                            , title: obj.event.description
                            , body: body
                            , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Importar</button>'
                        }
                    });
                } else {
                    let invalidfields = application.functions.getEmptyFields(obj.req.body, ['file']);
                    if (invalidfields.length > 0) {
                        return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                    }
                    let file = JSON.parse(obj.req.body.file)[0];
                    let menus = JSON.parse(fs.readFileSync(`${__dirname}/../files/${process.env.NODE_APPNAME}/${file.id}.${file.type}`, 'utf8'));
                    console.log('----------SYNC MENUS----------');
                    for (let i = 0; i < menus.length; i++) {
                        console.log('MENU ' + menus[i].tree);
                        let menu = await db.getModel('menu').findOne({ where: { tree: menus[i].tree } });
                        let mp = null;
                        let v = null;
                        if (menus[i].menuparent) {
                            mp = await db.getModel('menu').findOne({ where: { tree: menus[i].menuparent } });
                        }
                        if (menus[i].view) {
                            v = await db.getModel('view').findOne({ where: { name: menus[i].view } });
                        }
                        if (menu) {
                            menu.description = menus[i].description;
                            menu.icon = menus[i].icon;
                            menu.url = menus[i].url;
                            menu.tree = menus[i].tree;
                            if (menus[i].menuparent) {
                                menu.idmenuparent = mp.id;
                            }
                            if (menus[i].view) {
                                menu.idview = v.id;
                            }
                            if (menu.changed()) {
                                await menu.save();
                                console.log('UPDATED');
                            } else {
                                console.log('OK');
                            }
                        } else {
                            menu = await db.getModel('menu').create({
                                description: menus[i].description
                                , icon: menus[i].icon
                                , idmenuparent: menus[i].menuparent && mp ? mp.id : null
                                , idview: menus[i].view && v ? v.id : null
                                , url: menus[i].url
                                , tree: menus[i].tree
                            });
                            console.log('CREATED');
                        }
                        if (i != menus.length - 1) {
                            console.log('------------------------------');
                        }
                    }
                    console.log('-----------FINISHED-----------');
                    return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                }
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
    }
    , model: {
        onsave: async function (obj, next) {
            try {

                let register = await db.getModel('model').findOne({ where: { id: { $ne: obj.id }, name: obj.register.name } })
                if (register) {
                    return application.error(obj.res, { msg: 'Já existe um modelo com este nome' });
                }

                if (obj.register.id > 0 && obj.register.name != obj.register._previousDataValues.name) {
                    return application.error(obj.res, { msg: 'Não é possível alterar o nome de um modelo' });
                }

                next(obj);

            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , ondelete: async function (obj, next) {
            try {

                const queryInterface = db.sequelize.getQueryInterface();
                let models = await db.getModel('model').findAll({ where: { id: { $in: obj.ids } } })

                for (let i = 0; i < models.length; i++) {
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
        , e_syncAll: function (obj) {
            let models = {};
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
                for (let i = 0; i < results.length; i++) {
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
                for (let i = 0; i < results.length; i++) {
                    let j = {};
                    if (results[i].typeadd) {
                        j = application.modelattribute.parseTypeadd(results[i].typeadd);
                    }
                    let vas = j.as || j.model;
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

                db.sequelize.sync({ alter: true }).then(() => {
                    return application.success(obj.res, { msg: application.message.success });
                }).catch(err => {
                    return application.error(obj.res, { msg: err });
                });

            });

        }
        , e_export: async function (obj) {
            try {
                let json = JSON.parse(obj.event.parameters || '{}');
                let models = [];
                if (json.all) {
                    models = await db.getModel('model').findAll({ order: [['name', 'asc']] });
                } else {
                    if (obj.ids.length <= 0) {
                        return application.error(obj.res, { msg: application.message.selectOneEvent });
                    }
                    models = await db.getModel('model').findAll({ where: { id: { $in: obj.ids } }, order: [['name', 'asc']] });
                }
                let j = [];
                for (let i = 0; i < models.length; i++) {
                    j.push({
                        name: models[i].name
                        , description: models[i].description
                        , onsave: models[i].onsave
                        , ondelete: models[i].ondelete
                    });
                    let attributes = await db.getModel('modelattribute').findAll({ where: { idmodel: models[i].id }, order: [['name', 'asc']] });
                    j[j.length - 1]._attribute = [];
                    for (let z = 0; z < attributes.length; z++) {
                        j[j.length - 1]._attribute.push({
                            name: attributes[z].name
                            , label: attributes[z].label
                            , type: attributes[z].type
                            , notnull: attributes[z].notnull
                            , typeadd: attributes[z].typeadd
                        });
                    }
                }
                let filename = process.hrtime()[1] + '.json';
                fs.writeFile(`${__dirname}/../tmp/${process.env.NODE_APPNAME}/${filename}`, JSON.stringify(j), function (err) {
                    if (err) {
                        return application.error(obj.res, { msg: err });
                    }
                    return application.success(obj.res, { openurl: '/download/' + filename });
                });
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , e_import: async function (obj) {
            try {
                if (obj.req.method == 'GET') {
                    let body = '';
                    body += '<div class="row no-margin">';
                    body += application.components.html.file({
                        width: '12'
                        , name: 'file'
                        , label: 'Arquivo'
                        , maxfiles: '1'
                    });
                    body += '</div>';
                    return application.success(obj.res, {
                        modal: {
                            form: true
                            , id: 'modalevt'
                            , action: '/event/' + obj.event.id
                            , title: obj.event.description
                            , body: body
                            , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Importar</button>'
                        }
                    });
                } else {
                    let invalidfields = application.functions.getEmptyFields(obj.req.body, ['file']);
                    if (invalidfields.length > 0) {
                        return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                    }
                    let file = JSON.parse(obj.req.body.file)[0];
                    let models = JSON.parse(fs.readFileSync(`${__dirname}/../files/${process.env.NODE_APPNAME}/${file.id}.${file.type}`, 'utf8'));
                    console.log('----------SYNC MODELS---------');
                    for (let i = 0; i < models.length; i++) {
                        console.log('MODEL ' + models[i].name);
                        let model = await db.getModel('model').findOne({ where: { name: models[i].name } });
                        if (model) {
                            model.description = models[i].description;
                            model.onsave = models[i].onsave;
                            model.ondelete = models[i].ondelete;
                            await model.save();
                        } else {
                            model = await db.getModel('model').create({
                                name: models[i].name
                                , description: models[i].description
                                , onsave: models[i].onsave
                                , ondelete: models[i].ondelete
                            });
                        }
                        let attributes = [];
                        for (let z = 0; z < models[i]._attribute.length; z++) {
                            let attribute = await db.getModel('modelattribute').findOne({ where: { idmodel: model.id, name: models[i]._attribute[z].name } });
                            attributes.push(models[i]._attribute[z].name);
                            if (attribute) {
                                attribute.label = models[i]._attribute[z].label;
                                attribute.type = models[i]._attribute[z].type;
                                attribute.notnull = models[i]._attribute[z].notnull;
                                attribute.typeadd = models[i]._attribute[z].typeadd;
                                await attribute.save();
                            } else {
                                await db.getModel('modelattribute').create({
                                    idmodel: model.id
                                    , name: models[i]._attribute[z].name
                                    , label: models[i]._attribute[z].label
                                    , type: models[i]._attribute[z].type
                                    , notnull: models[i]._attribute[z].notnull
                                    , typeadd: models[i]._attribute[z].typeadd
                                });
                            }
                        }
                        await db.getModel('modelattribute').destroy({ iduser: obj.req.user.id, where: { idmodel: model.id, name: { $notIn: attributes } } });
                        if (i != models.length - 1) {
                            console.log('------------------------------');
                        }
                    }
                    console.log('-----------FINISHED-----------');
                    return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                }
            } catch (err) {
                return application.error(obj.res, { msg: err });
            }
        }
        , e_generateConnection: async function (obj) {
            try {
                if (obj.req.method == 'GET') {
                    let body = '';
                    body += '<div class="row no-margin">';
                    body += application.components.html.text({
                        width: '12'
                        , name: 'uri'
                        , label: 'URI'
                        , value: 'postgres://postgres:postgres@127.0.0.1:5432/db'
                    });
                    body += '</div>';
                    return application.success(obj.res, {
                        modal: {
                            form: true
                            , id: 'modalevt'
                            , action: '/event/' + obj.event.id
                            , title: obj.event.description
                            , body: body
                            , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Gerar</button>'
                        }
                    });
                } else {
                    let body = '';
                    body += '<div class="col-md-12" style="word-break: break-all;">';
                    body += Cyjs.AES.encrypt(obj.req.body.uri || '', application.sk).toString();
                    body += '</div>';
                    return application.success(obj.res, {
                        modal: {
                            id: 'modalevt2'
                            , title: obj.event.description
                            , body: body
                            , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Voltar</button>'
                        }
                    });
                }
            } catch (err) {
                return application.error(obj.res, { msg: err });
            }
        }
        , findAll: function (modelname, options) {
            return new Promise((resolve, reject) => {
                const fixResults = function (registers, modelattributes) {
                    for (let i = 0; i < registers.rows.length; i++) {
                        registers.rows[i]['DT_RowId'] = registers.rows[i].id;
                    }
                    let j = {};
                    for (let i = 0; i < modelattributes.length; i++) {
                        if (modelattributes[i].typeadd) {
                            j = application.modelattribute.parseTypeadd(modelattributes[i].typeadd);
                        }
                        switch (modelattributes[i].type) {
                            case 'autocomplete':
                                let vas = j.as || j.model;
                                for (let x = 0; x < registers.rows.length; x++) {
                                    if (registers.rows[x][modelattributes[i].name]) {
                                        registers.rows[x][modelattributes[i].name] = registers.rows[x][vas + '.' + j.attribute];
                                    }
                                }
                                break;
                            case 'date':
                                for (let x = 0; x < registers.rows.length; x++) {
                                    if (registers.rows[x][modelattributes[i].name]) {
                                        registers.rows[x][modelattributes[i].name] = application.formatters.fe.date(registers.rows[x][modelattributes[i].name]);
                                    }
                                }
                                break;
                            case 'datetime':
                                for (let x = 0; x < registers.rows.length; x++) {
                                    if (registers.rows[x][modelattributes[i].name]) {
                                        registers.rows[x][modelattributes[i].name] = application.formatters.fe.datetime(registers.rows[x][modelattributes[i].name]);
                                    }
                                }
                                break;
                            case 'decimal':
                                for (let x = 0; x < registers.rows.length; x++) {
                                    if (registers.rows[x][modelattributes[i].name]) {
                                        registers.rows[x][modelattributes[i].name] = application.formatters.fe.decimal(registers.rows[x][modelattributes[i].name], j.precision);
                                    }
                                }
                                break;
                            case 'time':
                                for (let x = 0; x < registers.rows.length; x++) {
                                    if (registers.rows[x][modelattributes[i].name]) {
                                        registers.rows[x][modelattributes[i].name] = application.formatters.fe.time(registers.rows[x][modelattributes[i].name]);
                                    }
                                }
                                break;
                            case 'virtual':
                                switch (j.type) {
                                    case 'decimal':
                                        for (let x = 0; x < registers.rows.length; x++) {
                                            if (registers.rows[x][modelattributes[i].name]) {
                                                registers.rows[x][modelattributes[i].name] = application.formatters.fe.decimal(registers.rows[x][modelattributes[i].name], j.precision);
                                            }
                                        }
                                        break;
                                }
                                break;
                        }
                    }
                    return registers;
                }
                db.getModel('model').findOne({ where: { name: modelname } }).then(model => {
                    if (!model) {
                        return reject('model not found');
                    }
                    db.getModel('modelattribute').findAll({ where: { idmodel: model.id } }).then(modelattributes => {
                        let attributes = ['id'];
                        for (let i = 0; i < modelattributes.length; i++) {
                            switch (modelattributes[i].type) {
                                case 'parent':
                                    attributes.push(modelattributes[i].name);
                                    break;
                                case 'virtual':
                                    attributes.push([db.Sequelize.literal(application.modelattribute.parseTypeadd(modelattributes[i].typeadd).subquery), modelattributes[i].name]);
                                    break;
                                default:
                                    attributes.push(modelattributes[i].name);
                                    break;
                            }
                        }
                        db.getModel(model.name).findAndCountAll(lodash.extend({
                            attributes: attributes
                            , raw: true
                            , include: [{ all: true }]
                        }, options)).then(registers => {
                            let original = JSON.stringify(registers.rows);
                            registers = fixResults(registers, modelattributes);
                            registers.original = JSON.parse(original);
                            return resolve(registers);
                        });
                    });
                });
            });
        }
    }
    , notification: {
        create: function (users, obj) {
            for (let i = 0; i < users.length; i++) {
                db.getModel('notification').create({
                    datetime: moment()
                    , iduser: users[i]
                    , title: obj.title
                    , description: obj.description
                    , link: obj.link || null
                    , read: false
                }).then(notification => {
                    notification = notification.dataValues;
                    notification.duration = application.functions.duration(moment().diff(moment(notification.datetime), 'minutes'));
                    io.to(notification.iduser).emit('notification', notification);
                });
            }
        }
        , js_read: async function (obj) {
            try {
                let notification = await db.getModel('notification').findOne({ where: { id: obj.data.id } });
                if (notification.iduser != obj.req.user.id) {
                    return application.error(obj.res, {});
                }
                notification.read = true;
                notification.save();
                io.to(notification.iduser).emit('notification:read');
                return application.success(obj.res, {});
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , js_readAll: async function (obj) {
            try {
                await db.getModel('notification').update({ read: true }, { where: { iduser: obj.req.user.id } });
                io.to(obj.req.user.id).emit('notification:read');
                return application.success(obj.res, {});
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , r_handler: async function (obj) {
            try {
                const f = {
                    getAll: async function (obj) {
                        let notifications = await db.getModel('notification').findAll({ raw: true, where: { iduser: obj.req.user.id }, order: [['datetime', 'desc'], ['id', 'desc']] });
                        for (let i = 0; i < notifications.length; i++) {
                            notifications[i].datetime = application.formatters.fe.datetime(notifications[i].datetime);
                        }
                        return application.success(obj.res, { data: notifications });
                    }
                }
                if (obj.req.body.function in f) {
                    f[obj.req.body.function](obj);
                } else {
                    return application.error(obj.res, { msg: 'Função não encontrada' });
                }
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
    }
    , permission: {
        onsave: async function (obj, next) {
            try {
                let permission = await db.getModel('permission').findOne({
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
    , report: {
        e_preview: async function (obj) {
            try {
                if (obj.ids.length != 1) {
                    return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                }
                let filename = await platform.report.f_generate(obj.ids[0], {});
                if (filename) {
                    return application.success(obj.res, {
                        openurl: '/download/' + filename
                    });
                } else {
                    return application.error(obj.res, { msg: 'ops' });
                }
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , f_generate: function (report, replaces) {
            return new Promise((resolve, reject) => {
                try {
                    let where = {};
                    if (isNaN(report)) {
                        where = { name: report };
                    } else {
                        where = { id: report };
                    }
                    db.getModel('report').findOne({ where: where }).then(report => {
                        if (!report) {
                            return reject(`Relatório ${report} não encontrado`);
                        }
                        db.getModel('config').findOne({ raw: true }).then(config => {
                            replaces.__reportimage = '';
                            if (config.reportimage) {
                                let reportimage = JSON.parse(config.reportimage);
                                replaces.__reportimage = `${__dirname}/../files/${process.env.NODE_APPNAME}/${reportimage[0].id}.${reportimage[0].type}`;
                            }
                            replaces.__datetime = moment().format(application.formatters.fe.datetime_format);
                            let html = `
                            <html>
                                <head>
                                    <meta charset="utf8">
                                    <style>
                                        html {
                                            zoom: 0.95;
                                        }
                                        html, body, table {
                                            font-size: ${report.fontsize || 12};
                                        }
                                        tbody td {
                                            border-color: #bfbfbf;
                                            height: 14px;
                                        }
                                        thead td, tfoot td {
                                            border: 1px solid black;
                                        }
                                        tr td {
                                            page-break-inside: avoid;
                                        }
                                    </style>
                                </head>
                                <body>          
                                    ${report.html}
                                </body>
                            </html>
                            `;
                            for (let k in replaces) {
                                html = html.replace('{{' + k + '}}', replaces[k] || '');
                            }
                            let options = {
                                border: {
                                    top: "0.5cm",
                                    right: "0.5cm",
                                    bottom: "0.5cm",
                                    left: "0.5cm"
                                }
                                , orientation: report.landscape ? 'landscape' : 'portait'
                            }
                            let filename = process.hrtime()[1] + '.pdf';

                            pdf.create(html, options).toFile(`${__dirname}/../tmp/${process.env.NODE_APPNAME}/${filename}`, function (err, res) {
                                if (err) {
                                    return reject(err);
                                }
                                return resolve(filename);
                            });
                        });
                    });
                } catch (err) {
                    return reject(err);
                }
            });
        }
    }
    , route: {
        onsave: async function (obj, next) {
            let register = await db.getModel('route').findOne({ where: { id: { $ne: obj.id }, description: obj.register.description } })
            if (register) {
                return application.error(obj.res, { msg: 'Já existe uma rota com esta descrição' });
            }
            await next(obj);
            db.sequelize.query("update route set url = translate(lower(description), 'áàãâéèêíìóòõôúùûç ', 'aaaaeeeiioooouuuc_')");
        }
        , e_export: async function (obj) {
            try {
                if (obj.ids.length <= 0) {
                    return application.error(obj.res, { msg: application.message.selectOneEvent });
                }
                let routes = await db.getModel('route').findAll({ where: { id: { $in: obj.ids } }, order: [['description', 'asc']] });
                let j = [];
                for (let i = 0; i < routes.length; i++) {
                    j.push({
                        description: routes[i].description
                        , file: routes[i].file
                        , function: routes[i].function
                        , needauth: routes[i].needauth
                        , needperm: routes[i].needperm
                        , url: routes[i].url
                    });
                }
                let filename = process.hrtime()[1] + '.json';
                fs.writeFile(`${__dirname}/../tmp/${process.env.NODE_APPNAME}/${filename}`, JSON.stringify(j), function (err) {
                    if (err) {
                        return application.error(obj.res, { msg: err });
                    }
                    return application.success(obj.res, { openurl: '/download/' + filename });
                });
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , e_import: async function (obj) {
            try {
                if (obj.req.method == 'GET') {
                    let body = '';
                    body += '<div class="row no-margin">';
                    body += application.components.html.file({
                        width: '12'
                        , name: 'file'
                        , label: 'Arquivo'
                        , maxfiles: '1'
                    });
                    body += '</div>';
                    return application.success(obj.res, {
                        modal: {
                            form: true
                            , id: 'modalevt'
                            , action: '/event/' + obj.event.id
                            , title: obj.event.description
                            , body: body
                            , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Importar</button>'
                        }
                    });
                } else {
                    let invalidfields = application.functions.getEmptyFields(obj.req.body, ['file']);
                    if (invalidfields.length > 0) {
                        return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                    }
                    let file = JSON.parse(obj.req.body.file)[0];
                    let routes = JSON.parse(fs.readFileSync(`${__dirname}/../files/${process.env.NODE_APPNAME}/${file.id}.${file.type}`, 'utf8'));
                    console.log('----------SYNC ROUTES---------');
                    for (let i = 0; i < routes.length; i++) {
                        console.log('ROUTE ' + routes[i].description);
                        let route = await db.getModel('route').findOne({ where: { description: routes[i].description } });
                        if (route) {
                            route.file = routes[i].file;
                            route.function = routes[i].function;
                            route.needauth = routes[i].needauth;
                            route.needperm = routes[i].needperm;
                            route.url = routes[i].url;
                            if (route.changed()) {
                                await route.save();
                                console.log('UPDATED');
                            } else {
                                console.log('OK');
                            }
                        } else {
                            route = await db.getModel('route').create({
                                description: routes[i].description
                                , file: routes[i].file
                                , function: routes[i].function
                                , needauth: routes[i].needauth
                                , needperm: routes[i].needperm
                                , url: routes[i].url
                            });
                            console.log('CREATED');
                        }
                        if (i != routes.length - 1) {
                            console.log('------------------------------');
                        }
                    }
                    console.log('-----------FINISHED-----------');
                    return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                }
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
    , messenger: {
        e_active: async function (obj) {
            try {
                if (obj.ids.length == 0) {
                    return application.error(obj.res, { msg: application.message.selectOneEvent });
                }
                let messengers = await db.getModel('messenger').findAll({ where: { id: { $in: obj.ids } } });
                messengers.map(mes => {
                    messenger.activeMessenger(mes);
                    mes.active = true;
                    mes.save();
                });
                return application.success(obj.res, { msg: application.message.success, reloadtables: true });
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , e_desactive: async function (obj) {
            try {
                if (obj.ids.length == 0) {
                    return application.error(obj.res, { msg: application.message.selectOneEvent });
                }
                let messengers = await db.getModel('messenger').findAll({ where: { id: { $in: obj.ids } } });
                messengers.map(mes => {
                    messenger.desactiveMessenger(mes);
                    mes.active = false;
                    mes.save();
                });
                return application.success(obj.res, { msg: application.message.success, reloadtables: true });
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , mailtest: function (mail) {
            console.log('received email', mail.subject, mail.text, mail.attachments);
        }
    }
    , parameter: {
        f_get: async (key) => {
            let param = await db.getModel('parameter').findOne({ where: { key: key } });
            return param ? JSON.parse(param.value) : null;
        }
    }
    , users: {
        onsave: async (obj, next) => {
            try {
                let user = await db.getModel('users').findOne({ where: { id: { $ne: obj.register.id }, username: obj.register.username } });
                if (user) {
                    return application.error(obj.res, { msg: 'Já existe um usuário com este Username', invalidfields: ['username'] });
                }
                if (obj.register.newpassword) {
                    obj.register.password = Cyjs.SHA3(`${application.sk}${obj.register.newpassword}${application.sk}`).toString();
                    obj.register.newpassword = null;
                }
                next(obj);
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , js_getNotifications: async function (obj) {
            try {
                let data = {
                    notifications: []
                }
                data.notifications = await db.getModel('notification').findAll({ raw: true, where: { iduser: obj.req.user.id, read: false }, order: [['datetime', 'desc']] });
                for (let i = 0; i < data.notifications.length; i++) {
                    data.notifications[i].duration = application.functions.duration(moment().diff(moment(data.notifications[i].datetime), 'minutes'))
                }
                return application.success(obj.res, { data: data });
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
    }
    , view: {
        onsave: async function (obj, next) {
            try {
                let register = await db.getModel('view').findOne({ where: { id: { $ne: obj.id }, name: { $iLike: obj.register.name } } })
                if (register) {
                    return application.error(obj.res, { msg: 'Já existe uma view com este nome' });
                }
                let modulee = await db.getModel('module').findOne({ where: { id: obj.register.idmodule || 0 } });
                obj.register.namecomplete = modulee ? modulee.description + ' - ' + obj.register.name : obj.register.name;
                await next(obj);
                db.sequelize.query("update view set url = translate(lower(name), 'áàãâéèêíìóòõôúùûç ', 'aaaaeeeiioooouuuc_')");
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , e_export: async function (obj) {
            try {
                let json = JSON.parse(obj.event.parameters || '{}');
                let views = [];
                if (json.all) {
                    views = await db.getModel('view').findAll({ include: [{ all: true }], order: [['name', 'asc']] });
                } else {
                    if (obj.ids.length <= 0) {
                        return application.error(obj.res, { msg: application.message.selectOneEvent });
                    }
                    views = await db.getModel('view').findAll({ include: [{ all: true }], where: { id: { $in: obj.ids } }, order: [['name', 'asc']] });
                }
                let j = [];
                for (let i = 0; i < views.length; i++) {
                    j.push({
                        name: views[i].name
                        , namecomplete: views[i].namecomplete
                        , js: views[i].js
                        , wherefixed: views[i].wherefixed
                        , orderfixed: views[i].orderfixed
                        , supressid: views[i].supressid
                        , template: views[i].template.name
                        , model: views[i].model.name
                        , module: views[i].module.description
                        , url: views[i].url
                        , pagelength: views[i].pagelength
                        , fastsearch: views[i].idfastsearch ? views[i].fastsearch.name : null
                    });
                    let viewfields = await db.getModel('viewfield').findAll({ include: [{ all: true }], where: { idview: views[i].id }, order: [['order', 'asc']] });
                    j[j.length - 1]._field = [];
                    for (let z = 0; z < viewfields.length; z++) {
                        j[j.length - 1]._field.push({
                            templatezone: viewfields[z].templatezone.name
                            , modelattribute: viewfields[z].modelattribute.name
                            , width: viewfields[z].width
                            , order: viewfields[z].order
                            , disabled: viewfields[z].disabled
                            , disablefilter: viewfields[z].disablefilter
                        });
                    }
                    let viewtables = await db.getModel('viewtable').findAll({ include: [{ all: true }], where: { idview: views[i].id }, order: [['ordertable', 'asc']] });
                    j[j.length - 1]._table = [];
                    for (let z = 0; z < viewtables.length; z++) {
                        j[j.length - 1]._table.push({
                            modelattribute: viewtables[z].modelattribute.name
                            , ordertable: viewtables[z].ordertable
                            , orderable: viewtables[z].orderable
                            , render: viewtables[z].render
                            , totalize: viewtables[z].totalize
                            , class: viewtables[z].class
                        });
                    }
                    let viewsubviews = await db.getModel('viewsubview').findAll({ include: [{ all: true }], where: { idview: views[i].id }, order: [['description', 'asc']] });
                    j[j.length - 1]._subview = [];
                    for (let z = 0; z < viewsubviews.length; z++) {
                        j[j.length - 1]._subview.push({
                            subview: viewsubviews[z].subview.name
                            , templatezone: viewsubviews[z].templatezone.name
                            , description: viewsubviews[z].description
                        });
                    }
                    let viewevents = await db.getModel('viewevent').findAll({ where: { idview: views[i].id }, order: [['description', 'asc']] });
                    j[j.length - 1]._event = [];
                    for (let z = 0; z < viewevents.length; z++) {
                        j[j.length - 1]._event.push({
                            description: viewevents[z].description
                            , icon: viewevents[z].icon
                            , function: viewevents[z].function
                            , parameters: viewevents[z].parameters
                        });
                    }
                }
                let filename = process.hrtime()[1] + '.json';
                fs.writeFile(`${__dirname}/../tmp/${process.env.NODE_APPNAME}/${filename}`, JSON.stringify(j), function (err) {
                    if (err) {
                        return application.error(obj.res, { msg: err });
                    }
                    return application.success(obj.res, { openurl: '/download/' + filename });
                });
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , e_import: async function (obj) {
            try {
                if (obj.req.method == 'GET') {
                    let body = '';
                    body += '<div class="row no-margin">';
                    body += application.components.html.file({
                        width: '12'
                        , name: 'file'
                        , label: 'Arquivo'
                        , maxfiles: '1'
                    });
                    body += '</div>';
                    return application.success(obj.res, {
                        modal: {
                            form: true
                            , id: 'modalevt'
                            , action: '/event/' + obj.event.id
                            , title: obj.event.description
                            , body: body
                            , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Importar</button>'
                        }
                    });
                } else {
                    let invalidfields = application.functions.getEmptyFields(obj.req.body, ['file']);
                    if (invalidfields.length > 0) {
                        return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                    }
                    let file = JSON.parse(obj.req.body.file)[0];
                    let views = JSON.parse(fs.readFileSync(`${__dirname}/../files/${process.env.NODE_APPNAME}/${file.id}.${file.type}`, 'utf8'));
                    console.log('----------SYNC VIEWS----------');
                    for (let i = 0; i < views.length; i++) {
                        console.log('VIEW ' + views[i].name);
                        let view = await db.getModel('view').findOne({ where: { name: views[i].name } });
                        let model = await db.getModel('model').findOne({ where: { name: views[i].model } });
                        let modulee = await db.getModel('module').findOrCreate({ where: { description: views[i].module } });
                        let template = await db.getModel('template').findOrCreate({ where: { name: views[i].template } });
                        let fastsearch = await db.getModel('modelattribute').findOne({ where: { idmodel: model.id, name: views[i].fastsearch } });
                        if (model) {
                            if (view) {
                                view.name = views[i].name;
                                view.idtemplate = template[0].id;
                                view.idmodel = model.id;
                                view.idmodule = modulee[0].id;
                                view.wherefixed = views[i].wherefixed;
                                view.supressid = views[i].supressid;
                                view.js = views[i].js;
                                view.namecomplete = views[i].namecomplete;
                                view.orderfixed = views[i].orderfixed;
                                view.url = views[i].url;
                                view.pagelength = views[i].pagelength;
                                view.idfastsearch = fastsearch ? fastsearch.id : null;
                                await view.save();
                            } else {
                                view = await db.getModel('view').create({
                                    name: views[i].name
                                    , idtemplate: template[0].id
                                    , idmodel: model.id
                                    , idmodule: modulee[0].id
                                    , wherefixed: views[i].wherefixed
                                    , supressid: views[i].supressid
                                    , js: views[i].js
                                    , namecomplete: views[i].namecomplete
                                    , orderfixed: views[i].orderfixed
                                    , url: views[i].url
                                    , pagelength: views[i].pagelength
                                    , idfastsearch: fastsearch ? fastsearch.id : null
                                });
                            }
                            let viewfields = []
                            for (let z = 0; z < views[i]._field.length; z++) {
                                let templatezone = await db.getModel('templatezone').findOrCreate({ where: { idtemplate: template[0].id, name: views[i]._field[z].templatezone } });
                                let modelattribute = await db.getModel('modelattribute').findOne({ where: { idmodel: model.id, name: views[i]._field[z].modelattribute } });
                                if (modelattribute) {
                                    let viewfield = await db.getModel('viewfield').findOne({ where: { idview: view.id, idmodelattribute: modelattribute.id } });
                                    if (viewfield) {
                                        viewfield.idtemplatezone = templatezone[0].id;
                                        viewfield.width = views[i]._field[z].width;
                                        viewfield.order = views[i]._field[z].order;
                                        viewfield.disabled = views[i]._field[z].disabled;
                                        viewfield.disablefilter = views[i]._field[z].disablefilter;
                                        await viewfield.save();
                                    } else {
                                        viewfield = await db.getModel('viewfield').create({
                                            idview: view.id
                                            , idtemplatezone: templatezone[0].id
                                            , idmodelattribute: modelattribute.id
                                            , width: views[i]._field[z].width
                                            , order: views[i]._field[z].order
                                            , disabled: views[i]._field[z].disabled
                                            , disablefilter: views[i]._field[z].disablefilter
                                        });
                                    }
                                    viewfields.push(viewfield.id);
                                } else {
                                    console.error('ERROR: Model attribute "' + views[i]._field[z].modelattribute + '" not found');
                                }
                            }
                            await db.getModel('viewfield').destroy({ iduser: obj.req.user.id, where: { idview: view.id, id: { $notIn: viewfields } } });
                            let viewtables = [];
                            for (let z = 0; z < views[i]._table.length; z++) {
                                let modelattribute = await db.getModel('modelattribute').findOne({ where: { idmodel: model.id, name: views[i]._table[z].modelattribute } });
                                if (modelattribute) {
                                    let viewtable = await db.getModel('viewtable').findOne({ where: { idview: view.id, idmodelattribute: modelattribute.id } });
                                    if (viewtable) {
                                        viewtable.ordertable = views[i]._table[z].ordertable;
                                        viewtable.orderable = views[i]._table[z].orderable;
                                        viewtable.render = views[i]._table[z].render;
                                        viewtable.totalize = views[i]._table[z].totalize;
                                        viewtable.class = views[i]._table[z].class;
                                        await viewtable.save();
                                    } else {
                                        viewtable = await db.getModel('viewtable').create({
                                            idview: view.id
                                            , idmodelattribute: modelattribute.id
                                            , ordertable: views[i]._table[z].ordertable
                                            , orderable: views[i]._table[z].orderable
                                            , render: views[i]._table[z].render
                                            , totalize: views[i]._table[z].totalize
                                            , class: views[i]._table[z].class
                                        });
                                    }
                                    viewtables.push(viewtable.id);
                                } else {
                                    console.error('ERROR: Model attribute "' + views[i]._table[z].modelattribute + '" not found');
                                }
                            }
                            await db.getModel('viewtable').destroy({ iduser: obj.req.user.id, where: { idview: view.id, id: { $notIn: viewtables } } });
                            let viewevents = [];
                            for (let z = 0; z < views[i]._event.length; z++) {
                                let viewevent = await db.getModel('viewevent').findOne({ where: { idview: view.id, description: views[i]._event[z].description } });
                                if (viewevent) {
                                    viewevent.icon = views[i]._event[z].icon;
                                    viewevent.function = views[i]._event[z].function;
                                    viewevent.parameters = views[i]._event[z].parameters;
                                    await viewevent.save();
                                } else {
                                    viewevent = await db.getModel('viewevent').create({
                                        idview: view.id
                                        , description: views[i]._event[z].description
                                        , icon: views[i]._event[z].icon
                                        , function: views[i]._event[z].function
                                        , parameters: views[i]._event[z].parameters
                                    });
                                }
                                viewevents.push(viewevent.id);
                            }
                            await db.getModel('viewevent').destroy({ iduser: obj.req.user.id, where: { idview: view.id, id: { $notIn: viewevents } } });
                        } else {
                            views[i]._skipped = true;
                            console.log('SKIPPED');
                        }
                        if (i != views.length - 1) {
                            console.log('------------------------------');
                        }
                    }
                    for (let i = 0; i < views.length; i++) {
                        if (!views[i]._skipped) {
                            let view = await db.getModel('view').findOne({ include: [{ all: true }], where: { name: views[i].name } });
                            let viewsubviews = [];
                            for (let z = 0; z < views[i]._subview.length; z++) {
                                let viewsubview = await db.getModel('view').findOne({ where: { name: views[i]._subview[z].subview } });
                                if (viewsubview) {
                                    let subview = await db.getModel('viewsubview').findOne({ where: { idview: view.id, idsubview: viewsubview.id } });
                                    let templatezone = await db.getModel('templatezone').findOrCreate({ where: { idtemplate: view.template.id, name: views[i]._subview[z].templatezone } });
                                    if (subview) {
                                        subview.description = views[i]._subview[z].description;
                                        subview.idtemplatezone = templatezone[0].id;
                                        await subview.save();
                                    } else {
                                        subview = await db.getModel('viewsubview').create({
                                            idview: view.id
                                            , idsubview: viewsubview.id
                                            , idtemplatezone: templatezone[0].id
                                            , description: views[i]._subview[z].description
                                        });
                                    }
                                    viewsubviews.push(subview.id);
                                } else {
                                    console.error('ERROR: Subview "' + views[i]._subview[z].subview + '" not found');
                                }
                            }
                            await db.getModel('viewsubview').destroy({ iduser: obj.req.user.id, where: { idview: view.id, id: { $notIn: viewsubviews } } });
                        }
                    }
                    console.log('-----------FINISHED-----------');
                    return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                }
            } catch (err) {
                return application.error(obj.res, { msg: err });
            }
        }
        , f_getFilteredRegisters: function (obj) {
            return new Promise((resolve) => {
                let getFilter = function (cookie, viewfields) {
                    let obj = {};

                    cookie = JSON.parse(cookie);

                    let m;
                    let v;
                    let f;

                    for (let i = 0; i < cookie.length; i++) {

                        for (let k in cookie[i]) {

                            let field = k.split('+');

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

                            let o = {};
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
                                    for (let z = 0; z < viewfields.length; z++) {
                                        if (field[0] == viewfields[z].modelattribute.name) {
                                            f = application.modelattribute.parseTypeadd(viewfields[z].modelattribute.typeadd).field;
                                            if (f && f.indexOf('$value') > 0) {
                                                o = db.Sequelize.literal(application.modelattribute.parseTypeadd(viewfields[z].modelattribute.typeadd).field.replace('$value', cookie[i][k]));
                                            } else {
                                                o = db.Sequelize.literal(application.modelattribute.parseTypeadd(viewfields[z].modelattribute.typeadd).subquery + " = " + cookie[i][k]);
                                            }
                                        }
                                    }
                                    break;
                                case 'sv':
                                    for (let z = 0; z < viewfields.length; z++) {
                                        if (field[0] == viewfields[z].modelattribute.name) {
                                            f = application.modelattribute.parseTypeadd(viewfields[z].modelattribute.typeadd).field;
                                            if (f && f.indexOf('$value') > 0) {
                                                o = db.Sequelize.literal(application.modelattribute.parseTypeadd(viewfields[z].modelattribute.typeadd).field.replace('$value', cookie[i][k]));
                                            } else {
                                                o = db.Sequelize.literal(application.modelattribute.parseTypeadd(viewfields[z].modelattribute.typeadd).subquery + "::text ilike '" + cookie[i][k] + "'");
                                            }
                                        }
                                    }
                                    break;
                                case 'bv':
                                    for (let z = 0; z < viewfields.length; z++) {
                                        if (field[0] == viewfields[z].modelattribute.name) {
                                            f = application.modelattribute.parseTypeadd(viewfields[z].modelattribute.typeadd).field;
                                            if (f && f.indexOf('$value') > 0) {
                                                o = db.Sequelize.literal(application.modelattribute.parseTypeadd(viewfields[z].modelattribute.typeadd).field.replace('$value', cookie[i][k]));
                                            } else {
                                                o = db.Sequelize.literal(application.modelattribute.parseTypeadd(viewfields[z].modelattribute.typeadd).subquery + "::decimal >= " + cookie[i][k]);
                                            }
                                        }
                                    }
                                    break;
                                case 'ev':
                                    for (let z = 0; z < viewfields.length; z++) {
                                        if (field[0] == viewfields[z].modelattribute.name) {
                                            f = application.modelattribute.parseTypeadd(viewfields[z].modelattribute.typeadd).field;
                                            if (f && f.indexOf('$value') > 0) {
                                                o = db.Sequelize.literal(application.modelattribute.parseTypeadd(viewfields[z].modelattribute.typeadd).field.replace('$value', cookie[i][k]));
                                            } else {
                                                o = db.Sequelize.literal(application.modelattribute.parseTypeadd(viewfields[z].modelattribute.typeadd).subquery + "::decimal <= " + cookie[i][k]);
                                            }
                                        }
                                    }
                                    break;
                                case 'iv':
                                    for (let z = 0; z < viewfields.length; z++) {
                                        if (field[0] == viewfields[z].modelattribute.name) {
                                            f = application.modelattribute.parseTypeadd(viewfields[z].modelattribute.typeadd).field;
                                            if (f && f.indexOf('$value') > 0) {
                                                o = db.Sequelize.literal(application.modelattribute.parseTypeadd(viewfields[z].modelattribute.typeadd).field.replace('$value', cookie[i][k].val));
                                            } else {
                                                o = db.Sequelize.literal(application.modelattribute.parseTypeadd(viewfields[z].modelattribute.typeadd).field + ' in (' + cookie[i][k].val + ')');
                                            }
                                        }
                                    }
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
                let fixResults = function (registers, viewfields) {
                    let j = {};
                    let modelattributenames = [];
                    for (let i = 0; i < viewfields.length; i++) {
                        modelattributenames.push(viewfields[i].modelattribute.name);

                        if (viewfields[i].modelattribute.typeadd) {
                            j = application.modelattribute.parseTypeadd(viewfields[i].modelattribute.typeadd);
                        }

                        switch (viewfields[i].modelattribute.type) {
                            case 'text':
                                for (let x = 0; x < registers.length; x++) {
                                    if (!registers[x][viewfields[i].modelattribute.name]) {
                                        registers[x][viewfields[i].modelattribute.name] = '';
                                    }
                                }
                                break;
                            case 'textarea':
                                for (let x = 0; x < registers.length; x++) {
                                    if (!registers[x][viewfields[i].modelattribute.name]) {
                                        registers[x][viewfields[i].modelattribute.name] = '';
                                    }
                                }
                                break;
                            case 'autocomplete':
                                let vas = j.as || j.model;
                                for (let x = 0; x < registers.length; x++) {
                                    if (registers[x][viewfields[i].modelattribute.name]) {
                                        registers[x][viewfields[i].modelattribute.name] = registers[x][vas + '.' + j.attribute];
                                    } else {
                                        registers[x][viewfields[i].modelattribute.name] = '';
                                    }
                                }
                                break;
                            case 'date':
                                for (let x = 0; x < registers.length; x++) {
                                    if (registers[x][viewfields[i].modelattribute.name]) {
                                        registers[x][viewfields[i].modelattribute.name] = application.formatters.fe.date(registers[x][viewfields[i].modelattribute.name]);
                                    } else {
                                        registers[x][viewfields[i].modelattribute.name] = '';
                                    }
                                }
                                break;
                            case 'datetime':
                                for (let x = 0; x < registers.length; x++) {
                                    if (registers[x][viewfields[i].modelattribute.name]) {
                                        registers[x][viewfields[i].modelattribute.name] = application.formatters.fe.datetime(registers[x][viewfields[i].modelattribute.name]);
                                    } else {
                                        registers[x][viewfields[i].modelattribute.name] = '';
                                    }
                                }
                                break;
                            case 'decimal':
                                for (let x = 0; x < registers.length; x++) {
                                    if (registers[x][viewfields[i].modelattribute.name]) {
                                        registers[x][viewfields[i].modelattribute.name] = application.formatters.fe.decimal(registers[x][viewfields[i].modelattribute.name], j.precision);
                                    } else {
                                        registers[x][viewfields[i].modelattribute.name] = '';
                                    }
                                }
                                break;
                            case 'time':
                                for (let x = 0; x < registers.length; x++) {
                                    if (registers[x][viewfields[i].modelattribute.name]) {
                                        registers[x][viewfields[i].modelattribute.name] = application.formatters.fe.time(registers[x][viewfields[i].modelattribute.name]);
                                    } else {
                                        registers[x][viewfields[i].modelattribute.name] = '';
                                    }
                                }
                                break;
                            case 'virtual':

                                switch (j.type) {
                                    case 'decimal':
                                        for (let x = 0; x < registers.length; x++) {
                                            if (registers[x][viewfields[i].modelattribute.name]) {
                                                registers[x][viewfields[i].modelattribute.name] = application.formatters.fe.decimal(registers[x][viewfields[i].modelattribute.name], j.precision);
                                            } else {
                                                registers[x][viewfields[i].modelattribute.name] = '';
                                            }
                                        }
                                        break;
                                }

                                break;
                        }

                    }

                    for (let i = 0; i < registers.length; i++) {
                        for (let k in registers[i]) {
                            if (k != 'id' && modelattributenames.indexOf(k) < 0) {
                                delete registers[i][k];
                            }
                        }
                    }

                    return registers;
                }
                db.getModel('view').findOne({ where: { id: obj.event.view.id }, include: [{ all: true }] }).then(view => {
                    db.getModel('viewfield').findAll({ where: { idview: view.id }, include: [{ all: true }] }).then(viewfields => {
                        let where = {};
                        if (view.wherefixed) {
                            view.wherefixed = view.wherefixed.replace(/\$user/g, obj.req.user.id);
                            view.wherefixed = view.wherefixed.replace(/\$id/g, obj.req.body.id);
                            where['$col'] = db.Sequelize.literal(view.wherefixed);
                        }
                        let parameters = JSON.parse(application.functions.singleSpace(obj.event.parameters));
                        if ('onlySelected' in parameters && parameters.onlySelected) {
                            where['$and'] = { id: { $in: obj.ids } };
                        } else {
                            if ('tableview' + view.url + 'filter' in obj.req.cookies) {
                                where['$and'] = getFilter(obj.req.cookies['tableview' + view.url + 'filter'], viewfields);
                            }
                        }
                        let order = parameters.order;
                        let ordercolumn = order[0];
                        let orderdir = order[1];
                        let attributes = ['id'];
                        for (let i = 0; i < viewfields.length; i++) {
                            switch (viewfields[i].modelattribute.type) {
                                case 'virtual':
                                    attributes.push([db.Sequelize.literal(application.modelattribute.parseTypeadd(viewfields[i].modelattribute.typeadd).subquery), viewfields[i].modelattribute.name]);
                                    break;
                                default:
                                    attributes.push(viewfields[i].modelattribute.name);
                                    break;
                            }
                            // Order
                            if (viewfields[i].modelattribute.name == ordercolumn) {
                                switch (viewfields[i].modelattribute.type) {
                                    case 'autocomplete':
                                        let j = application.modelattribute.parseTypeadd(viewfields[i].modelattribute.typeadd);
                                        let vas = j.as || j.model;
                                        ordercolumn = db.Sequelize.literal(vas + '.' + j.attribute);
                                        break;
                                    case 'virtual':
                                        ordercolumn = db.Sequelize.literal(viewfields[i].modelattribute.name);
                                        break;
                                }
                            }
                        }
                        db.getModel(view.model.name).findAll({
                            attributes: attributes
                            , raw: true
                            , include: [{ all: true }]
                            , where: where
                            , order: [[ordercolumn, orderdir]]
                        }).then(registers => {
                            resolve(fixResults(registers, viewfields));
                        });
                    });
                });
            });
        }
        , export: {
            xls: async function (obj) {
                let getFilter = function (cookie, modelattributes) {
                    let obj = {};

                    cookie = JSON.parse(cookie);

                    let m;
                    let v;

                    for (let i = 0; i < cookie.length; i++) {

                        for (let k in cookie[i]) {

                            let field = k.split('+');

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

                            let o = {};
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
                                    for (let z = 0; z < modelattributes.length; z++) {
                                        if (field[0] == modelattributes[z].name) {
                                            o = db.Sequelize.literal(application.modelattribute.parseTypeadd(modelattributes[z].typeadd).subquery + " = " + cookie[i][k]);
                                        }
                                    }
                                    break;
                                case 'sv':
                                    for (let z = 0; z < modelattributes.length; z++) {
                                        if (field[0] == modelattributes[z].name) {
                                            o = db.Sequelize.literal(application.modelattribute.parseTypeadd(modelattributes[z].typeadd).subquery + "::text ilike '" + cookie[i][k] + "'");
                                        }
                                    }
                                    break;
                                case 'bv':
                                    for (let z = 0; z < modelattributes.length; z++) {
                                        if (field[0] == modelattributes[z].name) {
                                            o = db.Sequelize.literal(application.modelattribute.parseTypeadd(modelattributes[z].typeadd).subquery + "::decimal >= " + cookie[i][k]);
                                        }
                                    }
                                    break;
                                case 'ev':
                                    for (let z = 0; z < modelattributes.length; z++) {
                                        if (field[0] == modelattributes[z].name) {
                                            o = db.Sequelize.literal(application.modelattribute.parseTypeadd(modelattributes[z].typeadd).subquery + "::decimal <= " + cookie[i][k]);
                                        }
                                    }
                                    break;
                                case 'iv':
                                    for (let z = 0; z < modelattributes.length; z++) {
                                        if (field[0] == modelattributes[z].name) {
                                            o = db.Sequelize.literal(application.modelattribute.parseTypeadd(modelattributes[z].typeadd).field + ' in (' + cookie[i][k].val + ')');
                                        }
                                    }
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
                let fixResults = function (registers, modelattributes) {
                    let j = {};
                    let modelattributenames = [];
                    for (let i = 0; i < modelattributes.length; i++) {
                        modelattributenames.push(modelattributes[i].name);

                        if (modelattributes[i].typeadd) {
                            j = application.modelattribute.parseTypeadd(modelattributes[i].typeadd);
                        }

                        switch (modelattributes[i].type) {
                            case 'autocomplete':
                                let vas = j.as || j.model;
                                for (let x = 0; x < registers.length; x++) {
                                    if (registers[x][modelattributes[i].name]) {
                                        registers[x][modelattributes[i].name] = registers[x][vas + '.' + j.attribute];
                                    }
                                }
                                break;
                            case 'datetime':
                                for (let x = 0; x < registers.length; x++) {
                                    if (registers[x][modelattributes[i].name]) {
                                        registers[x][modelattributes[i].name] = application.formatters.fe.datetime(registers[x][modelattributes[i].name]) + ':00';
                                    }
                                }
                                break;
                            case 'time':
                                for (let x = 0; x < registers.length; x++) {
                                    if (registers[x][modelattributes[i].name]) {
                                        registers[x][modelattributes[i].name] = application.formatters.fe.time(registers[x][modelattributes[i].name]);
                                    }
                                }
                                break;
                        }

                    }

                    for (let i = 0; i < registers.length; i++) {
                        for (let k in registers[i]) {
                            if (k != 'id' && modelattributenames.indexOf(k) < 0) {
                                delete registers[i][k];
                            }
                        }
                    }

                    return registers;
                }
                let toColumnName = function (num) {
                    for (let ret = '', a = 1, b = 26; (num -= a) >= 0; a = b, b *= 26) {
                        ret = String.fromCharCode(parseInt((num % b) / a) + 65) + ret;
                    }
                    return ret;
                }
                try {
                    let XLSX = require('xlsx');

                    let view = await db.getModel('view').findOne({ where: { id: obj.event.view.id }, include: [{ all: true }] });
                    let viewfields = await db.getModel('viewfield').findAll({ where: { idview: view.id }, include: [{ all: true }], order: [['order', 'asc']] });
                    let modelattributes = await db.getModel('modelattribute').findAll({ where: { idmodel: view.model.id } });
                    let where = {};
                    if (view.wherefixed) {
                        view.wherefixed = view.wherefixed.replace(/\$user/g, obj.req.user.id);
                        // view.wherefixed = view.wherefixed.replace(/\$id/g, obj.req.body.id);
                        where['$col'] = db.Sequelize.literal(view.wherefixed);
                    }
                    if ('tableview' + view.id + 'filter' in obj.req.cookies) {
                        where['$and'] = getFilter(obj.req.cookies['tableview' + view.id + 'filter'], modelattributes);
                    }
                    let attributes = ['id'];
                    let header = ['id'];
                    for (let i = 0; i < viewfields.length; i++) {
                        switch (viewfields[i].modelattribute.type) {
                            case 'virtual':
                                attributes.push([db.Sequelize.literal(application.modelattribute.parseTypeadd(viewfields[i].modelattribute.typeadd).subquery), viewfields[i].modelattribute.name]);
                                break;
                            default:
                                attributes.push(viewfields[i].modelattribute.name);
                                break;
                        }
                        header.push(viewfields[i].modelattribute.name);
                    }

                    let registers = await db.getModel(view.model.name).findAll({
                        attributes: attributes
                        , raw: true
                        , include: [{ all: true }]
                        , where: where
                    });
                    registers = fixResults(registers, modelattributes);

                    let wb = XLSX.utils.book_new();
                    wb.SheetNames.push('Sheet1');
                    let ws = XLSX.utils.json_to_sheet(registers, { header: header, cellDates: true });

                    for (let i = 0; i < viewfields.length; i++) {
                        let cn = toColumnName(i + 2);
                        switch (viewfields[i].modelattribute.type) {
                            case 'decimal':
                                for (let z = 0; z < registers.length; z++) {
                                    ws[cn + (z + 2)] = lodash.extend(ws[cn + (z + 2)], { t: 'n' });
                                }
                                break;
                            case 'integer':
                                for (let z = 0; z < registers.length; z++) {
                                    ws[cn + (z + 2)] = lodash.extend(ws[cn + (z + 2)], { t: 'n' });
                                }
                                break;
                            case 'date':
                                for (let z = 0; z < registers.length; z++) {
                                    ws[cn + (z + 2)] = lodash.extend(ws[cn + (z + 2)], { t: 's' });
                                }
                                break;
                            case 'datetime':
                                for (let z = 0; z < registers.length; z++) {
                                    ws[cn + (z + 2)] = lodash.extend(ws[cn + (z + 2)], { t: 's' });
                                }
                                break;
                            case 'virtual':
                                switch (application.modelattribute.parseTypeadd(viewfields[i].modelattribute.typeadd).type) {
                                    case 'decimal':
                                        for (let z = 0; z < registers.length; z++) {
                                            ws[cn + (z + 2)] = lodash.extend(ws[cn + (z + 2)], { t: 'n' });
                                        }
                                        break;
                                    case 'integer':
                                        for (let z = 0; z < registers.length; z++) {
                                            ws[cn + (z + 2)] = lodash.extend(ws[cn + (z + 2)], { t: 'n' });
                                        }
                                        break;
                                    case 'date':
                                        for (let z = 0; z < registers.length; z++) {
                                            ws[cn + (z + 2)] = lodash.extend(ws[cn + (z + 2)], { t: 'd' });
                                        }
                                        break;
                                    case 'datetime':
                                        for (let z = 0; z < registers.length; z++) {
                                            ws[cn + (z + 2)] = lodash.extend(ws[cn + (z + 2)], { t: 'd' });
                                        }
                                        break;
                                }
                                break;
                        }
                    }

                    //Fix Header
                    ws['A1'] = lodash.extend(ws['A1'], { v: 'ID' });
                    for (let i = 0; i < viewfields.length; i++) {
                        let cn = toColumnName(i + 2);
                        ws[cn + '1'] = lodash.extend(ws[cn + '1'], { v: viewfields[i].modelattribute.label });
                    }

                    let filename = process.hrtime()[1] + '.xls';
                    wb.Sheets['Sheet1'] = ws;
                    XLSX.writeFile(wb, `${__dirname}/../tmp/${process.env.NODE_APPNAME}/${filename}`);

                    return application.success(obj.res, { openurl: '/download/' + filename });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , pdf: async function (obj) {
                try {
                    let pdfMakePrinter = require('pdfmake');
                    let fontDescriptors = {
                        Roboto: {
                            normal: __dirname + '/../fonts/cour.ttf',
                            bold: __dirname + '/../fonts/courbd.ttf',
                            italics: __dirname + '/../fonts/couri.ttf',
                            bolditalics: __dirname + '/../fonts/courbi.ttf'
                        }
                    };
                    let printer = new pdfMakePrinter(fontDescriptors);

                    let config = await db.getModel('config').findOne();
                    let image = config.reportimage ? JSON.parse(config.reportimage)[0] : [{ id: 0, type: '' }];

                    let body = [];
                    let total = [];

                    let parameters = JSON.parse(application.functions.singleSpace(obj.event.parameters));
                    let registers = await platform.view.f_getFilteredRegisters(obj);
                    if (registers.length <= 0) {
                        return application.error(obj.res, { msg: 'Sem dados para exportar' });
                    }
                    for (let i = 0; i < registers.length; i++) {
                        body.push([]);
                        if (i == 0) {
                            for (let z = 0; z < parameters.columns.length; z++) {
                                body[body.length - 1].push({
                                    text: parameters.columnsLabel[z]
                                    , fontSize: parameters.headerFontSize || 8
                                    , bold: true
                                    , alignment: 'center'
                                });
                            }
                            body.push([]);
                        }
                        for (let z = 0; z < parameters.columns.length; z++) {
                            body[body.length - 1].push({
                                text: registers[i][parameters.columns[z]] || ''
                                , fontSize: parameters.bodyFontSize || 8
                                , alignment: parameters.columnsAlign[z] || 'left'
                            });

                            if ('total' in parameters && parameters.total[z]) {
                                if (!total[z]) {
                                    total[z] = 0;
                                }
                                switch (parameters.total[z]) {
                                    case 'count':
                                        total[z]++;
                                        break;
                                    case 'sum':
                                        total[z] += parseFloat(application.formatters.be.decimal(registers[i][parameters.columns[z]] || 0, parameters.totalPrecision[z]));
                                        break;
                                    default:
                                        break;
                                }
                            }
                        }
                    }

                    if ('total' in parameters) {
                        body.push([]);
                        body[body.length - 1].push({
                            text: 'Totais'
                            , fontSize: parameters.headerFontSize || 8
                            , colSpan: parameters.columns.length
                            , border: [false, false, false, false]
                            , bold: true
                            , alignment: 'center'
                        });
                        body.push([]);
                        for (let i = 0; i < parameters.columns.length; i++) {
                            body[body.length - 1].push({
                                text: parameters.total[i] == 'sum' ? application.formatters.fe.decimal(total[i], parameters.totalPrecision[i] || 2) : total[i] || ''
                                , fontSize: parameters.bodyFontSize || 8
                                , alignment: parameters.columnsAlign[i] || 'left'
                            });
                        }
                    }

                    let dd = {
                        footer: function (currentPage, pageCount) {
                            return { text: 'Página ' + currentPage + '/' + pageCount, alignment: 'center', fontSize: 8, italic: true };
                        }
                        , pageOrientation: parameters.pageOrientation || 'portait'
                        , content: [
                            {
                                style: 'table'
                                , table: {
                                    heights: 60
                                    , widths: [150, '*', 80]
                                    , body: [[
                                        fs.existsSync(`${__dirname}/../files/${process.env.NODE_APPNAME}/${image.id}.${image.type}`) ? { image: `${__dirname}/../files/${process.env.NODE_APPNAME}/${image.id}.${image.type}`, fit: [150, 100], alignment: 'center', border: [true, true, false, true] } : { text: '', border: [true, true, false, true] }
                                        , { text: parameters.title, alignment: 'center', border: [false, true, false, true], bold: true }
                                        , { text: '\n\n' + moment().format(application.formatters.fe.date_format) + '\n' + moment().format('HH:mm'), alignment: 'center', border: [false, true, true, true], fontSize: 9 }
                                    ]]
                                }
                            }
                            , {
                                table: {
                                    headerRows: 1
                                    , widths: parameters.widths
                                    , body: body
                                }
                            }
                        ]
                        , styles: {
                            table: {
                                margin: [0, 5, 0, 15]
                            }
                        }
                    };

                    let doc = printer.createPdfKitDocument(dd);
                    let filename = process.hrtime()[1] + '.pdf';
                    let stream = doc.pipe(fs.createWriteStream(`${__dirname}/../tmp/${process.env.NODE_APPNAME}/${filename}`));
                    doc.end();
                    stream.on('finish', function () {
                        return application.success(obj.res, {
                            openurl: '/download/' + filename
                        });
                    });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
        }
    }
    , viewfield: {
        e_changezone: async function (obj) {
            try {
                if (obj.req.method == 'GET') {
                    if (obj.ids.length == 0) {
                        return application.error(obj.res, { msg: application.message.selectOneEvent });
                    }

                    let viewfield = await db.getModel('viewfield').findOne({ where: { id: { $in: obj.ids } }, include: [{ all: true }] });

                    let body = '';
                    body += application.components.html.hidden({ name: 'ids', value: obj.ids.join(',') });
                    body += application.components.html.autocomplete({
                        width: 12
                        , label: 'Zona'
                        , name: 'zona'
                        , model: 'templatezone'
                        , attribute: 'name'
                        , where: 'idtemplate = ' + viewfield.view.idtemplate
                    });

                    return application.success(obj.res, {
                        modal: {
                            form: true
                            , action: '/event/' + obj.event.id
                            , id: 'modalevt'
                            , title: obj.event.description
                            , body: body
                            , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Alterar</button>'
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
        , e_incrementorder: function (obj) {
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
        , e_decrementorder: function (obj) {
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
        e_incrementorder: function (obj) {
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
        , e_decrementorder: function (obj) {
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

module.exports = platform;