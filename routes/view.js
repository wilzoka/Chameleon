const application = require('./application')
    , db = require('../models')
    , lodash = require('lodash')
    , moment = require('moment')
    , fs = require('fs-extra')
    , escape = require('escape-html')
    ;

const renderText = function (viewfield, register) {
    let value = register && register.dataValues[viewfield.modelattribute.name] ? register.dataValues[viewfield.modelattribute.name] : '';
    value = escape(value);

    let label = viewfield.modelattribute.label;
    if (viewfield.modelattribute.notnull) {
        label += '*';
    }
    let disabled = '';
    if (viewfield.disabled) {
        disabled = 'disabled="disabled"';
    }

    return application.components.html.text({
        width: viewfield.width
        , label: label
        , name: viewfield.modelattribute.name
        , value: value
        , disabled: disabled
    });
}

const renderTextArea = function (viewfield, register) {

    let value = register && register.dataValues[viewfield.modelattribute.name] ? register.dataValues[viewfield.modelattribute.name] : '';
    value = escape(value);

    let j = application.modelattribute.parseTypeadd(viewfield.modelattribute.typeadd);

    let label = viewfield.modelattribute.label;
    if (viewfield.modelattribute.notnull) {
        label += '*';
    }
    let disabled = '';
    if (viewfield.disabled) {
        disabled = 'disabled="disabled"';
    }

    return application.components.html.textarea({
        width: viewfield.width
        , label: label
        , name: viewfield.modelattribute.name
        , rows: j.rows || 3
        , value: value
        , disabled: disabled
    });
}

const renderInteger = function (viewfield, register) {

    let value = register && Number.isInteger(parseInt(register.dataValues[viewfield.modelattribute.name])) ? register.dataValues[viewfield.modelattribute.name] : '';

    let label = viewfield.modelattribute.label;
    if (viewfield.modelattribute.notnull) {
        label += '*';
    }
    let disabled = '';
    if (viewfield.disabled) {
        disabled = 'disabled="disabled"';
    }

    return application.components.html.integer({
        width: viewfield.width
        , label: label
        , name: viewfield.modelattribute.name
        , value: value
        , disabled: disabled
    });
}

const renderDecimal = function (viewfield, register) {

    let value = register && register.dataValues[viewfield.modelattribute.name] ? register.dataValues[viewfield.modelattribute.name] : '';

    let json = application.modelattribute.parseTypeadd(viewfield.modelattribute.typeadd);
    precision = json.precision;
    if (value) {
        value = parseFloat(value);
        let reg = '\\d(?=(\\d{3})+\\D)';
        value = value.toFixed(json.precision).replace('.', ',').replace(new RegExp(reg, 'g'), '$&.');
    }

    let label = viewfield.modelattribute.label;
    if (viewfield.modelattribute.notnull) {
        label += '*';
    }
    let disabled = '';
    if (viewfield.disabled) {
        disabled = 'disabled="disabled"';
    }

    return application.components.html.decimal({
        width: viewfield.width
        , label: label
        , name: viewfield.modelattribute.name
        , value: value
        , precision: precision
        , disabled: disabled
    });
}

const renderAutocomplete = function (viewfield, register) {

    let value = register && register.dataValues[viewfield.modelattribute.name] ? register.dataValues[viewfield.modelattribute.name] : '';
    let j = application.modelattribute.parseTypeadd(viewfield.modelattribute.typeadd);

    let option = '';
    let vas = j.as || j.model;
    if (value && register[vas]) {
        option = '<option value="' + register[vas].id + '" selected>' + (j.query ? register[viewfield.modelattribute.name] : register[vas][j.attribute]) + '</option>';
    }

    let label = viewfield.modelattribute.label;
    if (viewfield.modelattribute.notnull) {
        label += '*';
    }
    let disabled = '';
    if (viewfield.disabled) {
        disabled = 'disabled="disabled"';
    }

    return application.components.html.autocomplete({
        width: viewfield.width
        , label: label
        , name: viewfield.modelattribute.name
        , disabled: disabled
        , model: j.model
        , attribute: j.attribute || ''
        , where: j.where || ''
        , query: j.query || ''
        , multiple: ''
        , option: option
    });
}

const renderDate = function (viewfield, register) {

    let value = register && register.dataValues[viewfield.modelattribute.name] ? register.dataValues[viewfield.modelattribute.name] : '';

    let label = viewfield.modelattribute.label;
    if (viewfield.modelattribute.notnull) {
        label += '*';
    }
    let disabled = '';
    if (viewfield.disabled) {
        disabled = 'disabled="disabled"';
    }

    if (value) {
        let m = moment(value, 'YYYY-MM-DD');
        value = m.format('DD/MM/YYYY');
    }

    return application.components.html.date({
        width: viewfield.width
        , label: label
        , name: viewfield.modelattribute.name
        , value: value
        , disabled: disabled
    });
}

const renderDateTime = function (viewfield, register) {

    let value = register && register.dataValues[viewfield.modelattribute.name] ? register.dataValues[viewfield.modelattribute.name] : '';

    let label = viewfield.modelattribute.label;
    if (viewfield.modelattribute.notnull) {
        label += '*';
    }
    let disabled = '';
    if (viewfield.disabled) {
        disabled = 'disabled="disabled"';
    }

    if (value) {
        let m = moment(value, 'YYYY-MM-DD HH:mm');
        value = m.format('DD/MM/YYYY HH:mm');
    }

    return application.components.html.datetime({
        width: viewfield.width
        , label: label
        , name: viewfield.modelattribute.name
        , value: value
        , disabled: disabled
    });
}

