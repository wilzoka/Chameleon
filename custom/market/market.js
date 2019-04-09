const application = require('../../routes/application')
    , db = require('../../models')
    , moment = require('moment')
    ;

let main = {
    platform: require('../platform.js')
    , market: {
        e_popularNFCe: async (obj) => {
            try {
                if (obj.ids.length != 1) {
                    return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                }
                let nfce = await db.getModel('mkt_nfce').findOne({ where: { id: obj.ids[0] } });
                const jsdom = require("jsdom");
                const { JSDOM } = jsdom;
                const dom = new JSDOM(nfce.html);
                const $ = (require('jquery'))(dom.window);
                
                
                let test = $('#NFe').find('fieldset').html();
                console.log(test);

                return application.success(obj.res, { msg: 'ok' });
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , cadastro: {
            pessoa: {
                onsave: async function (obj, next) {
                    try {
                        if (obj.view.name == "Cliente") {
                            obj.register.cliente = true;
                        } else if (obj.view.name == "Fornecedor") {
                            obj.register.fornecedor = true;
                        }
                        let saved = await next(obj);

                        if (saved.success) {
                            let pessoa = await db.getModel('cad_pessoa').findOne({ where: { id: saved.register.id } })
                            main.platform.notification.create([4], {
                                title: 'Novo Cliente'
                                , description: pessoa.fantasia
                                , link: '/v/cliente/' + saved.register.id
                            });
                        }

                        db.sequelize.query("update cad_pessoa p set nomecompleto = coalesce(p.fantasia,'') || ' - ' || coalesce(p.bairro,'') || ' - ' || coalesce(p.logradouro,'') || ' - Nº ' || p.numero  || ' - ' || coalesce(p.complemento,'') where id = :idcliente;"
                            , {
                                type: db.sequelize.QueryTypes.UPDATE
                                , replacements: { idcliente: obj.register.id }
                            });

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
        }
    }
}

module.exports = main;