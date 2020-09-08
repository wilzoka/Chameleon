const moment = require('moment')
	, fs = require('fs-extra')
	, jwt = require('jsonwebtoken')
	;

const application = {
	components: {
		html: {
			hidden: function (obj) {
				const o = {};
				Object.assign(o, {
					name: ''
					, value: ''
				}, obj);
				return `<input name="${o.name}" type="hidden" value="${o.value}">`;
			}
			, text: function (obj) {
				const o = {};
				Object.assign(o, {
					width: ''
					, label: ''
					, name: ''
					, value: ''
					, disabled: ''
				}, obj);
				return `
				<div class="col-md-${o.width}">
					<div class="form-group">
						<label>${o.label}</label>
						<input name="${o.name}" type="text" class="form-control" value="${o.value}" data-type="text" ${o.disabled}>
					</div>
				</div>`;
			}
			, textarea: function (obj) {
				const o = {};
				Object.assign(o, {
					width: ''
					, label: ''
					, name: ''
					, rows: ''
					, value: ''
					, disabled: ''
				}, obj);
				return `
				<div class="col-md-${o.width}">
					<div class="form-group">
						<label>${o.label}</label>
						<textarea name="${o.name}" rows="${o.rows}" class="form-control ${o.wysiwyg ? 'hidden' : ''}" data-type="textarea" data-wysiwyg="${o.wysiwyg}" ${o.disabled}>${o.value}</textarea>
					</div>
				</div>`;
			}
			, integer: function (obj) {
				const o = {};
				Object.assign(o, {
					width: ''
					, label: ''
					, name: ''
					, value: ''
					, disabled: ''
				}, obj);
				return `
				<div class="col-md-${o.width}">
					<div class="form-group">
						<label>${o.label}</label>
						<input name="${o.name}" type="text" class="form-control" value="${o.value}" data-type="integer" ${o.disabled}>
					</div>
				</div>`;
			}
			, decimal: function (obj) {
				const o = {};
				Object.assign(o, {
					width: ''
					, label: ''
					, name: ''
					, value: ''
					, precision: '2'
					, disabled: ''
					, placeholder: ''
					, add: ''
				}, obj);
				return `
				<div class="col-md-${o.width}">
					<div class="form-group">
						<label>${o.label}</label>
						<input name="${o.name}" type="text" class="form-control" value="${o.value}" placeholder="${o.placeholder}" style="text-align:right;"
							data-type="decimal"
							data-precision="${o.precision}" ${o.add} ${o.disabled}>
					</div>
				</div>`;
			}
			, autocomplete: function (obj) {
				const o = {};
				Object.assign(o, {
					width: ''
					, label: ''
					, name: ''
					, disabled: ''
					, model: ''
					, attribute: ''
					, where: ''
					, query: ''
					, multiple: ''
					, option: ''
					, options: ''
				}, obj);
				return `
				<div class="col-md-${o.width}">
					<div class="form-group">
						<label>${o.label}</label>
						<select name="${o.name}" class="form-control select2" ${o.disabled}	style="width:100%;"
							data-type="autocomplete"
							data-model="${o.model}"
							data-attribute="${o.attribute}"
							data-where="${o.where}"
							data-query="${o.query}"
							data-options="${o.options}"
							${o.multiple}>
							${o.option}
						</select>
					</div>
				</div>`;
			}
			, date: function (obj) {
				const o = {};
				Object.assign(o, {
					width: ''
					, label: ''
					, name: ''
					, value: ''
					, disabled: ''
				}, obj);
				return `
				<div class="col-md-${o.width}">
					<div class="form-group">
						<label>${o.label}</label>
						<input name="${o.name}" type="text" class="form-control" value="${o.value}" placeholder="dd/mm/aaaa" ${o.disabled}
							data-type="date"
						>
					</div>
				</div>`;
			}
			, datetime: function (obj) {
				const o = {};
				Object.assign(o, {
					width: ''
					, label: ''
					, name: ''
					, value: ''
					, disabled: ''
				}, obj);
				return `
				<div class="col-md-${o.width}">
					<div class="form-group">
						<label>${o.label}</label>
						<input name="${o.name}" type="text" class="form-control" value="${o.value}" ${o.disabled}
							data-type="datetime"
							placeholder="dd/mm/aaaa hh:mm"
						>
					</div>
				</div>`;
			}
			, time: function (obj) {
				const o = {};
				Object.assign(o, {
					width: ''
					, label: ''
					, name: ''
					, value: ''
					, disabled: ''
					, placeholder: 'hh:mm'
				}, obj);
				return `
				<div class="col-md-${o.width}">
					<div class="form-group">
						<label>${o.label}</label>
						<input name="${o.name}" type="text" class="form-control" value="${o.value}" ${o.disabled} style="text-align:right;"
							data-type="time"
							placeholder="${o.placeholder}"
						>
					</div>
				</div>`;
			}
			, checkbox: function (obj) {
				const o = {};
				Object.assign(o, {
					width: ''
					, name: ''
					, checked: ''
					, label: ''
					, disabled: ''
				}, obj);
				return `
				<div class="col-md-${o.width}">
					<div class="checkbox">
						<label>
							<input name="${o.name}" type="checkbox" value="true" ${o.checked} data-unchecked-value="false" ${o.disabled}>
							${o.label}
						</label>
					</div>
				</div>`;
			}
			, file: function (obj) {
				const o = {};
				Object.assign(o, {
					width: ''
					, name: ''
					, label: ''
					, value: ''
					, maxfiles: ''
					, sizetotal: ''
					, acceptedfiles: ''
					, forcejpg: ''
					, maxwh: ''
				}, obj);
				return `
				<div class="col-md-${o.width}">
					<div class="form-group">
						<label>${o.label}</label>
						<div class="dropzone" data-name="${o.name}" data-type="file"
							data-maxfiles="${o.maxfiles}"
							data-sizetotal="${o.sizetotal}"
							data-acceptedfiles="${o.acceptedfiles}"
							data-forcejpg="${o.forcejpg}"
							data-maxwh="${o.maxwh}"
							><input name="${o.name}" type="hidden" value="${o.value}">
						</div>
					</div>
				</div>`;
			}
			, georeference: function (obj) {
				const o = {};
				Object.assign(o, {
					width: ''
					, label: ''
					, name: ''
					, value: ''
				}, obj);
				return `
				<div class="col-md-${o.width}">
					<div class="form-group">
						<label>${o.label}</label>
						<input name="${o.name}" type="hidden" value="${o.value}">
						<input id="${o.name}_gms" type="text" class="form-control hidden" style="border-radius:0px;" placeholder="Pesquise um local" ${o.disabled}>
						<div data-type="georeference"></div>
					</div>
				</div>`;
			}
			, radio: function (obj) {
				const o = {};
				Object.assign(o, {
					width: ''
					, label: ''
					, name: ''
					, value: ''
					, disabled: ''
					, options: []
				}, obj);
				let options = '';
				for (let i = 0; i < o.options.length; i++) {
					options += `
					<div class="radio">
						<label>
							<input type="radio" name="${obj.name}" value="${o.options[i]}" ${o.options[i] == o.value ? 'checked="checked"' : ''} ${o.disabled}>
							${o.options[i]}
						</label>
					</div>
					`;
				}
				return `
				<div class="col-md-${o.width}">
					<div class="form-group">
						<label>${o.label}</label>
						${options}
					</div>
				</div>`;
			}
		}
	}
	, config: {
		setPartials: function (config) {
			const favicon = config.favicon ? JSON.parse(config.favicon)[0] : null;
			application.Handlebars.registerPartial('parts/favicon', favicon ? `/file/${favicon.id}` : '/public/images/favicon.ico');
			const loginimage = config.loginimage ? JSON.parse(config.loginimage)[0] : null;
			application.Handlebars.registerPartial('parts/loginimage', loginimage ? `<img src="/file/${loginimage.id}" style="width: 100%; margin-bottom: 10px;">` : '');
			const loginbackground = config.loginbackground ? JSON.parse(config.loginbackground)[0] : null;
			let loginbackgroundstr = '';
			if (loginbackground) {
				if (['png', 'jpg', 'jpeg'].indexOf(loginbackground.type) >= 0) {
					loginbackgroundstr = `<img class="fullbg" src="/file/${loginbackground.id}">`;
				} else if (['mp4'].indexOf(loginbackground.type) >= 0) {
					loginbackgroundstr = `<video autoplay="" muted="" loop="" class="fullbg"><source src="/file/${loginbackground.id}" type="video/mp4"></video>`;
				}
			}
			application.Handlebars.registerPartial('parts/loginbackground', loginbackgroundstr);
		}
	}
	, error: function (res, json) {
		if (!res.headersSent) {
			Object.assign(json, { success: false });
			res.json(json);
		}
	}
	, fatal: function (res, err) {
		console.error(moment().format(application.formatters.fe.datetime_format), err);
		if (!res.headersSent) {
			res.status(500).json({ success: false });
		}
	}
	, forbidden: function (res) {
		res.status(403);
		application.render(res, __dirname + '/../views/403.html');
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
			, decimal: function (value) {
				value = value.replace(/\./g, '');
				value = value.replace(/\,/g, '.');
				return parseFloat(value);
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
				if (value == 0) {
					return '0:00';
				}
				let isNegative = value < 0;
				value = Math.abs(value);
				let v = value / 60;
				let integer = parseInt(v);
				let decimal = parseInt(Math.round((v - integer) * 60, 2));
				let integerlength = integer.toString().length;
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
			if (!data) {
				return fieldsrequired;
			} else {
				for (let i = 0; i < fieldsrequired.length; i++) {
					if (!(fieldsrequired[i] in data && data[fieldsrequired[i]])) {
						invalidfields.push(fieldsrequired[i]);
					}
				}
				return invalidfields;
			}
		}
		, singleSpace: function (value) {
			return value.replace(/\s\s+/g, ' ');
		}
		, removeSpecialCharacters: function (value) {
			return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
				return null;
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
				return Math.trunc(minutes / 60 / 24) + ' dias';
			}
		}
		, rootDir: function () {
			return `${__dirname}/../`;
		}
		, filesDir: function () {
			return `${application.functions.rootDir()}files/${process.env.NODE_APPNAME}/`;
		}
		, tmpDir: function () {
			return `${application.functions.rootDir()}tmp/${process.env.NODE_APPNAME}/`;
		}
	}
	, Handlebars: require('handlebars')
	, IsAuthenticated: function (req, res, next) {
		if (req.isAuthenticated()) {
			next();
		} else {
			application.jwt(req);
			if (req.user) {
				next();
			} else {
				if (req.xhr) {
					res.status(401).json({});
				} else {
					res.redirect('/login?continue=' + req.path);
				}
			}
		}
	}
	, jwt: function (req) {
		const token = req.headers['x-access-token'];
		jwt.verify(token, application.sk, function (err, decoded) {
			if (!err) {
				req.user = decoded;
			}
		});
		return req;
	}
	, menu: {
		createGroup: function (menu) {
			const icon = menu.icon;
			const description = menu.description;
			return `
			<li class="treeview">
				<a href="#">
					${icon ? '<i class="' + icon + '"></i> ' : ''}
					<span>${description}</span>
					<span class="pull-right-container">
						<i class="fa fa-angle-left pull-right"></i>
					</span>
				</a>
			<ul class="treeview-menu">`;
		}
		, createItem: function (menu) {
			const description = menu.description;
			const url = '/v/' + menu.url;
			return `
			<li>
				<a href="${url}">
					<i class="${menu.icon || 'fa fa-angle-right'}"></i>
					<span>${description}</span>
				</a>
			</li>`;
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
				if (idmenu == childs[i].idmenuparent) {
					if (childs[i].idview) {
						if (permissionarr.indexOf(childs[i].idview) >= 0) {
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
	, message: {
		success: 'Ação realizada com sucesso'
		, invalidFields: 'Informe os campos em vermelho'
		, selectOneEvent: 'Selecione um registro para esta executar este evento'
		, selectOnlyOneEvent: 'Selecione apenas um registro para esta executar este evento'
		, permissionDenied: 'Você não tem permissão para executar esta ação'
		, notAvailable: 'Esta ação não está disponível'
		, wrongConf: 'Configuração incorreta para executar esta ação'
	}
	, modelattribute: {
		parseTypeadd: function (value) {
			return value ? JSON.parse(application.functions.singleSpace(value)) : {};
		}
	}
	, notFound: function (res) {
		res.status(404);
		application.render(res, __dirname + '/../views/404.html');
	}
	, render: function (res, template, json) {
		if (!(template in application.Handlebars.compiledTemplates)) {
			application.Handlebars.compiledTemplates[template] = application.Handlebars.compile(fs.readFileSync(template, 'utf8'));
		}
		res.send(application.Handlebars.compiledTemplates[template](json)).end();
	}
	, sequelize: {
		decodeType: function (Sequelize, datatype) {
			switch (datatype) {
				case 'autocomplete':
					return Sequelize.INTEGER;
				case 'boolean':
					return Sequelize.BOOLEAN;
				case 'date':
					return Sequelize.DATEONLY;
				case 'datetime':
					return Sequelize.DATE;
				case 'decimal':
					return Sequelize.DECIMAL;
				case 'file':
					return Sequelize.TEXT;
				case 'georeference':
					return Sequelize.TEXT;
				case 'integer':
					return Sequelize.INTEGER;
				case 'parent':
					return Sequelize.INTEGER;
				case 'radio':
					return Sequelize.TEXT;
				case 'text':
					return Sequelize.TEXT;
				case 'textarea':
					return Sequelize.TEXT;
				case 'time':
					return Sequelize.INTEGER;
			}
		}
	}
	, sk: '$H!T'
	, success: function (res, obj) {
		if (!res.headersSent) {
			Object.assign(obj, { success: true });
			res.json(obj);
		}
	}
}

application.Handlebars.registerPartial('parts/head', fs.readFileSync(__dirname + '/../views/parts/head.html', 'utf8'))
application.Handlebars.registerPartial('parts/js', fs.readFileSync(__dirname + '/../views/parts/js.html', 'utf8'))
application.Handlebars.registerPartial('parts/nav', fs.readFileSync(__dirname + '/../views/parts/nav.html', 'utf8'))
application.Handlebars.registerPartial('parts/sidebar', fs.readFileSync(__dirname + '/../views/parts/sidebar.html', 'utf8'))
application.Handlebars.compiledTemplates = {};

module.exports = application;