const renderTime = function (viewfield, register) {

    let value = register && register.dataValues[viewfield.modelattribute.name] >= 0 ? register.dataValues[viewfield.modelattribute.name] : null;

    let label = viewfield.modelattribute.label;
    if (viewfield.modelattribute.notnull) {
        label += '*';
    }
    let disabled = '';
    if (viewfield.disabled) {
        disabled = 'disabled="disabled"';
    }

    value = value == null ? '' : application.formatters.fe.time(value);

    return application.components.html.time({
        width: viewfield.width
        , label: label
        , name: viewfield.modelattribute.name
        , value: value
        , disabled: disabled
    });
}

const renderCheckbox = function (viewfield, register) {

    let label = viewfield.modelattribute.label;
    let disabled = '';
    if (viewfield.disabled) {
        disabled = 'disabled="disabled"';
    }
    let checked = '';
    if (register && register.dataValues[viewfield.modelattribute.name]) {
        checked = 'checked';
    }

    return application.components.html.checkbox({
        width: viewfield.width
        , name: viewfield.modelattribute.name
        , checked: checked
        , label: label
        , disabled: disabled
    });
}

const renderFile = function (viewfield, register) {

    let value = register && register.dataValues[viewfield.modelattribute.name] ? register.dataValues[viewfield.modelattribute.name] : '';
    value = escape(value);

    let j = application.modelattribute.parseTypeadd(viewfield.modelattribute.typeadd);
    let maxfiles = j.maxfiles || '';
    let acceptedfiles = j.acceptedfiles || '';
    let sizeTotal = j.sizeTotal || '';

    let label = viewfield.modelattribute.label;
    if (sizeTotal) {
        label += ' (' + sizeTotal + ' MB)';
    }
    if (viewfield.modelattribute.notnull) {
        label += '*';
    }

    return application.components.html.file({
        width: viewfield.width
        , name: viewfield.modelattribute.name
        , label: label
        , value: value
        , maxfiles: maxfiles
        , acceptedfiles: acceptedfiles
    });
}

const renderGeoreference = function (viewfield, register) {

    let value = register && register.dataValues[viewfield.modelattribute.name] ? register.dataValues[viewfield.modelattribute.name] : '';
    value = escape(value);

    let label = viewfield.modelattribute.label;
    if (viewfield.modelattribute.notnull) {
        label += '*';
    }

    return application.components.html.georeference({
        width: viewfield.width
        , label: label
        , name: viewfield.modelattribute.name
        , value: value
    });
}

const renderRadio = function (viewfield, register) {

    let value = register && register.dataValues[viewfield.modelattribute.name] ? register.dataValues[viewfield.modelattribute.name] : '';

    let json = application.modelattribute.parseTypeadd(viewfield.modelattribute.typeadd);

    let label = viewfield.modelattribute.label;
    if (viewfield.modelattribute.notnull) {
        label += '*';
    }
    let disabled = '';
    if (viewfield.disabled) {
        disabled = 'disabled="disabled"';
    }

    if (json.renderAsSelect) {
        let option = '';
        if (value) {
            if (json.multiple) {
                value = value.split(',');
                for (let i = 0; i < value.length; i++) {
                    option += '<option value="' + value[i] + '" selected>' + value[i] + '</option>';
                }
            } else {
                option = '<option value="' + value + '" selected>' + value + '</option>';
            }
        } else {
            option = '<option></option>';
        }

        return application.components.html.autocomplete({
            width: viewfield.width
            , label: label
            , name: viewfield.modelattribute.name
            , option: option
            , disabled: disabled
            , multiple: json.multiple ? 'multiple="multiple"' : ''
            , options: json.options
        });
    } else {
        return application.components.html.radio({
            width: viewfield.width
            , label: label
            , name: viewfield.modelattribute.name
            , value: value
            , disabled: disabled
            , options: json.options
        });
    }
}

const renderSubView = function (viewsubview) {
    return `
    <div class="col-md-12">
        <h4 class="title_subview">${viewsubview.description || ''}</h4>
        <table id="tableview${viewsubview.subview.url}" class="table table-bordered table-hover dataTable" width="100%"
        data-subview="true"
        data-view="${viewsubview.subview.url}">
        </table>
    </div>`;
}

const render = function (viewfield, register) {
    let j = application.modelattribute.parseTypeadd(viewfield.modelattribute.typeadd);
    if (viewfield.modelattribute.type == 'virtual') {
        viewfield.disabled = true;
        j.type = j.type == 'autocomplete' ? 'text' : j.type;
    }
    switch (j.type || viewfield.modelattribute.type) {
        case 'text':
            return renderText(viewfield, register);
        case 'textarea':
            return renderTextArea(viewfield, register);
        case 'date':
            return renderDate(viewfield, register);
        case 'datetime':
            return renderDateTime(viewfield, register);
        case 'time':
            return renderTime(viewfield, register);
        case 'autocomplete':
            return renderAutocomplete(viewfield, register);
        case 'boolean':
            return renderCheckbox(viewfield, register);
        case 'integer':
            return renderInteger(viewfield, register);
        case 'decimal':
            return renderDecimal(viewfield, register);
        case 'file':
            return renderFile(viewfield, register);
        case 'georeference':
            return renderGeoreference(viewfield, register);
        case 'radio':
            return renderRadio(viewfield, register);
    }
}

