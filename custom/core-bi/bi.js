const application = require('../../routes/application')
    , db = require('../../models')
    , fs = require('fs-extra')
    , puppeteer = require('puppeteer')
    , moment = require('moment')
    , schedule = require('node-schedule')
    , mail = require('../core/modules/mail')
    ;

let cube_schedules = [];

const
    decodeChartType = function (type) {
        switch (type) {
            case 'Barra':
                return 'bar';
            case 'Barra Empilhada':
                return 'bar';
            case 'Coluna':
                return 'column';
            case 'Coluna Empilhada':
                return 'column';
            case 'Linha':
                return 'line';
            case 'Pizza':
                return 'pie';
            case 'Dispersão':
                return 'scatter';
            case 'Velocímetro':
                return 'solidgauge';
            case 'Mapa':
                return 'map';
            case 'Mapa de Calor':
                return 'heatmap';
            default:
                return 'line';
        }
    }

let bi = {
    f_pivot: function (sql, options) {
        const config = options.config || {};
        const columns = options.columns || [];
        const rows = options.rows || [];
        const measures = options.measures || [];

        let measure_order = [];
        if (config.ordermeasure) {
            const i = measures.indexOf(config.ordermeasure);
            if (i >= 0) {
                measure_order = [i, config.ordertype == 'Crescente' ? 'asc' : 'desc'];
            }
        }

        let row_total = options.config.totalrow;
        let column_total = options.config.totalcolumn;

        const delimiter = '->';

        const data = [];
        for (const s of sql) {
            const currentrow = [];
            for (let z = 0; z < rows.length; z++) {
                currentrow.push(s[rows[z]]);
            }
            const currentcolumn = [];
            for (let z = 0; z < columns.length; z++) {
                currentcolumn.push(s[columns[z]]);
            }
            const currentmeasures = [];
            for (let z = 0; z < measures.length; z++) {
                currentmeasures.push(s[measures[z]]);
            }
            data.push({
                row: currentrow.join(delimiter)
                , column: currentcolumn.join(delimiter)
                , measures: currentmeasures
            });
        }

        const structure = {
            rows: [] // Contém as linhas de esqueleto, já estratificando os níveis
            , columns: [] // Contém as colunas de esqueleto, já estratificando os níveis
            , r: [] // Contém as referências das linhas
            , c: [] // Contém as referências des colunas
        };

        for (let i = 0; i < data.length; i++) {
            if (structure.c.indexOf(data[i].column) < 0) {
                structure.c.push(data[i].column);
            }
            if (structure.r.indexOf(data[i].row) < 0) {
                structure.r.push(data[i].row);
            }
        }

        const tablelimit = 1000;
        if (structure.c.length > tablelimit || structure.r.length > tablelimit) {
            return {
                html: '<span>Muitos resultados para exibir, realize mais filtros para visualizar</span>'
                , charts: []
            };
        }

        if (measure_order.length === 0) {
            structure.c = structure.c.sort();
            structure.r = structure.r.sort();
        }

        //Total
        if (row_total && columns.length === 0) {
            row_total = false;
        }
        if (column_total && rows.length === 0) {
            column_total = false;
        }
        function emptyTotal() {
            let emptytotal = [];
            for (let i = 0; i < measures.length; i++) {
                emptytotal.push(0.0);
            }
            return emptytotal;
        }
        for (let i = 0; i < structure.c.length; i++) {
            structure.c[i] = { val: structure.c[i] };
        }
        for (let i = 0; i < structure.r.length; i++) {
            structure.r[i] = { val: structure.r[i] };
        }
        function calcTotal() {
            for (let r = 0; r < structure.r.length; r++) {
                structure.r[r].total = emptyTotal();
                structure.r[r].withValues = emptyTotal();
                for (let i = 0; i < data.length; i++) {
                    if (data[i].row === structure.r[r].val) {
                        for (let m = 0; m < measures.length; m++) {
                            structure.r[r].total[m] += parseFloat(data[i].measures[m] || 0);
                            if (!isNaN(data[i].measures[m]))
                                structure.r[r].withValues[m]++;
                        }
                    }
                }
            }
            for (let c = 0; c < structure.c.length; c++) {
                structure.c[c].total = emptyTotal();
                structure.c[c].withValues = emptyTotal();
                for (let i = 0; i < data.length; i++) {
                    if (data[i].column === structure.c[c].val) {
                        for (let m = 0; m < measures.length; m++) {
                            structure.c[c].total[m] += parseFloat(data[i].measures[m] || 0);
                            if (!isNaN(data[i].measures[m]))
                                structure.c[c].withValues[m]++;
                        }
                    }
                }
            }
            for (let m = 0; m < measures.length; m++) {
                if (options._measures[m] && options._measures[m].aggregator == 'avg') {
                    for (let r = 0; r < structure.r.length; r++) {
                        structure.r[r].total[m] = structure.r[r].total[m] / structure.r[r].withValues[m];
                    }
                    for (let c = 0; c < structure.c.length; c++) {
                        structure.c[c].total[m] = structure.c[c].total[m] / structure.c[c].withValues[m];
                    }
                }
            }
            if (row_total && column_total) {
                structure.grandtotal = emptyTotal();
                for (let m = 0; m < measures.length; m++) {
                    let withValues = 0;
                    for (let i = 0; i < data.length; i++) {
                        structure.grandtotal[m] += parseFloat(data[i].measures[m] || 0);
                        if (!isNaN(data[i].measures[m]))
                            withValues++;
                        if (i == data.length - 1) {
                            if (options._measures[m] && options._measures[m].aggregator == 'avg') {
                                structure.grandtotal[m] = structure.grandtotal[m] / withValues;
                            }
                        }
                    }
                }
            }
        }
        calcTotal();

        function compare(order) {
            return function (a, b) {
                if (a.total[order[0]] < b.total[order[0]])
                    return order[1] == 'asc' ? -1 : 1;
                if (a.total[order[0]] > b.total[order[0]])
                    return order[1] == 'asc' ? 1 : -1;
                return 0;
            }
        }
        if (measure_order.length > 0) {
            structure.c = structure.c.sort(compare(measure_order));
            structure.r = structure.r.sort(compare(measure_order));
        }

        let limited = false;
        if (options.config.limitrow) {
            limited = true;
            structure.r = structure.r.splice(0, options.config.limitrow);
            let values = [];
            for (let r = 0; r < structure.r.length; r++) {
                values.push(structure.r[r].val);
            }
            for (let i = 0; i < data.length; i++) {
                if (values.indexOf(data[i].row) < 0) {
                    data.splice(i, 1);
                    i--;
                }
            }
        }
        if (options.config.limitcolumn) {
            limited = true;
            structure.c = structure.c.splice(0, options.config.limitcolumn);
            let values = [];
            for (let c = 0; c < structure.c.length; c++) {
                values.push(structure.c[c].val);
            }
            for (let i = 0; i < data.length; i++) {
                if (values.indexOf(data[i].column) < 0) {
                    data.splice(i, 1);
                    i--;
                }
            }
        }
        if (limited) {
            calcTotal();
        }

        // Cria os levels de span para linha e coluna
        for (let c = 0; c < columns.length; c++) {
            structure.columns.push([]);
            for (let i = 0; i < structure.c.length; i++) {
                let splited = structure.c[i].val.split(delimiter);
                structure.columns[structure.columns.length - 1].push({ val: splited[c], colspan: 1 });
            }
        }
        for (let i = 0; i < structure.columns.length; i++) {
            for (let z = 0; z < structure.columns[i].length - 1; z++) {
                if (structure.columns[i][z].val === structure.columns[i][z + 1].val) {
                    structure.columns[i][z].colspan++;
                    structure.columns[i].splice(z + 1, 1);
                    z--;
                }
            }
        }
        for (let i = 0; i < rows.length; i++) {
            structure.rows.push([]);
            for (let r = 0; r < structure.r.length; r++) {
                let splited = structure.r[r].val.split(delimiter);
                structure.rows[structure.rows.length - 1].push({ val: splited[i], rowspan: 1 });
            }
        }
        for (let i = 0; i < structure.rows.length; i++) {
            for (let z = 0; z < structure.rows[i].length - 1; z++) {
                for (let y = z + 1; y < structure.rows[i].length; y++) {
                    if (structure.rows[i][y].rowspan > 0 && structure.rows[i][z].val === structure.rows[i][y].val) {
                        structure.rows[i][z].rowspan++;
                        structure.rows[i][y].rowspan = 0;
                    } else {
                        break;
                    }
                }
            }
        }

        function repeatString(element, qtd) {
            let ret = '';
            for (let i = 0; i < qtd; i++) {
                ret += element;
            }
            return ret;
        }

        // Render Chart
        const chart = {
            chart: {
                type: decodeChartType(options.charttype)
            }
            , title: {
                text: ''
            }
            , series: []
            , xAxis: {
                categories: []
            }
            , yAxis: []
            , exporting: {
                enabled: false
            }
            , lang: {
                decimalPoint: ','
                , thousandsSep: '.'
            }
            , credits: {
                enabled: false
            }
        };
        for (let i = 0; i < structure.r.length; i++) {
            chart.xAxis.categories.push(structure.r[i].val);
        }
        for (let m = 0; m < measures.length; m++) {
            let maxvalue;
            for (const d of data) {
                if (!maxvalue || parseFloat(d.measures[m]) > maxvalue)
                    maxvalue = d.measures[m];
            }
            let scale = 0;
            while (maxvalue > 1000) {
                maxvalue /= 1000;
                scale++;
            }

            chart.yAxis.push({
                title: {
                    text: measures[m]
                }
                , opposite: m % 2 == 1
            });
            for (let c = 0; c < structure.c.length; c++) {
                let seriesdata = [];
                for (let r = 0; r < structure.r.length; r++) {
                    let sd = null;
                    for (let i = 0; i < data.length; i++) {
                        if (structure.c[c].val == data[i].column && structure.r[r].val == data[i].row) {
                            const measuresplitted = data[i].measures[m].toString().split('.');
                            let format = application.formatters.fe.decimal((parseFloat(data[i].measures[m]) / (Math.pow(1000, scale))), measuresplitted.length > 1 ? 2 : 0);
                            if (scale == 1) {
                                format += ' k';
                            } else if (scale == 2) {
                                format += ' M';
                            } else if (scale == 3) {
                                format += ' G';
                            } else if (scale == 4) {
                                format += ' T';
                            }
                            if (options.charttype == 'Pizza')
                                format = '{point.name}<br>' + format + ' ({point.percentage:.1f}%)';
                            sd = {
                                name: data[i].row
                                , y: parseFloat(parseFloat(data[i].measures[m]).toFixed(2))
                                , dataLabels: {
                                    enabled: options.config.dataLabels ? true : false
                                    , format: format
                                }
                            };
                            break;
                        }
                    }
                    if (!sd) {
                        sd = { name: '', y: 0 };
                    }
                    seriesdata.push(sd);
                }
                chart.series.push({
                    name: (structure.c[c].val ? structure.c[c].val + ' - ' : '') + measures[m]
                    , yAxis: options.config.multiaxe ? m : 0
                    , data: seriesdata
                    , type: options.config.multiaxe ?
                        m == 0 ? ''
                            : m == 1 ? 'spline' : 'line'
                        : ''
                    , dashStyle: m % 2 == 0 ? 'Solid' : 'shortdot'
                });
            }
        }
        // Options for specific charts
        if (options.charttype && options.charttype.includes('Empilhada') > 0) {
            chart.plotOptions = {
                series: {
                    stacking: 'normal'
                }
            };
        } else if (options.charttype == 'Velocímetro') {
            chart.chart.width = 300;
            chart.chart.height = 200;
            for (let i = 0; i < chart.series.length; i++) {
                chart.series[i].dataLabels = {
                    format:
                        '<div style="text-align:center">' +
                        '<span style="font-size:25px">{y}</span><br/>' +
                        '</div>'
                };
            }
            chart.pane = {
                center: ['50%', '85%'],
                size: '140%',
                startAngle: -90,
                endAngle: 90,
                background: {
                    backgroundColor: '#EEE',
                    innerRadius: '60%',
                    outerRadius: '100%',
                    shape: 'arc'
                }
            };
            chart.yAxis = {
                min: options.config.chartgaugemin || 0,
                max: options.config.chartgaugemax || null,
                stops: [
                    [0.1, '#55BF3B'], // green
                    [0.5, '#DDDF0D'], // yellow
                    [0.9, '#DF5353'] // red
                ],
                lineWidth: 0,
                tickWidth: 0,
                minorTickInterval: null,
                tickAmount: 2,
                title: {
                    y: -70,
                    text: chart.series[0].name
                },
                labels: {
                    y: 16
                }
            };
            chart.plotOptions = {
                solidgauge: {
                    dataLabels: {
                        y: 5,
                        borderWidth: 0,
                        useHTML: true
                    }
                }
            };
            chart.tooltip = { enabled: false };
        } else if (options.charttype == 'Pizza') {
            chart.labels = { items: [] };
            let x = 0;
            for (let i = 0; i < chart.series.length; i++) {
                if (chart.series.length == 1) {
                    x = 50;
                } else if (i == 0) {
                    x = 100 / chart.series.length / 2;
                } else {
                    x += 100 / chart.series.length;
                }
                const screenwidth = 1000;
                chart.labels.items.push({
                    html: '<b>' + (chart.series[i].name.includes(' - ') ? chart.series[i].name.split(' - ')[0] : '') + '</b>',
                    style: {
                        left: (((screenwidth / chart.series.length) * (i + 1)) - (screenwidth / chart.series.length / 2)) + 'px'
                        , top: '20%'
                    }
                });
                chart.series[i].center = [x + '%', '50%'];
                chart.series[i].size = (100 / chart.series.length * 0.7) + '%';

            }
        }

        // Format Values
        for (let i = 0; i < data.length; i++) {
            for (let m = 0; m < measures.length; m++) {
                data[i].measures[m] = data[i].measures[m] == null ? '' : application.formatters.fe.decimal(data[i].measures[m], 2);
            }
        }
        for (let c = 0; c < structure.c.length; c++) {
            for (let m = 0; m < measures.length; m++) {
                structure.c[c].total[m] = structure.c[c].total[m] == null ? '' : application.formatters.fe.decimal(structure.c[c].total[m], 2);
            }
        }
        for (let r = 0; r < structure.r.length; r++) {
            for (let m = 0; m < measures.length; m++) {
                structure.r[r].total[m] = structure.r[r].total[m] == null ? '' : application.formatters.fe.decimal(structure.r[r].total[m], 2);
            }
        }
        if (structure.grandtotal) {
            for (let m = 0; m < measures.length; m++) {
                structure.grandtotal[m] = structure.grandtotal[m] == null ? '' : application.formatters.fe.decimal(structure.grandtotal[m], 2);
            }
        }


        // Render Table
        let html = '<table class="pvtTable" border="1" style="border-collapse: collapse;">';
        for (let i = 0; i < structure.columns.length; i++) {
            html += `<tr>`;
            if (rows.length > 0 && i === 0) {
                html += `<th colspan="${rows.length}" rowspan="${columns.length}"></th>`
            }
            html += `<th class="pvtAxisLabel">${columns[i]}</th>`;
            for (let z = 0; z < structure.columns[i].length; z++) {
                html += `<th class="pvtColLabel" colspan="${structure.columns[i][z].colspan * measures.length}" rowspan="${rows.length > 0 && i === structure.columns.length - 1 ? 2 : 1}">${structure.columns[i][z].val}</th>`;
            }
            if (row_total && i === 0) {
                html += `<th class="pvtRowTotalLabel" colspan="${measures.length}" rowspan="${columns.length + (rows.length > 0 ? 1 : 0)}">TOTAL</th>`;
            }
            html += '</tr>';
        }
        if (rows.length > 0) {
            html += '<tr>';
            for (let i = 0; i < rows.length; i++) {
                html += `<th class="pvtAxisLabel" rowspan="${columns.length > 0 && measures.length > 1 ? 2 : 1}">${rows[i]}</th>`;
                if (i === rows.length - 1) {
                    if (columns.length > 0) {
                        html += `<th rowspan="${columns.length > 0 && measures.length > 1 ? 2 : 1}"></th>`;
                    } else {
                        for (let z = 0; z < measures.length; z++) {
                            html += `<th class="pvtColLabel">${measures[z]}</th>`;
                        }
                    }
                }

            }
            html += '</tr>';
        }
        if (columns.length > 0 && measures.length > 1) {
            html += '<tr>';
            if (rows.length === 0) {
                html += `<th rowspan="2"></th>`;
            }
            for (let i = 0; i < structure.c.length; i++) {
                for (let i = 0; i < measures.length; i++) {
                    html += `<th class="pvtColLabel">${measures[i]}</th>`;
                }
            }
            if (row_total) {
                for (let i = 0; i < measures.length; i++) {
                    html += `<th class="pvtColLabel">${measures[i]}</th>`;
                }
            }
            html += '</tr>';
        }
        html += '';
        for (let r = 0; r < structure.r.length; r++) {
            html += `<tr>`;
            for (let i = 0; i < rows.length; i++) {
                if (structure.rows[i][r].rowspan > 0) {
                    html += `<th class="pvtRowLabel" rowspan="${structure.rows[i][r].rowspan}" colspan="${columns.length > 0 && i === rows.length - 1 ? 2 : 1}">${structure.rows[i][r].val}</th>`;
                }
            }
            if (columns.length > 0 && rows.length === 0 && measures.length === 1) {
                html += `<th></th>`;
            }
            for (let c = 0; c < structure.c.length; c++) {
                let td = repeatString('<td></td>', measures.length);
                for (let z = 0; z < data.length; z++) {
                    if (data[z].row === structure.r[r].val && data[z].column === structure.c[c].val) {
                        td = '';
                        for (let m = 0; m < measures.length; m++) {
                            td += `<td class="pvtVal">${data[z].measures[m]}</td>`;
                        }
                        // data.splice(z, 1);
                        // z--;
                        break;
                    }
                }
                html += td;
                if (row_total && c === structure.c.length - 1) {
                    for (let m = 0; m < measures.length; m++) {
                        html += `<td class="pvtTotal colTotal">${structure.r[r].total[m]}</td>`;
                    }
                }
            }
            html += '</tr>';
            if (column_total && r === structure.r.length - 1) {
                html += `<tr><th class="pvtTotalLabel pvtColTotalLabel" colspan="${rows.length + (columns.length > 0 ? 1 : 0)}">TOTAL</th>`
                for (let c = 0; c < structure.c.length; c++) {
                    for (let m = 0; m < measures.length; m++) {
                        html += `<td class="pvtTotal rowTotal">${structure.c[c].total[m]}</td>`;
                    }
                }
                if (row_total && column_total) {
                    for (let m = 0; m < measures.length; m++) {
                        html += `<td class="pvtGrandTotal">${structure.grandtotal[m]}</td>`;
                    }
                }
                html += `</tr>`;
            }
        }
        html += '</table>';

        return {
            html: html
            , chart: chart
            , data: data
        };
    }
    , cube: {
        onsave: async (obj, next) => {
            try {
                if (obj.register.id == 0) {
                    //Popular medidas/dimensoes
                }
                let saved = await next(obj);
                bi.cube.f_agendar(saved.register);
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , ondelete: async (obj, next) => {
            try {
                let deleted = await next(obj);
                if (deleted.success) {
                    for (let i = 0; i < obj.ids.length; i++) {
                        bi.cube.f_desagendar(obj.ids[i]);
                        db.sequelize.query(`drop table if exists bi_cube_${obj.ids[i]};`);
                    }
                }
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , e_executarCarga: async (obj) => {
            try {
                if (obj.ids.length <= 0) {
                    return application.error(obj.res, { msg: application.message.selectOneEvent });
                }
                const cubes = await db.getModel('bi_cube').findAll({ raw: true, where: { id: { [db.Op.in]: obj.ids } } });
                for (let i = 0; i < cubes.length; i++) {
                    await bi.cube.f_otimizar(cubes[i].id);
                }
                return application.success(obj.res, { msg: application.message.success, reloadtables: true });
            } catch (err) {
                application.fatal(obj.res, err);
            }
        }
        , f_otimizar: async (idcube) => {
            try {
                const cube = await db.getModel('bi_cube').findOne({ where: { id: idcube } });
                if (cube && !cube.virtual) {
                    const dimensions = await db.getModel('bi_cubedimension').findAll({ where: { idcube: cube.id } });
                    const measures = await db.getModel('bi_cubemeasure').findAll({ where: { idcube: cube.id } });
                    let indexes = [];
                    for (let i = 0; i < dimensions.length; i++) {
                        indexes.push(`create index "idx_bi_cube_${idcube}_${dimensions[i].sqlfield}" on bi_cube_${idcube}("${dimensions[i].sqlfield}")`);
                    }
                    if (cube.datasource) {
                        const config = await db.getModel('config').findOne();
                        const custom = require(application.functions.rootDir() + `custom/${config.customfile}`);
                        const dsf = application.functions.getRealReference(custom, cube.datasource);
                        if (dsf) {
                            const data = await dsf(cube.sql);
                            const ct = [];
                            const keys = [];
                            for (const d of dimensions) {
                                ct.push(`"${d.sqlfield}" Text`);
                                keys.push(d.sqlfield);
                            }
                            for (const m of measures) {
                                ct.push(`"${m.sqlfield}" Numeric`);
                                keys.push(m.sqlfield);
                            }
                            await db.sequelize.query(`drop table if exists bi_cube_${idcube}; create table bi_cube_${idcube} (${ct.join(',')});` + indexes.join(';'));
                            for (const d of data) {
                                await db.sequelize.query(`insert into bi_cube_${idcube} (${keys.map((k) => { return `"${k}"`; })}) values (${keys.map((k) => { return d[k] != null ? `'${db.sanitizeString(d[k].toString())}'` : 'null'; })})`);
                            }
                        } else {
                            console.error(`Função DS não encontrada no cubo ${cube.description}`);
                        }
                    } else {
                        await db.sequelize.query(`drop table if exists bi_cube_${idcube}; create table bi_cube_${idcube} as ${cube.sql};` + indexes.join(';'));

                    }
                    cube.lastloaddate = moment();
                    await cube.save();
                }
            } catch (err) {
                console.error(err);
            }
        }
        , f_desagendar: function (idcube) {
            if (cube_schedules[idcube]) {
                cube_schedules[idcube].cancel();
                delete cube_schedules[idcube];
            }
        }
        , f_agendar: function (cube) {
            if (cube.virtual)
                return;
            bi.cube.f_desagendar(cube.id);
            let rule = null;
            if (cube.loadfrequency == 'De Hora em Hora') {
                rule = '5 * * * *';
            } else if (cube.loadfrequency == 'Diariamente') {
                rule = '0 1 * * *';
            } else if (cube.loadfrequency == 'Semanalmente') {
                rule = '0 1 * * 1'; //Segunda
            }
            if (rule)
                cube_schedules[cube.id] = schedule.scheduleJob(rule
                    , bi.cube.f_otimizar.bind(null, cube.id));
        }
    }
    , analysis: {
        onsave: async function (obj, next) {
            try {
                if (obj.register.id == 0) {
                    obj.register.iduser = obj.req.user.id;
                }
                if (obj.register.iduser != obj.req.user.id) {
                    const share = await db.findOne('bi_analysisuser', { idanalysis: obj.register.id, iduser: obj.req.user.id });
                    if (!share || !share.editable) {
                        return application.error(obj.res, { msg: 'Você não tem permissão par editar esta análise' });
                    }
                }
                await next(obj);
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , f_getBaseQuery: async function (idcube, options) {
            let cube = await db.getModel('bi_cube').findOne({ where: { id: idcube } });
            let columnsAndRows = [];
            columnsAndRows = columnsAndRows.concat(options.columns || []);
            columnsAndRows = columnsAndRows.concat(options.rows || []);

            if (cube.virtual) {
                options.virtual = true;
                let cubes = await db.getModel('bi_cubevirtual').findAll({
                    raw: true, include: [{ all: true }], where: { idcube: cube.id }
                });
                let query = 'with ';
                let cubesjoined = [];
                let allmeasures = [];
                for (let i = 0; i < cubes.length; i++) {
                    let currentquery = await bi.analysis.f_getBaseQuery(cubes[i].idcubev, options);
                    if (currentquery) {
                        query += (cubesjoined.length > 0 ? ', ' : '') + `"${cubes[i]['virtual.description']}"` + ' as (' + currentquery + ')';
                        cubesjoined.push(`"${cubes[i]['virtual.description']}"`);
                        let measures = await db.getModel('bi_cubemeasure').findAll({ where: { idcube: cubes[i].idcubev } });
                        for (let z = 0; z < measures.length; z++) {
                            allmeasures.push(`${cubes[i]['virtual.description']}.${measures[z].sqlfield}`);
                        }
                    }
                }
                let joins = cubesjoined[0];
                if (columnsAndRows.length > 0) {
                    for (let i = 1; i < cubesjoined.length; i++) {
                        joins += ` full outer join ${cubesjoined[i]} on (`;
                        for (let z = 0; z < columnsAndRows.length; z++) {
                            joins += `${z > 0 ? ' and' : ''} ${cubesjoined[i - 1]}."${columnsAndRows[z]}"::text = ${cubesjoined[i]}."${columnsAndRows[z]}"::text`;
                        }
                        joins += `)`;
                    }
                    let j = [];
                    for (let i = 0; i < columnsAndRows.length; i++) {
                        j.push(i + 1);
                    }
                    joins += ' group by ' + j.join(',');
                } else {
                    joins = cubesjoined.join(',');
                }
                let vcolumns = [];
                for (let i = 0; i < columnsAndRows.length; i++) {
                    let c = [];
                    for (let z = 0; z < cubesjoined.length; z++) {
                        c.push(`${cubesjoined[z]}."${columnsAndRows[i]}"::text`);
                    }
                    vcolumns.push(`coalesce(${c.join(',')}) as "${columnsAndRows[i]}"`);
                }
                let vmeasures = [];
                for (let i = 0; i < allmeasures.length; i++) {
                    vmeasures.push(`sum("${allmeasures[i]}") as "${allmeasures[i]}"`);
                }
                return `${query} select ${vcolumns.concat(vmeasures)} from ${joins}`;
            }

            let dimensions = await db.getModel('bi_cubedimension').findAll({ where: { idcube: cube.id } });
            let measures = await db.getModel('bi_cubemeasure').findAll({ where: { idcube: cube.id } });

            let sqlcolumns = [];
            for (let i = 0; i < columnsAndRows.length; i++) {
                let found = false;
                for (let z = 0; z < dimensions.length; z++) {
                    if (columnsAndRows[i] == dimensions[z].sqlfield) {
                        sqlcolumns.push('"' + columnsAndRows[i] + '"');
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    sqlcolumns.push(`'' as "${columnsAndRows[i]}"`);
                }
            }

            let sqlmeasures = [];
            for (let z = 0; z < measures.length; z++) {
                if (measures[z].aggregator == 'count distinct') {
                    sqlmeasures.push(`count(distinct "${measures[z].sqlfield}") as "${options.virtual ? `${cube.description}.` : ''}${measures[z].sqlfield}"`)
                } else {
                    sqlmeasures.push(`${measures[z].aggregator}("${measures[z].sqlfield}") as "${options.virtual ? `${cube.description}.` : ''}${measures[z].sqlfield}"`)
                }
            }

            let groupby = [];
            for (let i = 0; i < sqlcolumns.length; i++) {
                groupby.push(i + 1);
            }
            groupby = groupby.length > 0 ? `group by ${groupby.join(',')}` : '';

            let filter = [];
            for (let k in options.filter) {
                for (let z = 0; z < dimensions.length; z++) {
                    if (dimensions[z].sqlfield == k) {
                        if (typeof options.filter[k] == 'string') { // dynamic filter
                            switch (options.filter[k]) {
                                case 'Dia Atual':
                                    filter.push(`"${k}" = lpad(extract(day from now())::text, 2, '0')`);
                                    break;
                                case 'Mês Atual':
                                    filter.push(`"${k}" = lpad(extract(month from  now())::text, 2, '0') || '-' || to_char(to_timestamp (extract(month from  now())::text, 'MM'), 'TMMonth')`);
                                    break;
                                case 'Ano Atual':
                                    filter.push(`"${k}" = extract(year from now())::text`);
                                    break;
                            }

                        } else {
                            const items = [];
                            for (let i = 0; i < options.filter[k].length; i++) {
                                items.push(`'${db.sanitizeString(options.filter[k][i].toString())}'`);
                            }
                            filter.push(`"${k}" in (${items.join(',')})`);
                        }
                        break;
                    }
                }
            }
            filter = filter.length > 0 ? ` where ${filter.join(' and ')}` : '';
            return `
            select
                ${sqlcolumns.concat(sqlmeasures).join(', ')}
            from
                bi_cube_${cube.id}
                ${filter}
                ${groupby}`;
        }
        , f_getQuery: async function (query, options) {
            let cm = [];
            let realcube;
            let dimensions = [];
            for (let k in options.calculatedmeasures) {
                let value = options.calculatedmeasures[k];
                let splitted = value.split(' ');
                for (let i = 0; i < splitted.length; i++) {
                    if (splitted[i] == 'from') {
                        i++;
                        // console.log('try finding', splitted[i + 1]);
                        // let realname = [];
                        // while (i < splitted.length) {
                        //     realname.push(splitted[i]);
                        //     i++;
                        //     if (realname.length > 0 && splitted[i - 1].includes('"'))
                        //         break;
                        // }
                        // console.log(realname);
                        realcube = await db.getModel('bi_cube').findOne({ raw: true, where: { description: splitted[i].replace(/"/g, '') } });
                        if (realcube)
                            splitted[i] = 'bi_cube_' + realcube.id;
                    } else if (splitted[i].includes('$filter')) {
                        if (realcube) {
                            dimensions = await db.getModel('bi_cubedimension').findAll({ raw: true, where: { idcube: realcube.id } });
                            let dimarr = [];
                            for (let z = 0; z < dimensions.length; z++) {
                                dimarr.push(dimensions[z].sqlfield);
                            }
                            let filter = [];
                            for (let f in options.filter) {
                                if (dimarr.indexOf(f) >= 0) {
                                    const arr = [];
                                    for (let i = 0; i < options.filter[f].length; i++) {
                                        arr.push(`'${db.sanitizeString(options.filter[f][i].toString())}'`);
                                    }
                                    filter.push(`"${f}" in (${arr.join(',')})`);
                                }
                            }
                            if (splitted[i].includes('$filters')) {
                                if (options.rows) {
                                    for (let i = 0; i < options.rows.length; i++) {
                                        if (dimarr.indexOf(options.rows[i]) >= 0) {
                                            filter.push(`"${options.rows[i]}"::text = x."${options.rows[i]}"::text`);
                                        } else {
                                            filter.push(`x."${options.rows[i]}"::text is null`);
                                        }
                                    }
                                }
                                if (options.columns) {
                                    for (let i = 0; i < options.columns.length; i++) {
                                        if (dimarr.indexOf(options.columns[i]) >= 0) {
                                            filter.push(`"${options.columns[i]}"::text = x."${options.columns[i]}"::text`)
                                        } else {
                                            filter.push(`x."${options.rows[i]}"::text is null`);
                                        }
                                    }
                                }
                            }
                            splitted[i] = splitted[i].replace(splitted[i].includes('$filters') ? '$filters' : '$filter', filter.length > 0 ? filter.join(' and ') : '1=1');
                        }
                    }
                }
                value = splitted.join(' ');
                cm.push(`(${value}) as "${k}"`);
            }
            query = `select * from (select x.* ${cm.length > 0 ? ',' + cm.join(',') : ''} from (${query}) as x) as x`;
            let w = [];
            for (let i = 0; i < options.measures.length; i++) {
                w.push(`"${options.measures[i]}" is not null`);
            }
            query += w.length > 0 ? ' where ' + w.join(' or ') : '';
            return query;
        }
        , f_getCubeDimensions: async function (idcube, dimensions) {
            let _dimensions = []
            let cube = await db.getModel('bi_cube').findOne({ raw: true, where: { id: idcube } });
            for (let i = 0; i < dimensions.length; i++) {
                let cubename = cube.description;
                let dimensionname = dimensions[i];
                const split = dimensions[i].split('.');
                if (split.length > 1) {//Virtual
                    cubename = split[0];
                    dimensionname = split[1];
                }
                _dimensions.push((await db.sequelize.query(`select cd.* from bi_cube c left join bi_cubedimension cd on (c.id = cd.idcube)
                    where c.description like '${cubename}' and cd.sqlfield like '${dimensionname}'`
                    , { type: db.Sequelize.QueryTypes.SELECT }))[0]);
            }
            return _dimensions;
        }
        , f_getCubeMeasures: async function (idcube, measures) {
            let _measures = []
            let cube = await db.getModel('bi_cube').findOne({ raw: true, where: { id: idcube } });
            for (let i = 0; i < measures.length; i++) {
                let cubename = cube.description;
                let measurename = measures[i];
                const split = measures[i].split('.');
                if (split.length > 1) {//Virtual
                    cubename = split[0];
                    measurename = split[1];
                }
                _measures.push((await db.sequelize.query(`select cm.* from bi_cube c left join bi_cubemeasure cm on (c.id = cm.idcube)
                    where c.description like '${cubename}' and cm.sqlfield like '${measurename}'`
                    , { type: db.Sequelize.QueryTypes.SELECT }))[0]);
            }
            return _measures;
        }
        , js_executeAnalysis: async function (obj) {
            try {
                const options = {
                    rows: obj.data.rows
                    , columns: obj.data.columns
                    , measures: obj.data.measures
                    , _measures: await bi.analysis.f_getCubeMeasures(obj.data.idcube, obj.data.measures)
                    , config: JSON.parse(obj.data.config || '{}')
                    , calculatedmeasures: JSON.parse(obj.data.calculatedmeasures || '{}')
                    , filter: JSON.parse(obj.data.filter || '{}')
                    , charttype: obj.data.charttype
                };
                let query = await bi.analysis.f_getBaseQuery(obj.data.idcube, options);
                query = await bi.analysis.f_getQuery(query, options);
                // require('fs-extra').writeFile(`${__dirname}/../../tmp/lastbiquery.sql`, query);
                const sql = await db.sequelize.query(
                    query
                    , { type: db.sequelize.QueryTypes.SELECT }
                );
                application.success(obj.res, { data: bi.f_pivot(sql, options) });
            } catch (err) {
                application.error(obj.res, { msg: err.message });
            }
        }
        , js_getCube: async function (obj) {
            try {
                let cube = await db.getModel('bi_cube').findOne({ raw: true, where: { id: obj.data.idcube } });
                let data = {
                    dimensions: []
                    , measures: []
                };
                if (cube.virtual) {
                    let cubes = await db.getModel('bi_cubevirtual').findAll({
                        raw: true, include: [{ all: true }], where: { idcube: cube.id }
                    });
                    for (let i = 0; i < cubes.length; i++) {
                        let vcube = await db.getModel('bi_cube').findOne({ raw: true, where: { id: cubes[i]['virtual.id'] } });
                        let dimensions = await db.getModel('bi_cubedimension').findAll({ raw: true, where: { idcube: vcube.id } });
                        let measures = await db.getModel('bi_cubemeasure').findAll({ raw: true, where: { idcube: vcube.id } });
                        for (let z = 0; z < dimensions.length; z++) {
                            if (data.dimensions.indexOf(dimensions[z].sqlfield) == -1) {
                                data.dimensions.push(dimensions[z].sqlfield);
                            }
                        }
                        for (let z = 0; z < measures.length; z++) {
                            data.measures.push(`${vcube.description}.${measures[z].sqlfield}`);
                        }
                    }
                } else {
                    let dimensions = await db.getModel('bi_cubedimension').findAll({ raw: true, where: { idcube: cube.id }, order: [['sqlfield', 'asc']] });
                    let measures = await db.getModel('bi_cubemeasure').findAll({ raw: true, where: { idcube: cube.id }, order: [['sqlfield', 'asc']] });
                    for (let i = 0; i < dimensions.length; i++) {
                        data.dimensions.push(dimensions[i].sqlfield);
                    }
                    for (let i = 0; i < measures.length; i++) {
                        data.measures.push(measures[i].sqlfield);
                    }
                }
                return application.success(obj.res, { data: data });
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , js_getFilter: async function (obj) {
            try {
                let cube = await db.getModel('bi_cube').findOne({ raw: true, where: { id: obj.data.idcube } });
                let sql = [];
                if (cube.virtual) {
                    let cubes = await db.getModel('bi_cubevirtual').findAll({
                        raw: true, include: [{ all: true }], where: { idcube: cube.id }
                    });
                    let unions = []
                    for (let i = 0; i < cubes.length; i++) {
                        let dimensions = await db.getModel('bi_cubedimension').findAll({ raw: true, where: { idcube: cubes[i]['virtual.id'] } });
                        for (let z = 0; z < dimensions.length; z++) {
                            if (dimensions[z].sqlfield == obj.data.key) {
                                unions.push(`select distinct "${obj.data.key}" as option from bi_cube_${cubes[i]['virtual.id']}`);
                            }
                        }
                    }
                    let query = `select * from (${unions.join(' union ')}) as x order by 1`;
                    sql = await db.sequelize.query(query, { type: db.sequelize.QueryTypes.SELECT });
                } else {
                    sql = await db.sequelize.query(`
                    select distinct
                        "${obj.data.key}" as option
                    from
                        bi_cube_${cube.id}
                    order by 1
                    `, { type: db.sequelize.QueryTypes.SELECT });
                }
                let ret = [];
                for (let i = 0; i < sql.length; i++) {
                    ret.push([sql[i].option]);
                }
                return application.success(obj.res, { data: ret });
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , js_print: async function (obj) {
            try {
                let pagebreak = '<div style="page-break-after:always"></div>';
                let html = `
                <html>
                    <head>
                        <meta charset="utf8">
                    </head>
                    <body>
                        <style>
                            ${fs.readFileSync(`${application.functions.rootDir()}public/assets/pivotjs/pivot.css`)}
                        </style>
                        <div style="width:100%;text-align:center;">
                            <h4>${obj.data.title || ''}</h4>
                        </div>
                        ${obj.data.table}
                        ${pagebreak}
                        <div style="width:100%">
                            ${obj.data.chart}
                        </div>
                    </body>
                </html>`;
                const filename = process.hrtime()[1];
                const path = `${application.functions.rootDir()}tmp/${process.env.NODE_APPNAME}`;
                fs.writeFileSync(`${path}/${filename}.html`, html);
                const browser = await puppeteer.launch();
                const page = await browser.newPage();
                await page.goto(`http://localhost:${process.env.NODE_PORT}/download/${filename}.html`);
                await page.pdf({
                    path: `${path}/${filename}.pdf`
                    , format: 'A4'
                    , printBackground: true
                    , scale: 0.8
                    , margin: {
                        top: "0.5cm"
                        , right: "0.5cm"
                        , bottom: "0.5cm"
                        , left: "0.5cm"
                    }
                    , landscape: true
                });
                await browser.close();
                return application.success(obj.res, { openurl: `/download/${filename}.pdf` });
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , e_share: async (obj) => {
            try {
                if (obj.req.method == 'GET') {
                    if (obj.ids.length <= 0) {
                        return application.error(obj.res, { msg: application.message.selectOneEvent });
                    }
                    let body = '';
                    body += application.components.html.hidden({ name: 'ids', value: obj.ids.join(',') });
                    body += application.components.html.autocomplete({
                        width: '12'
                        , label: 'Usuário'
                        , name: 'iduser'
                        , model: 'users'
                        , attribute: 'fullname'
                        , where: 'active is true'
                    });
                    application.success(obj.res, {
                        modal: {
                            form: true
                            , action: '/event/' + obj.event.id
                            , id: 'modalevt'
                            , title: obj.event.description
                            , body: body
                            , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Compartilhar</button>'
                        }
                    });
                } else {
                    const invalidfields = application.functions.getEmptyFields(obj.req.body, ['ids', 'iduser']);
                    if (invalidfields.length > 0)
                        return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                    const ids = obj.req.body.ids.split(',');
                    for (const id of ids) {
                        const analysis = await db.findById('bi_analysis', id);
                        await db.getModel('bi_analysis').create({
                            iduser: obj.req.body.iduser
                            , idcube: analysis.idcube
                            , description: analysis.description
                            , rows: analysis.rows
                            , columns: analysis.columns
                            , measures: analysis.measures
                            , filter: analysis.filter
                            , charttype: analysis.charttype
                            , calculatedmeasures: analysis.calculatedmeasures
                            , config: analysis.config
                        });
                    }
                    application.success(obj.res, { msg: application.message.success });
                }
            } catch (err) {
                application.fatal(obj.res, err);
            }
        }
    }
    , analysisuser: {
        onsave: async (obj, next) => {
            try {
                const saved = await next(obj);
                if (saved.success) {
                    const analysis = await db.findById('bi_analysis', saved.register.idanalysis);
                    const user = await db.findById('users', saved.register.iduser);
                    if (user && user.email)
                        mail.f_sendmail({
                            to: [user.email]
                            , subject: `SIP - Nova Análise Compartilhada`
                            , html: `Análise: <a href="https://${process.env.NODE_APPNAME}.plastrela.com.br/v/analise/${saved.register.id}" target="_blank">${analysis.description}</a>`
                        });
                }
            } catch (err) {
                application.fatal(obj.res, err);
            }
        }
    }
    , dashboard: {
        onsave: async (obj, next) => {
            try {
                if (!obj.register.iduser)
                    obj.register.iduser = obj.req.user.id;
                if (obj.register.iduser != obj.req.user.id) {
                    const perm = await db.findOne('bi_dashboarduser', { iddashboard: obj.register.id, iduser: obj.req.user.id, editable: true });
                    if (!perm)
                        return application.error(obj.res, { msg: 'Você não tem permissão para realizar esta ação' });
                }
                await next(obj);
            } catch (err) {
                application.fatal(obj.res, err);
            }
        }
        , ondelete: async (obj, next) => {
            try {
                const ds = await db.findAll('bi_dashboard', { id: { [db.Op.in]: obj.ids } });
                for (const d of ds) {
                    if (d.iduser != obj.req.user.id) {
                        const perm = await db.findOne('bi_dashboarduser', { iddashboard: d.id, iduser: obj.req.user.id, editable: true });
                        if (!perm)
                            return application.error(obj.res, { msg: 'Você não tem permissão para realizar esta ação' });
                    }
                }
                await next(obj);
            } catch (err) {
                application.fatal(obj.res, err);
            }
        }
        , js_renderAnalysis: async (obj) => {
            try {
                const dashboardanalysis = await db.getModel('bi_dashboardanalysis').findAll({ raw: true, where: { iddashboard: obj.data.iddashboard }, order: [['order', 'asc']] });
                let rendered = [];
                for (let i = 0; i < dashboardanalysis.length; i++) {
                    const analysis = await db.getModel('bi_analysis').findOne({ raw: true, where: { id: dashboardanalysis[i].idanalysis } });
                    const m = analysis.measures ? analysis.measures.split(',') : [];
                    const options = {
                        rows: analysis.rows ? analysis.rows.split(',') : []
                        , columns: analysis.columns ? analysis.columns.split(',') : []
                        , measures: m
                        , _measures: bi.analysis.f_getCubeMeasures(analysis.idcube, m)
                        , config: JSON.parse(analysis.config || '{}')
                        , calculatedmeasures: JSON.parse(analysis.calculatedmeasures || '{}')
                        , filter: JSON.parse(analysis.filter || '{}')
                        , charttype: analysis.charttype
                    };
                    let query = await bi.analysis.f_getBaseQuery(analysis.idcube, options);
                    query = await bi.analysis.f_getQuery(query, options);
                    const sql = await db.sequelize.query(query, { type: db.sequelize.QueryTypes.SELECT });
                    rendered.push({ analysis: analysis, dashboardanalysis: dashboardanalysis[i], data: bi.f_pivot(sql, options) });
                }
                return application.success(obj.res, { rendered: rendered });
            } catch (err) {
                application.fatal(obj.res, err);
            }
        }
    }
    , dashboardanalysis: {
        onsave: async (obj, next) => {
            try {
                const dashboard = await db.findById('bi_dashboard', obj.register.iddashboard || 0);
                if (!dashboard)
                    return application.error(obj.res, { msg: 'Dashboard não encontrado' });
                if (obj.req.user.id != dashboard.iduser) {
                    const perm = await db.findOne('bi_dashboarduser', { iddashboard: dashboard.id, iduser: obj.req.user.id, editable: true });
                    if (!perm)
                        return application.error(obj.res, { msg: 'Você não tem permissão para realizar esta ação' });
                }
                await next(obj);
            } catch (err) {
                application.fatal(obj.res, err);
            }
        }
        , ondelete: async (obj, next) => {
            try {
                const dus = await db.findAll('bi_dashboardanalysis', { id: { [db.Op.in]: obj.ids } });
                for (const du of dus) {
                    const dashboard = await db.findById('bi_dashboard', du.iddashboard);
                    if (!dashboard)
                        return application.error(obj.res, { msg: 'Dashboard não encontrado' });
                    if (obj.req.user.id != dashboard.iduser) {
                        const perm = await db.findOne('bi_dashboarduser', { iddashboard: dashboard.id, iduser: obj.req.user.id, editable: true });
                        if (!perm)
                            return application.error(obj.res, { msg: 'Você não tem permissão para realizar esta ação' });
                    }
                }
                await next(obj);
            } catch (err) {
                application.fatal(obj.res, err);
            }
        }
    }
    , dashboarduser: {
        onsave: async (obj, next) => {
            try {
                const dashboard = await db.findById('bi_dashboard', obj.register.iddashboard || 0);
                if (!dashboard)
                    return application.error(obj.res, { msg: 'Dashboard não encontrado' });
                if (obj.req.user.id != dashboard.iduser) {
                    const perm = await db.findOne('bi_dashboarduser', { iddashboard: dashboard.id, iduser: obj.req.user.id, editable: true });
                    if (!perm)
                        return application.error(obj.res, { msg: 'Você não tem permissão para realizar esta ação' });
                }
                await next(obj);
            } catch (err) {
                application.fatal(obj.res, err);
            }
        }
        , ondelete: async (obj, next) => {
            try {
                const dus = await db.findAll('bi_dashboarduser', { id: { [db.Op.in]: obj.ids } });
                for (const du of dus) {
                    const dashboard = await db.findById('bi_dashboard', du.iddashboard);
                    if (!dashboard)
                        return application.error(obj.res, { msg: 'Dashboard não encontrado' });
                    if (obj.req.user.id != dashboard.iduser) {
                        const perm = await db.findOne('bi_dashboarduser', { iddashboard: dashboard.id, iduser: obj.req.user.id, editable: true });
                        if (!perm)
                            return application.error(obj.res, { msg: 'Você não tem permissão para realizar esta ação' });
                    }
                }
                await next(obj);
            } catch (err) {
                application.fatal(obj.res, err);
            }
        }
    }
}

//Agendamento de Carga dos Cubos
db.sequelize.query("SELECT * FROM bi_cube WHERE virtual = false", { type: db.sequelize.QueryTypes.SELECT }).then(scheds => {
    scheds.map(sched => {
        bi.cube.f_agendar(sched);
    });
});

module.exports = bi;