const db = require('../models')
    , moment = require('moment')
    , fs = require('fs-extra')
    , schedule = require('../routes/schedule')
    , ns = require('node-schedule')
    , messenger = require('../routes/messenger')
    , lodash = require('lodash')
    , application = require('../routes/application')
    , Cyjs = require('crypto-js')
    , sharp = require('sharp')
    ;

sharp.cache(false);

const platform = {
    audit: {
        e_track: async function (obj) {
            try {
                if (obj.ids.length != 1) {
                    return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                }
                const audits = await db.getModel('audit').findAll({ raw: true, include: [{ all: true }], where: { idmodel: obj.event.view.idmodel, modelid: obj.ids[0] }, order: [['id', 'desc']] });
                const mas = await db.getModel('modelattribute').findAll({ raw: true, where: { idmodel: obj.event.view.idmodel } });
                const ma = {};
                for (const el of mas) {
                    ma[el.name] = el;
                }
                for (let i = 0; i < audits.length; i++) {
                    audits[i].changes = JSON.parse(audits[i].changes);
                    audits[i].translate = {};
                    for (const k in audits[i].changes) {
                        if (k == 'id')
                            continue;
                        if (!ma[k])
                            continue;
                        let value = audits[i].changes[k];
                        const j = JSON.parse(ma[k].typeadd || '{}');
                        if (value == null) {
                            continue;
                        }
                        switch (ma[k].type) {
                            case 'autocomplete':
                                const q = await db.getModel(j.model).findOne({
                                    attributes: [[j.query ? db.Sequelize.literal(j.query) : j.attribute, 'x']]
                                    , where: { id: value }
                                    , include: [{ all: true }]
                                    , raw: true
                                });
                                value = q ? q.x : `? (${value})`;
                                break;
                            case 'boolean':
                                value = value ? 'Sim' : 'Não';
                                break;
                            case 'date':
                                value = application.formatters.fe.date(value);
                                break;
                            case 'datetime':
                                value = application.formatters.fe.datetime(value);
                                break;
                            case 'decimal':
                                value = application.formatters.fe.decimal(value, j.precision || 2);
                                break;
                            case 'text':
                                value = value;
                                break;
                            case 'textarea':
                                value = value;
                                break;
                            case 'time':
                                value = application.formatters.fe.time(value);
                                break;
                        };
                        audits[i].translate[ma[k].label] = value;
                    }
                }
                let body = `
                <div class="col-md-12">
                <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                    <tr>
                        <td style="text-align:center;"><strong>Data/Hora</strong></td>
                        <td style="text-align:center;"><strong>Usuário</strong></td>
                        <td style="text-align:center;"><strong>Tipo</strong></td>
                        <td style="text-align:center;"><strong>Alterações</strong></td>
                    </tr>
                `;
                for (let i = 0; i < audits.length; i++) {
                    const translate = [];
                    for (let k in audits[i].translate) {
                        translate.push('<b>' + k + '</b>: ' + audits[i].translate[k]);
                    }
                    body += `
                    <tr>
                        <td style="text-align:center;"> ${application.formatters.fe.datetime(audits[i]['datetime'])}   </td>
                        <td style="text-align:center;">  ${audits[i]['users.fullname'] || ''}   </td>
                        <td style="text-align:center;">  ${audits[i]['type'] == 1 ? 'Inclusão' : audits[i]['type'] == 2 ? 'Edição' : 'Exclusão'}   </td>
                        <td style="text-align:left;">   ${translate.sort().join('<br>')}   </td>
                    </tr>
                    `;
                }
                body += `
                </table>
                </div>
                `;
                application.success(obj.res, {
                    modal: {
                        id: 'modalevt'
                        , title: obj.event.description
                        , body: body
                        , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Fechar</button>'
                        , fullscreen: true
                    }
                });
            } catch (err) {
                application.fatal(obj.res, err);
            }
        }
    }
    , config: {
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
                const config = await db.getModel('config').findOne();
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
        , e_compress: async function (obj) {
            try {
                const files = await db.getModel('file').findAll({
                    where: await platform.view.f_getFilter(obj.req, (await db.getModel('view').findOne({ where: { id: obj.event.idview }, include: [{ all: true }] })))
                    , include: [{ all: true }]
                });
                if (files.length > 1000)
                    return application.error(obj.res, { msg: 'Limite de no máximo 1000 arquivos para compreensão por vez' });
                for (const f of files) {
                    if (f.mimetype.match('image/*')) {
                        const r = await db.getModel(f.model.name).findOne({ raw: true, where: { id: f.modelid } });
                        let mak;
                        for (const k in r) {
                            if (r[k] != null && typeof r[k] == 'string' && r[k].indexOf(f.filename) >= 0) {
                                mak = k;
                            }
                        }
                        if (mak) {
                            const ma = await db.getModel('modelattribute').findOne({ raw: true, where: { idmodel: f.model.id, name: mak } });
                            if (ma) {
                                const j = JSON.parse(ma.typeadd || '{}');
                                const quality = 80;
                                const maxwh = parseInt(j.maxwh || 0);
                                const forcejpg = j.forcejpg;
                                const path = `${application.functions.filesDir()}${f.id}.${f.type}`;
                                const sharped = sharp(path, { failOnError: false });
                                if (maxwh > 0) {
                                    sharped.resize(maxwh, maxwh, { fit: 'inside' });
                                }
                                if (forcejpg) {
                                    let newfilename = f.filename.split('.');
                                    newfilename.splice(newfilename.length - 1, 1);
                                    f.filename = `${newfilename.join('.')}.jpg`;
                                    f.type = 'jpg';
                                    f.mimetype = 'image/jpeg';
                                }
                                sharped.rotate();
                                if (['jpeg', 'jpg'].indexOf(f.type) >= 0) {
                                    sharped.jpeg({ quality: quality, chromaSubsampling: '4:4:4' });
                                } else if (['png'].indexOf(f.type) >= 0) {
                                    sharped.png({ quality: quality });
                                }
                                const fileinfo = await sharp(await sharped.toBuffer()).toFile(`${application.functions.filesDir()}${f.id}.${f.type}`);
                                f.size = fileinfo.size;
                                await f.save({ iduser: obj.req.user.id });
                            }
                        }
                    }
                }
                application.success(obj.res, { msg: application.message.success, reloadtables: true });
            } catch (err) {
                application.fatal(obj.res, err);
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
            const config = await db.getModel('config').findOne();
            if (!config.emailconf) {
                return console.error('E-mail sent configuration missing');
            }
            const transportConfig = JSON.parse(config.emailconf)
            const nodemailer = require('nodemailer');
            const transporter = nodemailer.createTransport(transportConfig);
            const mailOptions = {
                from: transportConfig.auth.user
                , to: obj.to.join(',')
                , cc: obj.cc && Array.isArray(obj.cc) ? obj.cc : []
                , subject: obj.subject
                , html: obj.html
                , attachments: obj.attachments || []
            };
            if (config.emailsignature) {
                mailOptions.html += '</br></br><img src="cid:unique@signature"/>';
                const signature = JSON.parse(config.emailsignature);
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
        f_clearUnboundFiles: async () => {
            try {
                const sql = await db.sequelize.query(`select * from file where datetime < now()::date -1 and bounded = false`
                    , { type: db.Sequelize.QueryTypes.SELECT });
                for (let i = 0; i < sql.length; i++) {
                    const path = `${__dirname}/../files/${process.env.NODE_APPNAME}/${sql[i].id}.${sql[i].type}`;
                    if (fs.existsSync(path))
                        fs.unlinkSync(path);
                    db.getModel('file').destroy({ where: { id: sql[i].id } });
                }
            } catch (err) {
                console.error(err);
            }
        }
    }
    , map: {
        geocode: async (address) => {
            const config = await db.getModel('config').findOne();
            if (!config) {
                return null;
            }
            const googleMapsClient = require('@google/maps').createClient({
                key: config.googlemapskey,
                Promise: Promise
            });
            const geo = await googleMapsClient.geocode({ address: address }).asPromise();
            if (geo.status == 200) {
                return geo.json.results;
            } else {
                return null;
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
                    menus = await db.getModel('menu').findAll({ include: [{ all: true }], where: { id: { [db.Op.in]: obj.ids } }, order: [['tree', 'asc']] });
                }
                let j = [];
                for (let i = 0; i < menus.length; i++) {
                    j.push({
                        description: menus[i].description
                        , icon: menus[i].icon
                        , menuparent: menus[i].idmenuparent ? menus[i].parentmenu.tree : null
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
                        if (menus[i].menuparent) {
                            mp = await db.getModel('menu').findOne({ where: { tree: menus[i].menuparent } });
                        }
                        if (menu) {
                            menu.description = menus[i].description;
                            menu.icon = menus[i].icon;
                            menu.tree = menus[i].tree;
                            if (menus[i].menuparent) {
                                menu.idmenuparent = mp.id;
                            }
                            await menu.save();
                        } else {
                            await db.getModel('menu').create({
                                description: menus[i].description
                                , icon: menus[i].icon
                                , idmenuparent: menus[i].menuparent && mp ? mp.id : null
                                , tree: menus[i].tree
                            });
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
        , f_getMenu: async function (user) {
            let menu = await db.sequelize.query(`select m.*, v.id as idview, v.url from menu m left join view v on (m.id = v.idmenu) where m.idmenuparent is null order by tree`, { type: db.Sequelize.QueryTypes.SELECT });
            let childs = await db.sequelize.query(`select m.*, v.id as idview, v.url from menu m left join view v on (m.id = v.idmenu) where m.idmenuparent is not null order by tree`, { type: db.Sequelize.QueryTypes.SELECT });
            let permissions = await db.getModel('permission').findAll({
                where: { iduser: user.id, idview: { [db.Op.not]: null }, visible: true }
                , raw: true
            });
            permissionarr = [];
            for (let i = 0; i < permissions.length; i++) {
                permissionarr.push(permissions[i].idview);
            }
            for (let i = 0; i < menu.length; i++) {
                menu[i].children = application.menu.getChilds(menu[i].id, childs, permissionarr);
                if (menu[i].idview) {
                    if (permissionarr.indexOf(menu[i].idview) < 0) {
                        menu.splice(i, 1);
                        i--;
                    }
                } else if (menu[i].children.length == 0) {
                    menu.splice(i, 1);
                    i--;
                }
            }
            return menu;
        }
    }
    , model: {
        onsave: async function (obj, next) {
            try {

                let register = await db.getModel('model').findOne({ where: { id: { [db.Op.ne]: obj.id }, name: obj.register.name } })
                if (register) {
                    return application.error(obj.res, { msg: 'Já existe um modelo com este nome' });
                }

                if (obj.register.id > 0 && obj.register.name != obj.register._previousDataValues.name) {
                    return application.error(obj.res, { msg: 'Não é possível alterar o nome de um modelo' });
                }

                await next(obj);

            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , ondelete: async function (obj, next) {
            try {

                const queryInterface = db.sequelize.getQueryInterface();
                let models = await db.getModel('model').findAll({ where: { id: { [db.Op.in]: obj.ids } } })

                for (let i = 0; i < models.length; i++) {
                    if (db.sequelize.modelManager.getModel(models[i].name)) {
                        db.sequelize.modelManager.removeModel(db.sequelize.modelManager.getModel(models[i].name));
                        queryInterface.dropTable(models[i].name, {
                            force: true,
                            cascade: false,
                        });
                    }
                }

                await next(obj);
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
                    if (i == 0) {
                        modelname = results[i].model;
                        modelattributeobj = {};
                    }
                    if (modelname == results[i].model) {
                        if (results[i].type == 'decimal') {
                            modelattributeobj[results[i].name] = {
                                type: application.sequelize.decodeType(db.Sequelize, results[i].type)
                                , get(name) {
                                    const value = this.getDataValue(name);
                                    return value === null ? null : parseFloat(value);
                                }
                            };
                        } else {
                            modelattributeobj[results[i].name] = application.sequelize.decodeType(db.Sequelize, results[i].type);
                        }
                    } else {
                        defineModel(modelname, modelattributeobj);
                        modelname = results[i].model;
                        modelattributeobj = {};
                        if (results[i].type == 'decimal') {
                            modelattributeobj[results[i].name] = {
                                type: application.sequelize.decodeType(db.Sequelize, results[i].type)
                                , get(name) {
                                    const value = this.getDataValue(name);
                                    return value === null ? null : parseFloat(value);
                                }
                            };
                        } else {
                            modelattributeobj[results[i].name] = application.sequelize.decodeType(db.Sequelize, results[i].type);
                        }
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
                    console.error(err);
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
                    models = await db.getModel('model').findAll({ where: { id: { [db.Op.in]: obj.ids } }, order: [['name', 'asc']] });
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
                        await db.getModel('modelattribute').destroy({ iduser: obj.req.user.id, where: { idmodel: model.id, name: { [db.Op.notIn]: attributes } } });
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
                                const vas = j.as || j.model;
                                for (let x = 0; x < registers.rows.length; x++) {
                                    if (registers.rows[x][modelattributes[i].name]) {
                                        if (j.attribute && registers.rows[x][vas + '.' + j.attribute]) {
                                            registers.rows[x][modelattributes[i].name] = registers.rows[x][vas + '.' + j.attribute];
                                        }
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
                    db.getModel('modelattribute').findAll({ where: { idmodel: model.id }, order: [['name', 'asc']] }).then(modelattributes => {
                        const attributes = ['id'];
                        for (let i = 0; i < modelattributes.length; i++) {
                            const j = application.modelattribute.parseTypeadd(modelattributes[i].typeadd);
                            switch (modelattributes[i].type) {
                                case 'autocomplete':
                                    if (j.query) {
                                        attributes.push([db.Sequelize.literal(j.query), modelattributes[i].name]);
                                    } else {
                                        attributes.push(modelattributes[i].name);
                                    }
                                    break;
                                case 'virtual':
                                    attributes.push([db.Sequelize.literal(j.subquery.replace(/\$user/g, options.iduser || '0')), modelattributes[i].name]);
                                    break;
                                default:
                                    attributes.push(modelattributes[i].name);
                                    break;
                            }
                        }
                        db.getModel(model.name).findAndCountAll(Object.assign({}, options, {
                            attributes: attributes
                            , raw: true
                            , include: [{ all: true }]
                        })).then(registers => {
                            const original = JSON.stringify(registers.rows);
                            registers = fixResults(registers, modelattributes);
                            registers.original = JSON.parse(original);
                            return resolve(registers);
                        });
                    });
                });
            });
        }
        , e_clone: async (obj) => {
            try {
                if (obj.req.method == 'GET') {
                    if (obj.ids.length != 1) {
                        return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                    }
                    let body = '';
                    body += application.components.html.hidden({
                        name: 'id'
                        , value: obj.ids[0]
                    });
                    body += application.components.html.integer({
                        width: '12'
                        , label: 'Quantidade*'
                        , name: 'qtd'
                    });
                    application.success(obj.res, {
                        modal: {
                            form: true
                            , action: '/event/' + obj.event.id
                            , id: 'modalevt' + obj.event.id
                            , title: obj.event.description
                            , body: body
                            , footer: `<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">${obj.event.description}</button>`
                        }
                    });
                } else {
                    const invalidfields = application.functions.getEmptyFields(obj.req.body, ['id', 'qtd']);
                    if (invalidfields.length > 0) {
                        return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                    }
                    const model = await db.getModel('model').findOne({ raw: true, where: { id: obj.event.view.idmodel } });
                    const mas = await db.getModel('modelattribute').findAll({ raw: true, where: { idmodel: obj.event.view.idmodel, type: { [db.Op.ne]: 'virtual' } } });
                    const register = await db.getModel(model.name).findOne({ raw: true, where: { id: obj.req.body.id } });
                    const qtd = parseInt(obj.req.body.qtd);
                    for (let i = 0; i < qtd; i++) {
                        const newRegister = db.getModel(model.name).build({ id: 0 });
                        for (const ma of mas) {
                            newRegister[ma.name] = register[ma.name];
                        }
                        await newRegister.save({ iduser: obj.req.user.id });
                    }
                    application.success(obj.res, { msg: application.message.success, reloadtables: true });
                }
            } catch (err) {
                application.fatal(obj.res, err);
            }
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
    }
    , permission: {
        onsave: async function (obj, next) {
            try {
                let permission = await db.getModel('permission').findOne({
                    where: {
                        id: { [db.Op.ne]: obj.register.id }
                        , iduser: obj.register.iduser
                        , idview: obj.register.idview
                    }
                });
                if (permission) {
                    return application.error(obj.res, { msg: 'Este usuário já possui acesso a esta view' });
                }
                await next(obj);
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
    }
    , report: require('./core/modules/report')
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

                let scheds = await db.getModel('schedule').findAll({ where: { id: { [db.Op.in]: obj.ids } } });
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

                let scheds = await db.getModel('schedule').findAll({ where: { id: { [db.Op.in]: obj.ids } } });
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

                let scheds = await db.getModel('schedule').findAll({ where: { id: { [db.Op.in]: obj.ids } } })
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
                let messengers = await db.getModel('messenger').findAll({ where: { id: { [db.Op.in]: obj.ids } } });
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
                let messengers = await db.getModel('messenger').findAll({ where: { id: { [db.Op.in]: obj.ids } } });
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
            const param = await db.getModel('parameter').findOne({ where: { key: key } });
            return param ? JSON.parse(param.value) : null;
        }
    }
    , users: {
        onsave: async (obj, next) => {
            try {
                if (!obj.register.username)
                    return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: ['username'] });
                let user = await db.getModel('users').findOne({ where: { id: { [db.Op.ne]: obj.register.id }, username: obj.register.username } });
                if (user) {
                    return application.error(obj.res, { msg: 'Já existe um usuário com este Username', invalidfields: ['username'] });
                }
                if (obj.register.newpassword) {
                    obj.register.password = Cyjs.SHA3(`${application.sk}${obj.register.newpassword}${application.sk}`).toString();
                    obj.register.newpassword = null;
                }
                await next(obj);
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
                let register = await db.getModel('view').findOne({ where: { id: { [db.Op.ne]: obj.id }, name: { [db.Op.iLike]: obj.register.name } } })
                if (register) {
                    return application.error(obj.res, { msg: 'Já existe uma view com este nome' });
                }
                let modulee = await db.getModel('module').findOne({ where: { id: obj.register.idmodule || 0 } });
                obj.register.namecomplete = modulee ? modulee.description + ' - ' + obj.register.name : obj.register.name;

                if (obj.register.id > 0) {
                    //viewtable
                    let viewtables = JSON.parse(obj.req.body.viewtable || '[]');
                    let idma = [];
                    for (let i = 0; i < viewtables.length; i++) {
                        idma.push(viewtables[i].id);
                        let vt = (await db.getModel('viewtable').findOrCreate({ where: { idmodelattribute: viewtables[i].id, idview: obj.register.id }, transaction: obj.transaction }))[0];
                        vt.ordertable = i + 1;
                        vt.render = viewtables[i].render;
                        vt.orderable = viewtables[i].orderable;
                        vt.totalize = viewtables[i].totalize;
                        await vt.save({ iduser: obj.req.user.id, transaction: obj.transaction });
                    }
                    await db.getModel('viewtable').destroy({ where: { idview: obj.register.id, idmodelattribute: { [db.Op.notIn]: idma } }, transaction: obj.transaction });
                }
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
                    views = await db.getModel('view').findAll({ include: [{ all: true }], where: { id: { [db.Op.in]: obj.ids } }, order: [['name', 'asc']] });
                }
                let j = [];
                for (let i = 0; i < views.length; i++) {
                    let template = await db.getModel('template').findOne({ where: { id: views[i].idtemplate } });
                    let tpl = {
                        name: template.name
                        , zones: []
                    };
                    let templatezones = await db.getModel('templatezone').findAll({ where: { idtemplate: template.id } });
                    for (let x = 0; x < templatezones.length; x++) {
                        tpl.zones.push({
                            name: templatezones[x].name
                            , description: templatezones[x].description
                            , order: templatezones[x].order
                        });
                    }
                    j.push({
                        name: views[i].name
                        , namecomplete: views[i].namecomplete
                        , js: views[i].js
                        , wherefixed: views[i].wherefixed
                        , orderfixed: views[i].orderfixed
                        , supressid: views[i].supressid ? true : false
                        , neednoperm: views[i].neednoperm ? true : false
                        , template: tpl
                        , model: views[i].model ? views[i].model.name : null
                        , module: views[i].module.description
                        , menu: views[i].idmenu ? views[i].menu.tree : null
                        , type: views[i].type
                        , url: views[i].url
                        , fastsearch: views[i].idfastsearch ? views[i].fastsearch.name : null
                        , lineheight: views[i].lineheight
                        , add: views[i].add
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
            let t;
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
                    t = await db.sequelize.transaction();
                    console.log('----------SYNC VIEWS----------');
                    for (let i = 0; i < views.length; i++) {
                        console.log('VIEW ' + views[i].name);
                        let view = await db.getModel('view').findOne({ transaction: t, where: { name: views[i].name } });
                        let model = await db.getModel('model').findOne({ transaction: t, where: { name: views[i].model } });
                        let menu = await db.getModel('menu').findOne({ transaction: t, where: { tree: views[i].menu } });
                        let modulee = (await db.getModel('module').findOrCreate({ transaction: t, where: { description: views[i].module } }))[0];
                        let template = (await db.getModel('template').findOrCreate({ transaction: t, where: { name: views[i].template.name } }))[0];
                        for (let x = 0; x < views[i].template.zones.length; x++) {
                            let templatezone = (await db.getModel('templatezone').findOrCreate({
                                transaction: t
                                , where: {
                                    idtemplate: template.id
                                    , name: views[i].template.zones[x].name
                                }
                            }))[0];
                            templatezone.description = views[i].template.zones[x].description;
                            templatezone.order = views[i].template.zones[x].order;
                            await templatezone.save({ transaction: t });
                        }
                        let fastsearch = await db.getModel('modelattribute').findOne({ transaction: t, where: { idmodel: model ? model.id : 0, name: views[i].fastsearch } });
                        if (view) {
                            view.name = views[i].name;
                            view.idtemplate = template ? template.id : null;
                            view.idmodel = model ? model.id : null;
                            view.idmodule = modulee.id;
                            view.idmenu = menu ? menu.id : null;
                            view.type = views[i].type;
                            view.wherefixed = views[i].wherefixed;
                            view.supressid = views[i].supressid;
                            view.neednoperm = views[i].neednoperm;
                            view.js = views[i].js;
                            view.namecomplete = views[i].namecomplete;
                            view.orderfixed = views[i].orderfixed;
                            view.url = views[i].url;
                            view.idfastsearch = fastsearch ? fastsearch.id : null;
                            view.lineheight = views[i].lineheight;
                            view.add = views[i].add;
                            await view.save({ transaction: t });
                        } else {
                            view = await db.getModel('view').create({
                                name: views[i].name
                                , idtemplate: template.id
                                , idmodel: model ? model.id : null
                                , idmodule: modulee.id
                                , idmenu: menu ? menu.id : null
                                , type: views[i].type
                                , wherefixed: views[i].wherefixed
                                , supressid: views[i].supressid
                                , neednoperm: views[i].neednoperm
                                , js: views[i].js
                                , namecomplete: views[i].namecomplete
                                , orderfixed: views[i].orderfixed
                                , url: views[i].url
                                , idfastsearch: fastsearch ? fastsearch.id : null
                                , lineheight: views[i].lineheight
                                , add: views[i].add
                            }, { transaction: t });
                        }
                        let viewfields = [];
                        for (let z = 0; z < views[i]._field.length; z++) {
                            let templatezone = await db.getModel('templatezone').findOne({ transaction: t, where: { idtemplate: template.id, name: views[i]._field[z].templatezone } });
                            let modelattribute = await db.getModel('modelattribute').findOne({ transaction: t, where: { idmodel: model.id, name: views[i]._field[z].modelattribute } });
                            if (modelattribute) {
                                let viewfield = await db.getModel('viewfield').findOne({ transaction: t, where: { idview: view.id, idmodelattribute: modelattribute.id } });
                                if (viewfield) {
                                    viewfield.idtemplatezone = templatezone.id;
                                    viewfield.width = views[i]._field[z].width;
                                    viewfield.order = views[i]._field[z].order;
                                    viewfield.disabled = views[i]._field[z].disabled;
                                    viewfield.disablefilter = views[i]._field[z].disablefilter;
                                    await viewfield.save({ transaction: t });
                                } else {
                                    viewfield = await db.getModel('viewfield').create({
                                        idview: view.id
                                        , idtemplatezone: templatezone.id
                                        , idmodelattribute: modelattribute.id
                                        , width: views[i]._field[z].width
                                        , order: views[i]._field[z].order
                                        , disabled: views[i]._field[z].disabled
                                        , disablefilter: views[i]._field[z].disablefilter
                                    }, { transaction: t });
                                }
                                viewfields.push(viewfield.id);
                            } else {
                                console.error('ERROR: Model attribute "' + views[i]._field[z].modelattribute + '" not found');
                            }
                        }
                        await db.getModel('viewfield').destroy({
                            transaction: t
                            , iduser: obj.req.user.id
                            , where: { idview: view.id, id: { [db.Op.notIn]: viewfields } }
                        });
                        let viewtables = [];
                        for (let z = 0; z < views[i]._table.length; z++) {
                            let modelattribute = await db.getModel('modelattribute').findOne({ transaction: t, where: { idmodel: model.id, name: views[i]._table[z].modelattribute } });
                            if (modelattribute) {
                                let viewtable = await db.getModel('viewtable').findOne({ transaction: t, where: { idview: view.id, idmodelattribute: modelattribute.id } });
                                if (viewtable) {
                                    viewtable.ordertable = views[i]._table[z].ordertable;
                                    viewtable.orderable = views[i]._table[z].orderable;
                                    viewtable.render = views[i]._table[z].render;
                                    viewtable.totalize = views[i]._table[z].totalize;
                                    viewtable.class = views[i]._table[z].class;
                                    await viewtable.save({ transaction: t });
                                } else {
                                    viewtable = await db.getModel('viewtable').create({
                                        idview: view.id
                                        , idmodelattribute: modelattribute.id
                                        , ordertable: views[i]._table[z].ordertable
                                        , orderable: views[i]._table[z].orderable
                                        , render: views[i]._table[z].render
                                        , totalize: views[i]._table[z].totalize
                                    }, { transaction: t });
                                }
                                viewtables.push(viewtable.id);
                            } else {
                                console.error('ERROR: Model attribute "' + views[i]._table[z].modelattribute + '" not found');
                            }
                        }
                        await db.getModel('viewtable').destroy({
                            transaction: t
                            , iduser: obj.req.user.id
                            , where: { idview: view.id, id: { [db.Op.notIn]: viewtables } }
                        });
                        let viewevents = [];
                        for (let z = 0; z < views[i]._event.length; z++) {
                            let viewevent = await db.getModel('viewevent').findOne({ transaction: t, where: { idview: view.id, description: views[i]._event[z].description } });
                            if (viewevent) {
                                viewevent.icon = views[i]._event[z].icon;
                                viewevent.function = views[i]._event[z].function;
                                viewevent.parameters = views[i]._event[z].parameters;
                                await viewevent.save({ transaction: t });
                            } else {
                                viewevent = await db.getModel('viewevent').create({
                                    idview: view.id
                                    , description: views[i]._event[z].description
                                    , icon: views[i]._event[z].icon
                                    , function: views[i]._event[z].function
                                    , parameters: views[i]._event[z].parameters
                                }, { transaction: t });
                            }
                            viewevents.push(viewevent.id);
                        }
                        await db.getModel('viewevent').destroy({
                            transaction: t
                            , iduser: obj.req.user.id
                            , where: { idview: view.id, id: { [db.Op.notIn]: viewevents } }
                        });
                        if (i != views.length - 1) {
                            console.log('------------------------------');
                        }
                    }
                    for (let i = 0; i < views.length; i++) {
                        let view = await db.getModel('view').findOne({ transaction: t, include: [{ all: true }], where: { name: views[i].name } });
                        let viewsubviews = [];
                        for (let z = 0; z < views[i]._subview.length; z++) {
                            let viewsubview = await db.getModel('view').findOne({ transaction: t, where: { name: views[i]._subview[z].subview } });
                            if (viewsubview) {
                                let subview = await db.getModel('viewsubview').findOne({ transaction: t, where: { idview: view.id, idsubview: viewsubview.id } });
                                let templatezone = await db.getModel('templatezone').findOrCreate({
                                    transaction: t
                                    , where: { idtemplate: view.template.id, name: views[i]._subview[z].templatezone }
                                });
                                if (subview) {
                                    subview.description = views[i]._subview[z].description;
                                    subview.idtemplatezone = templatezone[0].id;
                                    await subview.save({ transaction: t });
                                } else {
                                    subview = await db.getModel('viewsubview').create({
                                        idview: view.id
                                        , idsubview: viewsubview.id
                                        , idtemplatezone: templatezone[0].id
                                        , description: views[i]._subview[z].description
                                    }, { transaction: t });
                                }
                                viewsubviews.push(subview.id);
                            } else {
                                console.error('ERROR: Subview "' + views[i]._subview[z].subview + '" not found');
                            }
                        }
                        await db.getModel('viewsubview').destroy({
                            transaction: t
                            , iduser: obj.req.user.id
                            , where: { idview: view.id, id: { [db.Op.notIn]: viewsubviews } }
                        });
                    }
                    await t.commit();
                    console.log('-----------FINISHED-----------');
                    application.success(obj.res, { msg: application.message.success, reloadtables: true });
                }
            } catch (err) {
                t.rollback();
                application.fatal(obj.res, err);
            }
        }
        , f_getFilteredRegisters: async function (obj) {
            try {
                const view = await db.getModel('view').findOne({ where: { id: obj.event.view.id }, include: [{ all: true }] })
                const viewfields = await db.getModel('viewfield').findAll({ where: { idview: view.id }, include: [{ all: true }] });
                const where = {};
                if (view.wherefixed) {
                    view.wherefixed = view.wherefixed.replace(/\$user/g, obj.req.user.id).replace(/\$id/g, obj.req.body.id);
                    Object.assign(where, { [db.Op.col]: db.Sequelize.literal(view.wherefixed) })
                }
                const parameters = JSON.parse(application.functions.singleSpace(obj.event.parameters));
                if ('onlySelected' in parameters && parameters.onlySelected) {
                    Object.assign(where, { id: { [db.Op.in]: obj.ids } })
                } else {
                    Object.assign(where, await platform.view.f_getFilter(obj.req, view));
                }
                const attributes = ['id'];
                const order = parameters.order;
                let ordercolumn = order[0];
                const orderdir = order[1];
                for (let i = 0; i < viewfields.length; i++) {
                    const j = application.modelattribute.parseTypeadd(viewfields[i].modelattribute.typeadd);
                    switch (viewfields[i].modelattribute.type) {
                        case 'autocomplete':
                            if (j.query) {
                                attributes.push([db.Sequelize.literal(j.query), viewfields[i].modelattribute.name]);
                            } else {
                                attributes.push(viewfields[i].modelattribute.name);
                            }
                            break;
                        case 'virtual':
                            attributes.push([db.Sequelize.literal(j.subquery), viewfields[i].modelattribute.name]);
                            break;
                        default:
                            attributes.push(viewfields[i].modelattribute.name);
                            break;
                    }
                    // Order
                    if (viewfields[i].modelattribute.name == ordercolumn) {
                        switch (viewfields[i].modelattribute.type) {
                            case 'autocomplete':
                                const vas = j.as || j.model;
                                ordercolumn = db.Sequelize.literal(vas + '.' + j.attribute);
                                break;
                            case 'virtual':
                                ordercolumn = db.Sequelize.literal(viewfields[i].modelattribute.name);
                                break;
                        }
                    }
                }
                const registers = await db.getModel(view.model.name).findAndCountAll({
                    attributes: attributes
                    , raw: true
                    , include: [{ all: true }]
                    , where: where
                    , order: [[ordercolumn, orderdir]]
                })
                return platform.view.f_fixResults(registers, viewfields);
            } catch (err) {
                console.error(err);
                return [];
            }
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
                                    Object.assign(o, { [db.Op.iLike]: cookie[i][k] })
                                    break;
                                case 'b':
                                    Object.assign(o, { [db.Op.gte]: cookie[i][k] })
                                    break;
                                case 'e':
                                    Object.assign(o, { [db.Op.lte]: cookie[i][k] })
                                    break;
                                case 'i':
                                    Object.assign(o, { [db.Op.in]: cookie[i][k].val })
                                    break;
                                case 'r':
                                    o = cookie[i][k];
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
                    const XLSX = require('xlsx');
                    const view = await db.getModel('view').findOne({ where: { id: obj.event.view.id }, include: [{ all: true }] });
                    const viewfields = await db.getModel('viewfield').findAll({ where: { idview: view.id }, include: [{ all: true }], order: [['order', 'asc']] });
                    const modelattributes = await db.getModel('modelattribute').findAll({ where: { idmodel: view.model.id } });
                    let where = {};
                    if (view.wherefixed) {
                        view.wherefixed = view.wherefixed.replace(/\$user/g, obj.req.user.id);
                        Object.assign(where, { [db.Op.col]: db.Sequelize.literal(view.wherefixed) });
                    }
                    if ('view' + view.id + 'filter' in obj.req.cookies) {
                        Object.assign(where, getFilter(obj.req.cookies['view' + view.id + 'filter'], modelattributes));
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
                    const wb = XLSX.utils.book_new();
                    wb.SheetNames.push('Sheet1');
                    const ws = XLSX.utils.json_to_sheet(registers, { header: header, cellDates: true });
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
                        const cn = toColumnName(i + 2);
                        ws[cn + '1'] = lodash.extend(ws[cn + '1'], { v: viewfields[i].modelattribute.label });
                    }
                    const filename = process.hrtime()[1] + '.xls';
                    wb.Sheets['Sheet1'] = ws;
                    XLSX.writeFile(wb, `${__dirname}/../tmp/${process.env.NODE_APPNAME}/${filename}`);
                    return application.success(obj.res, { openurl: '/download/' + filename });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , pdf: async function (obj) {
                try {
                    let parameters = JSON.parse(application.functions.singleSpace(obj.event.parameters));
                    let registers = (await platform.view.f_getFilteredRegisters(obj)).rows;
                    if (registers.length > 5000) {
                        return application.error(obj.res, { msg: 'Não é possível exportar mais que 5 mil registros' });
                    }
                    let total = [];
                    let report = {};
                    report.__title = parameters.title || obj.event.description;
                    report.__table = '<table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">';
                    report.__table += '<tr><thead>';
                    for (let i = 0; i < parameters.columns.length; i++) {
                        report.__table += `<td style="text-align:center;"><strong> ${parameters.columnsLabel[i]} </strong></td>`;
                    }
                    report.__table += '</thead></tr>';
                    for (let i = 0; i < registers.length; i++) {
                        report.__table += '<tr>';
                        for (let z = 0; z < parameters.columns.length; z++) {
                            report.__table += `<td style="text-align:${parameters.columnsAlign[z] || 'left'};"> ${registers[i][parameters.columns[z]] || ''} </td>`;
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
                        report.__table += '</tr>';
                    }
                    if ('total' in parameters) {
                        report.__table += `<tr><td style="text-align:center;" colspan="${parameters.columns.length}"><strong> Totais </strong></td></tr>`;
                        report.__table += '<tr>';
                        for (let i = 0; i < parameters.columns.length; i++) {
                            report.__table += `<td style="text-align:${parameters.columnsAlign[i] || 'left'};"> ${parameters.total[i] == 'sum' ? application.formatters.fe.decimal(total[i], parameters.totalPrecision[i] || 2) : total[i] || ''} </td>`;
                        }
                        report.__table += '</tr>';
                    }
                    report.__table += '</table>';
                    let filename = await platform.report.f_generate(parameters.pageOrientation == 'landscape' ? 'Geral - Listagem Paisagem' : 'Geral - Listagem', report);
                    return application.success(obj.res, {
                        openurl: '/download/' + filename
                    });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
        }
        , f_getFilter: async function (req, view) {
            try {
                let obj = {};
                const modelattributes = await db.getModel('modelattribute').findAll({ where: { idmodel: view.idmodel } });
                let filter = JSON.parse(req.cookies['view' + view.url + 'filter'] || req.body['_filter'] || '{}');
                let m;
                for (let i = 0; i < filter.length; i++) {
                    for (let k in filter[i]) {
                        let field = k.split('+');
                        switch (field[1]) {
                            case 'date':
                                m = moment(filter[i][k], application.formatters.fe.date_format);
                                filter[i][k] = m.isValid() ? m.format(application.formatters.be.date_format) : null;
                                break;
                            case 'datetime':
                                m = moment(filter[i][k], application.formatters.fe.datetime_format);
                                filter[i][k] = m.isValid() ? m.format(application.formatters.be.datetime_format + (field[2] == 'b' ? ':00' : ':59')) : null;
                                break;
                            case 'time':
                                filter[i][k] = application.formatters.be.time(filter[i][k]);
                                break;
                            case 'text':
                                filter[i][k] = '%' + filter[i][k] + '%';
                                break;
                            case 'textarea':
                                filter[i][k] = '%' + filter[i][k] + '%';
                                break;
                            case 'decimal':
                                filter[i][k] = application.formatters.be.decimal(filter[i][k]);
                                break;
                            case 'integer':
                                filter[i][k] = filter[i][k].substring(0, 8);
                                break;
                            case 'radio':
                                for (let z = 0; z < modelattributes.length; z++) {
                                    if (field[0] == modelattributes[z].name) {
                                        let j = application.modelattribute.parseTypeadd(modelattributes[z].typeadd);
                                        if (j.multiple) {
                                            filter[i][k] = '%' + filter[i][k].val.sort().join('%') + '%';
                                        }
                                    }
                                }
                                break;
                        }
                        let o = {};
                        switch (field[2]) {
                            case 's':
                                Object.assign(o, { [db.Op.iLike]: filter[i][k] })
                                break;
                            case 'b':
                                Object.assign(o, { [db.Op.gte]: filter[i][k] })
                                break;
                            case 'e':
                                Object.assign(o, { [db.Op.lte]: filter[i][k] })
                                break;
                            case 'i':
                                Object.assign(o, { [db.Op.in]: filter[i][k].val })
                                break;
                            case 'r':
                                o = filter[i][k];
                                break;
                            // Virtuals
                            case 'rv':
                                for (let z = 0; z < modelattributes.length; z++) {
                                    if (field[0] == modelattributes[z].name) {
                                        let j = application.modelattribute.parseTypeadd(modelattributes[z].typeadd);
                                        if (j.field && j.field.indexOf('$value') > 0) {
                                            o = db.Sequelize.literal(j.field.replace('$value', filter[i][k]));
                                        } else {
                                            o = db.Sequelize.literal(j.subquery.replace(/\$user/g, req.user.id) + " = '" + filter[i][k] + "'");
                                        }
                                    }
                                }
                                break;
                            case 'sv':
                                for (let z = 0; z < modelattributes.length; z++) {
                                    if (field[0] == modelattributes[z].name) {
                                        let j = application.modelattribute.parseTypeadd(modelattributes[z].typeadd);
                                        if (j.field && j.field.indexOf('$value') > 0) {
                                            o = db.Sequelize.literal(j.field.replace('$value', filter[i][k]));
                                        } else {
                                            o = db.Sequelize.literal(j.subquery.replace(/\$user/g, req.user.id) + "::text ilike '" + filter[i][k] + "'");
                                        }
                                    }
                                }
                                break;
                            case 'bv':
                                for (let z = 0; z < modelattributes.length; z++) {
                                    if (field[0] == modelattributes[z].name) {
                                        let j = application.modelattribute.parseTypeadd(modelattributes[z].typeadd);
                                        if (j.field && j.field.indexOf('$value') > 0) {
                                            o = db.Sequelize.literal(j.field.replace('$value', filter[i][k]));
                                        } else {
                                            o = db.Sequelize.literal(j.subquery.replace(/\$user/g, req.user.id) + " >= '" + filter[i][k] + "'");
                                        }
                                    }
                                }
                                break;
                            case 'ev':
                                for (let z = 0; z < modelattributes.length; z++) {
                                    if (field[0] == modelattributes[z].name) {
                                        let j = application.modelattribute.parseTypeadd(modelattributes[z].typeadd);
                                        if (j.field && j.field.indexOf('$value') > 0) {
                                            o = db.Sequelize.literal(j.field.replace('$value', filter[i][k]));
                                        } else {
                                            o = db.Sequelize.literal(j.subquery.replace(/\$user/g, req.user.id) + " <= '" + filter[i][k] + "'");
                                        }
                                    }
                                }
                                break;
                            case 'iv':
                                for (let z = 0; z < modelattributes.length; z++) {
                                    if (field[0] == modelattributes[z].name) {
                                        let j = application.modelattribute.parseTypeadd(modelattributes[z].typeadd);
                                        if (j.field) {
                                            if (j.field.indexOf('$value') > 0) {
                                                o = db.Sequelize.literal(j.field.replace('$value', filter[i][k].val));
                                            } else {
                                                o = db.Sequelize.literal(j.field + " in ('" + filter[i][k].val.join("','") + "')");
                                            }
                                        } else {
                                            o = db.Sequelize.literal(j.subquery.replace(/\$user/g, req.user.id) + " in ('" + filter[i][k].val.join("','") + "')");
                                        }
                                    }
                                }
                                break;
                        }
                        if (o && obj[field[0]]) {
                            if (obj[field[0]] && typeof obj[field[0]] == 'object' && 'val' in obj[field[0]]) {//Virtual concatenation
                                obj[field[0]].val += ' and ' + o.val;
                            } else {
                                Object.assign(obj[field[0]], o);
                            }
                        } else if (o) {
                            obj[field[0]] = o;
                        }
                    }
                }
                let fastsearch = req.cookies['view' + view.url + 'fs'] || req.body['_filterfs'];
                if (view.idfastsearch && fastsearch) {
                    fastsearch = db.sanitizeString(fastsearch);
                    const mafastsearch = await db.getModel('modelattribute').findOne({ where: { id: view.idfastsearch } });
                    const j = application.modelattribute.parseTypeadd(mafastsearch.typeadd);
                    switch (mafastsearch.type) {
                        case 'autocomplete':
                            if (j.query) {
                                obj[mafastsearch.name] = db.Sequelize.literal(j.query + "::text ilike '%" + fastsearch + "%'");
                            } else {
                                obj[mafastsearch.name] = db.Sequelize.literal((j.as || j.model) + '.' + j.attribute + "::text ilike '%" + fastsearch + "%'");
                            }
                            break;
                        case 'virtual':
                            obj[mafastsearch.name] = db.Sequelize.literal(j.subquery + "::text ilike '%" + fastsearch + "%'");
                            break;
                        default:
                            obj[mafastsearch.name] = db.Sequelize.literal(view.model.name + '.' + mafastsearch.name + "::text ilike '%" + fastsearch + "%'");
                            break;
                    }
                }
                return obj;
            } catch (err) {
                console.error(err, req.cookies, view);
                return {};
            }
        }
        , f_fixResults: function (registers, viewtables) {
            for (let i = 0; i < viewtables.length; i++) {
                const ma = viewtables[i].modelattribute;
                const j = application.modelattribute.parseTypeadd(ma.typeadd);
                switch (j.type || ma.type) {
                    case 'autocomplete':
                        const vas = j.as || j.model;
                        for (let x = 0; x < registers.rows.length; x++) {
                            if (registers.rows[x][ma.name]) {
                                if (j.attribute && registers.rows[x][vas + '.' + j.attribute]) {
                                    registers.rows[x][ma.name] = registers.rows[x][vas + '.' + j.attribute];
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
            const keys = ['id'];
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
        , f_hasPermission: async function (iduser, idview) {
            try {
                const permissionquery = 'select p.*, v.id as idview from permission p left join view v on (p.idview = v.id) where p.iduser = :iduser';
                const getChilds = function (idview, subviews) {
                    let returnsubviews = [];
                    for (let i = 0; i < subviews.length; i++) {
                        if (idview == subviews[i].idview) {
                            returnsubviews.push(subviews[i].idsubview);
                            const moresubviews = getChilds(subviews[i].idsubview, subviews);
                            for (let z = 0; z < moresubviews.length; z++) {
                                returnsubviews.push(moresubviews[z]);
                            }
                        }
                    }
                    return returnsubviews;
                }
                const permissions = await db.sequelize.query(permissionquery, {
                    replacements: { iduser: iduser }
                    , type: db.sequelize.QueryTypes.SELECT
                })
                for (let i = 0; i < permissions.length; i++) {
                    if (permissions[i].idview == idview) {
                        return permissions[i];
                    }
                }
                const subviews = await db.getModel('viewsubview').findAll({ raw: true })
                for (let i = 0; i < permissions.length; i++) {
                    permissions[i].childs = getChilds(permissions[i].idview, subviews);
                    for (let x = 0; x < permissions[i].childs.length; x++) {
                        if (permissions[i].childs[x] == idview) {
                            return permissions[i];
                        }
                    }
                }
                return false;
            } catch (err) {
                console.error(err);
                return false;
            }
        }
        , js_getAttributes: async (obj) => {
            try {
                let view = await db.getModel('view').findOne({ where: { id: obj.data.idview || 0 } });
                let table = await db.sequelize.query(`
                select
                    ma.id
                    , case when vt.id is not null then true else false end as active
                    , ma.label || '(' || ma.name || ')' as name
                    , vt.render
                    , vt.orderable
                    , vt.totalize
                from
                    modelattribute ma
                left join viewtable vt on (vt.idview = ${view ? view.id : 0} and vt.idmodelattribute = ma.id)
                where
                    ma.idmodel = ${view ? view.idmodel : 0}
                order by vt.ordertable, ma.label
                `, { type: db.Sequelize.QueryTypes.SELECT });
                let ret = {
                    table: []
                };
                for (let i = 0; i < table.length; i++) {
                    ret.table.push({
                        id: table[i].id
                        , active: table[i].active
                        , name: table[i].name
                        , render: table[i].render
                        , orderable: table[i].orderable
                        , totalize: table[i].totalize
                    });
                }
                application.success(obj.res, ret);
            } catch (err) {
                return application.fatal(obj.res, err);
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

                    let viewfield = await db.getModel('viewfield').findOne({ where: { id: { [db.Op.in]: obj.ids } }, include: [{ all: true }] });

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

                    await db.getModel('viewfield').update({ idtemplatezone: obj.req.body.zona }, { where: { id: { [db.Op.in]: obj.req.body.ids.split(',') } } });

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
            db.getModel('viewfield').findAll({ where: { id: { [db.Op.in]: obj.ids } } }).then(viewfields => {
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
            db.getModel('viewfield').findAll({ where: { id: { [db.Op.in]: obj.ids } } }).then(viewfields => {
                viewfields.map(viewfield => {
                    viewfield.order--;
                    viewfield.save();
                });
                return application.success(obj.res, { msg: application.message.success, reloadtables: true });
            }).catch(err => {
                return application.fatal(obj.res, err);
            });
        }
        , e_populate: async (obj) => {
            try {
                const view = await db.getModel('view').findOne({ where: { id: obj.id } });
                if (!view)
                    return application.error(obj.res, { msg: 'View não encontrada' });
                const mas = await db.getModel('modelattribute').findAll({ where: { idmodel: view.idmodel } });
                const templatezone = await db.getModel('templatezone').findOne({ where: { idtemplate: view.idtemplate, order: { [db.Op.gt]: 0 } }, order: [['order', 'asc']] });
                for (let i = 0; i < mas.length; i++) {
                    const ma = mas[i];
                    await db.getModel('viewfield').create({
                        idview: view.id
                        , width: 12
                        , order: i + 1
                        , idmodelattribute: ma.id
                        , disabled: false
                        , disablefilter: false
                        , idtemplatezone: templatezone.id
                    });
                }
                application.success(obj.res, { msg: application.message.success, reloadtables: true });
            } catch (err) {
                application.fatal(obj.res, err);
            }
        }
    }
}

ns.scheduleJob('0 0 * * *', platform.maintenance.f_clearUnboundFiles);

module.exports = platform;