const modelate = function (obj) {

    for (let i = 0; i < obj.viewfields.length; i++) {

        switch (obj.viewfields[i].modelattribute.type) {
            case 'text':
                if (obj.req.body[obj.viewfields[i].modelattribute.name]) {
                    obj.register[obj.viewfields[i].modelattribute.name] = obj.req.body[obj.viewfields[i].modelattribute.name];
                } else {
                    obj.register[obj.viewfields[i].modelattribute.name] = null;
                }
                break;
            case 'textarea':
                if (obj.req.body[obj.viewfields[i].modelattribute.name]) {
                    obj.register[obj.viewfields[i].modelattribute.name] = obj.req.body[obj.viewfields[i].modelattribute.name];
                } else {
                    obj.register[obj.viewfields[i].modelattribute.name] = null;
                }
                break;
            case 'file':
                if (obj.req.body[obj.viewfields[i].modelattribute.name]) {
                    obj.register[obj.viewfields[i].modelattribute.name] = obj.req.body[obj.viewfields[i].modelattribute.name];
                } else {
                    obj.register[obj.viewfields[i].modelattribute.name] = null;
                }
                break;
            case 'georeference':
                if (obj.req.body[obj.viewfields[i].modelattribute.name]) {
                    obj.register[obj.viewfields[i].modelattribute.name] = obj.req.body[obj.viewfields[i].modelattribute.name];
                } else {
                    obj.register[obj.viewfields[i].modelattribute.name] = null;
                }
                break;
            case 'date':
                if (obj.req.body[obj.viewfields[i].modelattribute.name]) {
                    obj.register[obj.viewfields[i].modelattribute.name] = application.formatters.be.date(obj.req.body[obj.viewfields[i].modelattribute.name]);
                } else {
                    obj.register[obj.viewfields[i].modelattribute.name] = null;
                }
                break;
            case 'datetime':
                if (obj.req.body[obj.viewfields[i].modelattribute.name]) {
                    obj.register[obj.viewfields[i].modelattribute.name] = application.formatters.be.datetime(obj.req.body[obj.viewfields[i].modelattribute.name]);
                } else {
                    obj.register[obj.viewfields[i].modelattribute.name] = null;
                }
                break;
            case 'time':
                if (obj.req.body[obj.viewfields[i].modelattribute.name] === '0') {
                    obj.register[obj.viewfields[i].modelattribute.name] = 0;
                } else if (obj.req.body[obj.viewfields[i].modelattribute.name]) {
                    obj.register[obj.viewfields[i].modelattribute.name] = application.formatters.be.time(obj.req.body[obj.viewfields[i].modelattribute.name]);
                } else {
                    obj.register[obj.viewfields[i].modelattribute.name] = null;
                }
                break;
            case 'boolean':
                if (obj.req.body[obj.viewfields[i].modelattribute.name] == undefined) {
                    obj.register[obj.viewfields[i].modelattribute.name] = false;
                } else {
                    obj.register[obj.viewfields[i].modelattribute.name] = true;
                }
                break;
            case 'integer':
                if (obj.req.body[obj.viewfields[i].modelattribute.name]) {
                    obj.register[obj.viewfields[i].modelattribute.name] = application.formatters.be.integer(obj.req.body[obj.viewfields[i].modelattribute.name]);
                } else {
                    obj.register[obj.viewfields[i].modelattribute.name] = null;
                }
                break;
            case 'autocomplete':
                if (obj.req.body[obj.viewfields[i].modelattribute.name] != undefined) {
                    obj.register[obj.viewfields[i].modelattribute.name] = application.formatters.be.integer(obj.req.body[obj.viewfields[i].modelattribute.name]);
                } else {
                    obj.register[obj.viewfields[i].modelattribute.name] = null;
                }
                break;
            case 'decimal':
                if (obj.req.body[obj.viewfields[i].modelattribute.name]) {
                    obj.register[obj.viewfields[i].modelattribute.name] = application.formatters.be.decimal(obj.req.body[obj.viewfields[i].modelattribute.name]).toFixed(application.modelattribute.parseTypeadd(obj.viewfields[i].modelattribute.typeadd).precision);
                } else {
                    obj.register[obj.viewfields[i].modelattribute.name] = null;
                }
                break;
            case 'radio':
                if (obj.req.body[obj.viewfields[i].modelattribute.name]) {
                    if (Array.isArray(obj.req.body[obj.viewfields[i].modelattribute.name])) {
                        obj.register[obj.viewfields[i].modelattribute.name] = obj.req.body[obj.viewfields[i].modelattribute.name].sort().join(',');
                    } else {
                        obj.register[obj.viewfields[i].modelattribute.name] = obj.req.body[obj.viewfields[i].modelattribute.name];
                    }
                } else {
                    obj.register[obj.viewfields[i].modelattribute.name] = null;
                }
                break;
        }
    }

    for (let i = 0; i < obj.modelattributes.length; i++) {
        if (obj.modelattributes[i].type == 'parent') {
            if (obj.req.query.parent && obj.req.query.parent > 0) {
                obj.register[obj.modelattributes[i].name] = parseInt(obj.req.query.parent);
            }
        }
    }

    return obj;
}

