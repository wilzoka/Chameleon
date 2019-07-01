const application = require('../../../routes/application')
    , platform = require('../../platform')
    , db = require('../../../models')
    , moment = require('moment')
    , fs = require('fs-extra')
    ;

let main = {
    evento: {
        onsave: async function (obj, next) {
            try {
                let saved = await next(obj);
                if (saved.register._isInsert) {
                    main.evento.f_calcularPrazosTarefas(saved.register);
                }
            } catch (error) {
                return application.fatal(obj.res, error);
            }
        }
        , f_calcularPrazosTarefas: async function (obj) {
            let evento = await db.getModel('eve_evento').findOne({ where: { id: obj.id } });
            let eventoTarefas = await db.getModel('eve_eventotarefa').findAll({ where: { idevento: evento.id } });
            let tarefatipoevento = await db.getModel('eve_tarefatipoevento').findAll({ where: { idevetipo: evento.idevetipo } });

            if (eventoTarefas == "") {
                for (let i = 0; i < tarefatipoevento.length; i++) {
                    let tarefa = await db.getModel("eve_tarefa").findOne({ where: { id: tarefatipoevento[i].idtarefa } });
                    let tarefatipoevento2 = await db.getModel("eve_tarefatipoevento").findOne({ where: { idtarefa: tarefa.id, idevetipo: evento.idevetipo } });
                    db.getModel('eve_eventotarefa').create({
                        idtarefa: tarefatipoevento[i].idtarefa
                        , idevento: evento.id
                        , prazo: tarefatipoevento2.previsaoinicio ? moment(evento.data_evento, application.formatters.be.date_format).subtract(tarefatipoevento2.previsaoinicio, 'day') : null
                    })
                }
            } else {
                for (let i = 0; i < eventoTarefas.length; i++) {
                    let tarefa = await db.getModel("eve_tarefa").findOne({ where: { id: eventoTarefas[i].idtarefa } });
                    let tarefatipoevento2 = await db.getModel("eve_tarefatipoevento").findOne({ where: { idtarefa: tarefa.id, idevetipo: evento.idevetipo } });
                    if (tarefatipoevento2.previsaoinicio != null) {
                        db.getModel('eve_eventotarefa').update({ prazo: moment(evento.data_evento, application.formatters.be.date_format).subtract(tarefatipoevento2.previsaoinicio, 'day') }
                            , { where: { id: eventoTarefas[i].id } });
                    } else {
                        db.getModel('eve_eventotarefa').update({ prazo: null }
                            , { where: { id: eventoTarefas[i].id } });
                    }
                }
            }
            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
        }
        , e_buscarfornecedores: async function (obj) {
            try {
                let eventotarefa = await db.getModel('eve_eventotarefa').findOne({ where: { id: obj.id } });
                let fornecedores = await db.getModel('eve_fornecedorservico').findAll({ where: { idcategoria: eventotarefa.idcategoria } });
                if (fornecedores.length > 0) {
                    for (let i = 0; i < fornecedores.length; i++) {
                        await db.getModel('eve_eventotarefaorca').create({
                            idfornecedor: fornecedores[i].idfornecedor
                            , valor: ''
                            , ideventotarefa: eventotarefa.id
                        })
                    }
                } else {
                    return application.error(obj.res, { msg: `Nenhum fornecedor encontrado para a categoria da tarefa.` })
                }
                return application.success(obj.res, { msg: application.message.success, reloadtables: true });
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , e_solicitarorcamento: async function (obj) {
            try {
                let eventotarefa = await db.getModel('eve_eventotarefa').findOne({ where: { id: obj.id } });
                let fornecedoresorca = await db.getModel('eve_eventotarefaorca').findAll({ where: { ideventotarefa: eventotarefa.id } });
                for (let i = 0; i < fornecedoresorca.length; i++) {
                    console.log(fornecedoresorca[i].idfornecedor)
                    let fornecedor = await db.getModel('cad_pessoa').findOne({ where: { id: fornecedoresorca[i].idfornecedor } });
                    platform.mail.f_sendmail({
                        to: [fornecedor.email]
                        , subject: `${eventotarefa.emailassunto}`
                        , html: `${eventotarefa.emailtexto}`
                    });
                }
                return application.success(obj.res, { msg: application.message.success, reloadtables: true });
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
        , e_publicarFotos: async function (obj) {
            try {
                let eventos = await db.getModel('eve_evento').findAll({ where: { publicar: true } });
                for (let i = 0; i < eventos.length; i++) {
                    let fotocapa = JSON.parse(eventos[i].fotocapa || '[]');
                    let fotopublicar = JSON.parse(eventos[i].fotopublicar || '[]');
                    let fm = fotocapa.concat(fotopublicar);
                    for (let z = 0; z < fm.length; z++) {
                        fs.copy(`${__dirname}/../../files/${fm[z].id}.${fm[z].type}`, `${__dirname}/../../public/files/site/${fm[z].id}.${fm[z].type}`, (err) => {
                            if (err) console.error(err);
                        });
                    }
                }
                return application.success(obj.res, { msg: application.message.success });
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
    }
}

module.exports = main;