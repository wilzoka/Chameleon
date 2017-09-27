var db = require('../models')
	, lodash = require('lodash')
	;

exports.IsAuthenticated = function (req, res, next) {
	if (req.isAuthenticated()) {
		next();
	} else {
		res.redirect('/login');
	}
}

exports.success = function (res, json) {
	res.json(lodash.extend({ success: true }, json));
}

exports.fatal = function (res, err) {
	console.error(err);
	res.status(500).json({});
}

exports.error = function (res, json) {
	res.json(lodash.extend({ success: false }, json));
}

exports.render = function (res, template, json) {
	res.render(template, lodash.extend({}, json));
}

exports.forbidden = function (res) {
	res.status(403).render('403');
}

exports.notFound = function (res) {
	res.status(404).render('404');
}

exports.message = {
	success: 'Ação realizada com sucesso'
	, invalidFields: 'Informe os campos em vermelho'
	, selectOneEvent: 'Selecione um registro para esta executar este evento'
	, permissionDenied: 'Você não tem permissão para executar esta ação'
}

exports.sequelize = {
	decodeType: function (Sequelize, datatype) {
		switch (datatype) {
			case 'text':
				return Sequelize.TEXT;
			case 'textarea':
				return Sequelize.TEXT;
			case 'date':
				return Sequelize.DATEONLY;
			case 'datetime':
				return Sequelize.DATE;
			case 'time':
				return Sequelize.INTEGER;
			case 'parent':
				return Sequelize.INTEGER;
			case 'autocomplete':
				return Sequelize.INTEGER;
			case 'boolean':
				return Sequelize.BOOLEAN;
			case 'integer':
				return Sequelize.INTEGER;
			case 'decimal':
				return Sequelize.DECIMAL;
		}
	}
}

exports.menu = {
	createGroup: function (menu) {
		icon = menu.icon;
		description = menu.description;

		if (icon) {
			icon = '<i class="' + icon + '"></i> ';
		} else {
			icon = '';
		}

		return '<li class="treeview">'
			+ '<a href="#">'
			+ icon
			+ '<span>' + description + '</span>'
			+ '<span class="pull-right-container">'
			+ '<i class="fa fa-angle-left pull-right"></i>'
			+ '</span>'
			+ '</a>'
			+ '<ul class="treeview-menu">'
			;
	}
	, createItem: function (menu) {
		icon = menu.icon;
		description = menu.description;
		url = menu.url || '/view/' + menu['view.id'];

		if (icon) {
			icon = '<i class="' + icon + '"></i> ';
		} else {
			icon = '';
		}

		return '<li><a href="' + url + '">' + icon + description + ' </a></li>';
	}
	, closeGroup: function () {
		return '</ul>'
			+ '</li >'
			;
	}
	, renderMenu: function (menu) {
		var html = '';
		if ('children' in menu) {
			html = exports.menu.createGroup(menu);
			for (var i = 0; i < menu.children.length; i++) {

				html += exports.menu.renderMenu(menu.children[i]);

			}
			html += exports.menu.closeGroup();
		} else {
			html = exports.menu.createItem(menu);
		}
		return html;
	}
	, getChilds: function (idmenu, childs, permissionarr) {
		var returnchilds = [];
		for (var i = 0; i < childs.length; i++) {
			if (childs[i].idmenuparent == idmenu) {
				if (childs[i].url || childs[i].idview) {

					if (permissionarr.indexOf(childs[i].id) >= 0) {
						returnchilds.push(childs[i]);
					}

				} else {

					childs[i].children = exports.menu.getChilds(childs[i].id, childs, permissionarr);
					if (childs[i].children.length > 0) {
						returnchilds.push(childs[i]);
					}

				}
			}
		}
		return returnchilds;
	}
}

exports.formatters = {
	be: {
		decimal: function (value, precision) {
			value = value.replace(/\./g, "");
			value = value.replace(/\,/g, ".");
			return parseFloat(value).toFixed(precision);
		}
		, time: function (value) {
			if (value.indexOf(':') >= 0) {
				value = value.split(':');
				let h = parseInt(value[0]);
				let m = parseInt(value[1]);
				return parseInt((h * 60) + m);
			} else {
				return parseInt(value);
			}
		}
	}
	, fe: {
		time: function (value) {
			let v = value / 60;
			let integer = parseInt(v);
			let decimal = parseInt(Math.round((v - integer) * 60, 2));
			let integerlength = integer.toString().length;
			if (integerlength < 2) {
				integerlength = 2;
			}
			return exports.functions.lpad(integer, integerlength, '0') + ':' + exports.functions.lpad(decimal, 2, '0');
		}
		, decimal: function (value, precision) {
			value = parseFloat(value);
			var reg = '\\d(?=(\\d{3})+\\D)';
			return value.toFixed(precision).replace('.', ',').replace(new RegExp(reg, 'g'), '$&.');
		}
	}

}

exports.functions = {
	getRealFunction: function (object, string) {
		try {
			var functionsplited = string.split('.');
			var realfunction = object[functionsplited[0]];
			for (var i = 1; i < functionsplited.length; i++) {
				realfunction = realfunction[functionsplited[i]];
			}
			return realfunction;
		} catch (error) {
			return undefined;
		}
	}
	, lpad: function (value, length, string) {
		string = string || ' ';
		length = length - value.toString().length;
		for (var i = 0; i < length; i++) {
			value = string + value;
		}
		return value;
	}
	, rpad: function (value, length, string) {
		string = string || ' ';
		length = length - value.toString().length;
		for (var i = 0; i < length; i++) {
			value = value + string;
		}
		return value;
	}
}

