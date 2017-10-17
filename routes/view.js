var application = require('./application')
    , db = require('../models')
    , lodash = require('lodash')
    , moment = require('moment')
    , escape = require('escape-html')
    , reload = require('require-reload')(require)
    ;

var renderText = function (viewfield, register) {

    var value = register && register[viewfield.modelattribute.name] ? register[viewfield.modelattribute.name] : '';
    value = escape(value);

    var label = viewfield.modelattribute.label;
    if (viewfield.modelattribute.notnull) {
        label += '*';
    }
    var disabled = '';
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

var renderTextArea = function (viewfield, register) {

    var value = register && register[viewfield.modelattribute.name] ? register[viewfield.modelattribute.name] : '';
    value = escape(value);

    var json = application.modelattribute.parseTypeadd(viewfield.modelattribute.typeadd);

    var rows = 3;
    if (json && 'rows' in json) {
        rows = json.rows;
    }

    var label = viewfield.modelattribute.label;
    if (viewfield.modelattribute.notnull) {
        label += '*';
    }
    var disabled = '';
    if (viewfield.disabled) {
        disabled = 'disabled="disabled"';
    }

    return application.components.html.textarea({
        width: viewfield.width
        , label: label
        , name: viewfield.modelattribute.name
        , rows: rows
        , value: value
        , disabled: disabled
    });
}

var renderInteger = function (viewfield, register) {

    var value = register && Number.isInteger(parseInt(register[viewfield.modelattribute.name])) ? register[viewfield.modelattribute.name] : '';

    var label = viewfield.modelattribute.label;
    if (viewfield.modelattribute.notnull) {
        label += '*';
    }
    var disabled = '';
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

var renderDecimal = function (viewfield, register) {

    var value = register && register[viewfield.modelattribute.name] ? register[viewfield.modelattribute.name] : '';

    var json = application.modelattribute.parseTypeadd(viewfield.modelattribute.typeadd);
    precision = json.precision;
    if (value) {
        value = parseFloat(value);
        var reg = '\\d(?=(\\d{3})+\\D)';
        value = value.toFixed(json.precision).replace('.', ',').replace(new RegExp(reg, 'g'), '$&.');
    }

    var label = viewfield.modelattribute.label;
    if (viewfield.modelattribute.notnull) {
        label += '*';
    }
    var disabled = '';
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

var renderAutocomplete = function (viewfield, register) {

    var value = register && register[viewfield.modelattribute.name] ? register[viewfield.modelattribute.name] : '';
    var json = application.modelattribute.parseTypeadd(viewfield.modelattribute.typeadd);
    var datawhere = '';
    if ('where' in json) {
        datawhere = json.where;
    }

    var option = '';
    var vas = json.as || json.model;
    if (value && register[vas]) {
        option = '<option value="' + register[vas].id + '" selected>' + register[vas][json.attribute] + '</option>';
    }

    var label = viewfield.modelattribute.label;
    if (viewfield.modelattribute.notnull) {
        label += '*';
    }
    var disabled = '';
    if (viewfield.disabled) {
        disabled = 'disabled="disabled"';
    }

    return application.components.html.autocomplete({
        width: viewfield.width
        , label: label
        , name: viewfield.modelattribute.name
        , disabled: disabled
        , model: json.model
        , attribute: json.attribute
        , datawhere: datawhere
        , multiple: ''
        , option: option
    });
}

var renderDate = function (viewfield, register) {

    var value = register && register[viewfield.modelattribute.name] ? register[viewfield.modelattribute.name] : '';

    var label = viewfield.modelattribute.label;
    if (viewfield.modelattribute.notnull) {
        label += '*';
    }
    var disabled = '';
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

var renderDateTime = function (viewfield, register) {

    var value = register && register[viewfield.modelattribute.name] ? register[viewfield.modelattribute.name] : '';

    var label = viewfield.modelattribute.label;
    if (viewfield.modelattribute.notnull) {
        label += '*';
    }
    var disabled = '';
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

var renderTime = function (viewfield, register) {

    var value = register && register[viewfield.modelattribute.name] ? register[viewfield.modelattribute.name] : '';

    var label = viewfield.modelattribute.label;
    if (viewfield.modelattribute.notnull) {
        label += '*';
    }
    var disabled = '';
    if (viewfield.disabled) {
        disabled = 'disabled="disabled"';
    }

    if (value) {
        value = application.formatters.fe.time(value);
    }

    return application.components.html.time({
        width: viewfield.width
        , label: label
        , name: viewfield.modelattribute.name
        , value: value
        , disabled: disabled
    });
}

var renderCheckbox = function (viewfield, register) {

    var label = viewfield.modelattribute.label;
    var disabled = '';
    if (viewfield.disabled) {
        disabled = 'disabled="disabled"';
    }
    var checked = '';
    if (register && register[viewfield.modelattribute.name]) {
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

var renderFile = function (viewfield, register) {

    let value = register && register[viewfield.modelattribute.name] ? register[viewfield.modelattribute.name] : '';
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

var renderSubView = function (viewsubview) {
    return '<div class="col-md-' + viewsubview.width + '">'
        + '<h4 class="title_subview">' + viewsubview.description + '</h4>'
        + '<table '
        + 'id="tableview' + viewsubview.idsubview + '" '
        + 'class="table table-bordered table-hover dataTable" '
        + 'width="100%" '
        + 'data-subview="true" '
        + 'data-view="' + viewsubview.idsubview + '">'
        + '</table>'
        + '</div>';
}

var render = function (viewfield, register) {
    switch (viewfield.modelattribute.type) {
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
        case 'virtual':
            var j = application.modelattribute.parseTypeadd(viewfield.modelattribute.typeadd);
            return application.components.html.text({
                width: viewfield.width
                , label: viewfield.modelattribute.label
                , value: application.functions.getRealReference(register, j.field)
                , disabled: 'disabled="disabled"'
            });
            break;
    }
}

var merge = function (register, data) {
    for (var k in data) {
        if (register[k] != data[k]) {
            register[k] = data[k];
        }
    }
    return register;
}

var modelate = function (obj) {

    for (var i = 0; i < obj.modelattributes.length; i++) {

        switch (obj.modelattributes[i].type) {
            case 'date':
                if (obj.data[obj.modelattributes[i].name] != undefined) {
                    obj.data[obj.modelattributes[i].name] = application.formatters.be.date(obj.data[obj.modelattributes[i].name]);
                }
                break;
            case 'datetime':
                if (obj.data[obj.modelattributes[i].name] != undefined) {
                    obj.data[obj.modelattributes[i].name] = application.formatters.be.datetime(obj.data[obj.modelattributes[i].name]);
                }
                break;
            case 'time':
                if (obj.data[obj.modelattributes[i].name] != undefined) {
                    obj.data[obj.modelattributes[i].name] = application.formatters.be.time(obj.data[obj.modelattributes[i].name]);
                }
                break;
            case 'parent':
                if (obj.req.query.parent && obj.req.query.parent > 0) {
                    obj.data[obj.modelattributes[i].name] = parseInt(obj.req.query.parent);
                }
                break;
            case 'boolean':
                if (obj.data[obj.modelattributes[i].name]) {
                    obj.data[obj.modelattributes[i].name] = true;
                } else {
                    obj.data[obj.modelattributes[i].name] = false;
                }
                break;
            case 'integer':
                if (obj.data[obj.modelattributes[i].name] != undefined) {
                    obj.data[obj.modelattributes[i].name] = application.formatters.be.integer(obj.data[obj.modelattributes[i].name]);
                }
                break;
            case 'autocomplete':
                if (obj.data[obj.modelattributes[i].name]) {
                    obj.data[obj.modelattributes[i].name] = application.formatters.be.integer(obj.data[obj.modelattributes[i].name]);
                }
                break;
            case 'decimal':
                if (obj.data[obj.modelattributes[i].name]) {
                    obj.data[obj.modelattributes[i].name] = application.formatters.be.decimal(obj.data[obj.modelattributes[i].name], application.modelattribute.parseTypeadd(obj.modelattributes[i].typeadd).precision);
                }
                break;
        }
    }

    return obj;
}

var validate = async function (obj) {
    return new Promise((resolve, reject) => {

        var invalidfields = [];

        if (obj.id == 0) {

            for (var i = 0; i < obj.modelattributes.length; i++) {

                let j = application.modelattribute.parseTypeadd(obj.modelattributes[i].typeadd);

                // NotNull
                if (obj.modelattributes[i].type == 'boolean') {
                } else if (obj.modelattributes[i].notnull && obj.modelattributes[i].type == 'integer') {
                    if (!Number.isInteger(obj.data[obj.modelattributes[i].name])) {
                        invalidfields.push(obj.modelattributes[i].name);
                    }
                } else {
                    if (obj.modelattributes[i].notnull && !obj.data[obj.modelattributes[i].name]) {
                        invalidfields.push(obj.modelattributes[i].name);
                    }
                }

                // File
                if (obj.modelattributes[i].type == 'file') {
                    if (j.sizeTotal) {

                        if (obj.data[obj.modelattributes[i].name]) {
                            let filesize = 0;
                            let files = JSON.parse(obj.data[obj.modelattributes[i].name]);
                            for (var z = 0; z < files.length; z++) {
                                filesize += files[z].size;
                            }
                            console.log(filesize, (j.sizeTotal * 1024 * 1024));
                            if (filesize > (j.sizeTotal * 1024 * 1024)) {
                                return resolve({ success: false, msg: 'Tamanho máximo de arquivos excedido', invalidfields: [obj.modelattributes[i].name] });
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

        } else {

            db.getModel(obj.view.model.name).find({ where: { id: obj.id } }).then(register => {
                register = merge(register, obj.data);

                for (var i = 0; i < obj.modelattributes.length; i++) {

                    let j = application.modelattribute.parseTypeadd(obj.modelattributes[i].typeadd);

                    // NotNull
                    if (obj.modelattributes[i].type == 'boolean') {
                    } else if (obj.modelattributes[i].notnull && obj.modelattributes[i].type == 'integer') {
                        if (!Number.isInteger(register[obj.modelattributes[i].name])) {
                            invalidfields.push(obj.modelattributes[i].name);
                        }
                    } else {
                        if (obj.modelattributes[i].notnull && !register[obj.modelattributes[i].name]) {
                            invalidfields.push(obj.modelattributes[i].name);
                        }
                    }

                    // File
                    if (obj.modelattributes[i].type == 'file') {
                        if (j.sizeTotal) {

                            if (obj.data[obj.modelattributes[i].name]) {
                                let filesize = 0;
                                let files = JSON.parse(obj.data[obj.modelattributes[i].name]);
                                for (var z = 0; z < files.length; z++) {
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
    });
}

var boundFiles = function (obj) {
    let idsToBound = [];
    for (var i = 0; i < obj.modelattributes.length; i++) {
        if (obj.modelattributes[i].type == 'file' && obj.data[obj.modelattributes[i].name] != undefined) {

            let j = JSON.parse(obj.data[obj.modelattributes[i].name]);

            for (var z = 0; z < j.length; z++) {
                idsToBound.push(j[z].id);
            }

            if (idsToBound.length > 0) {
                db.getModel('file').update({ bounded: true }, { where: { id: { $in: idsToBound } } });
            }

        }
    }
}

var save = async function (obj) {
    return new Promise((resolve, reject) => {
        try {

            if (obj.id == 0) {
                db.getModel(obj.view.model.name).create(obj.data).then(register => {
                    boundFiles(lodash.extend(obj, { register: register }));
                    return resolve({ success: true, register: register });
                });
            } else {
                db.getModel(obj.view.model.name).find({ where: { id: obj.id } }).then(register => {
                    register = merge(register, obj.data);

                    if (register.changed()) {
                        let residueIds = [];
                        for (var i = 0; i < obj.modelattributes.length; i++) {
                            if (obj.modelattributes[i].type == 'file' && register._changed[obj.modelattributes[i].name]) {

                                let previousIds = [];
                                let currentIds = [];
                                let j = {};

                                // previous
                                j = register._previousDataValues[obj.modelattributes[i].name] ? JSON.parse(register._previousDataValues[obj.modelattributes[i].name]) : [];
                                for (var z = 0; z < j.length; z++) {
                                    previousIds.push(j[z].id);
                                }

                                // current
                                j = register[obj.modelattributes[i].name] ? JSON.parse(register[obj.modelattributes[i].name]) : [];
                                for (var z = 0; z < j.length; z++) {
                                    currentIds.push(j[z].id);
                                }

                                for (var z = 0; z < previousIds.length; z++) {
                                    if (currentIds.indexOf(previousIds[z]) > 0) {
                                        previousIds.splice(z, 1);
                                    }
                                }

                                if (previousIds.length > 0) {
                                    db.getModel('file').update({ bounded: false }, { where: { id: { $in: previousIds } } });
                                }
                            }
                        }
                    }

                    register.save().then(registersaved => {
                        boundFiles(lodash.extend(obj, { register: registersaved }));
                        return resolve({ success: true, register: registersaved });
                    });
                });
            }

        } catch (err) {
            resolve({ success: false });
        }
    });
}

var validateAndSave = function (obj) {
    return new Promise((resolve, reject) => {

        try {

            validate(obj).then(validation => {
                if (validation.success) {
                    save(obj).then(saved => {
                        if (saved.success) {
                            resolve({ success: true, register: saved.register });
                            return application.success(obj.res, {
                                msg: application.message.success
                                , data: saved.register
                                , redirect: '/view/' + obj.view.id + '/' + saved.register.id
                            });
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

        } catch (err) {


        }

    });
}

var onDeleteModel = function (json, next) {
    if (json.view.model.ondelete) {
        var custom = reload('../custom/functions');
        application.functions.getRealReference(custom, json.view.model.ondelete)(json, next);
    } else {
        next(json);
    }
}

var deleteModel = function (json) {

    db.getModel(json.view.model.name).destroy({ where: { id: { $in: json.ids } } }).then(() => {

        return application.success(json.res, { msg: application.message.success });

    }).catch(err => {

        return application.fatal(json.res, err);

    });

}

var hasPermission = function (iduser, idview) {
    return new Promise((resolve, reject) => {

        var permissionquery = 'select p.*, v.id as idview from permission p left join menu m on (p.idmenu = m.id) left join view v on (m.idview = v.id) where p.iduser = :iduser';

        var getChilds = function (idview, subviews) {
            var returnsubviews = [];

            for (var i = 0; i < subviews.length; i++) {

                if (idview == subviews[i].idview) {
                    returnsubviews.push(subviews[i].idsubview);
                    var moresubviews = getChilds(subviews[i].idsubview, subviews);
                    if (moresubviews.length > 0) {
                        returnsubviews.push(moresubviews);
                    }
                }

            }

            return returnsubviews;

        }

        db.sequelize.query(permissionquery, {
            replacements: { iduser: iduser }
            , type: db.sequelize.QueryTypes.SELECT
        }).then(permissions => {

            for (var i = 0; i < permissions.length; i++) {
                if (permissions[i].idview == idview) {
                    return resolve(permissions[i]);
                }
            }

            db.getModel('viewsubview').findAll({ raw: true }).then(subviews => {

                for (var i = 0; i < permissions.length; i++) {
                    permissions[i].childs = getChilds(permissions[i].idview, subviews);

                    for (var x = 0; x < permissions[i].childs.length; x++) {

                        if (permissions[i].childs[x] == idview) {
                            return resolve(permissions[i]);
                        }

                    }

                }

                return reject();

            }).catch(err => {
                console.error(err);
                return reject();
            });

        });

    });
}

module.exports = function (app) {

    app.get('/view/:idview/config', application.IsAuthenticated, async (req, res) => {

        var decodeClass = function (type) {
            switch (type) {
                case 'decimal':
                    return 'text-right'
                case 'time':
                    return 'text-right'
                default:
                    return 'text-left';
            }
        }

        try {
            let permission = await hasPermission(req.user.id, req.params.idview);
            if (permission.visible) {

                let view = await db.getModel('view').find({ where: { id: req.params.idview } });
                let viewtables = await db.getModel('viewtable').findAll({
                    where: { idview: view.id }
                    , order: [['ordertable', 'ASC']]
                    , include: [{ all: true }]
                });
                let viewfields = await db.getModel('viewfield').findAll({
                    where: { idview: view.id }
                    , order: [['order', 'ASC']]
                    , include: [{ all: true }]
                });
                let viewevents = await db.getModel('viewevent').findAll({
                    where: { idview: view.id }
                    , order: [['description', 'ASC']]
                    , include: [{ all: true }]
                });

                var events = [];
                var columns = [];
                var needfooter = false;
                var footer = '';
                var permissions = {};
                var filter = '';

                // Permissions
                permissions.insertable = permission.insertable;
                permissions.editable = permission.editable;
                permissions.deletable = permission.deletable;

                // Events
                for (var i = 0; i < viewevents.length; i++) {

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
                    });
                }
                for (var i = 0; i < viewtables.length; i++) {

                    columns.push({
                        title: viewtables[i].modelattribute.label
                        , data: viewtables[i].modelattribute.name
                        , name: viewtables[i].modelattribute.name
                        , orderable: viewtables[i].orderable
                        , render: viewtables[i].render
                        , class: decodeClass(viewtables[i].modelattribute.type)
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
                    for (var i = 0; i < viewtables.length; i++) {
                        var data = 'data-view="' + view.id + '" data-attribute="' + viewtables[i].modelattribute.id + '"';
                        if (viewtables[i].totalize) {
                            footer += '<td> <span class="totalize" ' + data + '></span> </td>';
                        } else {
                            footer += '<td></td>';
                        }
                    }
                    footer += '</tr></tfoot>';
                }

                //Filter
                var getFilterValue = function (name, cookiefilter) {
                    if (name in cookiefilter) {
                        return cookiefilter[name];
                    } else {
                        return '';
                    }
                }
                var cookiefilter = {};
                var cookiefiltercount = 0;
                if ('tableview' + view.id + 'filter' in req.cookies) {
                    var cookiefilteraux = JSON.parse(req.cookies['tableview' + view.id + 'filter']);
                    cookiefiltercount = cookiefilteraux.length;
                    for (var i = 0; i < cookiefilteraux.length; i++) {
                        for (var k in cookiefilteraux[i]) {
                            cookiefilter[k] = cookiefilteraux[i][k];
                        }
                    }
                }

                var separator = '+';

                if (!view.supressid) {

                    filter += application.components.html.integer({
                        width: 4
                        , label: 'ID'
                        , name: 'id' + separator + 'integer' + separator + 'r'
                        , value: getFilterValue('id.integer.r', cookiefilter)
                    });

                    filter += application.components.html.integer({
                        width: 4
                        , label: 'ID - Inicial'
                        , name: 'id' + separator + 'integer' + separator + 'b'
                        , value: getFilterValue('id.integer.b', cookiefilter)
                    });

                    filter += application.components.html.integer({
                        width: 4
                        , label: 'ID - Final'
                        , name: 'id.integer.e'
                        , value: getFilterValue('id.integer.e', cookiefilter)
                    });
                }

                for (var i = 0; i < viewfields.length; i++) {

                    var filtername = viewfields[i].modelattribute.name + separator + viewfields[i].modelattribute.type;

                    var json = {};
                    if (viewfields[i].modelattribute.typeadd) {
                        json = application.modelattribute.parseTypeadd(viewfields[i].modelattribute.typeadd);
                    }

                    switch (viewfields[i].modelattribute.type) {
                        case 'text':

                            filtername += separator + 's';
                            filter += application.components.html.text({
                                width: 12
                                , label: viewfields[i].modelattribute.label
                                , name: filtername
                                , value: getFilterValue(filtername, cookiefilter)
                            });

                            break;

                        case 'textarea':

                            filtername += separator + 's';
                            filter += application.components.html.text({
                                width: 12
                                , label: viewfields[i].modelattribute.label
                                , name: filtername
                                , value: getFilterValue(filtername, cookiefilter)
                            });

                            break;

                        case 'integer':

                            var filtereq = filtername + separator + 'r';
                            var filterbegin = filtername + separator + 'b';
                            var filterend = filtername + separator + 'e';

                            filter += application.components.html.integer({
                                width: 4
                                , label: viewfields[i].modelattribute.label
                                , name: filtereq
                                , value: getFilterValue(filtereq, cookiefilter)
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

                            var filterbegin = filtername + separator + 'b';
                            var filterend = filtername + separator + 'e';

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

                            var filterbegin = filtername + separator + 'b';
                            var filterend = filtername + separator + 'e';

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

                            var filterbegin = filtername + separator + 'b';
                            var filterend = filtername + separator + 'e';

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

                            var filterbegin = filtername + separator + 'b';
                            var filterend = filtername + separator + 'e';

                            filter += application.components.html.decimal({
                                width: 6
                                , label: viewfields[i].modelattribute.label + ' - Inicial'
                                , name: filterbegin
                                , value: getFilterValue(filterbegin, cookiefilter)
                                , precision: json.precision
                            });

                            filter += application.components.html.decimal({
                                width: 6
                                , label: viewfields[i].modelattribute.label + ' - Final'
                                , name: filterend
                                , value: getFilterValue(filterend, cookiefilter)
                                , precision: json.precision
                            });

                            break;

                        case 'autocomplete':

                            filtername += separator + 'i';
                            filter += application.components.html.autocomplete({
                                width: 12
                                , label: viewfields[i].modelattribute.label
                                , name: filtername
                                , disabled: ''
                                , model: json.model
                                , attribute: json.attribute
                                , datawhere: json.where || ''
                                , multiple: 'multiple="multiple"'
                                , option: getFilterValue(filtername, cookiefilter).options || ''
                            });

                            break;

                        case 'boolean':

                            var name = viewfields[i].modelattribute.name;
                            var type = viewfields[i].modelattribute.type;
                            var label = viewfields[i].modelattribute.label;
                            filtername = name + separator + type + separator + 'r';
                            var value = getFilterValue(filtername, cookiefilter);

                            var html = '<div class="col-md-12">'
                                + '<div class="form-group">'
                                + '<label>' + label + '</label>'
                                + '<div class="row">'
                                + '<div class="col-xs-4">'
                                + '<label>'
                                + '<input type="radio" name="' + filtername + '" value="" ' + (value == '' ? 'checked="checked"' : '') + '>'
                                + ' Todos'
                                + '</label>'
                                + '</div>'
                                + '<div class="col-xs-4">'
                                + '<label>'
                                + '<input type="radio" name="' + filtername + '" value="true" ' + (value == 'true' ? 'checked="checked"' : '') + '>'
                                + ' Sim'
                                + '</label>'
                                + '</div>'
                                + '<div class="col-xs-4">'
                                + '<label>'
                                + '<input type="radio" name="' + filtername + '" value="false" ' + (value == 'false' ? 'checked="checked"' : '') + '>'
                                + ' Não'
                                + '</label>'
                                + '</div>'
                                + '</div>'
                                + '</div>'
                                + '</div>';

                            filter += html;

                            break;

                        case 'virtual':
                            filtername = json.field + separator + json.type;
                            switch (json.type) {
                                case 'text':

                                    filtername += separator + 'sv';
                                    filter += application.components.html.text({
                                        width: 12
                                        , label: viewfields[i].modelattribute.label
                                        , name: filtername
                                        , value: getFilterValue(filtername, cookiefilter)
                                    });

                                    break;
                                case 'integer':

                                    var filtereq = filtername + separator + 'rv';
                                    var filterbegin = filtername + separator + 'bv';
                                    var filterend = filtername + separator + 'ev';

                                    filter += application.components.html.integer({
                                        width: 4
                                        , label: viewfields[i].modelattribute.label
                                        , name: filtereq
                                        , value: getFilterValue(filtereq, cookiefilter)
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
                            }

                            break;
                    }

                }

                return application.success(res, {
                    name: view.id
                    , columns: columns
                    , footer: footer
                    , events: events
                    , permissions: permissions
                    , filter: {
                        count: cookiefiltercount
                        , html: filter
                    }
                });

            } else {
                return application.forbidden(res);
            }
        } catch (err) {
            return application.fatal(res, err);
        }

    });

    app.get('/view/:idview', application.IsAuthenticated, async (req, res) => {

        try {
            let permission = await hasPermission(req.user.id, req.params.idview);
            if (permission.visible) {

                let view = await db.getModel('view').find({ where: { id: req.params.idview } });

                return application.render(res, 'templates/viewtable', {
                    title: view.name
                    , viewid: view.id
                });

            } else {
                return application.forbidden(res);
            }
        } catch (err) {
            return application.forbidden(res);
        }

    });

    app.get('/view/:idview/:id', application.IsAuthenticated, async (req, res) => {

        try {
            let permission = await hasPermission(req.user.id, req.params.idview);
            if (permission.visible) {

                let view = await db.getModel('view').find({ where: { id: req.params.idview }, include: [{ all: true }] });
                let viewfields = await db.getModel('viewfield').findAll({
                    where: { idview: view.id }
                    , order: [['idtemplatezone', 'ASC'], ['order', 'ASC']]
                    , include: [{ all: true }]
                });

                let register = await db.getModel(view.model.name).find({ where: { id: req.params.id }, include: [{ all: true, nested: view.virtual }] });
                if (!register && req.params.id != 0) {
                    return application.render(res, 'templates/viewregisternotfound');
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

                return application.render(res, 'templates/viewregister', lodash.extend({
                    template: view.template.name
                    , title: view.name
                    , id: register ? register.id : ''
                }, zoneobj));

            } else {
                return application.forbidden(res);
            }
        } catch (err) {
            return application.forbidden(res);
        }

    });

    app.post('/view/:idview/delete', application.IsAuthenticated, function (req, res) {

        hasPermission(req.user.id, req.params.idview).then(permission => {

            if (permission.deletable) {

                var ids = req.body.ids.split(',');

                if (ids) {

                    db.getModel('view').find({ where: { id: req.params.idview }, include: [{ model: db.getModel('model'), as: 'model' }] }).then(view => {
                        if (view) {

                            onDeleteModel({
                                view: view
                                , res: res
                                , req: req
                                , ids: ids
                            }, deleteModel);

                        } else {
                            return application.fatal(res, 'View not found');
                        }
                    }).catch(err => {
                        return application.error(res, {});
                    });

                } else {
                    return application.fatal(res, 'ids not given');
                }

            } else {

                return application.error(res, { msg: application.message.permissionDenied });

            }

        }).catch(err => {

            if (err == 403) {
                return application.error(res, { msg: application.message.permissionDenied });
            } else {
                return application.fatal(res, err);
            }

        });

    });

    app.post('/view/:idview/:id', application.IsAuthenticated, async (req, res) => {

        try {
            let permission = await hasPermission(req.user.id, req.params.idview);
            if ((req.params.id == 0 && permission.insertable) || (req.params.id > 0 && permission.editable)) {

                let view = await db.getModel('view').find({ where: { id: req.params.idview }, include: [{ all: true }] });
                let modelattributes = await db.getModel('modelattribute').findAll({ where: { idmodel: view.model.id } });
                let viewfields = await db.getModel('viewfield').findAll({
                    where: { idview: view.id, disabled: { $eq: false } }
                    , include: [{ model: db.getModel('modelattribute'), as: 'modelattribute' }]
                });

                let data = {};
                for (var i = 0; i < viewfields.length; i++) {
                    data[viewfields[i].modelattribute.name] = req.body[viewfields[i].modelattribute.name] || null;
                }

                let obj = modelate({
                    id: req.params.id
                    , data: data
                    , modelattributes: modelattributes
                    , view: view
                    , req: req
                    , res: res
                });

                if (view.model.onsave) {

                    let custom = reload('../custom/functions');
                    return application.functions.getRealReference(custom, view.model.onsave)(obj, validateAndSave);
                } else {

                    validateAndSave(obj);

                }

            } else {
                return application.error(res, { msg: application.message.permissionDenied });
            }

        } catch (err) {

            return application.error(res, { msg: err });
        }

    });

}