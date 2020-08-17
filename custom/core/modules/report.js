const application = require('../../../routes/application')
    , db = require(application.functions.rootDir() + 'models')
    , moment = require('moment')
    , fs = require('fs-extra')
    , puppeteer = require('puppeteer')
    ;

let main = {
    e_preview: async function (obj) {
        try {
            if (obj.ids.length != 1) {
                return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
            }
            let filename = await main.f_generate(obj.ids[0], {});
            if (filename) {
                return application.success(obj.res, {
                    openurl: '/download/' + filename
                });
            } else {
                return application.error(obj.res, { msg: 'ops' });
            }
        } catch (err) {
            return application.fatal(obj.res, err);
        }
    }
    , f_generate: function (reportname, replaces) {
        return new Promise(async (resolve, reject) => {
            try {
                let where = {};
                if (isNaN(reportname)) {
                    where = { name: reportname };
                } else {
                    where = { id: reportname };
                }
                const report = await db.getModel('report').findOne({ where: where });
                if (!report) {
                    return reject(`Relatório ${report} não encontrado`);
                }
                const config = await db.getModel('config').findOne({ raw: true });
                let html = `
                    <html>
                        <head>
                            <meta charset="utf8">
                            <style>
                                html, body, table {
                                    font-family: "Courier New", Courier, monospace;
                                    font-size: ${report.fontsize || 10};
                                }
                                p {
                                    margin: 0;
                                }
                                tbody td {
                                    border-color: #bfbfbf;
                                    height: 14px;
                                    padding: 3px;
                                }
                                thead td, tfoot td {
                                    border: 1px solid black;
                                }
                                tr td {
                                    page-break-inside: avoid;
                                }
                                ul.todo-list {
                                    list-style: none;
                                }
                            </style>
                        </head>
                        <body>`;
                if (replaces.constructor === Object)
                    replaces = [replaces];
                function base64_encode(file) {
                    if (fs.existsSync(file)) {
                        const bitmap = fs.readFileSync(file);
                        return 'data:image/png;base64,' + (new Buffer.from(bitmap).toString('base64'));
                    } else {
                        return '';
                    }
                }
                for (let i = 0; i < replaces.length; i++) {
                    replaces[i].__reportimage = '';
                    if (config.reportimage) {
                        const reportimage = JSON.parse(config.reportimage);
                        if (reportimage.length > 0)
                            replaces[i].__reportimage = base64_encode(application.functions.filesDir() + `${reportimage[0].id}.${reportimage[0].type}`);
                    }
                    replaces[i].__datetime = moment().format(application.formatters.fe.datetime_format);
                    let htmlpart = report.html;
                    for (let k in replaces[i]) {
                        htmlpart = htmlpart.replace(new RegExp('{{' + k + '}}', 'g'), replaces[i][k] || '');
                    }
                    if (i < replaces.length - 1) // not last page
                        htmlpart += '<div style="page-break-after:always"></div>';
                    html += htmlpart;
                }
                html += `</body></html>`;
                const filename = process.hrtime()[1];
                const path = application.functions.tmpDir();
                fs.writeFileSync(`${path}/${filename}.html`, html);
                const browser = await puppeteer.launch();
                const page = await browser.newPage();
                await page.goto(`http://localhost:${process.env.NODE_PORT}/download/${filename}.html`);
                await page.pdf({
                    path: `${path}/${filename}.pdf`
                    , format: 'A4'
                    , printBackground: true
                    , scale: 1
                    , margin: {
                        top: "0.5cm"
                        , right: "0.5cm"
                        , bottom: "0.5cm"
                        , left: "0.5cm"
                    }
                    , landscape: report.landscape ? true : false
                });
                await browser.close();
                resolve(`${filename}.pdf`);
            } catch (err) {
                return reject(err);
            }
        });
    }
}

module.exports = main;