const application = require('./application')
    , db = require('../models')
    , platform = require('../custom/platform')
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

    let label = viewfield.modelattribute.label;
    if (j.sizeTotal && j.sizeTotal > 0) {
        label += ' (' + j.sizeTotal + ' MB)';
    }
    if (viewfield.modelattribute.notnull) {
        label += '*';
    }

    return application.components.html.file({
        width: viewfield.width
        , name: viewfield.modelattribute.name
        , label: label
        , value: value
        , maxfiles: j.maxfiles || ''
        , sizetotal: j.sizeTotal || ''
        , acceptedfiles: j.acceptedfiles || ''
        , forcejpg: j.forcejpg || false
        , maxwh: j.maxwh || 0
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
    <div class="col-md-12 divsubview${viewsubview.subview.url}">
        <h4 class="title_subview">${viewsubview.description || ''}</h4>
        <table id="view${viewsubview.subview.url}" class="table table-bordered table-hover dataTable" width="100%"
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
        if (obj.req.body._calendar && !(obj.viewfields[i].modelattribute.name in obj.req.body))
            continue;
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
                        return { success: false, msg: 'Tamanho máximo de arquivos excedido (' + j.sizeTotal + ' MB)', invalidfields: [obj.modelattributes[i].name] };
                    }
                }
            }
        }
    }
    if (invalidfields.length > 0) {
        return { success: false, msg: application.message.invalidFields, invalidfields: invalidfields };
    } else {
        return { success: true };
    }
}

const boundFiles = async function (obj) {
    try {
        for (let i = 0; i < obj.modelattributes.length; i++) {
            if (obj.modelattributes[i].type == 'file' && obj.register[obj.modelattributes[i].name] != undefined && obj.register[obj.modelattributes[i].name] != '') {
                let j = JSON.parse(obj.register[obj.modelattributes[i].name]);
                let typeadd = application.modelattribute.parseTypeadd(obj.modelattributes[i].typeadd);
                for (let z = 0; z < j.length; z++) {
                    await db.getModel('file').update({
                        bounded: true, idmodel: obj.view.model.id, modelid: obj.register.id, public: typeadd.public == true ? true : false
                    }, { transaction: obj.transaction, where: { id: j[z].id } });
                }
            }
        }
    } catch (err) {
        console.error('Cannot boundFiles', err);
    }
}

const save = async function (obj) {
    try {
        if (obj.register.changed()) {
            // File
            for (let i = 0; i < obj.modelattributes.length; i++) {
                if (obj.modelattributes[i].type == 'file' && obj.register._changed[obj.modelattributes[i].name]) {
                    let previousIds = [];
                    let currentIds = [];
                    let j = [];
                    // previous
                    j = JSON.parse(obj.register._previousDataValues[obj.modelattributes[i].name] || '[]');
                    for (let z = 0; z < j.length; z++) {
                        previousIds.push(j[z].id);
                    }
                    // current
                    j = JSON.parse(obj.register[obj.modelattributes[i].name] || '[]');
                    for (let z = 0; z < j.length; z++) {
                        currentIds.push(j[z].id);
                    }
                    for (let z = 0; z < previousIds.length; z++) {
                        if (currentIds.indexOf(previousIds[z]) >= 0) {
                            previousIds.splice(z, 1);
                            z--;
                        }
                    }
                    await db.getModel('file').update({ bounded: false }, { transaction: obj.transaction, where: { id: { [db.Op.in]: previousIds } } });
                }
            }
        }
        let register = await obj.register.save({ iduser: obj.req.user.id, transaction: obj.transaction });
        await boundFiles(Object.assign(obj, { register: register }));
        await obj.transaction.commit();
        return { success: true, register: register };
    } catch (err) {
        console.error(err);
        return { success: false };
    }
}

const validateAndSave = async function (obj) {
    try {
        let validation = validate(obj);
        if (validation.success) {
            let saved = await save(obj);
            if (saved.success) {
                let ret = {};
                ret.data = saved.register;
                ret.msg = application.message.success;
                if (!obj.req.body._calendar) {
                    ret.redirect = '/v/' + obj.view.url + '/' + saved.register.id;
                    ret.historyBack = obj.hasSubview ? false : true;
                }
                if (obj._cookies) {
                    for (let i = 0; i < obj._cookies.length; i++) {
                        obj.res.cookie(obj._cookies[i].key, obj._cookies[i].value);
                    }
                }
                if (obj._responseModifier && typeof obj._responseModifier == 'function') {
                    ret = obj._responseModifier(ret);
                }
                if (obj.req.cookies.subview_redirect) {
                    Object.assign(ret, {
                        subview_redirect: `/v/${obj.req.cookies.subview_redirect}/0?parent=${saved.register.id}`
                    });
                }
                application.success(obj.res, ret);
                return { success: true, register: saved.register };
            } else {
                application.error(obj.res, { msg: 'Nâo foi possível salvar este registro' });
                return { success: false };
            }
        } else {
            application.error(obj.res, { msg: validation.msg, invalidfields: validation.invalidfields });
            return { success: false };
        }
    } catch (err) {
        application.fatal(obj.res, err);
        return { success: false };
    }
}

