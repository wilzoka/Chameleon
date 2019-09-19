const application = require('../../routes/application')
    , db = require('../../models')
    ;

let bi = {
    f_pivot: function (sql, options) {
        let columns = options.columns || [];
        let rows = options.rows || [];
        let measures = options.measures || [];

        let row_order = []//[0, 'asc'];
        let column_order = []//[0, 'asc'];

        let row_total = true;
        let column_total = true;

        let delimiter = '->';

        let data = [];
        for (let i = 0; i < sql.length; i++) {
            let currentrow = [];
            for (let z = 0; z < rows.length; z++) {
                currentrow.push(sql[i][rows[z]]);
            }
            let currentcolumn = [];
            for (let z = 0; z < columns.length; z++) {
                currentcolumn.push(sql[i][columns[z]]);
            }
            let currentmeasures = [];
            for (let z = 0; z < measures.length; z++) {
                currentmeasures.push(sql[i][measures[z]]);
            }
            data.push({
                row: currentrow.join(delimiter)
                , column: currentcolumn.join(delimiter)
                , measures: currentmeasures
            });
        }

        let structure = {
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

        if (column_order.length === 0) {
            structure.c = structure.c.sort();
        }
        if (row_order.length === 0) {
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
            structure.c[i] = { val: structure.c[i], total: emptyTotal(), withValues: emptyTotal() };
        }
        for (let i = 0; i < structure.r.length; i++) {
            structure.r[i] = { val: structure.r[i], total: emptyTotal(), withValues: emptyTotal() };
        }
        for (let i = 0; i < data.length; i++) {
            for (let r = 0; r < structure.r.length; r++) {
                if (data[i].row == structure.r[r].val) {
                    for (let m = 0; m < measures.length; m++) {
                        structure.r[r].total[m] += parseFloat(data[i].measures[m] || 0);
                        if (!isNaN(data[i].measures[m]))
                            structure.r[r].withValues[m]++;
                    }
                }
            }
        }
        for (let c = 0; c < structure.c.length; c++) {
            for (let i = 0; i < data.length; i++) {
                if (data[i].column === structure.c[c].val) {
                    for (let m = 0; m < measures.length; m++) {
                        structure.c[c].total[m] = parseFloat(structure.c[c].total[m]) + parseFloat(data[i].measures[m] || 0);
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

        function compare(order) {
            return function (a, b) {
                if (a.total[order[0]] < b.total[order[0]])
                    return order[1] == 'asc' ? -1 : 1;
                if (a.total[order[0]] > b.total[order[0]])
                    return order[1] == 'asc' ? 1 : -1;
                return 0;
            }
        }
        if (column_order.length > 0) {
            structure.c = structure.c.sort(compare(column_order));
        }
        if (row_order.length > 0) {
            structure.r = structure.r.sort(compare(row_order));
        }

        //Cria os levels de span para linha e coluna
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
        let charts = [];
        let categories = [];
        for (let i = 0; i < structure.r.length; i++) {
            categories.push(structure.r[i].val);
        }
        if (structure.columns.length > 0) {
            for (let m = 0; m < measures.length; m++) {
                let series = [];
                for (let c = 0; c < structure.c.length; c++) {
                    seriesdata = [];
                    for (let r = 0; r < structure.r.length; r++) {
                        let sd = null;
                        for (let i = 0; i < data.length; i++) {
                            if (structure.c[c].val == data[i].column && structure.r[r].val == data[i].row) {
                                sd = { name: data[i].row, y: parseFloat(parseFloat(data[i].measures[m]).toFixed(2)) };
                                break;
                            }
                        }
                        if (!sd) {
                            sd = { name: '', y: 0 };
                        }
                        seriesdata.push(sd);
                    }
                    series.push({
                        name: structure.c[c].val
                        , data: seriesdata
                    });
                }
                charts.push({
                    title: measures[m]
                    , categories: categories
                    , series: series
                });
            }
        } else {
            let series = [];
            for (let i = 0; i < measures.length; i++) {
                let seriesdata = [];
                for (let r = 0; r < structure.r.length; r++) {
                    for (let z = 0; z < data.length; z++) {
                        if (structure.r[r].val == data[z].row) {
                            seriesdata.push({ name: data[z].row, y: parseFloat(parseFloat(data[z].measures[i]).toFixed(2)) });
                            break;
                        }
                    }
                }
                series.push({
                    name: measures[i]
                    , data: seriesdata
                });
            }
            charts.push({
                categories: categories
                , series: series
            });
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
                        data.splice(z, 1);
                        z--;
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
            , charts: charts
        };
    }
    , cube: {
        onsave: async function (obj, next) {
            try {
                if (obj.register.id == 0) {
                    //Popular medidas/dimensoes
                }
                await next(obj);
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
    }
    , analysis: {
        onsave: async function (obj, next) {
            try {
                if (obj.register.id == 0) {
                    obj.register.iduser = obj.req.user.id;
                }
                await next(obj);
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , f_getQuery: async function (idcube, options) {
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
                    let currentquery = await bi.analysis.f_getQuery(cubes[i].idcubev, options);
                    if (currentquery) {
                        query += (cubesjoined.length > 0 ? ', ' : '') + cubes[i]['virtual.description'] + ' as (' + currentquery + ')';
                        cubesjoined.push(cubes[i]['virtual.description']);
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
                    vmeasures.push(`"${allmeasures[i]}"`);
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
                sqlmeasures.push(`${measures[z].aggregator}("${measures[z].sqlfield}") as "${options.virtual ? `${cube.description}.` : ''}${measures[z].sqlfield}"`)
            }

            let groupby = [];
            for (let i = 0; i < sqlcolumns.length; i++) {
                groupby.push(i + 1);
            }
            groupby = groupby.length > 0 ? `group by ${groupby.join(',')}` : '';

            let filterobj = JSON.parse(options.filter || '{}');
            let filter = [];
            for (let k in filterobj) {
                for (let z = 0; z < dimensions.length; z++) {
                    if (k == dimensions[z].sqlfield) {
                        let arr = filterobj[k];
                        for (let i = 0; i < arr.length; i++) {
                            arr[i] = `'${arr[i]}'`;
                        }
                        filter.push(`"${k}" in (${arr.join(',')})`);
                        break;
                    }
                }
            }
            filter = filter.length > 0 ? ` where ${filter.join(' and ')}` : ''

            return `
            select
                ${sqlcolumns.concat(sqlmeasures).join(', ')}
            from
                (${cube.sql}) as x
                ${filter}
                ${groupby}`;

        }
        , js_executeAnalysis: async function (obj) {
            try {
                let query = await bi.analysis.f_getQuery(obj.data.idcube, obj.data);
                let cube = await db.getModel('bi_cube').findOne({ raw: true, where: { id: obj.data.idcube } });
                let calculatedmeasures = JSON.parse(obj.data.calculatedmeasures);
                let cm = [];
                for (let k in calculatedmeasures) {
                    cm.push(`(${calculatedmeasures[k]}) as "${k}"`);
                }
                query = `select * from (select x.* ${cm.length > 0 ? ',' + cm.join(',') : ''} from (${query}) as x) as x`;
                for (let i = 0; i < obj.data.measures.length; i++) {
                    if (i == 0) {
                        query += ` where "${obj.data.measures[i]}" is not null`;
                    } else {
                        query += ` or "${obj.data.measures[i]}" is not null`;
                    }
                }
                // require('fs-extra').writeFile(`${__dirname}/../../tmp/lastbiquery.sql`, query);
                let sql = await db.sequelize.query(query, { type: db.sequelize.QueryTypes.SELECT });
                let options = {
                    rows: obj.data.rows
                    , columns: obj.data.columns
                    , measures: obj.data.measures
                    , _measures: []
                };
                for (let i = 0; i < options.measures.length; i++) {
                    let cubename = cube.description;
                    let measurename = options.measures[i];
                    let split = options.measures[i].split('.');
                    if (split.length > 1) {//Virtual
                        cubename = split[0];
                        measurename = split[1];
                    }
                    options._measures.push((await db.sequelize.query(`select cm.* from bi_cube c left join bi_cubemeasure cm on (c.id = cm.idcube)
                    where c.description like '${cubename}' and cm.sqlfield like '${measurename}'`
                        , { type: db.Sequelize.QueryTypes.SELECT }))[0]);
                }
                return application.success(obj.res, { data: bi.f_pivot(sql, options) });
            } catch (err) {
                return application.fatal(obj.res, err);
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
                                unions.push(`select distinct "${obj.data.key}" as option from (${cubes[i]['virtual.sql']}) as x`);
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
                        (${cube.sql}) as x
                    order by 1
                    `, { type: db.sequelize.QueryTypes.SELECT });
                }
                let html = `<div class="row"><div class="col-md-12"><table id="tablefilter" class="table table-bordered table-hover dataTable no-footer" width="100%">
                <thead>
                    <tr>
                        <td></td>
                        <td>${obj.data.key}</td>
                    </tr>
                </thead>
                <tbody>`;
                for (let i = 0; i < sql.length; i++) {
                    html += `<tr>`;
                    html += `<td></td> <td>${sql[i].option}</td>`;
                    html += `</tr>`;
                }
                html += `</tbody></table></div></div>`;
                return application.success(obj.res, { data: { html: html } });
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
    }
}

module.exports = bi;