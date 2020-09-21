const application = require('../../../routes/application')
    , db = require(application.functions.rootDir() + 'models')
    , moment = require('moment')
    , fs = require('fs-extra')
    , puppeteer = require('puppeteer')
    ;

let browser;

const main = {
    e_preview: async function (obj) {
        try {
            if (obj.ids.length != 1) {
                return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
            }
            const filename = await main.f_generate(obj.ids[0], {});
            if (filename) {
                application.success(obj.res, {
                    openurl: '/download/' + filename
                });
            } else {
                application.error(obj.res, { msg: 'ops' });
            }
        } catch (err) {
            application.fatal(obj.res, err);
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
                                table {
                                    width: 100%;
                                    border-collapse: collapse;
                                    border-spacing: 0;
                                }  
                                table td {
                                    border: 1px solid #888;
                                    padding: 5px;
                                }  
                                img {
                                    max-width: 100%;
                                }
                                figure {
                                    margin: 0;
                                }
                                .image-style-align-center {
                                    margin-left: auto;
                                    margin-right: auto;
                                }                           
                            </style>
                        </head>
                        <body>`;
                if (replaces.constructor === Object)
                    replaces = [replaces];
                function base64_encode(file) {
                    if (fs.existsSync(file)) {
                        const bitmap = fs.readFileSync(file);
                        return 'data:image/png;base64,' + Buffer.from(bitmap).toString('base64');
                    } else {
                        return '';
                    }
                }
                for (let i = 0; i < replaces.length; i++) {
                    replaces[i].__reportimage = '';
                    if (config.reportimage) {
                        const reportimage = JSON.parse(config.reportimage);
                        if (reportimage.length > 0)
                            replaces[i].__reportimage = '<img style="max-height: 35px;" src="' + base64_encode(application.functions.filesDir() + `${reportimage[0].id}.${reportimage[0].type}`) + '">';
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
                if (!browser)
                    browser = await puppeteer.launch();
                const page = await browser.newPage();
                await page.goto(`http://localhost:${process.env.NODE_PORT}/download/${filename}.html`);
                await page.pdf({
                    path: `${path}/${filename}.pdf`
                    , format: 'A4'
                    , printBackground: true
                    , scale: 0.75
                    , margin: {
                        top: "0.5cm"
                        , right: "0.5cm"
                        , bottom: "0.5cm"
                        , left: "0.5cm"
                    }
                    , landscape: report.landscape ? true : false
                });
                await page.close();
                resolve(`${filename}.pdf`);
            } catch (err) {
                return reject(err);
            }
        });
    }
}

module.exports = main;