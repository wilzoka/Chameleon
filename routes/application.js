var lodash = require('lodash')
	, moment = require('moment')
	, reload = require('require-reload')(require)
	;

var application = {

	IsAuthenticated: function (req, res, next) {
		if (req.isAuthenticated()) {
			next();
		} else {
			res.redirect('/login');
		}
	}

	, success: function (res, obj) {
		res.json(lodash.extend({ success: true }, obj));
	}

	, fatal: function (res, err) {
		console.error(err);
		res.status(500).json({});
	}

	, error: function (res, json) {
		res.json(lodash.extend({ success: false }, json));
	}

	, render: function (res, template, json) {
		res.render(template, lodash.extend({}, json));
	}

	, forbidden: function (res) {
		res.status(403).render('403');
	}

	, notFound: function (res) {
		res.status(404).render('404');
	}

	, message: {
		success: 'Ação realizada com sucesso'
		, invalidFields: 'Informe os campos em vermelho'
		, selectOneEvent: 'Selecione um registro para esta executar este evento'
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
				html = application.menu.createGroup(menu);
				for (var i = 0; i < menu.children.length; i++) {

					html += application.menu.renderMenu(menu.children[i]);

				}
				html += application.menu.closeGroup();
			} else {
				html = application.menu.createItem(menu);
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
				let v = value / 60;
				let integer = parseInt(v);
				let decimal = parseInt(Math.round((v - integer) * 60, 2));
				let integerlength = integer.toString().length;
				if (integerlength < 2) {
					integerlength = 2;
				}
				return application.functions.lpad(integer, integerlength, '0') + ':' + application.functions.lpad(decimal, 2, '0');
			}
			, decimal: function (value, precision) {
				value = parseFloat(value);
				var reg = '\\d(?=(\\d{3})+\\D)';
				return value.toFixed(precision).replace('.', ',').replace(new RegExp(reg, 'g'), '$&.');
			}
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
			for (var i = 0; i < fieldsrequired.length; i++) {
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
				var referencesplited = string.split('.');
				var realreference = object[referencesplited[0]];
				for (var i = 1; i < referencesplited.length; i++) {
					realreference = realreference[referencesplited[i]];
				}
				return realreference;
			} catch (error) {
				return undefined;
			}
		}
		, lpad: function (value, length, string) {
			string = string || ' ';
			for (var i = value.toString().length; i < length; i++) {
				value = string + value;
			}
			return value.substring(0, length);
		}
		, rpad: function (value, length, string) {
			string = string || ' ';
			for (var i = value.toString().length; i < length; i++) {
				value = value + string;
			}
			return value.substring(0, length);
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
					+ 'data-where="' + obj.datawhere + '" '
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

}

module.exports = application;