const application = require('../../routes/application')
    , db = require('../../models')
    , moment = require('moment')
    , fs = require('fs-extra')
    ;

let main = {
    platform: require('../platform.js')
    , merito: {
        cadastro: {
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
                            main.platform.notification.create([4], {
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
        , evento: {
            onsave: async function (obj, next) {
                try {
                    let saved = await next(obj);
                    if (saved.register._isInsert) {
                        main.merito.evento.f_calcularPrazosTarefas(saved.register);
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
    , api: async function (obj) {
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
    }
}

module.exports = main;