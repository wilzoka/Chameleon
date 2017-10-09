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
        datawhere = 'data-where="' + json.where + '"';
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

var mergeModel = function (register, data) {
    for (var k in data) {
        register[k] = data[k];
    }
    return register;
}

var flowModel = function (json) {
    modelateModel(json);
}

var modelateModel = function (json) {
    // Adjust json.data 
    for (var i = 0; i < json.modelattributes.length; i++) {

        switch (json.modelattributes[i].type) {
            case 'date':
                if (json.data[json.modelattributes[i].name] != undefined) {
                    json.data[json.modelattributes[i].name] = application.formatters.be.date(json.data[json.modelattributes[i].name]);
                }
                break;
            case 'datetime':
                if (json.data[json.modelattributes[i].name] != undefined) {
                    json.data[json.modelattributes[i].name] = application.formatters.be.datetime(json.data[json.modelattributes[i].name]);
                }
                break;
            case 'time':
                if (json.data[json.modelattributes[i].name] != undefined) {
                    json.data[json.modelattributes[i].name] = application.formatters.be.time(json.data[json.modelattributes[i].name]);
                }
                break;
            case 'parent':
                if (json.req.query.parent && json.req.query.parent > 0) {
                    json.data[json.modelattributes[i].name] = parseInt(json.req.query.parent);
                }
                break;
            case 'boolean':
                if (json.data[json.modelattributes[i].name]) {
                    json.data[json.modelattributes[i].name] = true;
                } else {
                    json.data[json.modelattributes[i].name] = false;
                }
                break;
            case 'integer':
                if (json.data[json.modelattributes[i].name] != undefined) {
                    json.data[json.modelattributes[i].name] = application.formatters.be.integer(json.data[json.modelattributes[i].name]);
                }
                break;
            case 'autocomplete':
                if (json.data[json.modelattributes[i].name]) {
                    json.data[json.modelattributes[i].name] = application.formatters.be.integer(json.data[json.modelattributes[i].name]);
                }
                break;
            case 'decimal':
                if (json.data[json.modelattributes[i].name]) {
                    json.data[json.modelattributes[i].name] = application.formatters.be.decimal(json.data[json.modelattributes[i].name], application.modelattribute.parseTypeadd(json.modelattributes[i].typeadd).precision);
                }
                break;
        }
    }

    onSaveModel(json, validateModel);
}

var onSaveModel = function (json, next) {
    if (json.view.model.onsave) {
        var custom = reload('../custom/functions');
        application.functions.getRealReference(custom, json.view.model.onsave)(json, next);
    } else {
        next(json);
    }
}

var validateModel = function (json) {
    return new Promise((resolve, reject) => {

        // #invalidfields contains the name fields invalid
        var invalidfields = [];

        if (json.id == 0) {
            // Validade with data
            for (var i = 0; i < json.modelattributes.length; i++) {

                // Not Null validate
                if (json.modelattributes[i].type == 'boolean') {
                } else if (json.modelattributes[i].notnull && json.modelattributes[i].type == 'integer') {
                    if (!Number.isInteger(json.data[json.modelattributes[i].name])) {
                        invalidfields.push(json.modelattributes[i].name);
                    }
                } else {
                    if (json.modelattributes[i].notnull && !json.data[json.modelattributes[i].name]) {
                        invalidfields.push(json.modelattributes[i].name);
                    }
                }

            }

            if (invalidfields.length > 0) {
                reject();
                return application.error(json.res, {
                    invalidfields: invalidfields
                    , msg: application.message.invalidFields
                });
            } else {
                resolve(saveModel(json));
            }

        } else {
            // Validate with data merged with already exists
            db.getModel(json.view.model.name).find({ where: { id: json.id } }).then(register => {
                register = mergeModel(register, json.data);

                for (var i = 0; i < json.modelattributes.length; i++) {

                    // Not Null Validate
                    if (json.modelattributes[i].type == 'boolean') {
                    } else if (json.modelattributes[i].notnull && json.modelattributes[i].type == 'integer') {
                        if (!Number.isInteger(register[json.modelattributes[i].name])) {
                            invalidfields.push(json.modelattributes[i].name);
                        }
                    } else {
                        if (json.modelattributes[i].notnull && !register[json.modelattributes[i].name]) {
                            invalidfields.push(json.modelattributes[i].name);
                        }
                    }

                }

                if (invalidfields.length > 0) {
                    reject();
                    return application.error(json.res, {
                        invalidfields: invalidfields
                        , msg: application.message.invalidFields
                    });
                } else {
                    resolve(saveModel(json));
                }

            }).catch(err => {
                reject();
                return application.fatal(json.res, err);
            });
        }
    });
}