const validate = function (obj) {
    return new Promise((resolve) => {

        let invalidfields = [];

        for (let i = 0; i < obj.modelattributes.length; i++) {

            let j = application.modelattribute.parseTypeadd(obj.modelattributes[i].typeadd);

            // NotNull
            if (obj.modelattributes[i].type == 'boolean' && obj.register[obj.modelattributes[i].name] == null) {
                obj.register[obj.modelattributes[i].name] = false;
            } else if (obj.modelattributes[i].notnull && obj.modelattributes[i].type == 'integer') {
                if (!Number.isInteger(obj.register[obj.modelattributes[i].name])) {
                    invalidfields.push(obj.modelattributes[i].name);
                }
            } else {
                if (obj.modelattributes[i].notnull && obj.register[obj.modelattributes[i].name] == null) {
                    invalidfields.push(obj.modelattributes[i].name);
                }
            }

            // File
            if (obj.modelattributes[i].type == 'file') {
                if (j.sizeTotal) {
                    if (obj.register[obj.modelattributes[i].name]) {
                        let filesize = 0;
                        let files = JSON.parse(obj.register[obj.modelattributes[i].name]);
                        for (let z = 0; z < files.length; z++) {
                            filesize += files[z].size;
                        }
                        if (filesize > (j.sizeTotal * 1024 * 1024)) {
                            return resolve({ success: false, msg: 'Tamanho máximo de arquivos excedido (' + j.sizeTotal + ' MB)', invalidfields: [obj.modelattributes[i].name] });
                        }
                    }
                }
            }

        }

        if (invalidfields.length > 0) {
            return resolve({ success: false, msg: application.message.invalidFields, invalidfields: invalidfields });
        } else {
            return resolve({ success: true });
        }

    });
}

const boundFiles = function (obj) {
    let idsToBound = [];
    for (let i = 0; i < obj.modelattributes.length; i++) {
        if (obj.modelattributes[i].type == 'file' && obj.register[obj.modelattributes[i].name] != undefined && obj.register[obj.modelattributes[i].name] != '') {
            let j = JSON.parse(obj.register[obj.modelattributes[i].name]);
            for (let z = 0; z < j.length; z++) {
                idsToBound.push(j[z].id);
            }
        }
    }
    if (idsToBound.length > 0) {
        db.getModel('file').update({ bounded: true, idmodel: obj.view.model.id, modelid: obj.register.id }, { where: { id: { $in: idsToBound } } });
    }
}

const save = function (obj) {
    return new Promise((resolve) => {
        if (obj.register.changed()) {
            // File
            for (let i = 0; i < obj.modelattributes.length; i++) {
                if (obj.modelattributes[i].type == 'file' && obj.register._changed[obj.modelattributes[i].name]) {
                    let previousIds = [];
                    let currentIds = [];
                    let j = {};
                    // previous
                    j = obj.register._previousDataValues[obj.modelattributes[i].name] ? JSON.parse(obj.register._previousDataValues[obj.modelattributes[i].name]) : [];
                    for (let z = 0; z < j.length; z++) {
                        previousIds.push(j[z].id);
                    }
                    // current
                    j = obj.register[obj.modelattributes[i].name] ? JSON.parse(obj.register[obj.modelattributes[i].name]) : [];
                    for (let z = 0; z < j.length; z++) {
                        currentIds.push(j[z].id);
                    }
                    for (let z = 0; z < previousIds.length; z++) {
                        if (currentIds.indexOf(previousIds[z]) >= 0) {
                            previousIds.splice(z, 1);
                            z--;
                        }
                    }
                    if (previousIds.length > 0) {
                        db.getModel('file').update({ bounded: false }, { where: { id: { $in: previousIds } } });
                    }
                }
            }
        }
        obj.register._iduser = obj.req.user.id;
        obj.register.save().then(register => {
            boundFiles(lodash.extend(obj, { register: register }));
            resolve({ success: true, register: register });
        });
    });
}

const validateAndSave = function (obj) {
    return new Promise((resolve) => {
        validate(obj).then(validation => {
            if (validation.success) {
                save(obj).then(saved => {
                    if (saved.success) {
                        resolve({ success: true, register: saved.register });
                        let ret = {
                            data: saved.register
                            , redirect: '/v/' + obj.view.url + '/' + saved.register.id
                            , msg: application.message.success
                            , historyBack: obj.hasSubview ? false : true
                        };
                        if (obj._cookies) {
                            lodash.extend(ret, { cookies: obj._cookies });
                        }
                        if (obj._responseModifier && typeof obj._responseModifier == 'function') {
                            ret = obj._responseModifier(ret);
                        }
                        return application.success(obj.res, ret);
                    } else {
                        resolve({ success: false });
                        return application.error(obj.res, { msg: 'Nâo foi possível salvar este registro' });
                    }
                });
            } else {
                resolve({ success: false });
                return application.error(obj.res, { msg: validation.msg, invalidfields: validation.invalidfields });
            }
        });
    });
}

const deleteModel = function (obj) {
    return new Promise((resolve) => {
        db.getModel(obj.view.model.name).findAll({ where: { id: { $in: obj.ids } }, raw: true }).then(registers => {
            db.getModel(obj.view.model.name).destroy({ iduser: obj.req.user.id, where: { id: { $in: obj.ids } } }).then(() => {
                resolve({ success: true, registers: registers });
                application.success(obj.res, { msg: application.message.success });
            }).catch(err => {
                if ('name' in err && err.name == 'SequelizeForeignKeyConstraintError') {
                    let errsplited = err.original.detail.split('"');
                    if (errsplited.length == 3) {
                        db.getModel('model').findOne({ where: { name: errsplited[1] } }).then(model => {
                            if (model) {
                                resolve({ success: false, err: err });
                                return application.error(obj.res, { msg: 'Este registro está em uso em ' + (model.description || model.name) });
                            } else {
                                resolve({ success: false, err: err });
                                return application.fatal(obj.res, err);
                            }
                        });
                    } else {
                        resolve({ success: false, err: err });
                        return application.fatal(obj.res, err);
                    }
                } else {
                    resolve({ success: false, err: err });
                    return application.fatal(obj.res, err);
                }
            });
        });
    });
}

