let application = require('../../routes/application')
    , db = require('../../models')
    ;

let bi = {
    js_getCube: async function (obj) {
        try {

            let cube = await db.getModel('bi_cube').find({ raw: true, where: { id: obj.data.idcube } });
            let dimensions = await db.getModel('bi_cubedimension').findAll({ raw: true, where: { idcube: cube.id } });
            let measures = await db.getModel('bi_cubemeasure').findAll({ raw: true, where: { idcube: cube.id } });

            let data = {
                hiddenAttributes: []
                , measures: 'var globalaggregator = {'
                , data: []
            }

            for (let i = 0; i < measures.length; i++) {
                data.hiddenAttributes.push(measures[i].sqlfield);
                switch (measures[i].aggregator) {
                    case 'sum':
                        data.measures += '"' + measures[i].sqlfield + '": function () {return $.pivotUtilities.aggregatorTemplates.sum($.pivotUtilities.numberFormat({thousandsSep: ".", decimalSep: ",", digitsAfterDecimal: "2"}))(["' + measures[i].sqlfield + '"]);}';
                        break;
                }
                if (measures.length - 1 != i)
                    data.measures += ', ';
            }
            data.measures += '}';

            data.data = await db.sequelize.query(cube.sql, { type: db.sequelize.QueryTypes.SELECT });

            return application.success(obj.res, { msg: 'cube', data: data });

        } catch (err) {
            return application.fatal(obj.res, err);
        }
    }
    , analysis: {
        onsave: async function (obj, next) {
            try {

                if (obj.register.id == 0) {
                    obj.register.iduser = obj.req.user.id;
                }

                next(obj);

            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
    }
    , dashboard: {
        onsave: async function (obj, next) {
            try {
                if (obj.register.id == 0) {
                    obj.register.iduser = obj.req.user.id;
                }

                next(obj);

            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
    }
    , dashboardanalysis: {
        onsave: async function (obj, next) {
            try {

                if (obj.register.width < 1 || obj.register.width > 12) {
                    return application.error(obj.res, { msg: 'A largura deve ser entre 1 e 12', invalidfields: ['width'] });
                }

                next(obj);

            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
    }
    , r_dashboard: async function (obj) {
        try {
            let nav = '';
            let content = '';
            let dashboards = await db.getModel('bi_dashboard').findAll({ where: { iduser: obj.req.user.id }, order: [['order', 'asc']] });
            for (let i = 0; i < dashboards.length; i++) {
                nav += '<li class="' + (i == 0 ? 'active' : '') + '"><a href="#tab_' + i + '" data-toggle="tab"> ' + dashboards[i].description + '</a></li>'
                content += '<div class="tab-pane ' + (i == 0 ? 'active' : '') + '" id="tab_' + i + '"><div class="row">';
                let analysis = await db.getModel('bi_dashboardanalysis').findAll({ include: [{ all: true }], where: { iddashboard: dashboards[i].id }, order: [['order', 'asc']] });
                for (let z = 0; z < analysis.length; z++) {
                    content += '<div class="col-md-' + analysis[z].width + '">';
                    content += '<div class="box">';
                    content += '<div class="box-header"><h3 class="box-title">' + analysis[z].bi_analysis.description + '</h3></div>';
                    content += '<div class="box-body">';
                    content += '<textarea class="hidden">' + analysis[z].bi_analysis.config + '</textarea>'

                    let style = [];
                    if (analysis[z].height) {
                        style.push('height: ' + analysis[z].height + 'px');
                    };
                    content += '<div class="pivotdiv pivotUiHidden" data-idcube="' + analysis[z].bi_analysis.idcube + '" style="' + style.join(';') + '" ></div>';
                    content += '</div></div>';
                    content += '</div>';
                }
                content += '</div></div>';
            }

            return application.success(obj.res, {
                data: {
                    nav: nav
                    , content: content
                }
            });

        } catch (err) {
            return application.fatal(obj.res, err);
        }
    }
}

module.exports = bi;