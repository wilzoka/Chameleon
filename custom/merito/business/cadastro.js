const application = require('../../../routes/application')
    , platform = require('../../platform')
    , db = require('../../../models')
    , moment = require('moment')
    , fs = require('fs-extra')
    ;

let main = {
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
                    platform.notification.create([4], {
                        title: 'Novo Cliente'
                        , description: saved.register.fantasia
                        , link: '/v/cliente/' + saved.register.id
                    });
                    db.sequelize.query("update cad_pessoa p set nomecompleto = coalesce(p.fantasia,'') || ' - ' || coalesce(p.bairro,'') || ' - ' || coalesce(p.logradouro,'') || ' - Nº ' || p.numero  || ' - ' || coalesce(p.complemento,'') where id = :idcliente;"
                        , {
                            type: db.sequelize.QueryTypes.UPDATE
                            , replacements: { idcliente: saved.register.id }
                        });
                }
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
    }
}

module.exports = main;