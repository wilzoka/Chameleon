const lodash = require('lodash')
	, moment = require('moment')
	, fs = require('fs')
	;

let application = {
	IsAuthenticated: function (req, res, next) {
		if (req.isAuthenticated()) {
			next();
		} else {
			if (req.xhr) {
				res.status(401).json({});
			} else {
				res.redirect('/login');
			}
		}
	}
	, success: function (res, obj) {
		if (!res.headersSent) {
			res.json(lodash.extend({ success: true }, obj));
		}
	}
	, fatal: function (res, err) {
		console.error(err);
		if (!res.headersSent) {
			res.status(500).json({});
		}
	}
	, error: function (res, json) {
		if (!res.headersSent) {
			res.json(lodash.extend({ success: false }, json));
		}
	}
	, render: function (res, template, json) {
		if (!(template in application.Handlebars.compiledTemplates)) {
			application.Handlebars.compiledTemplates[template] = application.Handlebars.compile(fs.readFileSync(template, 'utf8'));
		}
		res.send(application.Handlebars.compiledTemplates[template](json)).end();
	}
	, forbidden: function (res) {
		res.status(403);
		application.render(res, __dirname + '/../views/403.html');
	}
	, notFound: function (res) {
		res.status(404);
		application.render(res, __dirname + '/../views/404.html');
	}
	, message: {
		success: 'Ação realizada com sucesso'
		, invalidFields: 'Informe os campos em vermelho'
		, selectOneEvent: 'Selecione um registro para esta executar este evento'
		, selectOnlyOneEvent: 'Selecione apenas um registro para esta executar este evento'
		, permissionDenied: 'Você não tem permissão para executar esta ação'
	}
	, sequelize: {
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
				case 'file':
					return Sequelize.TEXT;
				case 'georeference':
					return Sequelize.TEXT;
			}
		}
	}
	, menu: {
		createGroup: function (menu) {
			let icon = menu.icon;
			let description = menu.description;
			return '<li class="treeview">'
				+ '<a href="#">'
				+ (icon ? '<i class="' + icon + '"></i> ' : '')
				+ '<span>' + description + '</span>'
				+ '<span class="pull-right-container">'
				+ '<i class="fa fa-angle-left pull-right"></i>'
				+ '</span>'
				+ '</a>'
				+ '<ul class="treeview-menu">'
				;
		}
		, createItem: function (menu) {
			let description = menu.description;
			let url = menu.url || '/v/' + menu['view.url'];
			return '<li><a href="' + url + '"><i class="' + (menu.icon || 'fa fa-angle-right') + '"></i> <span>' + description + '</span> </a></li>';
		}
		, closeGroup: function () {
			return '</ul></li>';
		}
		, renderMenu: function (menu) {
			let html = '';
			if ('children' in menu && menu.children.length > 0) {
				html = application.menu.createGroup(menu);
				for (let i = 0; i < menu.children.length; i++) {
					html += application.menu.renderMenu(menu.children[i]);
				}
				html += application.menu.closeGroup();
			} else {
				html = application.menu.createItem(menu);
			}
			return html;
		}
		, getChilds: function (idmenu, childs, permissionarr) {
			let returnchilds = [];
			for (let i = 0; i < childs.length; i++) {
				if (childs[i].idmenuparent == idmenu) {
					if (childs[i].url || childs[i].idview) {
						if (permissionarr.indexOf(childs[i].id) >= 0) {
							returnchilds.push(childs[i]);
						}
					} else {
						childs[i].children = application.menu.getChilds(childs[i].id, childs, permissionarr);
						if (childs[i].children.length > 0) {
							returnchilds.push(childs[i]);
						}
					}
				}
			}
			return returnchilds;
		}
	}
	, formatters: {
		be: {
			time: function (value) {
				if (value.indexOf(':') >= 0) {
					value = value.split(':');
					let h = parseInt(value[0]);
					let m = parseInt(value[1]);
					return parseInt((h * 60) + m);
				} else {
					return parseInt(value);
				}
			}
			, decimal: function (value, precision) {
				value = value.replace(/\./g, "");
				value = value.replace(/\,/g, ".");
				return parseFloat(value).toFixed(precision);
			}
			, date_format: 'YYYY-MM-DD'
			, datetime_format: 'YYYY-MM-DD HH:mm'
			, date: function (value) {
				value = moment(value, 'DD/MM/YYYY');
				return value.isValid() ? value.format('YYYY-MM-DD') : null;
			}
			, datetime: function (value) {
				value = moment(value, 'DD/MM/YYYY HH:mm');
				return value.isValid() ? value.format('YYYY-MM-DD HH:mm') : null;
			}
			, integer: function (value) {
				value = parseInt(value);
				return Number.isInteger(value) ? value : null;
			}
		}
		, fe: {
			time: function (value) {
				let isNegative = value < 0;
				value = Math.abs(value);
				let v = value / 60;
				let integer = parseInt(v);
				let decimal = parseInt(Math.round((v - integer) * 60, 2));
				let integerlength = integer.toString().length;
				if (integerlength < 2) {
					integerlength = 2;
				}
				return (isNegative ? '-' : '') + application.functions.lpad(integer, integerlength, '0') + ':' + application.functions.lpad(decimal, 2, '0');
			}
			, decimal: function (value, precision) {
				return parseFloat(value).toFixed(precision).replace('.', ',').replace(new RegExp('\\d(?=(\\d{3})+\\D)', 'g'), '$&.');
			}
			, date_format: 'DD/MM/YYYY'
			, datetime_format: 'DD/MM/YYYY HH:mm'
			, date: function (value) {
				value = moment(value, 'YYYY-MM-DD');
				return value.isValid() ? value.format('DD/MM/YYYY') : null;
			}
			, datetime: function (value) {
				value = moment(value, 'YYYY-MM-DD HH:mm');
				return value.isValid() ? value.format('DD/MM/YYYY HH:mm') : null;
			}
		}
	}
	, functions: {
		getEmptyFields: function (data, fieldsrequired) {
			let invalidfields = [];
			for (let i = 0; i < fieldsrequired.length; i++) {
				if (!(fieldsrequired[i] in data && data[fieldsrequired[i]])) {
					invalidfields.push(fieldsrequired[i]);
				}
			}
			return invalidfields;
		}
		, singleSpace: function (value) {
			return value.replace(/\s\s+/g, ' ');
		}
		, getRealReference: function (object, string) {
			try {
				let referencesplited = string.split('.');
				let realreference = object[referencesplited[0]];
				for (let i = 1; i < referencesplited.length; i++) {
					realreference = realreference[referencesplited[i]];
				}
				return realreference;
			} catch (err) {
				return undefined;
			}
		}
		, lpad: function (value, length, string) {
			value = value.toString() || '';
			string = string || ' ';
			for (let i = value.length; i < length; i++) {
				value = string + value;
			}
			return value.substring(0, length);
		}
		, rpad: function (value, length, string) {
			value = value || '';
			string = string || ' ';
			for (let i = value.toString().length; i < length; i++) {
				value = value + string;
			}
			return value.substring(0, length);
		}
		, isWindows: function () {
			return /^win/.test(process.platform);
		}
		, duration: function (minutes) {
			if (minutes <= 1) {
				return 'Agora';
			} else if (minutes < 60) {
				return minutes + ' minutos';
			} else if (minutes < 120) {
				return '1 hora'
			} else if (minutes < 1440) {
				return Math.trunc(minutes / 60) + ' horas';
			} else if (minutes < 2880) {
				return '1 dia';
			} else {
				return Math.trunc(minutes / 60) + ' dias';
			}
		}
	}
	, modelattribute: {
		parseTypeadd: function (value) {
			return value ? JSON.parse(application.functions.singleSpace(value)) : {};
		}
	}
	, components: {
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
					, where: ''
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
					+ 'data-where="' + obj.where + '" '
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
			, file: function (obj) {
				obj = lodash.extend({
					width: ''
					, name: ''
					, label: ''
					, value: ''
					, maxfiles: ''
					, acceptedfiles: ''
				}, obj);
				return '<div class="col-md-' + obj.width + '">'
					+ '<div class="form-group">'
					+ '<label>' + obj.label + '</label>'
					+ '<div class="dropzone" data-type="file" data-maxfiles="' + obj.maxfiles + '" data-acceptedfiles="' + obj.acceptedfiles + '">'
					+ '<input name="' + obj.name + '" type="hidden" value="' + obj.value + '">'
					+ '</div>'
					+ '</div>'
					+ '</div>';
			}
			, georeference: function (obj) {
				obj = lodash.extend({
					width: ''
					, label: ''
					, name: ''
					, value: ''
				}, obj);
				return '<div class="col-md-' + obj.width + '">'
					+ '<div class="form-group">'
					+ '<label>' + obj.label + '</label>'
					+ '<input name="' + obj.name + '" type="hidden" value="' + obj.value + '">'
					+ '<div data-type="georeference"></div>'
					+ '</div>'
					+ '</div>';
			}
			, radio: function (obj) {// width label name value

			}
		}
	}
	, Handlebars: require('handlebars')
}

application.Handlebars.registerPartial('parts/head', fs.readFileSync(__dirname + '/../views/parts/head.html', 'utf8'))
application.Handlebars.registerPartial('parts/js', fs.readFileSync(__dirname + '/../views/parts/js.html', 'utf8'))
application.Handlebars.registerPartial('parts/nav', fs.readFileSync(__dirname + '/../views/parts/nav.html', 'utf8'))
application.Handlebars.registerPartial('parts/sidebar', fs.readFileSync(__dirname + '/../views/parts/sidebar.html', 'utf8'))
application.Handlebars.compiledTemplates = {};

module.exports = application;