const deleteModel = async function (obj) {
    try {
        let registers = await db.getModel(obj.view.model.name).findAll({ where: { id: { [db.Op.in]: obj.ids } }, raw: true });
        await db.getModel(obj.view.model.name).destroy({ transaction: obj.transaction, iduser: obj.req.user.id, where: { id: { [db.Op.in]: obj.ids } } });
        await obj.transaction.commit();
        application.success(obj.res, { msg: application.message.success });
        return { success: true, registers: registers };
    } catch (err) {
        if ('name' in err && err.name == 'SequelizeForeignKeyConstraintError') {
            let errsplited = err.original.detail.split('"');
            if (errsplited.length == 3) {
                let model = await db.getModel('model').findOne({ where: { name: errsplited[1] } });
                if (model) {
                    application.error(obj.res, { msg: 'Este registro está em uso em ' + (model.description || model.name) });
                    return { success: false, err: err };
                } else {
                    application.fatal(obj.res, err);
                    return { success: false, err: err };
                }
            } else {
                application.fatal(obj.res, err);
                return { success: false, err: err };
            }
        } else {
            application.fatal(obj.res, err);
            return { success: false, err: err };
        }
    }
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

    app.get('/v/:view/config', application.IsAuthenticated, async (req, res) => {
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
            if (!view)
                return application.error(res, {});
            const permission = await platform.view.f_hasPermission(req.user.id, view.id);
            if (!view.neednoperm && !permission.visible)
                return application.forbidden(res);
            if (view.type == 'Calendar') {
                return application.success(res, {
                    add: JSON.parse(view.add || '{}')
                });
            } else {
                const viewtables = await db.getModel('viewtable').findAll({
                    where: { idview: view.id }
                    , order: [['ordertable', 'ASC']]
                    , include: [{ all: true }]
                });
                const permissionevents = await db.sequelize.query(`select e.*, pe.available from permissionevent pe
                left join viewevent e on (pe.idevent = e.id)
                left join permission p on (pe.idpermission = p.id)
                where p.id = ${permission ? permission.id : 0} and p.idview = ${view.id}`, { type: db.Sequelize.QueryTypes.SELECT });
                const viewevents = await db.sequelize.query(`select e.*, true as available from viewevent e where e.idview = ${view.id} order by e.description`, { type: db.Sequelize.QueryTypes.SELECT });
                let events = [];
                let columns = [];
                let needfooter = false;
                let footer = '';
                let permissions = {};
                // Permissions
                permissions.insertable = permission.insertable;
                permissions.editable = permission.editable;
                permissions.deletable = permission.deletable;
                permissions.orderable = view.orderfixed ? false : true;
                // Events
                const realevents = permissionevents.length > 0 ? permissionevents : viewevents;
                for (let i = 0; i < realevents.length; i++) {
                    if (realevents[i].available)
                        events.push({
                            id: realevents[i].id
                            , description: realevents[i].description
                            , icon: realevents[i].icon
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
                return application.success(res, {
                    name: view.url
                    , columns: columns
                    , footer: footer
                    , events: events
                    , permissions: permissions
                    , fastsearch: view.idfastsearch ? view.fastsearch.label : false
                    , subview: req.query.issubview == 'true' ? true : false
                    , lineheight: view.lineheight
                });
            }
        } catch (err) {
            return application.fatal(res, err);
        }
    });

    app.get('/v/:view/filter', application.IsAuthenticated, async (req, res) => {
        try {
            const view = await findView(req.params.view);
            if (!view)
                return application.error(res, {});
            const permission = await platform.view.f_hasPermission(req.user.id, view.id);
            if (!view.neednoperm && !permission.visible)
                return application.forbidden(res);
            const viewfields = await db.getModel('viewfield').findAll({
                where: { idview: view.id, disablefilter: false }
                , order: [['order', 'ASC']]
                , include: [{ all: true }]
            });
            let filter = '';
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
            if ('view' + view.url + 'filter' in req.cookies) {
                let cookiefilteraux = JSON.parse(req.cookies['view' + view.url + 'filter']);
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
                , filter: {
                    count: cookiefiltercount
                    , html: application.functions.singleSpace(filter)
                    , available: viewfields.length
                }
            });
        } catch (err) {
            return application.fatal(res, err);
        }
    });

    app.get('/v/:view', application.IsAuthenticated, async (req, res) => {
        try {
            const view = await findView(req.params.view);
            if (!view)
                return application.notFound(res);
            const permission = await platform.view.f_hasPermission(req.user.id, view.id);
            if (!view.neednoperm && !permission.visible)
                return application.forbidden(res);
            switch (view.type) {
                case 'Template':
                    return application.render(res, __dirname + '/../views/templates/viewtype_template.html', {
                        title: view.idmenu ? view.menu.description : view.name
                        , template: getTemplate(view.template.name)({})
                    });
                case 'Calendar':
                    return application.render(res, __dirname + '/../views/templates/viewtype_calendar.html', {
                        title: view.idmenu ? view.menu.description : view.name
                        , view: view.url
                    });
                case 'Registration':
                    return res.redirect(req.path + '/0');
                case 'Configuration':
                    return res.redirect(req.path + '/1');
                default:
                    return application.render(res, __dirname + '/../views/templates/viewtable.html', {
                        title: view.idmenu ? view.menu.description : view.name
                        , view: view.url
                        , js: view.js ? `<script type="text/javascript">${fs.readFileSync(__dirname + '/../custom/' + view.js, 'utf8')}</script>` : ''
                    });
            }
        } catch (err) {
            return application.fatal(res, err);
        }
    });

    app.get('/v/:view/:id', application.IsAuthenticated, async (req, res) => {
        try {
            const view = await findView(req.params.view);
            const id = parseInt(req.params.id)
            if (!view)
                return application.notFound(res);
            if (isNaN(id))
                return application.render(res, __dirname + '/../views/templates/viewregisternotfound.html');
            const permission = await platform.view.f_hasPermission(req.user.id, view.id);
            if (!view.neednoperm && !permission.visible)
                return application.forbidden(res);
            if (id > 0 && view.wherefixed) {
                let wherefixed = view.wherefixed.replace(/\$user/g, req.user.id).replace(/\$id/g, req.query.parent || null);
                let exists = await db.getModel(view.model.name).count({ raw: true, include: [{ all: true }], where: { id: id, $col: db.Sequelize.literal(wherefixed) } });
                if (exists <= 0) {
                    return res.redirect(`/v/${req.params.view}`);
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
            // Events
            const permissionevents = await db.sequelize.query(`select e.*, pe.available from permissionevent pe
                left join viewevent e on (pe.idevent = e.id)
                left join permission p on (pe.idpermission = p.id)
                where p.id = ${permission ? permission.id : 0} and p.idview = ${view.id}`, { type: db.Sequelize.QueryTypes.SELECT });
            const viewevents = await db.sequelize.query(`select e.*, true as available from viewevent e where e.idview = ${view.id} order by e.description`, { type: db.Sequelize.QueryTypes.SELECT });
            const realevents = permissionevents.length > 0 ? permissionevents : viewevents;
            let events = [];
            for (let i = 0; i < realevents.length; i++) {
                if (realevents[i].available)
                    events.push(`<li class="btn-event" data-event="${realevents[i].id}"><a href="javascript:void(0)"><i class="${realevents[i].icon}"></i>${realevents[i].description}</a></li>`);
            }
            res.setHeader('Cache-Control', 'no-cache, no-store');
            return application.render(res, __dirname + '/../views/templates/viewregister.html', {
                id: register ? register.id : 0
                , title: view.name
                , events: events.join('')
                , template: getTemplate(view.template.name)(zoneobj)
                , js: view.js && fs.existsSync(__dirname + '/../custom/' + view.js) ? `<script type="text/javascript">${fs.readFileSync(__dirname + '/../custom/' + view.js, 'utf8')}</script>` : ''
            });
        } catch (err) {
            return application.fatal(res, err);
        }
    });

    app.get('/v/:view/:id/config', application.IsAuthenticated, async (req, res) => {
        try {
            const view = await findView(req.params.view);
            const id = parseInt(req.params.id)
            if (!view)
                return application.notFound(res);
            if (isNaN(id))
                return application.render(res, __dirname + '/../views/templates/viewregisternotfound.html');
            const permission = await platform.view.f_hasPermission(req.user.id, view.id);
            if (!view.neednoperm && !permission.visible)
                return application.forbidden(res);
            if (id > 0 && view.wherefixed) {
                let wherefixed = view.wherefixed.replace(/\$user/g, req.user.id).replace(/\$id/g, req.query.parent || null);
                let exists = await db.getModel(view.model.name).count({ raw: true, include: [{ all: true }], where: { id: id, $col: db.Sequelize.literal(wherefixed) } });
                if (exists <= 0) {
                    return res.redirect(`/v/${req.params.view}`);
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
                return application.error(res, {});
            }
            let templatezones = await db.getModel('templatezone').findAll({
                where: { idtemplate: view.template.id }
                , order: [['name', 'asc']]
            });
            // Fill zones with blank
            let obj = {
                zones: {}
            };
            for (let i = 0; i < templatezones.length; i++) {
                obj.zones[templatezones[i].name] = {
                    fields: []
                };
            }
            for (let i = 0; i < viewfields.length; i++) {
                obj.zones[viewfields[i].templatezone.name].fields.push({
                    name: viewfields[i].modelattribute.name
                    , label: viewfields[i].modelattribute.label
                    , type: viewfields[i].modelattribute.type
                    , notnull: viewfields[i].modelattribute.notnull
                    , value: register.dataValues[viewfields[i].modelattribute.name] || ''
                });;
            }
            return application.success(res, obj);
        } catch (err) {
            return application.fatal(res, err);
        }
    });

    app.post('/v/:view/delete', application.IsAuthenticated, async (req, res) => {
        try {
            const view = await findView(req.params.view);
            if (!view)
                return application.error(res, {});
            const permission = await platform.view.f_hasPermission(req.user.id, view.id);
            if (!permission.deletable)
                return application.error(res, { msg: application.message.permissionDenied });
            let obj = {
                ids: req.body.ids ? req.body.ids.split(',') : []
                , view: view
                , req: req
                , res: res
                , transaction: await db.sequelize.transaction()
            };
            if (view.model && view.model.ondelete) {
                let config = await db.getModel('config').findOne();
                let custom = require('../custom/' + config.customfile);
                let realfunction = application.functions.getRealReference(custom, view.model.ondelete);
                if (realfunction) {
                    await realfunction(obj, deleteModel);
                } else {
                    application.error(res, { msg: `Função ${view.model.ondelete} não encontrada` });
                }
            } else {
                await deleteModel(obj);
            }
            if (!obj.transaction.finished)
                obj.transaction.rollback();
        } catch (err) {
            return application.fatal(res, err);
        }
    });

    app.post('/v/:view/:id', application.IsAuthenticated, async (req, res) => {
        try {
            const view = await findView(req.params.view);
            if (!view)
                return application.error(res, {});
            const permission = await platform.view.f_hasPermission(req.user.id, view.id);
            if ((req.params.id == 0 && !permission.insertable) || (req.params.id > 0 && !permission.editable)) {
                return application.error(res, { msg: application.message.permissionDenied });
            }
            const viewfields = await db.getModel('viewfield').findAll({
                where: { idview: view.id, disabled: { [db.Op.eq]: false } }
                , include: [{ all: true }]
            });
            const subview = await db.getModel('viewsubview').findOne({ where: { idview: view.id } });
            const modelattributes = await db.getModel('modelattribute').findAll({ where: { idmodel: view.model.id } });
            let register = await db.getModel(view.model.name).findOne({ where: { id: req.params.id }, include: [{ all: true }] });
            if (!register)
                register = db.getModel(view.model.name).build({ id: 0 });
            let obj = {
                id: req.params.id
                , view: view
                , viewfields: viewfields
                , modelattributes: modelattributes
                , hasSubview: subview ? true : false
                , register: register
                , req: req
                , res: res
                , transaction: await db.sequelize.transaction()
            };
            obj = modelate(obj);
            if (view.model && view.model.onsave) {
                let config = await db.getModel('config').findOne();
                let custom = require('../custom/' + config.customfile);
                let realfunction = application.functions.getRealReference(custom, view.model.onsave);
                if (realfunction) {
                    await realfunction(obj, validateAndSave);
                } else {
                    application.error(res, { msg: `Função ${view.model.onsave} não encontrada` });
                }
            } else {
                await validateAndSave(obj);
            }
            if (!obj.transaction.finished)
                obj.transaction.rollback();
        } catch (err) {
            return application.fatal(res, err);
        }
    });

}