const hasPermission = function (iduser, idview) {
    return new Promise((resolve) => {
        let permissionquery = 'select p.*, v.id as idview from permission p left join menu m on (p.idmenu = m.id) left join view v on (m.idview = v.id) where p.iduser = :iduser';
        let getChilds = function (idview, subviews) {
            let returnsubviews = [];
            for (let i = 0; i < subviews.length; i++) {
                if (idview == subviews[i].idview) {
                    returnsubviews.push(subviews[i].idsubview);
                    let moresubviews = getChilds(subviews[i].idsubview, subviews);
                    for (let z = 0; z < moresubviews.length; z++) {
                        returnsubviews.push(moresubviews[z]);
                    }
                }
            }
            return returnsubviews;
        }
        db.sequelize.query(permissionquery, {
            replacements: { iduser: iduser }
            , type: db.sequelize.QueryTypes.SELECT
        }).then(permissions => {
            for (let i = 0; i < permissions.length; i++) {
                if (permissions[i].idview == idview) {
                    return resolve(permissions[i]);
                }
            }
            db.getModel('viewsubview').findAll({ raw: true }).then(subviews => {
                for (let i = 0; i < permissions.length; i++) {
                    permissions[i].childs = getChilds(permissions[i].idview, subviews);
                    for (let x = 0; x < permissions[i].childs.length; x++) {
                        if (permissions[i].childs[x] == idview) {
                            return resolve(permissions[i]);
                        }
                    }
                }
                return resolve(false);
            });
        });
    });
}

const getTemplate = function (template) {
    let templatename = __dirname + (template.indexOf('/') < 0 ? '/../views/templates/' : '/../custom/') + template + '.html';
    if (!(templatename in application.Handlebars.compiledTemplates)) {
        application.Handlebars.compiledTemplates[templatename] = application.Handlebars.compile(fs.readFileSync(templatename, 'utf8'));
    }
    return application.Handlebars.compiledTemplates[templatename];
}

const findView = function (url) {
    return db.getModel('view').findOne({ include: [{ all: true }], where: { url: url } });
}