exports.model = {
	save: function (model, register) {
		if ('id' in register && register.id > 0) {
			return register.save();
		} else {
			return db.getModel(model).create(register);
		}
	}
	, delete: function (model, ids) {
		return db.getModel(model).destroy({ where: { id: { $in: ids } } });
	}
}

exports.components = {
	html: {
		hidden: function (obj) {
			obj = lodash.extend({
				name: ''
				, value: ''
			}, obj);

			return '<input name="' + obj.name + '" type="hidden" value="' + obj.value + '">';
		}
		, text: function (obj) {
			obj = lodash.extend({
				width: ''
				, label: ''
				, name: ''
				, value: ''
				, disabled: ''
			}, obj);

			return '<div class="col-md-' + obj.width + '">'
				+ '<div class="form-group">'
				+ '<label>' + obj.label + '</label>'
				+ '<input name="' + obj.name + '" type="text" class="form-control" value="' + obj.value + '" '
				+ 'data-type="text" '
				+ obj.disabled
				+ '></div>'
				+ '</div>';
		}
		, textarea: function (obj) {
			obj = lodash.extend({
				width: ''
				, label: ''
				, name: ''
				, rows: ''
				, value: ''
				, disabled: ''
			}, obj);

			return '<div class="col-md-' + obj.width + '">'
				+ '<div class="form-group">'
				+ '<label>' + obj.label + '</label>'
				+ '<textarea name="' + obj.name + '" rows="' + obj.rows + '" class="form-control" data-type="textarea" '
				+ obj.disabled
				+ '>'
				+ obj.value
				+ '</textarea>'
				+ '</div>'
				+ '</div>';
		}
		, integer: function (obj) {
			obj = lodash.extend({
				width: ''
				, label: ''
				, name: ''
				, value: ''
				, disabled: ''
			}, obj);

			return '<div class="col-md-' + obj.width + '">'
				+ '<div class="form-group">'
				+ '<label>' + obj.label + '</label>'
				+ '<input name="' + obj.name + '" type="text" class="form-control" value="' + obj.value + '" '
				+ 'data-type="integer" '
				+ obj.disabled
				+ '></div>'
				+ '</div>';
		}
		, decimal: function (obj) {
			obj = lodash.extend({
				width: ''
				, label: ''
				, name: ''
				, value: ''
				, precision: '2'
				, disabled: ''
			}, obj);

			return '<div class="col-md-' + obj.width + '">'
				+ '<div class="form-group">'
				+ '<label>' + obj.label + '</label>'
				+ '<input name="' + obj.name + '" type="text" class="form-control" value="' + obj.value + '" '
				+ 'data-type="decimal" '
				+ 'data-precision="' + obj.precision + '" '
				+ obj.disabled
				+ '></div>'
				+ '</div>';
		}
		, autocomplete: function (obj) {
			obj = lodash.extend({
				width: ''
				, label: ''
				, name: ''
				, disabled: ''
				, model: ''
				, attribute: ''
				, datawhere: ''
				, multiple: ''
				, option: ''
			}, obj);

			return '<div class="col-md-' + obj.width + '">'
				+ '<div class="form-group">'
				+ '<label>' + obj.label + '</label>'
				+ '<select name="' + obj.name + '" class="form-control select2" ' + obj.disabled
				+ 'style="width: 100%;" '
				+ 'data-type="autocomplete" '
				+ 'data-model="' + obj.model + '" '
				+ 'data-attribute="' + obj.attribute + '" '
				+ obj.datawhere + ' '
				+ obj.multiple + '>'
				+ obj.option
				+ '</select></div>'
				+ '</div>';
		}
		, date: function (obj) {
			obj = lodash.extend({
				width: ''
				, label: ''
				, name: ''
				, value: ''
				, disabled: ''
			}, obj);

			return '<div class="col-md-' + obj.width + '">'
				+ '<div class="form-group">'
				+ '<label>' + obj.label + '</label>'
				+ '<input name="' + obj.name + '" type="text" class="form-control" value="' + obj.value + '" '
				+ 'data-type="date" '
				+ 'placeholder="dd/mm/aaaa" '
				+ obj.disabled
				+ '></div>'
				+ '</div>';
		}
		, datetime: function (obj) {
			obj = lodash.extend({
				width: ''
				, label: ''
				, name: ''
				, value: ''
				, disabled: ''
			}, obj);

			return '<div class="col-md-' + obj.width + '">'
				+ '<div class="form-group">'
				+ '<label>' + obj.label + '</label>'
				+ '<input name="' + obj.name + '" type="text" class="form-control" value="' + obj.value + '" '
				+ 'data-type="datetime" '
				+ 'placeholder="dd/mm/aaaa hh:mm" '
				+ obj.disabled
				+ '></div>'
				+ '</div>';
		}
		, time: function (obj) {
			obj = lodash.extend({
				width: ''
				, label: ''
				, name: ''
				, value: ''
				, disabled: ''
			}, obj);

			return '<div class="col-md-' + obj.width + '">'
				+ '<div class="form-group">'
				+ '<label>' + obj.label + '</label>'
				+ '<input name="' + obj.name + '" type="text" class="form-control" value="' + obj.value + '" '
				+ 'data-type="time" '
				+ 'placeholder="hh:mm" '
				+ obj.disabled
				+ '></div>'
				+ '</div>';
		}
		, checkbox: function (obj) {
			obj = lodash.extend({
				width: ''
				, name: ''
				, checked: ''
				, label: ''
				, disabled: ''
			}, obj);

			return '<div class="col-md-' + obj.width + '">'
				+ '<div class="checkbox"> '
				+ '<label> '
				+ '<input name="' + obj.name + '" type="checkbox" ' + obj.checked + ' '
				+ obj.disabled
				+ '> '
				+ obj.label
				+ '</label> '
				+ '</div></div>';
		}
		, radio: function (obj) {// width label name value

		}
	}
}