var saveModel = function (json) {
    return new Promise((resolve, reject) => {
        if (json.id == 0) {
            // Inserting
            db.getModel(json.view.model.name).create(json.data).then(register => {
                application.success(json.res, {
                    msg: application.message.success
                    , data: register
                    , redirect: '/view/' + json.view.id + '/' + register.id
                });
                resolve(register);
            }).catch(err => {
                reject(err);
                return application.fatal(json.res, err);
            });
        } else {
            // Updating
            db.getModel(json.view.model.name).find({ where: { id: json.id } }).then(register => {
                register = mergeModel(register, json.data);
                register.save().then(registersaved => {
                    application.success(json.res, {
                        msg: application.message.success
                        , data: registersaved
                    });
                    resolve(registersaved);
                });
            }).catch(err => {
                reject(err);
                return application.fatal(json.res, err);
            });
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

    return new Promise(
        function (resolve, reject) {

            db.sequelize.query(permissionquery, {
                replacements: { iduser: iduser }
                , type: db.sequelize.QueryTypes.SELECT
            }).then(permissions => {

                for (var i = 0; i < permissions.length; i++) {
                    if (permissions[i].idview == idview) {
                        resolve(permissions[i]);
                    }
                }

                db.getModel('viewsubview').findAll({ raw: true }).then(subviews => {

                    for (var i = 0; i < permissions.length; i++) {
                        permissions[i].childs = getChilds(permissions[i].idview, subviews);

                        for (var x = 0; x < permissions[i].childs.length; x++) {

                            if (permissions[i].childs[x] == idview) {
                                resolve(permissions[i]);
                            }

                        }

                    }

                    reject(403);

                }).catch(err => {

                    reject(err);

                });

            });

        });
}

module.exports = function (app) {

    app.get('/view/:idview/config', application.IsAuthenticated, function (req, res) {

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

        hasPermission(req.user.id, req.params.idview).then(permission => {

            if (permission.visible) {

                db.getModel('view').find({
                    where: { id: req.params.idview }
                    , include: [{ all: true }]
                }).then(view => {

                    db.getModel('viewtable').findAll({
                        where: { idview: view.id }
                        , order: [['ordertable', 'ASC']]
                        , include: [{ all: true }]
                    }).then(viewtables => {

                        db.getModel('viewfield').findAll({
                            where: { idview: view.id }
                            , order: [['order', 'ASC']]
                            , include: [{ all: true }]
                        }).then(viewfields => {

                            db.getModel('viewevent').findAll({
                                where: { idview: view.id }
                                , order: [['description', 'ASC']]
                                , include: [{ all: true }]
                            }).then(viewevents => {

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
                                                , datawhere: json.where
                                                , multiple: 'multiple="multiple"'
                                                , option: getFilterValue(filtername, cookiefilter).options
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

                            });

                        });

                    });

                });

            } else {

                return application.error(res, {});

            }
        }).catch(err => {

            if (err == 403) {
                return application.forbidden(res);
            } else {
                return application.fatal(res, err);
            }

        });

    });

    app.get('/view/:idview', application.IsAuthenticated, function (req, res) {

        hasPermission(req.user.id, req.params.idview).then(permission => {
            if (permission.visible) {

                db.getModel('view').find({ where: { id: req.params.idview } }).then(view => {
                    return application.render(res, 'templates/viewtable', {
                        title: view.name
                        , viewid: view.id
                    });
                });

            } else {

                return application.forbidden(res);

            }
        }).catch(err => {

            if (err == 403) {
                return application.forbidden(res);
            } else {
                return application.fatal(res, err);
            }

        });

    });

    app.get('/view/:idview/:id', application.IsAuthenticated, function (req, res) {

        hasPermission(req.user.id, req.params.idview).then(permission => {

            if (permission.visible) {

                // Find the requested view
                db.getModel('view').find({
                    where: { id: req.params.idview }
                    , include: [{ model: db.getModel('template'), as: 'template' }, { model: db.getModel('model'), as: 'model' }]
                }).then(view => {

                    // Find all fields of the View 
                    // order by template zone and 
                    // the order inside zone
                    db.getModel('viewfield').findAll({
                        where: { idview: view.id }
                        , order: [['idtemplatezone', 'ASC'], ['order', 'ASC']]
                        , include: [
                            { model: db.getModel('templatezone'), as: 'templatezone' }
                            , { model: db.getModel('modelattribute'), as: 'modelattribute' }
                        ]
                    }).then(viewfields => {
                        db.getModel(view.model.name).find({ where: { id: req.params.id }, include: [{ all: true, nested: view.virtual }] }).then(register => {
                            if (!register && req.params.id != 0) {
                                return application.render(res, 'templates/viewregisternotfound');
                            }
                            // #zoneobj contains the final html rendered
                            // for that zone
                            var zoneobj = {};
                            for (var i = 0; i < viewfields.length; i++) {
                                // Initialize the zone for the first time
                                if (!zoneobj[viewfields[i].templatezone.name]) {
                                    zoneobj[viewfields[i].templatezone.name] = '';
                                }
                                zoneobj[viewfields[i].templatezone.name] += render(viewfields[i], register);
                            }

                            db.getModel('viewsubview').findAll({
                                where: { idview: view.id }
                                , include: [{ all: true }]
                            }).then(viewsubviews => {
                                if (viewsubviews.length > 0) {

                                    for (var i = 0; i < viewsubviews.length; i++) {
                                        if (!zoneobj[viewsubviews[i].templatezone.name]) {
                                            zoneobj[viewsubviews[i].templatezone.name] = '';
                                        }
                                        zoneobj[viewsubviews[i].templatezone.name] += renderSubView(viewsubviews[i]);
                                    }

                                }

                                db.getModel('templatezone').findAll({
                                    where: { idtemplate: view.template.id }
                                }).then(templatezones => {

                                    // Fill empty zones with blank
                                    for (var i = 0; i < templatezones.length; i++) {
                                        if (!zoneobj[templatezones[i].name]) {
                                            zoneobj[templatezones[i].name] = '';
                                        }
                                    }

                                    // Render the requested view
                                    return application.render(res, 'templates/viewregister', lodash.extend({
                                        template: view.template.name
                                        , title: view.name
                                        , id: register ? register.id : ''
                                    }, zoneobj));
                                });
                            });
                        });
                    });

                });

            } else {

                return application.forbidden(res);

            }

        }).catch(err => {

            if (err == 403) {
                return application.forbidden(res);
            } else {
                return application.fatal(res, err);
            }

        });

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

    app.post('/view/:idview/:id', application.IsAuthenticated, function (req, res) {

        hasPermission(req.user.id, req.params.idview).then(permission => {

            if ((req.params.id == 0 && permission.insertable) || (req.params.id > 0 && permission.editable)) {

                // Find request view
                db.getModel('view').find({ where: { id: req.params.idview }, include: [{ model: db.getModel('model'), as: 'model' }] }).then(view => {
                    if (view) {

                        // Find attributes from model
                        db.getModel('modelattribute').findAll({ where: { idmodel: view.model.id } }).then(modelattributes => {

                            // Find fields from view
                            db.getModel('viewfield').findAll({
                                where: { idview: view.id, disabled: { $eq: false } }
                                , include: [{ model: db.getModel('modelattribute'), as: 'modelattribute' }]
                            }).then(viewfields => {

                                // #data contains attributes defined for the view
                                // with posted data
                                var data = {};

                                // Merge posted data with view's fields
                                for (var i = 0; i < viewfields.length; i++) {
                                    data[viewfields[i].modelattribute.name] = req.body[viewfields[i].modelattribute.name] || null;
                                }

                                // Validate ID parameter, must be equals or greater then 0
                                if (req.params.id >= 0) {

                                    flowModel({
                                        view: view
                                        , data: data
                                        , res: res
                                        , req: req
                                        , id: req.params.id
                                        , modelattributes: modelattributes
                                    });

                                } else {
                                    return application.error(res);
                                }

                            });

                        });

                    } else {
                        return application.fatal(res, 'View not found');
                    }

                });

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

}