module.exports = function (app) {

    app.post('/v/:view/config', application.IsAuthenticated, async (req, res) => {
        try {
            const decodeClass = function (type) {
                switch (type) {
                    case 'decimal':
                        return 'text-right';
                    case 'time':
                        return 'text-right';
                    case 'file':
                        return 'text-center';
                    default:
                        return 'text-left';
                }
            }
            const view = await findView(req.params.view);
            if (!view) {
                return application.error(res, {});
            }
            const permission = await hasPermission(req.user.id, view.id);
            if (permission.visible) {
                const viewtables = await db.getModel('viewtable').findAll({
                    where: { idview: view.id }
                    , order: [['ordertable', 'ASC']]
                    , include: [{ all: true }]
                });
                const viewfields = await db.getModel('viewfield').findAll({
                    where: { idview: view.id, disablefilter: false }
                    , order: [['order', 'ASC']]
                    , include: [{ all: true }]
                });
                const viewevents = await db.getModel('viewevent').findAll({
                    where: { idview: view.id }
                    , order: [['description', 'ASC']]
                    , include: [{ all: true }]
                });
                let events = [];
                let columns = [];
                let needfooter = false;
                let footer = '';
                let permissions = {};
                let filter = '';
                // Permissions
                permissions.insertable = permission.insertable;
                permissions.editable = permission.editable;
                permissions.deletable = permission.deletable;
                permissions.orderable = view.orderfixed ? false : true;
                // Events
                for (let i = 0; i < viewevents.length; i++) {
                    events.push({
                        id: viewevents[i].id
                        , description: viewevents[i].description
                        , icon: viewevents[i].icon
                        , function: viewevents[i].function
                    });
                }
                // Columns
                if (!view.supressid) {
                    columns.push({
                        title: 'ID'
                        , data: 'id'
                        , name: 'id'
                        , width: 37
                        , orderable: view.orderfixed ? false : true
                    });
                }
                for (let i = 0; i < viewtables.length; i++) {
                    columns.push({
                        title: viewtables[i].modelattribute.label
                        , data: viewtables[i].modelattribute.name
                        , name: viewtables[i].modelattribute.name
                        , orderable: view.orderfixed ? false : viewtables[i].orderable
                        , render: viewtables[i].render
                        , class: (viewtables[i].modelattribute.type == 'virtual'
                            ? decodeClass(application.modelattribute.parseTypeadd(viewtables[i].modelattribute.typeadd).type)
                            : decodeClass(viewtables[i].modelattribute.type))
                            + (viewtables[i].class ? ' ' + viewtables[i].class : '')
                    });
                    if (viewtables[i].totalize) {
                        needfooter = true;
                    }
                }
                if (needfooter) {
                    footer = '<tfoot><tr>';
                    if (!view.supressid) {
                        footer += '<td style="text-align: center;"><b>Total</b></td>';
                    }
                    for (let i = 0; i < viewtables.length; i++) {
                        let data = 'data-view="' + view.url + '" data-attribute="' + viewtables[i].modelattribute.id + '"';
                        if (viewtables[i].totalize) {
                            footer += '<td> <span class="totalize" ' + data + '></span> </td>';
                        } else {
                            footer += '<td></td>';
                        }
                    }
                    footer += '</tr></tfoot>';
                }
                //Filter
                const getFilterValue = function (name, cookiefilter) {
                    if (name in cookiefilter) {
                        return cookiefilter[name];
                    } else {
                        return '';
                    }
                }
                let cookiefilter = {};
                let cookiefiltercount = 0;
                const separator = '+';
                if ('tableview' + view.url + 'filter' in req.cookies) {
                    let cookiefilteraux = JSON.parse(req.cookies['tableview' + view.url + 'filter']);
                    cookiefiltercount = cookiefilteraux.length;
                    for (let i = 0; i < cookiefilteraux.length; i++) {
                        for (let k in cookiefilteraux[i]) {
                            cookiefilter[k] = cookiefilteraux[i][k];
                        }
                    }
                }

                filter = `<div class="${viewfields.length > 8 ? 'col-md-6 no-padding' : ''}">`;
                if (!view.supressid) {
                    filter += application.components.html.integer({
                        width: 4
                        , label: 'ID'
                        , name: 'id' + separator + 'integer' + separator + 'r'
                        , value: getFilterValue('id' + separator + 'integer' + separator + 'r', cookiefilter)
                    });
                    filter += application.components.html.integer({
                        width: 4
                        , label: 'ID - Inicial'
                        , name: 'id' + separator + 'integer' + separator + 'b'
                        , value: getFilterValue('id' + separator + 'integer' + separator + 'b', cookiefilter)
                    });
                    filter += application.components.html.integer({
                        width: 4
                        , label: 'ID - Final'
                        , name: 'id' + separator + 'integer' + separator + 'e'
                        , value: getFilterValue('id' + separator + 'integer' + separator + 'e', cookiefilter)
                    });
                }
                for (let i = 0; i < viewfields.length; i++) {
                    if (i == Math.trunc(viewfields.length / 2) && viewfields.length > 8) {
                        filter += '</div><div class="col-md-6 no-padding">';
                    }
                    let filterbegin = '';
                    let filterend = '';
                    let j = application.modelattribute.parseTypeadd(viewfields[i].modelattribute.typeadd);
                    let filtername = viewfields[i].modelattribute.name + separator + (j.type || viewfields[i].modelattribute.type);
                    let virtual = viewfields[i].modelattribute.type == 'virtual' ? 'v' : ''
                    switch (j.type || viewfields[i].modelattribute.type) {
                        case 'text':
                            filtername += separator + 's' + virtual;
                            filter += application.components.html.text({
                                width: 12
                                , label: viewfields[i].modelattribute.label
                                , name: filtername
                                , value: getFilterValue(filtername, cookiefilter)
                            });
                            break;
                        case 'textarea':
                            filtername += separator + 's' + virtual;
                            filter += application.components.html.text({
                                width: 12
                                , label: viewfields[i].modelattribute.label
                                , name: filtername
                                , value: getFilterValue(filtername, cookiefilter)
                            });
                            break;
                        case 'integer':
                            filterbegin = filtername + separator + 'b' + virtual;
                            filterend = filtername + separator + 'e' + virtual;
                            filtername += separator + 'r' + virtual;
                            filter += application.components.html.integer({
                                width: 4
                                , label: viewfields[i].modelattribute.label
                                , name: filtername
                                , value: getFilterValue(filtername, cookiefilter)
                            });
                            filter += application.components.html.integer({
                                width: 4
                                , label: viewfields[i].modelattribute.label + ' - Inicial'
                                , name: filterbegin
                                , value: getFilterValue(filterbegin, cookiefilter)
                            });
                            filter += application.components.html.integer({
                                width: 4
                                , label: viewfields[i].modelattribute.label + ' - Final'
                                , name: filterend
                                , value: getFilterValue(filterend, cookiefilter)
                            });
                            break;
                        case 'date':
                            filterbegin = filtername + separator + 'b' + virtual;
                            filterend = filtername + separator + 'e' + virtual;
                            filter += application.components.html.date({
                                width: 6
                                , label: viewfields[i].modelattribute.label + ' - Inicial'
                                , name: filterbegin
                                , value: getFilterValue(filterbegin, cookiefilter)
                            });
                            filter += application.components.html.date({
                                width: 6
                                , label: viewfields[i].modelattribute.label + ' - Final'
                                , name: filterend
                                , value: getFilterValue(filterend, cookiefilter)
                            });
                            break;
                        case 'datetime':
                            filterbegin = filtername + separator + 'b' + virtual;
                            filterend = filtername + separator + 'e' + virtual;
                            filter += application.components.html.datetime({
                                width: 6
                                , label: viewfields[i].modelattribute.label + ' - Inicial'
                                , name: filterbegin
                                , value: getFilterValue(filterbegin, cookiefilter)
                            });
                            filter += application.components.html.datetime({
                                width: 6
                                , label: viewfields[i].modelattribute.label + ' - Final'
                                , name: filterend
                                , value: getFilterValue(filterend, cookiefilter)
                            });
                            break;
                        case 'time':
                            filterbegin = filtername + separator + 'b' + virtual;
                            filterend = filtername + separator + 'e' + virtual;
                            filter += application.components.html.time({
                                width: 6
                                , label: viewfields[i].modelattribute.label + ' - Inicial'
                                , name: filterbegin
                                , value: getFilterValue(filterbegin, cookiefilter)
                            });
                            filter += application.components.html.time({
                                width: 6
                                , label: viewfields[i].modelattribute.label + ' - Final'
                                , name: filterend
                                , value: getFilterValue(filterend, cookiefilter)
                            });
                            break;
                        case 'decimal':
                            filterbegin = filtername + separator + 'b' + virtual;
                            filterend = filtername + separator + 'e' + virtual;
                            filter += application.components.html.decimal({
                                width: 6
                                , label: viewfields[i].modelattribute.label + ' - Inicial'
                                , name: filterbegin
                                , value: getFilterValue(filterbegin, cookiefilter)
                                , precision: j.precision
                            });
                            filter += application.components.html.decimal({
                                width: 6
                                , label: viewfields[i].modelattribute.label + ' - Final'
                                , name: filterend
                                , value: getFilterValue(filterend, cookiefilter)
                                , precision: j.precision
                            });
                            break;
                        case 'autocomplete':
                            filtername += separator + 'i' + virtual;
                            filter += application.components.html.autocomplete({
                                width: 12
                                , label: viewfields[i].modelattribute.label
                                , name: filtername
                                , disabled: ''
                                , model: j.model
                                , attribute: j.attribute || ''
                                , query: j.query || ''
                                , where: req.body.issubview == 'true' && j.where ? j.where : ''
                                , multiple: 'multiple="multiple"'
                                , option: getFilterValue(filtername, cookiefilter).options || ''
                            });
                            break;
                        case 'radio':
                            filtername += separator + (j.multiple ? 's' : 'i') + virtual;
                            filter += application.components.html.autocomplete({
                                width: 12
                                , label: viewfields[i].modelattribute.label
                                , name: filtername
                                , disabled: ''
                                , multiple: 'multiple="multiple"'
                                , options: j.options
                                , option: getFilterValue(filtername, cookiefilter).options || ''
                            });
                            break;
                        case 'boolean':
                            filtername = viewfields[i].modelattribute.name + separator + viewfields[i].modelattribute.type + separator + 'r' + virtual;
                            filter += `
                            <div class="col-md-12">
                                <div class="form-group">
                                    <label>${viewfields[i].modelattribute.label}</label>
                                    <div class="row" style="text-align: center;">
                                        <div class="col-xs-4">
                                            <label>
                                                <input type="radio" name="${filtername}" value="" ${getFilterValue(filtername, cookiefilter) == '' ? 'checked="checked"' : ''}>
                                                Todos
                                            </label>
                                        </div>
                                        <div class="col-xs-4">
                                            <label>
                                                <input type="radio" name="${filtername}" value="true" ${getFilterValue(filtername, cookiefilter) == 'true' ? 'checked="checked"' : ''}>
                                                Sim
                                            </label>
                                        </div>
                                        <div class="col-xs-4">
                                            <label>
                                                <input type="radio" name="${filtername}" value="false" ${getFilterValue(filtername, cookiefilter) == 'false' ? 'checked="checked"' : ''}>
                                                Não
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>`;
                            break;
                    }
                }
                filter += '</div>';
                return application.success(res, {
                    name: view.url
                    , columns: columns
                    , footer: footer
                    , events: events
                    , permissions: permissions
                    , filter: {
                        count: cookiefiltercount
                        , html: application.functions.singleSpace(filter)
                        , available: viewfields.length
                    }
                    , pageLength: view.pagelength || 15
                    , fastsearch: view.idfastsearch ? view.fastsearch.label : false
                });
            } else {
                return application.forbidden(res);
            }
        } catch (err) {
            return application.fatal(res, err);
        }
    });

    app.get('/v/:view', application.IsAuthenticated, async (req, res) => {
        try {
            const view = await findView(req.params.view);
            if (!view) {
                return application.notFound(res);
            }
            const permission = await hasPermission(req.user.id, view.id);
            if (permission.visible && !permission.hidelisting) {
                return application.render(res, __dirname + '/../views/templates/viewtable.html', {
                    title: view.name
                    , view: view.url
                    , js: view.js ? `<script type="text/javascript">${fs.readFileSync(__dirname + '/../custom/' + view.js, 'utf8')}</script>` : ''
                });
            } else {
                return application.forbidden(res);
            }
        } catch (err) {
            return application.fatal(res, err);
        }
    });

    app.get('/v/:view/:id', application.IsAuthenticated, async (req, res) => {
        try {
            const view = await findView(req.params.view);
            const id = parseInt(req.params.id)
            if (!view) {
                return application.notFound(res);
            }
            if (isNaN(id)) {
                return application.render(res, __dirname + '/../views/templates/viewregisternotfound.html');
            }
            const permission = await hasPermission(req.user.id, view.id);
            if (permission.visible) {
                if (id > 0 && view.wherefixed) {
                    let wherefixed = view.wherefixed.replace(/\$user/g, req.user.id).replace(/\$id/g, req.query.parent || null);
                    let exists = await db.getModel(view.model.name).count({ raw: true, include: [{ all: true }], where: { id: id, $col: db.Sequelize.literal(wherefixed) } });
                    if (exists <= 0) {
                        return application.forbidden(res);
                    }
                }
                const viewfields = await db.getModel('viewfield').findAll({
                    where: { idview: view.id }
                    , order: [['idtemplatezone', 'ASC'], ['order', 'ASC']]
                    , include: [{ all: true }]
                });
                let attributes = ['id'];
                for (let i = 0; i < viewfields.length; i++) {
                    let j = application.modelattribute.parseTypeadd(viewfields[i].modelattribute.typeadd);
                    switch (viewfields[i].modelattribute.type) {
                        case 'autocomplete':
                            if (j.query) {
                                attributes.push([db.Sequelize.literal(j.query), viewfields[i].modelattribute.name]);
                            } else {
                                attributes.push(viewfields[i].modelattribute.name);
                            }
                            break;
                        case 'virtual':
                            attributes.push([db.Sequelize.literal(j.subquery.replace(/\$user/g, req.user.id)), viewfields[i].modelattribute.name]);
                            break;
                        default:
                            attributes.push(viewfields[i].modelattribute.name);
                            break;
                    }
                }
                let register = await db.getModel(view.model.name).findOne({
                    attributes: attributes
                    , where: { id: id }
                    , include: [{ all: true }]
                });
                if (!register && id != 0) {
                    return application.render(res, __dirname + '/../views/templates/viewregisternotfound.html');
                }
                let templatezones = await db.getModel('templatezone').findAll({
                    where: { idtemplate: view.template.id }
                });
                // Fill zones with blank
                let zoneobj = {};
                for (let i = 0; i < templatezones.length; i++) {
                    zoneobj[templatezones[i].name] = '';
                }
                for (let i = 0; i < viewfields.length; i++) {
                    zoneobj[viewfields[i].templatezone.name] += render(viewfields[i], register);
                }
                let viewsubviews = await db.getModel('viewsubview').findAll({
                    where: { idview: view.id }
                    , include: [{ all: true }]
                });
                if (viewsubviews.length > 0) {
                    for (let i = 0; i < viewsubviews.length; i++) {
                        zoneobj[viewsubviews[i].templatezone.name] += renderSubView(viewsubviews[i]);
                    }
                }
                res.setHeader('Cache-Control', 'no-cache, no-store');
                return application.render(res, __dirname + '/../views/templates/viewregister.html', {
                    id: register ? register.id : 0
                    , title: view.name
                    , template: getTemplate(view.template.name)(zoneobj)
                    , js: view.js ? `<script type="text/javascript">${fs.readFileSync(__dirname + '/../custom/' + view.js, 'utf8')}</script>` : ''
                });
            } else {
                return application.forbidden(res);
            }
        } catch (err) {
            return application.fatal(res, err);
        }
    });

    app.post('/v/:view/delete', application.IsAuthenticated, async (req, res) => {
        try {
            const view = await findView(req.params.view);
            if (!view) {
                return application.error(res, {});
            }
            const permission = await hasPermission(req.user.id, view.id);
            if (permission.deletable) {
                let ids = req.body.ids.split(',');
                if (ids) {
                    let obj = {
                        ids: ids
                        , view: view
                        , req: req
                        , res: res
                    };
                    if (view.model.ondelete) {
                        let config = await db.getModel('config').findOne();
                        let custom = require('../custom/' + config.customfile);
                        return application.functions.getRealReference(custom, view.model.ondelete)(obj, deleteModel);
                    } else {
                        deleteModel(obj);
                    }
                } else {
                    return application.fatal(res, 'ids not given');
                }
            } else {
                return application.error(res, { msg: application.message.permissionDenied });
            }
        } catch (err) {
            return application.fatal(res, err);
        }
    });

    app.post('/v/:view/:id', application.IsAuthenticated, async (req, res) => {
        try {
            const view = await findView(req.params.view);
            if (!view) {
                return application.error(res, {});
            }
            const permission = await hasPermission(req.user.id, view.id);
            if ((req.params.id == 0 && permission.insertable) || (req.params.id > 0 && permission.editable)) {
                const viewfields = await db.getModel('viewfield').findAll({
                    where: { idview: view.id, disabled: { $eq: false } }
                    , include: [{ all: true }]
                });
                const subview = await db.getModel('viewsubview').findOne({ where: { idview: view.id } });
                const modelattributes = await db.getModel('modelattribute').findAll({ where: { idmodel: view.model.id } });
                let register = await db.getModel(view.model.name).findOne({ where: { id: req.params.id }, include: [{ all: true }] });
                if (!register) {
                    register = db.getModel(view.model.name).build({ id: 0 });
                }
                let obj = {
                    id: req.params.id
                    , view: view
                    , viewfields: viewfields
                    , modelattributes: modelattributes
                    , hasSubview: subview ? true : false
                    , register: register
                    , req: req
                    , res: res
                };
                obj = modelate(obj);
                if (view.model.onsave) {
                    let config = await db.getModel('config').findOne();
                    let custom = require('../custom/' + config.customfile);
                    let realfunction = application.functions.getRealReference(custom, view.model.onsave);
                    if (realfunction) {
                        return realfunction(obj, validateAndSave);
                    } else {
                        console.error("Custom function '" + view.model.onsave + "' not found");
                        await validateAndSave(obj);
                    }
                } else {
                    await validateAndSave(obj);
                }
            } else {
                return application.error(res, { msg: application.message.permissionDenied });
            }
        } catch (err) {
            return application.fatal(res, err);
        }
    });

}