const application = require('../../../routes/application')
    , platform = require('../../platform')
    , db = require('../../../models')
    , moment = require('moment')
    , fs = require('fs-extra')
    ;

module.exports = async function (obj) {
    try {
        if (obj.req.params.function == 'getEvents') {
            let eventos = await db.getModel('eve_evento').findAll({ where: { publicar: true } });
            let data = [];
            for (let i = 0; i < eventos.length; i++) {
                let fotocapa = JSON.parse(eventos[i].fotocapa || '[]')[0];
                let fotopublicar = JSON.parse(eventos[i].fotopublicar || '[]');
                let fp = [];
                for (let z = 0; z < fotopublicar.length; z++) {
                    fp.push(`${fotopublicar[z].id}`)
                }
                data.push({
                    id: eventos[i].id
                    , description: eventos[i].descricao
                    , capa: fotocapa ? `${fotocapa.id}` : null
                    , fotos: fp
                });
            }
            return application.success(obj.res, { data: data });
        } else {
            return application.error(obj.res, {});
        }
    } catch (err) {
        return application.fatal(obj.res, err);
    }
};