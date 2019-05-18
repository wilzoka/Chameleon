const application = require('../../routes/application')
    , db = require('../../models')
    , moment = require('moment')
    ;

let main = {
    platform: require('../platform.js')
    , merito: {
        evento: {
            onsave: async function (obj, next) {
                try {
                    if (obj.register.id == 0) {
                        let saved = await next(obj);
                        let evento = await db.getModel("eve_evento").findOne({ where: { id: saved.register.id } });
                        main.platform.erp.evento.f_calcularPrazosTarefas(evento);
                    } else if (obj.register.id > 0) {
                        let saved = await next(obj);
                    } else {
                        return application.error(obj.res, { msg: 'Não foram encontradas tarefas para esse tipo de evento.' });
                    }
                } catch (error) {
                    return application.fatal(obj.res, error);
                }
            }
            , f_recalculaPrazos: function () {

            }
            , f_calcularPrazosTarefas: async function (evento) {
                console.log("ID: " + obj.id);
                console.log("Data:" + data);
                let tarefatipoevento = await db.getModel('eve_tarefatipoevento').findAll({ where: { idevetipo: evento.idevetipo } });
                for (let i = 0; i < tarefatipoevento.length; i++) {
                    let tarefa = await db.getModel("eve_tarefa").findOne({ where: { id: tarefatipoevento[i].idtarefa } });
                    let tarefatipoevento2 = await db.getModel("eve_tarefatipoevento").findOne({ where: { idtarefa: tarefa.id, idevetipo: evento.idevetipo } });
                    let eventotarefas = await db.getModel('eve_eventotarefa').create({
                        idtarefa: tarefatipoevento[i].idtarefa
                        , idevento: saved.register.id
                        , prazo: tarefatipoevento2.previsaoinicio ? moment(evento.data_evento, application.formatters.be.date_format).subtract(tarefatipoevento2.previsaoinicio, 'day') : null
                    })
                }
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
                        main.platform.mail.f_sendmail({
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
        }
    }
}

module.exports = main;