const application = require('../../routes/application')
    , db = require('../../models')
    , moment = require('moment')
    , fs = require('fs-extra')
    , lodash = require('lodash')
    , schedule = require('node-schedule')
    , Cyjs = require('crypto-js')
    ;

let atv_schedules = [];

let main = {
    platform: require('../platform.js')
    , atividade: {
        atividade: {
            onsave: async (obj, next) => {
                try {
                    if (obj.register.id == 0) {
                        obj.register.datahora_criacao = moment();
                        obj.register.iduser_criacao = obj.req.user.id;
                        let statusinicial = await db.getModel('atv_tipo_status').findOne({ where: { idtipo: obj.register.idtipo, inicial: true } });
                        if (!statusinicial) {
                            return application.error(obj.res, { msg: 'Status Inicial não configurado para este tipo' });
                        }
                        obj.register.idstatus = statusinicial.idstatus;
                    } else {
                        // Autenticar/Leitura
                        if (!obj.register.iduser_leitura) {
                            if (obj.register.atv_tipo.autenticarleitura) {
                                let userauth = await db.getModel('users').findOne({ where: { username: obj.req.body.authuser, password: obj.req.body.authpass } })
                                if (userauth) {
                                    let single = await db.getModel('atv_atividade').findOne({ where: { id: obj.register.id } });
                                    single.iduser_leitura = userauth.id;
                                    single.save({ iduser: obj.req.user.id });
                                    return application.success(obj.res, { redirect: obj.req.path });
                                } else {
                                    return application.error(obj.res, { msg: 'Usuário inválido' });
                                }
                            }
                        }

                        if (obj.register.encerrada) {
                            return application.error(obj.res, { msg: 'Atividade está encerrada' });
                        }
                        //mantém o tipo inicial e remove da auditoria
                        obj.register.idtipo = obj.register._previousDataValues.idtipo; delete obj.register._changed.idtipo;

                        //Usuário é do setor responsável
                        if (!await db.getModel('cad_setorusuario').findOne({ where: { idsetor: obj.register.atv_tipo.idsetor, idusuario: obj.req.user.id } })) {
                            return application.error(obj.res, { msg: 'Edição é liberada apenas para usuários do setor responsável' });
                        }
                    }

                    //campos dinâmicos
                    let invalidfields = [];
                    let cds = await db.getModel('atv_tipo_cd').findAll({ include: [{ all: true }], where: { idtipo: obj.register.idtipo } });
                    for (let i = 0; i < cds.length; i++) {
                        if (cds[i].obrigatorioc && !obj.req.body['cd' + cds[i].idcampodinamico]) {
                            invalidfields.push('cd' + cds[i].idcampodinamico);
                        }
                    }
                    if (invalidfields.length > 0) {
                        return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                    }
                    let saved = await next(obj);
                    if (saved.success) {
                        if (saved.register._isInsert) {
                            let user = await db.getModel('users').findOne({ where: { id: saved.register.iduser_criacao } });
                            if (user.email) {
                                main.platform.mail.f_sendmail({
                                    to: [user.email]
                                    , subject: `[ATV#${saved.register.id}] - ${saved.register.assunto}`
                                    , html: `Sua atividade foi registrada!<br>${saved.register.descricao}`
                                });
                            }
                        }

                        for (let i = 0; i < cds.length; i++) {
                            let atvcd = (await db.getModel('atv_atividade_cd').findOrCreate({ include: [{ all: true }], where: { idatividade: saved.register.id, idcampodinamico: cds[i].atv_campodinamico.id } }))[0];
                            if (obj.req.body['cd' + cds[i].idcampodinamico]) {
                                switch (atvcd.atv_campodinamico.tipo) {
                                    case 'Data':
                                        atvcd.valor = application.formatters.be.date(obj.req.body['cd' + cds[i].idcampodinamico]);
                                        break;
                                    case 'Data/Hora':
                                        atvcd.valor = application.formatters.be.datetime(obj.req.body['cd' + cds[i].idcampodinamico]);
                                        break;
                                    case 'Decimal':
                                        atvcd.valor = application.formatters.be.decimal(obj.req.body['cd' + cds[i].idcampodinamico]);
                                        break;
                                    default:
                                        atvcd.valor = obj.req.body['cd' + cds[i].idcampodinamico];
                                        break;
                                }
                                atvcd.save({ iduser: obj.req.user.id });
                            }
                        }
                    }
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , e_finalizar: async (obj) => {
                try {
                    if (obj.ids.length != 1) {
                        return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                    }
                    let atividade = await db.getModel('atv_atividade').findOne({ where: { id: obj.ids[0] } });
                    if (!atividade) {
                        return application.error(obj.res, { msg: 'Atividade não encontrada' });
                    }
                    if (atividade.encerrada) {
                        return application.error(obj.res, { msg: 'Atividade já está encerrada' });
                    }
                    let statusfinal = await db.getModel('atv_tipo_status').findOne({ include: [{ all: true }], where: { idtipo: atividade.idtipo, final: true } });
                    if (!statusfinal) {
                        return application.error(obj.res, { msg: 'Status Final não configurado para este tipo' });
                    }
                    atividade.idstatus = statusfinal.idstatus;
                    atividade.datahora_termino = moment();
                    atividade.encerrada = true;
                    await atividade.save({ iduser: obj.req.user.id });
                    main.platform.notification.create([atividade.iduser_criacao], {
                        title: `Atividade - ${atividade.assunto}`
                        , description: `Sua atividade foi ${statusfinal.atv_status.html}!`
                        , link: '/v/atividade_solicitada/' + atividade.id
                    });
                    return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , e_cancelar: async (obj) => {
                try {
                    if (obj.ids.length != 1) {
                        return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                    }
                    let atividade = await db.getModel('atv_atividade').findOne({ where: { id: obj.ids[0] } });
                    if (!atividade) {
                        return application.error(obj.res, { msg: 'Atividade não encontrada' });
                    }
                    if (atividade.encerrada) {
                        return application.error(obj.res, { msg: 'Atividade já está encerrada' });
                    }
                    let statuscancelada = await db.getModel('atv_tipo_status').findOne({ include: [{ all: true }], where: { idtipo: atividade.idtipo, cancelada: true } });
                    if (!statuscancelada) {
                        return application.error(obj.res, { msg: 'Status Cancelada não configurado para este tipo' });
                    }
                    atividade.idstatus = statuscancelada.idstatus;
                    atividade.datahora_termino = moment();
                    atividade.encerrada = true;
                    await atividade.save({ iduser: obj.req.user.id });
                    main.platform.notification.create([atividade.iduser_criacao], {
                        title: `Atividade - ${atividade.assunto}`
                        , description: `Sua atividade foi ${statuscancelada.atv_status.html}!`
                        , link: '/v/atividade_solicitada/' + atividade.id
                    });
                    return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , e_reabrir: async (obj) => {
                try {
                    if (obj.ids.length != 1) {
                        return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                    }
                    let atividade = await db.getModel('atv_atividade').findOne({ where: { id: obj.ids[0] } });
                    if (!atividade) {
                        return application.error(obj.res, { msg: 'Atividade não encontrada' });
                    }
                    if (!atividade.encerrada) {
                        return application.error(obj.res, { msg: 'Atividade não está encerrada' });
                    }
                    let statusinicial = await db.getModel('atv_tipo_status').findOne({ where: { idtipo: atividade.idtipo, inicial: true } });
                    if (!statusinicial) {
                        return application.error(obj.res, { msg: 'Status Inicial não configurado para este tipo' });
                    }
                    atividade.idstatus = statusinicial.idstatus;
                    atividade.datahora_termino = null;
                    atividade.encerrada = false;
                    await atividade.save({ iduser: obj.req.user.id });
                    return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , js_play: async (obj) => {
                try {
                    let atividade = await db.getModel('atv_atividade').findOne({ where: { id: obj.data.id || 0 } });
                    if (!atividade) {
                        return application.error(obj.res, { msg: 'Atividade não encontrada' });
                    }
                    if (atividade.encerrada) {
                        return application.error(obj.res, { msg: 'Atividade está encerrada' });
                    }
                    let statusemandamento = await db.getModel('atv_tipo_status').findOne({ include: [{ all: true }], where: { idtipo: atividade.idtipo, andamento: true } });
                    if (!statusemandamento) {
                        return application.error(obj.res, { msg: 'Status Em Andamento não configurado para este tipo' });
                    }
                    let atvemandamento = await db.getModel('atv_atividadetempo').findOne({ where: { iduser: obj.req.user.id, datahorafim: null } });
                    if (atvemandamento) {
                        let atv = await db.getModel('atv_atividade').findOne({ where: { id: atvemandamento.idatividade } });
                        let statuspausada = await db.getModel('atv_tipo_status').findOne({ where: { idtipo: atividade.idtipo, pausada: true } });
                        if (!statuspausada) {
                            return application.error(obj.res, { msg: 'Status Pausada não configurado para este tipo' });
                        }
                        atv.idstatus = statuspausada.idstatus;
                        atvemandamento.datahorafim = moment();
                        await atvemandamento.save({ iduser: obj.req.user.id });
                        await atv.save({ iduser: obj.req.user.id });
                    }
                    await db.getModel('atv_atividadetempo').create({
                        idatividade: atividade.id
                        , iduser: obj.req.user.id
                        , datahoraini: moment()
                    });
                    if (atividade.idstatus != statusemandamento.idstatus) {
                        atividade.idstatus = statusemandamento.idstatus;
                        await atividade.save({ iduser: obj.req.user.id });
                    }
                    return application.success(obj.res, { status: statusemandamento.atv_status });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , js_pause: async (obj) => {
                try {
                    let atividade = await db.getModel('atv_atividade').findOne({ include: [{ all: true }], where: { id: obj.data.id || 0 } });
                    if (!atividade) {
                        return application.error(obj.res, { msg: 'Atividade não encontrada' });
                    }
                    let statuspausada = await db.getModel('atv_tipo_status').findOne({ include: [{ all: true }], where: { idtipo: atividade.idtipo, pausada: true } });
                    if (!statuspausada) {
                        return application.error(obj.res, { msg: 'Status Pausada não configurado para este tipo' });
                    }
                    let tempo = await db.getModel('atv_atividadetempo').findOne({
                        where: {
                            idatividade: atividade.id
                            , iduser: obj.req.user.id
                            , datahorafim: null
                        }
                    });
                    if (!tempo) {
                        return application.error(obj.res, { msg: 'Nenhum tempo ativo encontrado' });
                    }
                    tempo.datahorafim = moment();
                    await tempo.save({ iduser: obj.req.user.id });

                    let outrotrabalhando = await db.getModel('atv_atividadetempo').findOne({
                        where: {
                            idatividade: atividade.id
                            , iduser: { [db.Op.ne]: obj.req.user.id }
                            , datahorafim: null
                        }
                    });

                    if (outrotrabalhando) {
                        return application.success(obj.res, {});
                    } else {
                        atividade.idstatus = statuspausada.idstatus;
                        await atividade.save({ iduser: obj.req.user.id });
                        return application.success(obj.res, { status: statuspausada.atv_status });
                    }
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , js_getTempo: async (obj) => {
                try {
                    let atividade = await db.getModel('atv_atividade').findOne({ where: { id: obj.data.id || 0 } });
                    if (!atividade) {
                        return application.error(obj.res, { msg: 'Atividade não encontrada' });
                    }
                    let total = 0;
                    let isRunning = false;
                    let tempos = await db.getModel('atv_atividadetempo').findAll({
                        where: {
                            idatividade: atividade.id
                            , iduser: obj.req.user.id
                        }
                        , order: [['datahoraini', 'asc']]
                    });
                    for (let i = 0; i < tempos.length; i++) {
                        if (tempos[i].datahorafim) {
                            total += moment(tempos[i].datahorafim, application.formatters.be.datetime_format).diff(moment(tempos[i].datahoraini, application.formatters.be.datetime_format), 'minutes');
                            isRunning = false;
                        } else {
                            total += moment().diff(moment(tempos[i].datahoraini, application.formatters.be.datetime_format), 'minutes');
                            isRunning = true;
                        }
                    }
                    return application.success(obj.res, { tempo: application.formatters.fe.time(total), rodando: isRunning });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , js_adicionarNota: async (obj) => {
                try {
                    let atividade = await db.getModel('atv_atividade').findOne({ include: [{ all: true }], where: { id: obj.data.id || 0 } });
                    if (!atividade) {
                        return application.error(obj.res, { msg: 'Atividade não encontrada' });
                    }
                    if (atividade.encerrada) {
                        return application.error(obj.res, { msg: 'Atividade está encerrada' });
                    }
                    let invalidfields = application.functions.getEmptyFields(obj.data, ['descricao', 'tempo']);
                    if (invalidfields.length > 0) {
                        return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                    }
                    let privada = obj.data.privada == 'true';
                    let atvnota = await db.getModel('atv_atividadenota').create({
                        idatividade: atividade.id
                        , datahora: moment()
                        , iduser: obj.req.user.id
                        , descricao: obj.data.descricao
                        , anexos: obj.data.anexos
                        , tempo: obj.data.tempo == '' ? null : application.formatters.be.time(obj.data.tempo)
                        , privada: privada
                    });
                    let anexos = JSON.parse(obj.data.anexos || '[]');
                    if (anexos.length > 0) {
                        let modelatv = await db.getModel('model').findOne({ where: { name: 'atv_atividadenota' } });
                        for (let i = 0; i < anexos.length; i++) {
                            db.getModel('file').update({ idmodel: modelatv.id, modelid: atvnota.id, public: false, bounded: true }, { where: { id: anexos[i].id } });
                        }
                    }
                    let atvemandamento = await db.getModel('atv_atividadetempo').findOne({ where: { idatividade: atividade.id, iduser: obj.req.user.id, datahorafim: null } });
                    if (atvemandamento) {
                        let statuspausada = await db.getModel('atv_tipo_status').findOne({ where: { idtipo: atividade.idtipo, pausada: true } });
                        if (statuspausada) {
                            atividade.idstatus = statuspausada.idstatus;
                            await atividade.save({ iduser: obj.req.user.id });
                        }
                    }
                    await db.getModel('atv_atividadetempo').destroy({
                        iduser: obj.req.user.id
                        , where: {
                            idatividade: atividade.id
                            , iduser: obj.req.user.id
                        }
                    });
                    if (!privada) {
                        // Notifica o criador
                        main.platform.notification.create([atividade.iduser_criacao], {
                            title: `Atividade - ${atividade.assunto}`
                            , description: `Nota adicionada!`
                            , link: '/v/atividade_solicitada/' + atividade.id
                        });
                        if (atividade.users.email) {
                            let attachments = [];
                            if (obj.data.anexos) {
                                let j = JSON.parse(obj.data.anexos);
                                for (let i = 0; i < j.length; i++) {
                                    attachments.push({
                                        filename: j[i].filename
                                        , path: `${__dirname}/../../files/${process.env.NODE_APPNAME}/${j[i].id}.${j[i].type}`
                                    });
                                }
                            }
                            let participantes = await db.getModel('atv_atividadeparticipante').findAll({ include: [{ all: true }], where: { id: { [db.Op.in]: obj.data.participantes || [] } } })
                            let parts = { id: [], email: [] };
                            for (let i = 0; i < participantes.length; i++) {
                                if (participantes[i].users.email) {
                                    parts.id.push(participantes[i].iduser);
                                    parts.email.push(participantes[i].users.email);
                                }
                            }
                            if (parts.id.length > 0) {
                                main.platform.notification.create(parts.id, {
                                    title: `Atividade - ${atividade.assunto}`
                                    , description: `Nota adicionada!`
                                    , link: '/v/atividade_participante/' + atividade.id
                                });
                            }
                            if (atividade.users.email) {
                                main.platform.mail.f_sendmail({
                                    to: [atividade.users.email]
                                    , cc: parts.email
                                    , subject: `Nota Adicionada - [ATV#${atividade.id}] - ${atividade.assunto}`
                                    , html: `<a href="http://intranet.plastrela.com.br:8084/r/visao_administrativa" target="_blank">http://intranet.plastrela.com.br:8084/r/visao_administrativa</a>
                                    <br>${obj.data.descricao || ''}`
                                    , attachments: attachments
                                });
                            }
                        }
                    }
                    return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , js_obterCamposDinamicos: async (obj) => {
                try {
                    if (!obj.data.idtipo) {
                        return application.error(obj.res, { msg: 'Tipo não informado' });
                    }
                    let sql = await db.sequelize.query(`
                    select
                        cd.id
                        , case when tcd.obrigatorioc = true then cd.descricao || '*'
                          when ${obj.data.idatividade} > 0 and tcd.obrigatoriof = true then cd.descricao || '*'
                          else cd.descricao
                        end as descricao
                        , tcd.largura
                        , cd.tipo
                        , cd.add
                        , (select acd.valor from atv_atividade_cd acd where acd.idcampodinamico = cd.id and acd.idatividade = ${obj.data.idatividade}) as valor
                    from
                        atv_tipo_cd tcd
                    left join atv_campodinamico cd on (tcd.idcampodinamico = cd.id)
                    where
                        tcd.idtipo = ${obj.data.idtipo}
                    order by tcd.ordem asc
                    `, { type: db.Sequelize.QueryTypes.SELECT });
                    let html = '';
                    for (let i = 0; i < sql.length; i++) {
                        switch (sql[i].tipo) {
                            case 'Texto':
                                html += application.components.html.text({
                                    width: sql[i].largura
                                    , label: sql[i].descricao
                                    , name: 'cd' + sql[i].id
                                    , value: sql[i].valor || ''
                                });
                                break;
                            case 'Inteiro':
                                html += application.components.html.integer({
                                    width: sql[i].largura
                                    , label: sql[i].descricao
                                    , name: 'cd' + sql[i].id
                                    , value: sql[i].valor || ''
                                });
                                break;
                            case 'Decimal':
                                html += application.components.html.decimal({
                                    width: sql[i].largura
                                    , label: sql[i].descricao
                                    , name: 'cd' + sql[i].id
                                    , value: sql[i].valor ? application.formatters.fe.decimal(sql[i].valor, 2) : ''
                                });
                                break;
                            case 'Data':
                                html += application.components.html.date({
                                    width: sql[i].largura
                                    , label: sql[i].descricao
                                    , name: 'cd' + sql[i].id
                                    , value: sql[i].valor ? application.formatters.fe.date(sql[i].valor) : ''
                                });
                                break;
                            case 'Data/Hora':
                                html += application.components.html.datetime({
                                    width: sql[i].largura
                                    , label: sql[i].descricao
                                    , name: 'cd' + sql[i].id
                                    , value: sql[i].valor ? application.formatters.fe.datetime(sql[i].valor) : ''
                                });
                                break;
                            case 'Combo':
                                html += application.components.html.autocomplete({
                                    width: sql[i].largura
                                    , label: sql[i].descricao
                                    , name: 'cd' + sql[i].id
                                    , option: sql[i].valor ? `<option selected>${sql[i].valor}</option>` : '<option></option>'
                                    , options: sql[i].add
                                });
                                break;
                        }
                    }
                    return application.success(obj.res, { data: html });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , js_getParticipantes: async (obj) => {
                try {
                    let participantes = await main.platform.model.findAll('atv_atividadeparticipante', { where: { idatividade: obj.data.idatividade || 0 } });
                    if (!participantes) {
                        return application.error(obj.res, { msg: 'Atividade não encontrada' });
                    }
                    let ret = [];
                    for (let i = 0; i < participantes.count; i++) {
                        ret.push({
                            id: 'participante_' + participantes.rows[i].id
                            , user: participantes.rows[i].iduser
                            , email: participantes.rows[i].vemail || ''
                        });
                    }
                    return application.success(obj.res, { data: ret });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , js_getInfo: async (obj) => {
                try {
                    let horashoje = await db.sequelize.query(`
                    select sum(tempo) as sum from atv_atividadenota where iduser = ${obj.req.user.id} and datahora >= :dataini and datahora <= :datafim
                    `, {
                            type: db.Sequelize.QueryTypes.SELECT, replacements: {
                                dataini: moment().startOf('day').format(application.formatters.be.datetime_format)
                                , datafim: moment().endOf('day').format(application.formatters.be.datetime_format)
                            }
                        });
                    let tarefaandamento = await db.sequelize.query(`
                       select idatividade from atv_atividadetempo where iduser = ${obj.req.user.id} and datahorafim is null
                           `, {
                            type: db.Sequelize.QueryTypes.SELECT, replacements: {
                                dataini: moment().startOf('day').format(application.formatters.be.datetime_format)
                                , datafim: moment().endOf('day').format(application.formatters.be.datetime_format)
                            }
                        });
                    let tempomedioresolucao = await db.sequelize.query(`
                    select avg(EXTRACT(EPOCH FROM (datahora_termino - datahora_criacao))/60) as sum from atv_atividade where iduser_responsavel = ${obj.req.user.id} and encerrada = true and datahora_criacao >= now() - interval '15 days'
                        `, {
                            type: db.Sequelize.QueryTypes.SELECT, replacements: {
                                dataini: moment().startOf('day').format(application.formatters.be.datetime_format)
                                , datafim: moment().endOf('day').format(application.formatters.be.datetime_format)
                            }
                        });


                    let ret = {
                        horashoje: horashoje.length > 0 ? application.formatters.fe.time(horashoje[0].sum) : '0:00'
                        , tarefaandamento: tarefaandamento.length > 0 ? '#' + tarefaandamento[0].idatividade : ''
                        , tempomedioresolucao: tempomedioresolucao.length > 0 ? application.formatters.fe.time(tempomedioresolucao[0].sum) : '0:00'
                    };

                    return application.success(obj.res, { data: ret });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , js_read: async (obj) => {
                try {
                    let atividade = await db.getModel('atv_atividade').findOne({ where: { id: obj.data.id || 0 } });
                    if (!atividade) {
                        return application.success(obj.res, {});
                    }
                    atividade.iduser_leitura = obj.req.user.id;
                    atividade.save({ iduser: obj.req.user.id });
                    return application.success(obj.res, {});
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , js_getUnread: async (obj) => {
                try {
                    let ret = {
                        minhas: []
                        , setor: []
                    };
                    let viewatv = await db.getModel('view').findOne({ where: { name: 'Atividade' } });
                    let atividades = await db.getModel('atv_atividade').findAll({
                        include: [{ all: true }]
                        , where: { iduser_leitura: null, [db.Op.col]: db.Sequelize.literal(viewatv.wherefixed.replace(/\$user/g, obj.req.user.id)) }
                    });
                    for (let i = 0; i < atividades.length; i++) {
                        ret.minhas.push(atividades[i].id);
                    }
                    let viewsetor = await db.getModel('view').findOne({ where: { name: 'Atividade do Setor' } });
                    let setor = await db.getModel('atv_atividade').findAll({
                        include: [{ all: true }]
                        , where: { iduser_leitura: null, [db.Op.col]: db.Sequelize.literal(viewsetor.wherefixed.replace(/\$user/g, obj.req.user.id)) }
                    });
                    for (let i = 0; i < setor.length; i++) {
                        ret.setor.push(setor[i].id);
                    }
                    return application.success(obj.res, { data: ret });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
        }
        , atividadeag: {
            onsave: async (obj, next) => {
                try {
                    if (obj.register.id == 0) {
                        obj.register.iduser_criacao = obj.req.user.id;
                    } else {
                        obj.register.idtipo = obj.register._previousDataValues.idtipo; delete obj.register._changed.idtipo;
                    }

                    //campos dinâmicos
                    let invalidfields = [];
                    let cds = await db.getModel('atv_tipo_cd').findAll({ include: [{ all: true }], where: { idtipo: obj.register.idtipo } });
                    for (let i = 0; i < cds.length; i++) {
                        if (cds[i].obrigatorioc && !obj.req.body['cd' + cds[i].idcampodinamico]) {
                            invalidfields.push('cd' + cds[i].idcampodinamico);
                        }
                    }
                    if (invalidfields.length > 0) {
                        return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                    }
                    obj.register.ativo = false;
                    obj.register.datahora_proximaexecucao = null;
                    let saved = await next(obj);
                    if (saved.success) {
                        main.atividade.atividadeag.f_desativar(saved.register);
                        if (saved.register._isInsert) {
                            let user = await db.getModel('users').findOne({ where: { id: saved.register.iduser_criacao } });
                            if (user.email) {
                                main.platform.mail.f_sendmail({
                                    to: [user.email]
                                    , subject: `[ATV#${saved.register.id}] - ${saved.register.assunto}`
                                    , html: `Sua atividade foi registrada!<br>${saved.register.descricao}`
                                });
                            }
                        }
                        for (let i = 0; i < cds.length; i++) {
                            let atvcd = (await db.getModel('atv_atividadeag_cd').findOrCreate({ include: [{ all: true }], where: { idatividadeag: saved.register.id, idcampodinamico: cds[i].atv_campodinamico.id } }))[0];
                            if (obj.req.body['cd' + cds[i].idcampodinamico]) {
                                switch (atvcd.atv_campodinamico.tipo) {
                                    case 'Data':
                                        atvcd.valor = application.formatters.be.date(obj.req.body['cd' + cds[i].idcampodinamico]);
                                        break;
                                    case 'Data/Hora':
                                        atvcd.valor = application.formatters.be.datetime(obj.req.body['cd' + cds[i].idcampodinamico]);
                                        break;
                                    case 'Decimal':
                                        atvcd.valor = application.formatters.be.decimal(obj.req.body['cd' + cds[i].idcampodinamico]);
                                        break;
                                    default:
                                        atvcd.valor = obj.req.body['cd' + cds[i].idcampodinamico];
                                        break;
                                }
                            } else {
                                atvcd.valor = null;
                            }
                            atvcd.save({ iduser: obj.req.user.id });
                        }
                    }
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , ondelete: async (obj, next) => {
                try {
                    if (obj.ids.length != 1) {
                        return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                    }
                    let atividadeag = await db.getModel('atv_atividadeag').findOne({ where: { id: obj.ids[0] } });
                    if (atividadeag.ativo) {
                        return application.error(obj.res, { msg: 'Não é possível excluir agendamentos ativos' });
                    }
                    next(obj);
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , f_agendamento: async (atividadeag) => {
                try {
                    db.getModel('atv_atividadeag').update({
                        datahora_ultimaexecucao: moment()
                        , datahora_proximaexecucao: moment(atv_schedules[atividadeag.id].nextInvocation()._date)
                    }, { where: { id: atividadeag.id } });
                    let replaces = function (str) {
                        return str ? str.replace(/\${day}/g, moment().format('DD'))
                            .replace(/\${month}/g, moment().format('MM'))
                            .replace(/\${year}/g, moment().format('YYYY'))
                            : str
                    }
                    let status_inicial = await db.getModel('atv_tipo_status').findOne({ where: { idtipo: atividadeag.idtipo, inicial: true } });
                    if (status_inicial) {
                        let matv = {
                            iduser_criacao: atividadeag.iduser_criacao
                            , iduser_responsavel: atividadeag.iduser_responsavel
                            , assunto: atividadeag.assunto
                            , descricao: atividadeag.descricao
                            , idtipo: atividadeag.idtipo
                            , idstatus: status_inicial.idstatus
                            , datahora_criacao: moment()
                            , datahora_prazo: moment()
                            , encerrada: false
                        };
                        if (atividadeag.prazo) {
                            matv.datahora_prazo.add(atividadeag.prazo, 'day')
                        }
                        if (atividadeag.prazohora) {
                            let time = application.formatters.fe.time(atividadeag.prazohora).split(':');
                            matv.datahora_prazo.set({
                                hour: time[0]
                                , minute: time[1]
                            });
                        }
                        matv.assunto = replaces(matv.assunto);
                        matv.descricao = replaces(matv.descricao);
                        let atividade = await db.getModel('atv_atividade').create(matv);
                        let atvagcds = await db.getModel('atv_atividadeag_cd').findAll({ where: { idatividadeag: atividadeag.id } });
                        for (let i = 0; i < atvagcds.length; i++) {
                            await db.getModel('atv_atividade_cd').create({
                                idatividade: atividade.id
                                , idcampodinamico: atvagcds[i].idcampodinamico
                                , valor: atvagcds[i].valor
                            });
                        }
                        if (atividade.iduser_responsavel) {
                            main.platform.notification.create([atividade.iduser_responsavel], {
                                title: `Atividade - ${atividade.assunto}`
                                , description: `Atividade agendada criada`
                                , link: '/v/atividade/' + atividade.id
                            });
                        } else {
                            let atv_tipo = await db.getModel('atv_tipo').findOne({ where: { id: atividade.idtipo } });
                            let usersnotification = []
                            let su = await db.getModel('cad_setorusuario').findAll({ include: [{ all: true }], where: { idsetor: atv_tipo.idsetor } });
                            for (let i = 0; i < su.length; i++) {
                                usersnotification.push(su[i].idusuario);
                            }
                            main.platform.notification.create(usersnotification, {
                                title: `Atividade - ${atividade.assunto}`
                                , description: `Atividade agendada criada`
                                , link: '/v/atividade_do_setor/' + atividade.id
                            });
                        }
                    }
                } catch (err) {
                    console.error(err);
                }
            }
            , f_ativar: function (atividadeag) {
                atv_schedules[atividadeag.id] = schedule.scheduleJob(
                    [
                        , atividadeag.cron_minute
                        , atividadeag.cron_hour
                        , atividadeag.cron_dom
                        , atividadeag.cron_moy
                        , atividadeag.cron_dow
                    ].join(' ')
                    , main.atividade.atividadeag.f_agendamento.bind(null, atividadeag));
                db.getModel('atv_atividadeag').update({ datahora_proximaexecucao: moment(atv_schedules[atividadeag.id].nextInvocation()._date) }, { where: { id: atividadeag.id } });
            }
            , f_desativar: function (atividadeag) {
                if (atv_schedules[atividadeag.id]) {
                    atv_schedules[atividadeag.id].cancel();
                    delete atv_schedules[atividadeag.id];
                }
            }
            , e_ativar: async (obj) => {
                try {
                    if (obj.ids.length != 1) {
                        return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                    }
                    let atividadeag = await db.getModel('atv_atividadeag').findOne({ where: { id: obj.ids[0] } });
                    if (!atividadeag) {
                        return application.error(obj.res, { msg: 'Atividade não encontrada' });
                    }
                    main.atividade.atividadeag.f_ativar(atividadeag.dataValues);
                    atividadeag.ativo = true;
                    await atividadeag.save({ iduser: obj.req.user.id });
                    return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , e_desativar: async (obj) => {
                try {
                    if (obj.ids.length != 1) {
                        return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                    }
                    let atividadeag = await db.getModel('atv_atividadeag').findOne({ where: { id: obj.ids[0] } });
                    if (!atividadeag) {
                        return application.error(obj.res, { msg: 'Atividade não encontrada' });
                    }
                    main.atividade.atividadeag.f_desativar(atividadeag.dataValues);
                    atividadeag.ativo = false;
                    atividadeag.datahora_proximaexecucao = null;
                    await atividadeag.save({ iduser: obj.req.user.id });
                    return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , js_obterCamposDinamicos: async (obj) => {
                try {
                    if (!obj.data.idtipo) {
                        return application.error(obj.res, { msg: 'Tipo não informado' });
                    }
                    let sql = await db.sequelize.query(`
                    select
                        cd.id
                        , case when tcd.obrigatorioc = true then cd.descricao || '*'
                          when ${obj.data.idatividadeag} > 0 and tcd.obrigatoriof = true then cd.descricao || '*'
                          else cd.descricao
                        end as descricao
                        , tcd.largura
                        , cd.tipo
                        , cd.add
                        , (select acd.valor from atv_atividadeag_cd acd where acd.idcampodinamico = cd.id and acd.idatividadeag = ${obj.data.idatividadeag}) as valor
                    from
                        atv_tipo_cd tcd
                    left join atv_campodinamico cd on (tcd.idcampodinamico = cd.id)
                    where
                        tcd.idtipo = ${obj.data.idtipo}
                    order by tcd.ordem asc
                    `, { type: db.Sequelize.QueryTypes.SELECT });
                    let html = '';
                    for (let i = 0; i < sql.length; i++) {
                        switch (sql[i].tipo) {
                            case 'Texto':
                                html += application.components.html.text({
                                    width: sql[i].largura
                                    , label: sql[i].descricao
                                    , name: 'cd' + sql[i].id
                                    , value: sql[i].valor || ''
                                });
                                break;
                            case 'Inteiro':
                                html += application.components.html.integer({
                                    width: sql[i].largura
                                    , label: sql[i].descricao
                                    , name: 'cd' + sql[i].id
                                    , value: sql[i].valor || ''
                                });
                                break;
                            case 'Decimal':
                                html += application.components.html.decimal({
                                    width: sql[i].largura
                                    , label: sql[i].descricao
                                    , name: 'cd' + sql[i].id
                                    , value: sql[i].valor ? application.formatters.fe.decimal(sql[i].valor, 2) : ''
                                });
                                break;
                            case 'Data':
                                html += application.components.html.date({
                                    width: sql[i].largura
                                    , label: sql[i].descricao
                                    , name: 'cd' + sql[i].id
                                    , value: sql[i].valor ? application.formatters.fe.date(sql[i].valor) : ''
                                });
                                break;
                            case 'Data/Hora':
                                html += application.components.html.datetime({
                                    width: sql[i].largura
                                    , label: sql[i].descricao
                                    , name: 'cd' + sql[i].id
                                    , value: sql[i].valor ? application.formatters.fe.datetime(sql[i].valor) : ''
                                });
                                break;
                            case 'Combo':
                                html += application.components.html.autocomplete({
                                    width: sql[i].largura
                                    , label: sql[i].descricao
                                    , name: 'cd' + sql[i].id
                                    , option: sql[i].valor ? `<option selected>${sql[i].valor}</option>` : '<option></option>'
                                    , options: sql[i].add
                                });
                                break;
                        }
                    }
                    return application.success(obj.res, { data: html });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
        }
        , atividadehora: {
            onsave: async (obj, next) => {
                try {
                    if (obj.register.id == 0) {
                        obj.register.iduser = obj.req.user.id;
                    }

                    let invalidfields = [];
                    let cds = await db.getModel('atv_tipo_cd').findAll({ include: [{ all: true }], where: { idtipo: obj.register.idtipo } });
                    for (let i = 0; i < cds.length; i++) {
                        if (cds[i].obrigatorioc && !obj.req.body['cd' + cds[i].idcampodinamico]) {
                            invalidfields.push('cd' + cds[i].idcampodinamico);
                        }
                    }
                    if (invalidfields.length > 0) {
                        return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                    }

                    await next(obj);
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
        }
        , atividadenota: {
            onsave: async (obj, next) => {
                try {
                    let atividade = await db.getModel('atv_atividade').findOne({ where: { id: obj.register.idatividade } });
                    if (atividade.encerrada) {
                        return application.error(obj.res, { msg: 'Atividade está encerrada' });
                    }

                    if (obj.register.id == 0) {
                        obj.register.datahora = moment();
                        obj.register.iduser = obj.req.user.id;
                    } else {
                        if (obj.register.iduser != obj.req.user.id) {
                            return application.error(obj.res, { msg: 'Apenas o usuário criador da nota pode alterá-la' });
                        }
                    }
                    await next(obj);
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , ondelete: async (obj, next) => {
                try {
                    let notas = await db.getModel('atv_atividadenota').findAll({ where: { id: { [db.Op.in]: obj.ids } } });
                    for (let i = 0; i < notas.length; i++) {
                        if (notas[i].iduser != obj.req.user.id) {
                            return application.error(obj.res, { msg: 'Apenas o usuário criador da nota pode excluí-la' });
                        }
                    }
                    await next(obj);
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
        }
        , atividadeparticipante: {
            onsave: async (obj, next) => {
                try {
                    let sql = await db.sequelize.query(`
                    select
                        *
                    from
                        atv_atividade a
                    left join atv_tipo t on (a.idtipo = t.id)
                    where
                        a.id = ${obj.register.idatividade}
                        and t.idsetor in (select c.idsetor from cad_setorusuario c where c.idusuario = ${obj.req.user.id})
                    `,
                        { type: db.Sequelize.QueryTypes.SELECT });
                    if (sql.length <= 0) {
                        return application.error(obj.res, { msg: 'Apenas o setor responsável pode adicionar participantes' });
                    }
                    await next(obj);
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
        }
        , tipo: {
            onsave: async (obj, next) => {
                try {
                    let saved = await next(obj);
                    if (saved.success) {
                        main.atividade.tipo.f_treeAll();
                        await db.getModel('atv_tipo_status').create({
                            idtipo: saved.register.id
                            , idstatus: false
                            , inicial: false
                            , andamento: false
                            , pausada: false
                            , cancelada: false
                            , final: false
                        });
                    }
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , f_treeAll: function () {
                let getChildren = function (current, childs) {
                    for (let i = 0; i < childs.length; i++) {
                        if (current.idtipopai == childs[i].id) {
                            if (childs[i].idtipopai) {
                                return getChildren(childs[i], childs) + childs[i].descricao + ' - ';
                            } else {
                                return childs[i].descricao + ' - ';
                            }
                        }
                    }
                }
                db.getModel('atv_tipo').findAll({ include: [{ all: true }] }).then(tipos => {
                    tipos.map(tipo => {
                        if (tipo.idtipopai) {
                            tipo.descricaocompleta = tipo.cad_setor.descricao + ' - ' + getChildren(tipo, tipos) + tipo.descricao;
                        } else {
                            tipo.descricaocompleta = tipo.cad_setor.descricao + ' - ' + tipo.descricao;
                        }
                        tipo.save();
                    });
                });
            }
        }
        , f_coletor: async (email) => {
            try {
                let initialIdx = email.subject.indexOf('[ATV#');
                let finalIdx = email.subject.indexOf(']');
                if (initialIdx >= 0 && finalIdx >= 0 && initialIdx < finalIdx) { //Existe
                    let id = email.subject.substring(initialIdx + 5, finalIdx);
                    id = parseInt(id);
                    if (id > 0) {
                        let atividade = await db.getModel('atv_atividade').findOne({ include: [{ all: true }], where: { id: id } });
                        let user = await db.getModel('users').findOne({ where: { email: email.from[0].address } });
                        if (atividade) {
                            let nota = await db.getModel('atv_atividadenota').create({
                                idatividade: atividade.id
                                , datahora: moment()
                                , descricao: email.html
                                , tempo: 0
                                , iduser: user ? user.id : null
                                , privada: false
                            });
                            let html = nota.descricao;
                            if (email.attachments && email.attachments.length > 0) {
                                let files = [];
                                let modelatv = await db.getModel('model').findOne({ where: { name: 'atv_atividade' } });
                                for (let i = 0; i < email.attachments.length; i++) {
                                    let type = email.attachments[i].fileName.split('.');
                                    type = type[type.length - 1];
                                    let file = await db.getModel('file').create({
                                        filename: email.attachments[i].fileName
                                        , size: email.attachments[i].length
                                        , bounded: true
                                        , mimetype: email.attachments[i].contentType
                                        , type: type
                                        , datetime: moment()
                                        , modelid: atividade.id
                                        , iduser: user ? user.id : null
                                        , idmodel: modelatv.id
                                        , public: false
                                    });
                                    let attach = email.attachments[i];
                                    fs.writeFile(`${__dirname}/../../files/${process.env.NODE_APPNAME}/${file.id}.${type}`, attach.content, function (err) { });
                                    if (html.indexOf('cid:' + email.attachments[i].contentId) < 0) {
                                        files.push(file);
                                    }
                                    html = html.replace('cid:' + email.attachments[i].contentId, `/file/${file.id}`);
                                }
                                const jsdom = require("jsdom");
                                const { JSDOM } = jsdom;
                                const dom = new JSDOM(html);
                                const $ = (require('jquery'))(dom.window);
                                $('div.system_content').remove();
                                nota.descricao = $('html').html();
                                if (files.length > 0) {
                                    nota.anexos = JSON.stringify(files);
                                }
                                nota.save();
                            }
                            if (atividade.iduser_responsavel) {
                                main.platform.notification.create([atividade.iduser_responsavel], {
                                    title: `Atividade - ${atividade.assunto}`
                                    , description: `Nota adicionada!`
                                    , link: '/v/atividade/' + atividade.id
                                });
                            } else {
                                let usersnotification = []
                                let su = await db.getModel('cad_setorusuario').findAll({ include: [{ all: true }], where: { idsetor: atividade.atv_tipo.idsetor } });
                                for (let i = 0; i < su.length; i++) {
                                    usersnotification.push(su[i].idusuario);
                                }
                                main.platform.notification.create(usersnotification, {
                                    title: `Atividade - ${atividade.assunto}`
                                    , description: `Nota adicionada!`
                                    , link: '/v/atividade_do_setor/' + atividade.id
                                });
                            }
                        }
                    }
                } else { // Novo
                    let tipo = await db.getModel('atv_tipo').findOne({ where: { descricaocompleta: 'TI - Geral' } });
                    let status_inicial = await db.getModel('atv_tipo_status').findOne({ where: { idtipo: tipo.id, inicial: true } });
                    let user = (await db.getModel('users').findOrCreate({ where: { email: email.from[0].address } }))[0];
                    if (!user.fullname) {
                        user.fullname = email.from[0].name;
                        user.save();
                    }
                    if (tipo && status_inicial) {
                        let atividade = await db.getModel('atv_atividade').create({
                            iduser_criacao: user.id
                            , assunto: email.subject
                            , descricao: email.html
                            , idtipo: tipo.id
                            , idstatus: status_inicial.idstatus
                            , datahora_criacao: moment()
                            , encerrada: false
                        });
                        let html = atividade.descricao || '';
                        // Participantes
                        let j = JSON.parse(email._messenger.conf);
                        // to
                        if (email.to.length > 0) {
                            for (let i = 0; i < email.to.length; i++) {
                                if (j.username != email.to[i].address) {
                                    let participante = (await db.getModel('users').findOrCreate({ where: { email: email.to[i].address } }))[0];
                                    if (!participante.fullname) {
                                        participante.fullname = email.to[i].name;
                                        participante.save();
                                    }
                                    await db.getModel('atv_atividadeparticipante').create({
                                        idatividade: atividade.id
                                        , iduser: participante.id
                                    });
                                }
                            }
                        }
                        // CC
                        if (email.cc && email.cc.length > 0) {
                            for (let i = 0; i < email.cc.length; i++) {
                                if (j.username != email.cc[i].address) {
                                    let participante = (await db.getModel('users').findOrCreate({ where: { email: email.cc[i].address } }))[0];
                                    if (!participante.fullname) {
                                        participante.fullname = email.cc[i].name;
                                        participante.save();
                                    }
                                    await db.getModel('atv_atividadeparticipante').create({
                                        idatividade: atividade.id
                                        , iduser: participante.id
                                    });
                                }
                            }
                        }
                        // Anexo
                        if (email.attachments && email.attachments.length > 0) {
                            let files = [];
                            let modelatv = await db.getModel('model').findOne({ where: { name: 'atv_atividade' } });
                            for (let i = 0; i < email.attachments.length; i++) {
                                let type = email.attachments[i].fileName.split('.');
                                type = type[type.length - 1];
                                let file = await db.getModel('file').create({
                                    filename: email.attachments[i].fileName
                                    , size: email.attachments[i].length
                                    , bounded: true
                                    , mimetype: email.attachments[i].contentType
                                    , type: type
                                    , datetime: moment()
                                    , modelid: atividade.id
                                    , iduser: user ? user.id : null
                                    , idmodel: modelatv.id
                                });
                                let attach = email.attachments[i];
                                fs.writeFile(`${__dirname}/../../files/${process.env.NODE_APPNAME}/${file.id}.${type}`, attach.content, function (err) { });
                                if (html.indexOf('cid:' + email.attachments[i].contentId) < 0) {
                                    files.push(file);
                                }
                                html = html.replace('cid:' + email.attachments[i].contentId, `/file/${file.id}`);
                            }
                            atividade.descricao = html;
                            if (files.length > 0) {
                                atividade.anexo = JSON.stringify(files);
                            }
                            atividade.save();
                        }
                        if (user && user.email) {
                            main.platform.mail.f_sendmail({
                                to: [user.email]
                                , subject: `Nova Atividade -  [ATV#${atividade.id}] - ${atividade.assunto}`
                                , html: `Sua atividade foi registrada, para visualizá-la <a href="http://intranet.plastrela.com.br:8084/v/atividade_solicitada/${atividade.id}" target="_blank">clique aqui!</a>`
                            });
                        }
                    }
                }
            } catch (err) {
                console.error(err);
            }
        }
        , projeto: {
            onsave: async (obj, next) => {
                try {
                    if (obj.register.id == 0) {
                        obj.register.datahora_criacao = moment();
                    }
                    await next(obj);
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
        }
    }
    , plastrela: {
        sync: async function () {
            let config = await db.getModel('config').findOne();
            let empresa = config.cnpj == "90816133000123" ? 2 : 1;
            main.platform.kettle.f_runJob(`jobs/${empresa == 2 ? 'ms' : 'rs'}_sync/Job.kjb`);
        }
        , schedule: {
            integracaoApontamentos: async function () {
                let config = await db.getModel('config').findOne();
                let empresa = config.cnpj == "90816133000123" ? 2 : 1;
                main.platform.kettle.f_runJob(`jobs/${empresa == 2 ? 'ms' : 'rs'}_integracaoap/Job.kjb`);
            }
            , integracaoVolumes: async function () {
                let config = await db.getModel('config').findOne();
                let empresa = config.cnpj == "90816133000123" ? 2 : 1;
                main.platform.kettle.f_runJob(`jobs/${empresa == 2 ? 'ms' : 'rs'}_integracaovolumes/Job.kjb`);
            }
            , notificacaoReserva: async function () {
                let config = await db.getModel('config').findOne();
                let empresa = config.cnpj == "90816133000123" ? 2 : 1;
                main.platform.kettle.f_runJob(`jobs/${empresa == 2 ? 'ms' : 'rs'}_notificacaoReserva/Job.kjb`);
            }
            , s_analiseMovimentacoesSemValor: async () => {
                try {
                    let empresas = [1, 2];
                    let needle = require('needle');
                    let query = null;
                    for (let i = 0; i < empresas.length; i++) {
                        query = await needle('post', 'http://172.10.30.18/SistemaH/scripts/socket/scripts2socket.php', {
                            function: 'PLAIniflexSQL', param: JSON.stringify([`
                        SELECT mov.empresa, mov.data_movto, ite.grupo, mov.item, mov.quantidade, mov.valor, mov.origem, mov.tipo_movto, mov.deposito 
                        FROM estmovim mov 
                        LEFT JOIN estitem ite on mov.empresa = ite.empresa AND mov.item = ite.codigo 
                        WHERE mov.empresa = ${empresas[i]} 
                        AND ite.tipo_item = 5
                        AND ite.grupo in (504)
                        AND TO_CHAR(mov.data_movto, 'mm') = TO_CHAR(SYSDATE, 'mm')
                        AND TO_CHAR(mov.data_movto, 'yyyy') = TO_CHAR(SYSDATE, 'yyyy')
                        AND mov.valor = 0
                        ORDER BY mov.data_movto ASC
                        `])
                        });
                        query = JSON.parse(query.body);
                        if (query.count > 0) {
                            let body = `
                        <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                            <thead>
                                <tr>
                                    <td style="text-align:center;"><strong>Empresa</strong></td>  
                                    <td style="text-align:center;"><strong>Data_Movto</strong></td>
                                    <td style="text-align:center;"><strong>Grupo</strong></td>
                                    <td style="text-align:center;"><strong>Item</strong></td>
                                    <td style="text-align:center;"><strong>Quantidade</strong></td>
                                    <td style="text-align:center;"><strong>Valor</strong></td>
                                    <td style="text-align:center;"><strong>Origem</strong></td>
                                    <td style="text-align:center;"><strong>Tipo_Movto</strong></td>
                                    <td style="text-align:center;"><strong>Depósito</strong></td>
                                </tr>
                            </thead>
                            <tbody>
                        `;
                            for (let i = 0; i < query.count; i++) {
                                body += `
                                <tr>
                                    <td style="text-align:center;"> ${query.data['EMPRESA'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['DATA_MOVTO'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['GRUPO'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['ITEM'][i]} </td>
                                    <td style="text-align:right;"> ${query.data['QUANTIDADE'][i]} </td>                                        
                                    <td style="text-align:right;"> ${query.data['VALOR'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['ORIGEM'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['TIPO_MOVTO'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['DEPOSITO'][i]} </td>
                                </tr>
                            `;
                            }
                            body += `
                            </tbody>
                        </table>
                        `;
                            return main.platform.mail.f_sendmail({
                                to: ['julio@plastrela.com.br', 'informatica@plastrela.com.br']
                                , subject: 'SIP-Análise Movimentações Estoque - Sem Valor'
                                , html: body
                            });
                        }
                    }
                } catch (err) {
                    console.error(err);
                }
            }
            , s_analiseMovimentacoesBalanco: async () => {
                try {
                    let empresas = [1, 2];
                    let needle = require('needle');
                    let query = null;
                    for (let i = 0; i < empresas.length; i++) {
                        query = await needle('post', 'http://172.10.30.18/SistemaH/scripts/socket/scripts2socket.php', {
                            function: 'PLAIniflexSQL', param: JSON.stringify([`
                        SELECT mov.empresa, mov.data_movto, ite.grupo, mov.item, mov.quantidade, mov.valor, mov.origem, mov.tipo_movto, mov.deposito 
                        FROM estmovim mov 
                        LEFT JOIN estitem ite on mov.empresa = ite.empresa AND mov.item = ite.codigo 
                        WHERE mov.empresa = ${empresas[i]} 
                        AND ite.tipo_item = 5
                        AND ite.grupo in (504)
                        AND TO_CHAR(mov.data_movto, 'mm') = TO_CHAR(SYSDATE, 'mm')
                        AND TO_CHAR(mov.data_movto, 'yyyy') = TO_CHAR(SYSDATE, 'yyyy')
                        AND mov.origem LIKE '%BAL%'
                        ORDER BY mov.data_movto ASC`])
                        });
                        query = JSON.parse(query.body);
                        if (query.count > 0) {
                            let body = `
                        <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                            <thead>
                                <tr>
                                    <td style="text-align:center;"><strong>Empresa</strong></td>  
                                    <td style="text-align:center;"><strong>Data_Movto</strong></td>
                                    <td style="text-align:center;"><strong>Grupo</strong></td>
                                    <td style="text-align:center;"><strong>Item</strong></td>
                                    <td style="text-align:center;"><strong>Quantidade</strong></td>
                                    <td style="text-align:center;"><strong>Valor</strong></td>
                                    <td style="text-align:center;"><strong>Origem</strong></td>
                                    <td style="text-align:center;"><strong>Tipo_Movto</strong></td>
                                    <td style="text-align:center;"><strong>Depósito</strong></td>
                                </tr>
                            </thead>
                            <tbody>
                        `;
                            for (let i = 0; i < query.count; i++) {
                                body += `
                                <tr>
                                    <td style="text-align:center;"> ${query.data['EMPRESA'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['DATA_MOVTO'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['GRUPO'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['ITEM'][i]} </td>
                                    <td style="text-align:right;"> ${query.data['QUANTIDADE'][i]} </td>                                        
                                    <td style="text-align:right;"> ${query.data['VALOR'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['ORIGEM'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['TIPO_MOVTO'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['DEPOSITO'][i]} </td>
                                </tr>
                            `;
                            }
                            body += `
                            </tbody>
                        </table>
                        `;
                            return main.platform.mail.f_sendmail({
                                to: ['julio@plastrela.com.br', 'informatica@plastrela.com.br']
                                , subject: 'SIP-Análise Movimentações Estoque - Balanço'
                                , html: body
                            });
                        }
                    }
                } catch (err) {
                    console.error(err);
                }
            }
            , s_analiseMovimentacoesTiposMovto: async () => {
                try {
                    let empresas = [1, 2];
                    let needle = require('needle');
                    let query = null;
                    for (let i = 0; i < empresas.length; i++) {
                        query = await needle('post', 'http://172.10.30.18/SistemaH/scripts/socket/scripts2socket.php', {
                            function: 'PLAIniflexSQL', param: JSON.stringify([`
                        SELECT mov.empresa, mov.data_movto, ite.grupo, mov.item, mov.quantidade, mov.valor, mov.origem, mov.tipo_movto, mov.deposito 
                        FROM estmovim mov 
                        LEFT JOIN estitem ite on mov.empresa = ite.empresa AND mov.item = ite.codigo 
                        WHERE mov.empresa = ${empresas[i]}
                        AND ite.tipo_item = 5 
                        AND ite.grupo in (504)
                        AND TO_CHAR(mov.data_movto, 'mm') = TO_CHAR(SYSDATE, 'mm')
                        AND TO_CHAR(mov.data_movto, 'yyyy') = TO_CHAR(SYSDATE, 'yyyy')
                        AND mov.tipo_movto IN (1,3,9,10,11)
                        ORDER BY mov.data_movto ASC
                        `])
                        });
                        query = JSON.parse(query.body);
                        if (query.count > 0) {
                            let body = `
                        <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                            <thead>
                                <tr>
                                    <td style="text-align:center;"><strong>Empresa</strong></td>  
                                    <td style="text-align:center;"><strong>Data_Movto</strong></td>
                                    <td style="text-align:center;"><strong>Grupo</strong></td>
                                    <td style="text-align:center;"><strong>Item</strong></td>
                                    <td style="text-align:center;"><strong>Quantidade</strong></td>
                                    <td style="text-align:center;"><strong>Valor</strong></td>
                                    <td style="text-align:center;"><strong>Origem</strong></td>
                                    <td style="text-align:center;"><strong>Tipo_Movto</strong></td>
                                    <td style="text-align:center;"><strong>Depósito</strong></td>
                                </tr>
                            </thead>
                            <tbody>
                        `;
                            for (let i = 0; i < query.count; i++) {
                                body += `
                                <tr>
                                    <td style="text-align:center;"> ${query.data['EMPRESA'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['DATA_MOVTO'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['GRUPO'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['ITEM'][i]} </td>
                                    <td style="text-align:right;"> ${query.data['QUANTIDADE'][i]} </td>                                        
                                    <td style="text-align:right;"> ${query.data['VALOR'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['ORIGEM'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['TIPO_MOVTO'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['DEPOSITO'][i]} </td>
                                </tr>
                            `;
                            }
                            body += `
                            </tbody>
                        </table>
                        `;
                            return main.platform.mail.f_sendmail({
                                to: ['julio@plastrela.com.br', 'informatica@plastrela.com.br']
                                , subject: 'SIP-Análise Movimentações Estoque - Tipo de Movimentação'
                                , html: body
                            });
                        }
                    }
                } catch (err) {
                    console.error(err);
                }
            }
            , s_analiseMovimentacoesTransferencias: async () => {
                try {
                    let empresas = [1, 2];
                    let needle = require('needle');
                    let query = null;
                    for (let i = 0; i < empresas.length; i++) {
                        query = await needle('post', 'http://172.10.30.18/SistemaH/scripts/socket/scripts2socket.php', {
                            function: 'PLAIniflexSQL', param: JSON.stringify([`
                        SELECT * FROM (SELECT mov.empresa, mov.data_movto, ite.grupo, mov.item, mov.quantidade, mov.valor, mov.origem, mov.tipo_movto, mov.deposito 
                           ,(SELECT COUNT(origem) FROM estmovim 
                                WHERE empresa = ${empresas[i]} 
                                AND ite.grupo in (504)
                                AND TO_CHAR(mov.data_movto, 'mm') = TO_CHAR(SYSDATE, 'mm')
                                AND TO_CHAR(mov.data_movto, 'yyyy') = TO_CHAR(SYSDATE, 'yyyy')
                                AND origem = mov.origem) as "MOVIMENTOS"
                        FROM estmovim mov 
                        LEFT JOIN estitem ite on mov.empresa = ite.empresa AND mov.item = ite.codigo 
                        WHERE mov.empresa = ${empresas[i]} 
                        AND ite.tipo_item = 5
                        AND ite.grupo in (504)
                        AND TO_CHAR(mov.data_movto, 'mm') = TO_CHAR(SYSDATE, 'mm')
                        AND TO_CHAR(mov.data_movto, 'yyyy') = TO_CHAR(SYSDATE, 'yyyy')
                        AND (mov.origem LIKE '%REQ%' OR mov.origem LIKE '%TRF%')) x
                        WHERE MOD(x.movimentos,2) = 1
                        ORDER BY x.data_movto ASC
                        `])
                        });
                        query = JSON.parse(query.body);
                        if (query.count > 0) {
                            let body = `
                        <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                            <thead>
                                <tr>
                                    <td style="text-align:center;"><strong>Empresa</strong></td>  
                                    <td style="text-align:center;"><strong>Data_Movto</strong></td>
                                    <td style="text-align:center;"><strong>Grupo</strong></td>
                                    <td style="text-align:center;"><strong>Item</strong></td>
                                    <td style="text-align:center;"><strong>Quantidade</strong></td>
                                    <td style="text-align:center;"><strong>Valor</strong></td>
                                    <td style="text-align:center;"><strong>Origem</strong></td>
                                    <td style="text-align:center;"><strong>Tipo_Movto</strong></td>
                                    <td style="text-align:center;"><strong>Depósito</strong></td>
                                    <td style="text-align:center;"><strong>Movimentos</strong></td>
                                </tr>
                            </thead>
                            <tbody>
                        `;
                            for (let i = 0; i < query.count; i++) {
                                body += `
                                <tr>
                                    <td style="text-align:center;"> ${query.data['EMPRESA'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['DATA_MOVTO'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['GRUPO'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['ITEM'][i]} </td>
                                    <td style="text-align:right;"> ${query.data['QUANTIDADE'][i]} </td>                                        
                                    <td style="text-align:right;"> ${query.data['VALOR'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['ORIGEM'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['TIPO_MOVTO'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['DEPOSITO'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['MOVIMENTOS'][i]} </td>
                                </tr>
                            `;
                            }
                            body += `
                            </tbody>
                        </table>
                        `;
                            return main.platform.mail.f_sendmail({
                                to: ['julio@plastrela.com.br', 'informatica@plastrela.com.br']
                                , subject: 'SIP-Análise Movimentações Estoque - Requisições e Transferências'
                                , html: body
                            });
                        }
                    }
                } catch (err) {
                    console.error(err);
                }
            }
            , s_configuracaoContabilItem: async () => {
                try {
                    let empresas = [1, 2];
                    let needle = require('needle');
                    let query = null;
                    for (let i = 0; i < empresas.length; i++) {
                        query = await needle('post', 'http://172.10.30.18/SistemaH/scripts/socket/scripts2socket.php', {
                            function: 'PLAIniflexSQL', param: JSON.stringify([`
                            SELECT i.codigo as "ITEM", r.tipo
                            FROM estitem i 
                            LEFT JOIN estitemctareq r ON (i.empresa = r.empresa AND i.codigo = r.item) 
                            WHERE i.empresa = ${empresas[i]}  
                            AND i.tipo_item = 5
                            AND i.situacao = 'A'
                            AND i.grupo = 504 
                            AND r.tipo != 'AP'
                        `])
                        });
                        query = JSON.parse(query.body);
                        if (query.count > 0) {
                            let body = `
                        <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                            <thead>
                                <tr>
                                    <td style="text-align:center;"><strong>Item</strong></td>
                                    <td style="text-align:center;"><strong>Tipo</strong></td>
                                </tr>
                            </thead>
                            <tbody>
                        `;
                            for (let i = 0; i < query.count; i++) {
                                body += `
                                <tr>
                                    <td style="text-align:center;"> ${query.data['ITEM'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['TIPO'][i]} </td>
                                </tr>
                            `;
                            }
                            body += `
                            </tbody>
                        </table>
                        `;
                            return main.platform.mail.f_sendmail({
                                to: ['julio@plastrela.com.br', 'informatica@plastrela.com.br']
                                , subject: 'SIP-Configuração Contábil do Item'
                                , html: `ADEQUAÇÃO: </br></br> 
                                    1- Acessar o cadastro do item no Sistema Iniflex; </br>
                                    2- Clicar com o botão direito na área cinza e escolher a opção "Conta Contábil";</br>
                                    3- Configurar e no campo Tipo tem que ser "Apontamento"</br></br>` + body
                            });
                        }
                    }
                } catch (err) {
                    console.error(err);
                }
            }
            , s_configuracaoDepositoItem: async () => {
                try {
                    let empresas = [1, 2];
                    let needle = require('needle');
                    let query = null;
                    for (let i = 0; i < empresas.length; i++) {
                        query = await needle('post', 'http://172.10.30.18/SistemaH/scripts/socket/scripts2socket.php', {
                            function: 'PLAIniflexSQL', param: JSON.stringify([`
                            SELECT DISTINCT i.codigo as "ITEM", d.deposito, d.operacao, d.centro_custo, d.contabil
                            FROM estitem i 
                            LEFT JOIN estitemdeposito d ON (i.empresa = d.empresa AND i.codigo = d.item) 
                            WHERE i.empresa = ${empresas[i]} 
                            AND i.tipo_item = 5
                            AND i.situacao = 'A'
                            AND i.grupo = 504 
                            AND d.deposito IS NULL
                        `])
                        });
                        query = JSON.parse(query.body);
                        if (query.count > 0) {
                            let body = `
                        <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                            <thead>
                                <tr>
                                    <td style="text-align:center;"><strong>Item</strong></td>
                                    <td style="text-align:center;"><strong>Depósito</strong></td>
                                    <td style="text-align:center;"><strong>Operação</strong></td>
                                    <td style="text-align:center;"><strong>Centro Custo</strong></td>
                                    <td style="text-align:center;"><strong>Movimenta Contabilidade</strong></td>
                                </tr>
                            </thead>
                            <tbody>
                        `;
                            for (let i = 0; i < query.count; i++) {
                                body += `
                                <tr>
                                    <td style="text-align:center;"> ${query.data['ITEM'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['DEPOSITO'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['OPERACAO'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['CENTRO_CUSTO'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['CONTABIL'][i]} </td>
                                </tr>
                            `;
                            }
                            body += `
                            </tbody>
                        </table>
                        `;
                            return main.platform.mail.f_sendmail({
                                to: ['julio@plastrela.com.br', 'informatica@plastrela.com.br']
                                , subject: 'SIP-Configuração Depósitos do Item'
                                , html: `ADEQUAÇÃO: </br></br> 
                                    1- Acessar o cadastro do item no Sistema Iniflex; </br>
                                    2- Clicar com o botão direito na área cinza e escolher a opção "Depósitos do Item";</br>
                                    3- Configurar conforme abaixo:</br></br>
                                        1   -   Saída   -   103003  -   Sim </br>
                                        7   -   Saída   -   102006  -   Sim </br>
                                        8   -   Saída   -   102009  -   Sim </br>
                                        9   -   Saída   -   102007  -   Sim </br>
                                        10  -   Saída   -   102008  -   Sim </br>
                                    </br></br>` + body
                            });
                        }
                    }
                } catch (err) {
                    console.error(err);
                }
            }
            , s_conferenciaItensTransferencia: async () => {
                try {
                    let needle = require('needle');
                    let query = await needle('post', 'http://172.10.30.18/SistemaH/scripts/socket/scripts2socket.php', {
                        function: 'PLAIniflexSQL', param: JSON.stringify([`
                        SELECT nt.empresa, nt.nota, nt.data_saida, nt.cliente, co.nome, it.item, i.descricao
                        FROM fatnota nt 
                        LEFT JOIN fatnotait it ON (nt.empresa = it.empresa and nt.nota = it.nota)
                        LEFT JOIN cadcorr co ON (nt.cliente = co.codigo)
                        LEFT JOIN estitem i ON (nt.empresa = i.empresa and it.item = i.codigo)
                        WHERE nt.cliente = 1
                        AND it.item NOT LIKE '130%'
                        AND nt.data_saida > '10/12/2018'
                        AND i.tipo_item IN (1)
                        ORDER BY nt.data_nota DESC
                        `
                        ])
                    });
                    query = JSON.parse(query.body);
                    if (query.count > 0) {
                        let body = `
                        <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                            <thead>
                                <tr>
                                    <td style="text-align:center;"><strong>Empresa</strong></td>  
                                    <td style="text-align:center;"><strong>Nota</strong></td>
                                    <td style="text-align:center;"><strong>Data Saída</strong></td>
                                    <td style="text-align:center;"><strong>Cliente</strong></td>
                                    <td style="text-align:center;"><strong>Nome</strong></td>
                                    <td style="text-align:center;"><strong>Item</strong></td>
                                    <td style="text-align:center;"><strong>Descrição</strong></td>
                                </tr>
                            </thead>
                            <tbody>
                        `;
                        for (let i = 0; i < query.count; i++) {
                            body += `
                                <tr>
                                    <td style="text-align:center;"> ${query.data['EMPRESA'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['NOTA'][i]} </td>
                                    <td style="text-align:center;"> ${query.data['DATA_SAIDA'][i]} </td>
                                    <td style="text-align:left;"> ${query.data['CLIENTE'][i]} </td>
                                    <td style="text-align:left;"> ${query.data['NOME'][i]} </td>                                        
                                    <td style="text-align:left;"> ${query.data['ITEM'][i]} </td>
                                    <td style="text-align:left;"> ${query.data['DESCRICAO'][i]} </td>
                                </tr>
                            `;
                        }
                        body += `
                            </tbody>
                        </table>
                        `;
                        return main.platform.mail.f_sendmail({
                            to: ['informatica@plastrela.com.br']
                            , subject: 'SIP - Conferência Transferência Itens'
                            , html: body
                        });
                    }
                } catch (err) {
                    console.error(err);
                }
            }
            , s_integracaoTransferencia: async () => {
                try {
                    let integ = await db.getModel('est_integracaotrf').findAll({ where: { integrado: { [db.Op.in]: ['N', 'E'] } } });
                    for (let i = 0; i < integ.length; i++) {
                        let query = await require('needle')('post', 'http://172.10.30.18/SistemaH/scripts/socket/scripts2socket.php', {
                            function: 'PLAIniflexSQL', param: JSON.stringify([integ[i].query])
                        });
                        if (query.body.includes('erro')) {
                            integ[i].integrado = 'E';
                            integ[i].erro = query.body;
                        } else {
                            integ[i].integrado = 'I';
                            // integ[i].erro = null;
                        }
                        integ[i].save();
                    }
                } catch (err) {
                    console.error(err);
                }
            }
        }
        , adm: {
            viagem: {
                onsave: async function (obj, next) {
                    try {
                        if (obj.id == 0) {
                            obj.register.datahorainclusao = moment();
                            obj.register.iduser = obj.req.user.id;
                        }
                        next(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_registrarponto: async function (obj) {
                    try {
                        let invalidfields = application.functions.getEmptyFields(obj.data, ['id', 'datahora']);
                        if (invalidfields.length > 0) {
                            return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                        }

                        let registro = await db.getModel('adm_viagemhorario').findOne({ where: { idviagem: obj.data.id, datahorafim: null } });
                        if (registro) {
                            let datahoraini = moment(registro.datahoraini, application.formatters.be.datetime_format);
                            let datahorafim = moment(obj.data.datahora, application.formatters.fe.datetime_format);
                            if (datahorafim.diff(datahoraini, 'h') <= 10) {
                                registro.datahorafim = application.formatters.be.datetime(obj.data.datahora);
                                registro.observacao = registro.observacao ? registro.observacao + ' | ' + obj.data.observacao : obj.data.observacao || null;
                                await registro.save({ iduser: obj.req.user.id });
                            } else {
                                return application.error(obj.res, { msg: "Tempo registrado é muito extenso. Possivelmente foram registrados horários incorretos. Favor verificar." });
                            }
                        } else {
                            await db.getModel('adm_viagemhorario').create({
                                iduser: obj.req.user.id,
                                idviagem: obj.data.id,
                                datahoraini: application.formatters.be.datetime(obj.data.datahora),
                                observacao: obj.data.observacao || null
                            });
                        }

                        return application.success(obj.res, { msg: application.message.success, reloadtables: true });

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_concluirTransfer: async function (obj) {
                    if (obj.ids.length <= 0) {
                        return application.error(obj.res, { msg: application.message.selectOneEvent });
                    }
                    let transfers = await db.getModel('adm_viagemreserva').findAll({ where: { id: { [db.Op.in]: obj.ids } } });
                    for (let i = 0; i < transfers.length; i++) {
                        transfers[i].concluida = true;
                        await transfers[i].save({ iduser: obj.req.user.id });
                    }
                    return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                }
            }
            , reserva: {
                onsave: async function (obj, next) {

                    let invalidfields = application.functions.getEmptyFields(obj.register, ['local2', 'data2', 'hora1']);
                    if (obj.register.tipo == 'Passagem Aérea' && obj.register.local2 == null) {
                        return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                    }
                    if (obj.register.tipo == 'Hospedagem' && obj.register.data2 == null) {
                        return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                    }
                    if (obj.register.tipo == 'Carro' && (obj.register.hora1 == null || obj.register.local2 == null || obj.register.data2 == null)) {
                        return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                    }
                    if (obj.register.tipo == 'Transfer' && (obj.register.hora1 == null || obj.register.local2 == null)) {
                        return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                    }

                    let saved = await next(obj);

                    if (saved.success && saved.register._isInsert && obj.register.tipo == 'Transfer') {
                        let param = await db.getModel('parameter').findOne({ where: { key: 'adm_viagens_transferNotificationUsers' } });
                        if (param) {
                            let notificationUsers = JSON.parse(param.value);
                            main.platform.notification.create(notificationUsers, {
                                title: 'Novo Transfer agendado!'
                                , description: `De: ${saved.register.local1} - Para: ${saved.register.local2}`
                                , link: '/v/transfers/' + saved.register.id
                            });
                        }
                    }
                }
            }
        }
        , cadastro: {
            vinculacaolicenca: {
                onsave: async (obj, next) => {
                    try {
                        let licenca = await db.getModel('cad_licenca').findOne({ where: { id: obj.register.idlicenca || 0 } });
                        if (!licenca) {
                            return application.error(obj.res, { msg: 'Licença não encontrada' });
                        }
                        let count = await db.getModel('cad_vinculacaolicenca').count({ where: { idlicenca: licenca.id, id: { [db.Op.ne]: obj.register.id } } });
                        if (count >= licenca.qtd) {
                            // return application.error(obj.res, { msg: 'Esta licença excedeu o número de vinculações' });
                        }
                        next(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , vinculacaopeca: {
                onsave: async (obj, next) => {
                    try {
                        let count = await db.getModel('cad_vinculacaopeca').count({ where: { idpeca: obj.register.idpeca, id: { [db.Op.ne]: obj.register.id } } });
                        if (count > 0) {
                            return application.error(obj.res, { msg: 'Esta peça já foi utilizada' });
                        }
                        next(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , vinculacaosoftware: {
                e_download: async (obj) => {
                    try {

                        let vincsoft = await db.getModel('cad_vinculacaosoftware').findAll({ include: [{ all: true }], where: { idequipamento: obj.id } });

                        let arquivos = [];
                        for (let i = 0; i < vincsoft.length; i++) {
                            if (vincsoft[i].cad_software.arquivo) {
                                arquivos = arquivos.concat(JSON.parse(vincsoft[i].cad_software.arquivo));
                            }
                        }
                        let body = '';
                        body += application.components.html.file({
                            width: '12'
                            , label: 'Quantidade'
                            , name: 'qtd'
                            , value: escape(JSON.stringify(arquivos))
                        });

                        return application.success(obj.res, {
                            modal: {
                                id: 'modalevt'
                                , title: obj.event.description
                                , body: body
                                , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Voltar</button>'
                            }
                        });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_importar: async function (obj) {
                    try {
                        if (obj.req.method == 'GET') {
                            let body = '';
                            body += '<div class="row no-margin">';
                            body += application.components.html.hidden({ name: 'id', value: obj.id });
                            body += application.components.html.file({
                                width: '12'
                                , name: 'file'
                                , label: 'Arquivo'
                                , maxfiles: '1'
                            });
                            body += '</div>';
                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , id: 'modalevt'
                                    , action: '/event/' + obj.event.id
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Importar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['id', 'file']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }
                            let file = JSON.parse(obj.req.body.file)[0];
                            let lines = fs.readFileSync(`${__dirname}/../../files/${process.env.NODE_APPNAME}/${file.id}.${file.type}`, 'ucs-2').split(/\n/);
                            // Limpa softwares
                            let sql = await db.sequelize.query(`select vl.id from cad_vinculacaosoftware vl left join cad_software s on (vl.idsoftware = s.id) 
                            where vl.idequipamento = ${obj.req.body.id} and (s.so is null or s.so = false)`, { type: db.Sequelize.QueryTypes.SELECT });
                            let ids = []
                            for (let i = 0; i < sql.length; i++) {
                                ids.push(sql[i]['id']);
                            }
                            await db.getModel('cad_vinculacaosoftware').destroy({ where: { id: { [db.Op.in]: ids } } });
                            for (let i = 1; i < lines.length - 1; i++) {
                                let content = lines[i].trim().replace(/\s\s+/g, 'xxx').split('xxx');
                                let software = (await db.getModel('cad_software').findOrCreate({ where: { descricao: content[0] } }))[0];
                                let vs = (await db.getModel('cad_vinculacaosoftware').findOrCreate({ where: { idequipamento: obj.req.body.id, idsoftware: software.id } }))[0];
                                vs.detalhes = content[1];
                                await vs.save({ iduser: obj.req.user.id });
                            }
                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
        }
        , compra: {
            solicitacaoitem: {
                onsave: async function (obj, next) {
                    try {

                        let config = await db.getModel('cmp_config').findOne();

                        if (obj.id == 0) {
                            obj.register.iduser = obj.req.user.id;
                            obj.register.datainclusao = moment();

                            if (!obj.register.idestado) {
                                obj.register.idestado = config.idsolicitacaoestadoinicial;
                            }
                        } else {
                            if (obj.register._previousDataValues.idestado == config.idsolicitacaoestadofinal) {
                                return application.error(obj.res, { msg: 'Não é possivel modificar uma solicitação finalizada' });
                            }
                        }

                        next(obj);

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , _dividir: async function (obj) {
                    try {
                        if (obj.req.method == 'GET') {
                            if (obj.ids.length != 1) {
                                return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                            }

                            let body = '';
                            body += application.components.html.hidden({ name: 'id', value: obj.ids[0] });
                            body += application.components.html.decimal({
                                width: '12'
                                , label: 'Quantidade'
                                , name: 'qtd'
                                , precision: '4'
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt'
                                    , title: 'Dividir Solicitação'
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Dividir</button>'
                                }
                            });
                        } else {

                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['id', 'qtd']);
                            let qtd = parseFloat(application.formatters.be.decimal(obj.req.body.qtd, 4));
                            let solicitacaoitem = await db.getModel('cmp_solicitacaoitem').findOne({ where: { id: obj.req.body.id } });
                            let config = await db.getModel('cmp_config').findOne();

                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }
                            if (qtd > parseFloat(solicitacaoitem.qtd)) {
                                return application.error(obj.res, { msg: 'A quantidade informada excede a quantidade da solicitação' });
                            }
                            if (solicitacaoitem.idestado == config.idsolicitacaoestadofinal) {
                                return application.error(obj.res, { msg: 'Não é possível dividir solicitação finalizada' });
                            }

                            await db.getModel('cmp_solicitacaoitem').create({
                                iduser: solicitacaoitem.iduser,
                                idversao: solicitacaoitem.idversao,
                                idpedidoitem: solicitacaoitem.idpedidoitem,
                                idestado: solicitacaoitem.idestado,
                                ociniflex: solicitacaoitem.ociniflex,
                                dataprevisao: solicitacaoitem.dataprevisao,
                                datadesejada: solicitacaoitem.datadesejada,
                                datainclusao: moment(),
                                qtd: qtd.toFixed(4)
                            });

                            solicitacaoitem.qtd = (parseFloat(solicitacaoitem.qtd) - qtd).toFixed(4);
                            await solicitacaoitem.save({ iduser: obj.req.user.id });

                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , _alterarEstado: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {
                            if (obj.ids.length <= 0) {
                                return application.error(obj.res, { msg: application.message.selectOneEvent });
                            }

                            let body = '';
                            body += application.components.html.hidden({ name: 'ids', value: obj.ids.join(',') });
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'Estado'
                                , name: 'idestado'
                                , model: 'cmp_solicitacaoestado'
                                , attribute: 'descricao'
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt'
                                    , title: 'Alterar Estado'
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Alterar</button>'
                                }
                            });
                        } else {

                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['ids', 'idestado']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }
                            let config = await db.getModel('cmp_config').findOne();
                            let sql = await db.getModel('cmp_solicitacaoitem').findAll({
                                where: {
                                    id: { [db.Op.in]: obj.req.body.ids.split(',') }
                                    , idestado: config.idsolicitacaoestadofinal
                                }
                            });
                            if (sql.length > 0) {
                                return application.error(obj.res, { msg: 'Não é possível alterar o estado de solicitações finalizadas' });
                            }

                            await db.getModel('cmp_solicitacaoitem').update({ idestado: obj.req.body.idestado }, { iduser: obj.req.user.id, where: { id: { [db.Op.in]: obj.req.body.ids.split(',') } } });

                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , _imprimir: async function (obj) {
                    try {

                        if (obj.ids.length == 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }

                        let sql = await db.sequelize.query(`
                            select
                                si.id
                                , si.datadesejada
                                , c.descricao as tipo
                                , si.qtd
                                , (select f.valor from pcp_ficha f left join pcp_atribficha af on (f.idatributo = af.id) where f.valor is not null and f.idversao = v.id and af.codigo in (15028, 176, 150028, 150038, 22)) as espessura
                                , (select f.valor from pcp_ficha f left join pcp_atribficha af on (f.idatributo = af.id) where f.valor is not null and f.idversao = v.id and af.codigo in (15046, 175, 150029, 150039, 20)) as largura
                                , u.unidade
                            from
                                cmp_solicitacaoitem si
                            left join pcp_versao v on (si.idversao = v.id)
                            left join cad_item i on (v.iditem = i.id)
                            left join est_classe c on (i.idclasse = c.id)
                            left join cad_unidade u on (i.idunidade = u.id)
                            where
                                si.id in ( ` + obj.ids.join(',') + ` )
                            `
                            , {
                                type: db.sequelize.QueryTypes.SELECT
                            });

                        let report = {};
                        report.__title = 'Solicitações de Compra';
                        report.__table = `
                            <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                                <thead>
                                    <tr>
                                        <td style="text-align:center;"><strong>OC</strong></td>
                                        <td style="text-align:center;"><strong>Data Desejada</strong></td>
                                        <td style="text-align:center;"><strong>Tipo</strong></td>
                                        <td style="text-align:center;"><strong>Largura(mm)</strong></td>
                                        <td style="text-align:center;"><strong>Espessura(mm)</strong></td>
                                        <td style="text-align:center;"><strong>Quantidade</strong></td>
                                        <td style="text-align:center;"><strong>Unidade</strong></td>
                                    </tr>
                                </thead>
                                <tbody>
                            `;
                        for (let i = 0; i < sql.length; i++) {
                            report.__table += `
                                    <tr>
                                        <td style="text-align:center;"> ${sql[i]['id']} </td>
                                        <td style="text-align:center;"> ${sql[i]['datadesejada'] ? application.formatters.fe.date(sql[i]['datadesejada']) : ''} </td>
                                        <td style="text-align:center;"> ${sql[i]['tipo']} </td>
                                        <td style="text-align:center;"> ${application.formatters.fe.decimal(sql[i]['largura'], 4)} </td>                                        
                                        <td style="text-align:center;"> ${application.formatters.fe.decimal(sql[i]['espessura'], 4)} </td>
                                        <td style="text-align:center;"> ${application.formatters.fe.decimal(sql[i]['qtd'], 4)} </td>
                                        <td style="text-align:center;"> ${sql[i]['unidade']} </td>
                                    </tr>
                                `;
                        }
                        report.__table += `
                                </tbody>
                            </table>
                            `;

                        let filename = await main.platform.report.f_generate('Geral - Listagem', report);
                        return application.success(obj.res, {
                            openurl: '/download/' + filename
                        });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
        }
        , manutencao: {
            grupo: {
                onsave: async function (obj, next) {
                    try {

                        await next(obj);
                        main.plastrela.manutencao.grupo.treeAll();
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , treeAll: function () {

                    let getChildren = function (current, childs) {
                        for (let i = 0; i < childs.length; i++) {
                            if (current.idgrupopai == childs[i].id) {
                                if (childs[i].idgrupopai) {
                                    return getChildren(childs[i], childs) + childs[i].descricao + ' - ';
                                } else {
                                    return childs[i].descricao + ' - ';
                                }
                            }
                        }
                    }

                    db.getModel('man_grupo').findAll().then(grupos => {
                        grupos.map(grupo => {
                            if (grupo.idgrupopai) {
                                grupo.descricaocompleta = getChildren(grupo, grupos) + grupo.descricao;
                            } else {
                                grupo.descricaocompleta = grupo.descricao;
                            }
                            grupo.save();
                        });
                    });

                }
            }
            , movimentacao: {
                onsave: async function (obj, next) {
                    try {
                        let peca = await db.getModel('man_peca').findOne({ where: { id: obj.register.idmanpeca } });

                        if (obj.register.qtd <= 0) {
                            return application.error(obj.res, { msg: 'A Quantidade deve ser maior que 0', invalidfields: ['qtd'] });
                        }

                        if (obj.register.id > 0) {
                            if (obj.register._previousDataValues.tipo == 'Entrada') {
                                peca.estoque = parseFloat(peca.estoque) - parseFloat(obj.register._previousDataValues.qtd);
                            } else {
                                peca.estoque = parseFloat(peca.estoque) + parseFloat(obj.register._previousDataValues.qtd);
                            }
                        }
                        if (obj.register.tipo == 'Entrada') {
                            peca.estoque = parseFloat(peca.estoque || 0) + parseFloat(obj.register.qtd);
                        } else {
                            peca.estoque = parseFloat(peca.estoque || 0) - parseFloat(obj.register.qtd);
                        }
                        if (peca.estoque < 0) {
                            return application.error(obj.res, { msg: 'Estoque insuficiente' });
                        }
                        let saved = await next(obj);
                        if (saved.success) {
                            peca.save({ iduser: obj.req.user.id });
                            if (parseFloat(peca.estoque) < parseFloat(peca.minimo)) {
                                main.platform.notification.create([obj.req.user.id], {
                                    title: 'Estoque Mínimo Atingido!'
                                    , description: `Peça: ${peca.descricao} Qtd em Estoque: ${application.formatters.fe.decimal(peca.estoque, 2)} Mínimo: ${application.formatters.fe.decimal(peca.minimo, 2)}`
                                });
                            }
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , ondelete: async function (obj, next) {
                    try {
                        let movimentacoes = await db.getModel('man_movimentacao').findAll({ where: { id: { [db.Op.in]: obj.ids } } });
                        let deleted = await next(obj);
                        if (deleted.success) {
                            for (let i = 0; i < movimentacoes.length; i++) {
                                let peca = await db.getModel('man_peca').findOne({ where: { id: movimentacoes[i].idmanpeca } });
                                if (movimentacoes[i].tipo == 'Entrada') {
                                    peca.estoque = parseFloat(peca.estoque) - parseFloat(movimentacoes[i].qtd);
                                } else {
                                    peca.estoque = parseFloat(peca.estoque) + parseFloat(movimentacoes[i].qtd);
                                }
                                await peca.save({ iduser: obj.req.user.id });
                            }
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , os: {
                save: function (json, next) {
                    db.getModel('man_config').findOne().then(config => {

                        // Prioridades
                        if (config.idprioridadeurgente == json.data.idprioridade && !json.data.idmotivo) {
                            return application.error(json.res, { msg: 'Prioridade Urgente exige motivo', invalidfields: ['idmotivo'] });
                        } else if (config.idprioridadeate == json.data.idprioridade && !json.data.dataprioridade) {
                            return application.error(json.res, { msg: 'Prioridade Executar até exige Data Prioridade', invalidfields: ['dataprioridade'] });
                        } else if (config.idprioridadeapartir == json.data.idprioridade && !json.data.dataprioridade) {
                            return application.error(json.res, { msg: 'Prioridade Executar a Partir exige Data Prioridade', invalidfields: ['dataprioridade'] });
                        }

                        if (json.id == 0) {
                            json.data.idusuariorequisitante = json.req.user.id;
                            json.data.idestado = config.idestadoinicial;
                        } else {
                            if (!json.data.idestado) {
                                return application.error(json.res, { msg: 'Informe o Estado', invalidfields: ['idestado'] });
                            }
                        }

                        next(json);
                    });
                }
            }
        }
        , estoque: {

            criarNotaChaveAcesso: async function (obj) {
                if (obj.req.method == 'GET') {
                    let config = await db.getModel('config').findOne();
                    let empresa = config.cnpj == "90816133000123" ? 2 : 1;
                    main.platform.kettle.f_runJob(`jobs/${empresa == 2 ? 'ms' : 'rs'}_sync_sped/Job.kjb`);

                    let body = '';

                    body += application.components.html.autocomplete({
                        width: '12'
                        , label: 'Depósito'
                        , name: 'deposito'
                        , model: 'est_deposito'
                        , attribute: 'descricao'
                    });
                    body += application.components.html.text({
                        width: 12
                        , label: 'Chave de Acesso'
                        , name: 'chave'
                    });

                    return application.success(obj.res, {
                        modal: {
                            form: true
                            , action: '/event/' + obj.event.id
                            , id: 'modalevt'
                            , title: 'Criar Nota'
                            , body: body
                            , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Gerar</button>'
                        }
                    });
                } else {

                    let invalidfields = application.functions.getEmptyFields(obj.req.body, ['chave', 'deposito']);
                    if (invalidfields.length > 0) {
                        return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                    }

                    let count = await db.getModel('est_nfentrada').count({
                        where: {
                            chave: obj.req.body.chave
                        }
                    });
                    if (count > 0) {
                        return application.error(obj.res, { msg: 'Nota já importada' });
                    }

                    try {

                        let spednf = await db.getModel('sped_nfentrada').findOne({
                            where: {
                                chave_nfe: obj.req.body.chave
                            }
                            , raw: true
                        });
                        if (!spednf) {
                            return application.error(obj.res, { msg: 'Chave de acesso não encontrada' });
                        }
                        let spednfitem = await db.getModel('sped_nfentradait').findAll({
                            where: {
                                chave_nfe: obj.req.body.chave
                            }
                            , raw: true
                        });
                        if (spednfitem.length <= 0) {
                            return application.error(obj.res, { msg: 'Esta nota não possui itens' });
                        }
                        for (let i = 0; i < spednfitem.length; i++) {
                            if (!spednfitem[i].ordem_compra) {
                                return application.error(obj.res, { msg: 'Existe algum item desta nota sem ordem de compra vinculado' });
                            }
                        }

                        let nf = await db.getModel('est_nfentrada').create({
                            chave: spednf.chave_nfe
                            , finalizado: false
                            , dataemissao: spednf.data_emissao
                            , documento: spednf.docto + '/' + spednf.serie
                            , cnpj: spednf.cnpj_emitente
                            , razaosocial: spednf.nome_emitente
                            , datainclusao: moment()
                            , iddeposito: obj.req.body.deposito
                        });

                        let bulkitens = [];
                        for (let i = 0; i < spednfitem.length; i++) {

                            let sql = await db.sequelize.query("select v.id from pcp_versao v left join cad_item i on (v.iditem = i.id) where i.codigo = :item and v.codigo = :versao", {
                                type: db.sequelize.QueryTypes.SELECT
                                , replacements: { item: spednfitem[i].produto, versao: spednfitem[i].versao }
                            });

                            if (sql.length == 0) {
                                nf.destroy();
                                return application.error(obj.res, { msg: 'Não foi encontrado o cadastro do produto: ' + spednfitem[i].produto + '/' + spednfitem[i].versao });
                            }

                            bulkitens.push({
                                codigoviniflex: null
                                , idnfentrada: nf.id
                                , sequencial: spednfitem[i].item
                                , codigo: spednfitem[i].codigo_produto
                                , descricao: spednfitem[i].nome_produto
                                , qtd: spednfitem[i].quantidade
                                , oc: spednfitem[i].ordem_compra
                                , idversao: sql[0].id
                                , qtdvolumes: 0
                            });

                        }

                        let nfitem = await db.getModel('est_nfentradaitem').bulkCreate(bulkitens);

                        return application.success(obj.res, { msg: application.message.success, reloadtables: true });

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }

                }
            }
            , _finalizarEntrada: async function (obj) {
                try {

                    if (obj.ids.length != 1) {
                        return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                    }

                    let nfentrada = await db.getModel('est_nfentrada').findOne({ where: { id: obj.ids[0] } });
                    if (nfentrada.finalizado) {
                        return application.error(obj.res, { msg: 'Não é possível finalizar uma nota já finalizada' });
                    }

                    let est_config = await db.getModel('est_config').findOne();

                    let results = await db.sequelize.query(`
                    select * from (select
                        ni.sequencial
                        , ni.qtd
                        , (select sum(v.qtd) from est_volume v where v.idnfentradaitem = ni.id) as totalgerado
                        , (select count(*) from est_volume v where v.idnfentradaitem = ni.id and v.observacao is not null) as temobs
                    from
                        est_nfentrada n
                    left join est_nfentradaitem ni on (n.id = ni.idnfentrada)
                    where
                        n.id = :v1) as x
                    where qtd != totalgerado
                    `, { type: db.sequelize.QueryTypes.SELECT, replacements: { v1: nfentrada.id } });
                    if (results.length > 0) {
                        for (let i = 0; i < results.length; i++) {
                            if (results[i].temobs <= 0) {
                                return application.error(obj.res, { msg: 'O peso gerado do item com sequencial ' + results[0].sequencial + ' não bate com o da nota, verifique' });
                            }
                        }
                    }

                    let config = await db.getModel('cmp_config').findOne();
                    let nfentradaitens = await db.getModel('est_nfentradaitem').findAll({ include: [{ all: true }], where: { idnfentrada: nfentrada.id } });
                    let reservascriadas = [];
                    let solicitacoesfinalizadas = [];

                    if (!nfentrada.semsolicitacaocompra) {
                        for (let i = 0; i < nfentradaitens.length; i++) {
                            let solicitacaoitem = await db.getModel('cmp_solicitacaoitem').findAll({
                                where: {
                                    idversao: nfentradaitens[i].idversao
                                    , ociniflex: nfentradaitens[i].oc
                                }
                                , order: [['datainclusao', 'asc']]
                            });

                            if (solicitacaoitem.length <= 0) {
                                for (let z = 0; z < solicitacoesfinalizadas.length; z++) {
                                    solicitacoesfinalizadas[z].qtdrecebida = null;
                                    await solicitacoesfinalizadas[z].save({ iduser: obj.req.user.id });
                                }
                                for (let z = 0; z < reservascriadas.length; z++) {
                                    reservascriadas[z].destroy();
                                }

                                application.error(obj.res, { msg: 'Solicitação de compra não encontrado para o item com sequencial ' + nfentradaitens[i].sequencial });
                                return main.platform.mail.f_sendmail({
                                    to: est_config.gv_email.split(';')
                                    , subject: 'SIP - Solicitação não encontrada'
                                    , html: `Entrada de NF:<br/>
                                        Solicitação de compra não encontrada.<br/>
                                        <b>OC:</b> `+ nfentradaitens[i].oc + `<br/>
                                        <b>Código do item:</b> `+ nfentradaitens[i].pcp_versao.descricaocompleta + `</br></br>
                                        Responder o e-mail após realização do procedimento.`
                                });
                            }

                            for (let y = 0; y < solicitacaoitem.length; y++) {
                                let pesorestante = parseFloat(solicitacaoitem[y].qtd) - parseFloat(solicitacaoitem[y].qtdrecebida || 0);
                                if (pesorestante > 0) {
                                    // Reservas                          
                                    let volumes = await db.getModel('est_volume').findAll({ where: { idnfentradaitem: nfentradaitens[i].id } });
                                    for (let z = 0; z < volumes.length; z++) {
                                        let totalreservado = await db.sequelize.query('select sum(qtd) as soma from est_volumereserva where idvolume = :v1', { type: db.sequelize.QueryTypes.SELECT, replacements: { v1: volumes[z].id } });
                                        let qtd = parseFloat(volumes[z].qtd) - parseFloat(totalreservado.length > 0 ? totalreservado[0].soma || 0 : 0);
                                        if (pesorestante < qtd) {
                                            if (pesorestante > 0 && solicitacaoitem[y].idpedidoitem) {
                                                reservascriadas.push(await db.getModel('est_volumereserva').create({
                                                    idvolume: volumes[z].id
                                                    , idpedidoitem: solicitacaoitem[y].idpedidoitem
                                                    , idopetapa: solicitacaoitem[y].idopetapa
                                                    , qtd: pesorestante.toFixed(4)
                                                    , apontado: false
                                                }));
                                            }
                                            solicitacaoitem[y].qtdrecebida = parseFloat(solicitacaoitem[y].qtdrecebida || 0) + pesorestante;
                                            pesorestante = 0;
                                        } else {
                                            pesorestante -= qtd;
                                            if (qtd > 0 && solicitacaoitem[y].idpedidoitem) {
                                                reservascriadas.push(await db.getModel('est_volumereserva').create({
                                                    idvolume: volumes[z].id
                                                    , idpedidoitem: solicitacaoitem[y].idpedidoitem
                                                    , idopetapa: solicitacaoitem[y].idopetapa
                                                    , qtd: qtd.toFixed(4)
                                                    , apontado: false
                                                }));
                                            }
                                            solicitacaoitem[y].qtdrecebida = parseFloat(solicitacaoitem[y].qtdrecebida || 0) + qtd;
                                        }
                                    }

                                    await solicitacaoitem[y].save({ iduser: obj.req.user.id });
                                    solicitacoesfinalizadas.push(solicitacaoitem[y]);
                                }
                            }
                        }
                        let volumesreservados = [];
                        for (let i = 0; i < reservascriadas.length; i++) {
                            if (volumesreservados.indexOf(reservascriadas[i].idvolume) == -1) {
                                volumesreservados.push(reservascriadas[i].idvolume);//Entra apenas 1 vez no volume
                                let volume = await db.getModel('est_volume').findOne({ where: { id: reservascriadas[i].idvolume } });
                                let totalreservado = await db.sequelize.query('select sum(qtd) as soma from est_volumereserva where idvolume = :v1', { type: db.sequelize.QueryTypes.SELECT, replacements: { v1: volume.id } });
                                let qtd = parseFloat(volume.qtd) - parseFloat(totalreservado.length > 0 ? totalreservado[0].soma || 0 : 0);
                                if (qtd < 50) {
                                    let ultimareserva = await db.getModel('est_volumereserva').findOne({ where: { idvolume: volume.id }, order: [['id', 'desc']] });
                                    ultimareserva.qtd = (parseFloat(ultimareserva.qtd) + parseFloat(qtd)).toFixed(4);
                                    await ultimareserva.save({ iduser: obj.req.user.id });
                                }
                            }
                        }
                    }

                    for (let z = 0; z < solicitacoesfinalizadas.length; z++) {
                        solicitacoesfinalizadas[z].idestado = config.idsolicitacaoestadofinal;
                        await solicitacoesfinalizadas[z].save({ iduser: obj.req.user.id });
                    }

                    nfentrada.integrado = 'P';
                    nfentrada.finalizado = true;
                    await nfentrada.save({ iduser: obj.req.user.id });

                    application.success(obj.res, { msg: application.message.success, reloadtables: true });

                    let sql = await db.sequelize.query(`
                    select
                        v.descricaocompleta
                        , nfi.oc
                        , (select sum(c.qtd) from cmp_solicitacaoitem c where c.idversao = nfi.idversao and c.ociniflex like nfi.oc) as solicitado
                        , sum((select sum(vol.qtd) from est_volume vol where vol.idnfentradaitem = nfi.id)) as recebido
                        , sum((select count(*) from  est_volume vol where vol.idnfentradaitem = nfi.id)) as qtd
                    from
                        est_nfentrada nf
                    left join est_nfentradaitem nfi on (nf.id = nfi.idnfentrada)
                    left join pcp_versao v on (nfi.idversao = v.id)
                    where
                        nf.id = :v1
                    group by 1,2,3
                    `, { type: db.sequelize.QueryTypes.SELECT, replacements: { v1: nfentrada.id } });
                    let emailItens = '';
                    for (let i = 0; i < sql.length; i++) {
                        emailItens += `
                        <tr>
                            <td>`+ sql[i].descricaocompleta + `</td>
                            <td>`+ sql[i].oc + `</td>
                            <td>`+ application.formatters.fe.decimal(sql[i].solicitado, 4) + `</td>
                            <td>`+ application.formatters.fe.decimal(sql[i].recebido, 4) + `</td>
                            <td>`+ sql[i].qtd + `</td>
                        </tr>
                        `;
                    }

                    return main.platform.mail.f_sendmail({
                        to: est_config.gv_email.split(';')
                        , subject: 'SIP - Chegada de Material no Almoxarifado'
                        , html: `
                        <style type="text/css">
                            .conteudo{
                                font-family: arial, sans-serif;
                                font-size: 14px;
                            }
                        
                            table {
                                border-collapse: collapse;
                                font-size: 14px;
                            }
                        
                            td, th {
                                border: 1px solid black;
                                text-align: left;
                                padding: 5px;
                            }
                        
                            .table1 td:first-child {
                                text-align: right;
                            } 
                        
                            .table2 td:nth-child(3) {
                                text-align: right;
                            } 
                            .table2 td:nth-child(4) {
                                text-align: right;
                            } 
                        </style>
                        <div class="conteudo">
                            <table class="table1">
                                <tbody>
                                    <tr>
                                        <td>
                                            <b>Fornecedor</b>
                                        </td>
                                        <td>`+ nfentrada.razaosocial + `</td>
                                    </tr>
                                    <tr>
                                        <td>
                                            <b>NF</b>
                                        </td>
                                        <td>`+ nfentrada.documento + `</td>
                                    </tr>
                                </tbody>
                            </table>

                            <table class="table2" style="margin-top: 5px;">
                                <thead>
                                    <tr>
                                        <td>
                                            <b>Produto</b>
                                        </td>
                                        <td>
                                            <b>OC</b>
                                        </td>
                                        <td>
                                            <b>Qtd Solicitada</b>
                                        </td>
                                        <td>
                                            <b>Qtd Recebida</b>
                                        </td>
                                        <td>
                                            <b>Volumes</b>
                                        </td>
                                    </tr>
                                </thead>
                                <tbody>`+ emailItens + `</tbody>
                            </table>
                        </div>
                        `
                    });


                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , est_volume: {

                _imprimirEtiqueta: async function (obj) {
                    try {

                        let f = application.functions;
                        let pdfkit = require('pdfkit');
                        let barcode = require('barcode-2-svg');
                        let svgtopdfkit = require('svg-to-pdfkit');

                        if (obj.ids.length == 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }

                        const doc = new pdfkit({
                            autoFirstPage: false
                        });

                        let config = await db.getModel('config').findOne({ raw: true });
                        let image = JSON.parse(config.reportimage)[0];
                        let filename = process.hrtime()[1] + '.pdf';
                        let stream = doc.pipe(fs.createWriteStream(`${__dirname}/../../tmp/${process.env.NODE_APPNAME}/${filename}`));

                        let volumes = await db.getModel('est_volume').findAll({ where: { id: { [db.Op.in]: obj.ids } }, include: [{ all: true }], raw: true });
                        for (let i = 0; i < volumes.length; i++) {
                            let volume = volumes[i];
                            let versao = await db.getModel('pcp_versao').findOne({ where: { id: volume.idversao } });
                            let item = await db.getModel('cad_item').findOne({ where: { id: versao ? versao.iditem : 0 } });
                            let grupo = await db.getModel('est_grupo').findOne({ where: { id: item ? item.idgrupo : 0 } });

                            let nfentradaitem = await db.getModel('est_nfentradaitem').findOne({ where: { id: volume.idnfentradaitem } });
                            let nfentrada = await db.getModel('est_nfentrada').findOne({ where: { id: nfentradaitem ? nfentradaitem.idnfentrada : 0 } });
                            let approducaovolume = await db.getModel('pcp_approducaovolume').findOne({ where: { id: volume.idapproducaovolume } });
                            let approducao = await db.getModel('pcp_approducao').findOne({ where: { id: approducaovolume ? approducaovolume.idapproducao : 0 } });
                            let approducaotempos = await db.getModel('pcp_approducaotempo').findAll({ where: { idapproducao: approducao ? approducao.id : 0 }, order: [['dataini', 'asc']] });
                            let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: approducaovolume && approducaovolume.idopreferente ? approducaovolume.idopreferente : approducao ? approducao.idoprecurso : 0 } });
                            let oprecurso_recurso = await db.getModel('pcp_recurso').findOne({ where: { id: oprecurso ? oprecurso.idrecurso : 0 } });
                            let opetapa = await db.getModel('pcp_opetapa').findOne({ where: { id: oprecurso ? oprecurso.idopetapa : 0 } });
                            let etapa = await db.getModel('pcp_etapa').findOne({ where: { id: opetapa ? opetapa.idetapa : 0 } });
                            let op = await db.getModel('pcp_op').findOne({ where: { id: opetapa ? opetapa.idop : 0 } });
                            let opmae = await db.getModel('pcp_op').findOne({ include: [{ all: true }], where: { id: op && op.idopmae ? op.idopmae : 0 } });
                            let opep = await db.getModel('pcp_opep').findOne({ where: { idop: op ? op.id : 0 } });
                            let opmaeopep = await db.getModel('pcp_opep').findOne({ where: { idop: opmae ? opmae.id : 0 } });
                            let pedido = await db.getModel('ven_pedido').findOne({ where: { id: opep ? opep.idpedido : 0 } });
                            let opmaepedido = await db.getModel('ven_pedido').findOne({ where: { id: opmaeopep ? opmaeopep.idpedido : 0 } });
                            let opmaepedidoitem = await db.getModel('ven_pedidoitem').findOne({ include: [{ all: true }], where: { idpedido: opmaepedido ? opmaepedido.id : 0 } });
                            let cliente = await db.getModel('cad_corr').findOne({ where: { id: pedido ? pedido.idcliente : opmaepedido ? opmaepedido.idcliente : 0 } });

                            let formato = await db.sequelize.query(`
                            select
                                case when tp.codigo = 2 then
                                    (select f.valor from pcp_ficha f left join pcp_atribficha af on (f.idatributo = af.id) where f.valor is not null and f.idversao = v.id and af.codigo in (123))::decimal
                                else
                                    (select f.valor from pcp_ficha f left join pcp_atribficha af on (f.idatributo = af.id) where f.valor is not null and f.idversao = v.id and af.codigo in (15046, 175, 150029, 150039, 20))::decimal
                                end as largura
                                , (select f.valor from pcp_ficha f left join pcp_atribficha af on (f.idatributo = af.id) where f.valor is not null and f.idversao = v.id and af.codigo in (15028, 176, 150028, 150038, 22))::decimal as espessura
                                , (select f.valor from pcp_ficha f left join pcp_atribficha af on (f.idatributo = af.id) where f.valor is not null and f.idversao = v.id and af.codigo in (1176))::decimal as espessuralam
                                , (select f.valor from pcp_ficha f left join pcp_atribficha af on (f.idatributo = af.id) where f.valor is not null and f.idversao = v.id and af.codigo in (1197)) as larguralam
                                , (select f.valor from pcp_ficha f left join pcp_atribficha af on (f.idatributo = af.id) where f.valor is not null and f.idversao = v.id and af.codigo in (23)) as implargura
                                , (select f.valor from pcp_ficha f left join pcp_atribficha af on (f.idatributo = af.id) where f.valor is not null and f.idversao = v.id and af.codigo in (1190)) as impespessura
                            from
                                est_volume vol
                            left join pcp_versao v on (vol.idversao = v.id)
                            left join cad_item i on (v.iditem = i.id)
                            left join est_tpitem tp on (i.idtpitem = tp.id)
                            where vol.id = :v1
                            `, {
                                    type: db.sequelize.QueryTypes.SELECT
                                    , replacements: { v1: volume.id }
                                });

                            let sequenciaProducao = await db.sequelize.query(`
                            select
                                count(case when v.id >= va.id then 1 else null end) as seq
                            from
                                est_volume v
                            left join pcp_approducaovolume apv on (v.idapproducaovolume = apv.id)
                            left join pcp_approducao ap on (apv.idapproducao = ap.id)
                            left join pcp_approducao apa on (ap.idoprecurso = apa.idoprecurso)
                            left join pcp_approducaovolume apav on (apa.id = apav.idapproducao)
                            left join est_volume va on (apav.id = va.idapproducaovolume)
                            where
                                v.id = :v1
                            `, {
                                    type: db.sequelize.QueryTypes.SELECT
                                    , replacements: { v1: volume.id }
                                });

                            doc.addPage({ margin: 30 });

                            let width1 = 27;
                            let width1val = 20;

                            let width2 = 24;
                            let width2val = 25;

                            let width3 = 5;
                            let width3val = 21;

                            let padstr = ' ';
                            let md = 0.65;

                            if (grupo && grupo.codigo != 533 && grupo.codigo != 502) {

                                doc.moveTo(25, 25)
                                    .lineTo(589, 25) //top
                                    .lineTo(589, 445) //right
                                    .lineTo(25, 445) //bottom
                                    .lineTo(25, 25) //bottom
                                    .stroke();

                                if (fs.existsSync(`${__dirname}/../../files/${process.env.NODE_APPNAME}/${image.id}.${image.type}`)) {
                                    doc.image(`${__dirname}/../../files/${process.env.NODE_APPNAME}/${image.id}.${image.type}`, 35, 33, { width: 20 });
                                }

                                doc.moveTo(25, 60)
                                    .lineTo(589, 60) // Cabeçalho
                                    .stroke();

                                doc.moveTo(25, 75)
                                    .lineTo(589, 75) // Cabeçalho
                                    .stroke();

                                // Title

                                doc
                                    .font('Courier-Bold')
                                    .fontSize(11)
                                    .text('IDENTIFICAÇÃO E STATUS DO VOLUME Nº ' + volume.id, 165, 40);


                                doc
                                    .fontSize(7.5)
                                    .text('Anexo - 03', 500, 35)
                                    .text('Nº PPP - 05 Revisão: 10', 460, 50);

                                doc
                                    .moveTo(240, 75)
                                    .lineTo(240, 104)
                                    .stroke()
                                    .moveTo(460, 75)
                                    .lineTo(460, 117)
                                    .stroke();

                                doc
                                    .font('Courier-Bold').text(f.lpad('Produto: ', width1, padstr), 30, 67, { continued: true })
                                    .font('Courier').text(f.rpad(versao.descricaocompleta, 87, padstr))
                                    .moveDown(md);

                                doc
                                    .font('Courier-Bold').text(f.lpad('Formato: ', width1, padstr), { continued: true })
                                    .font('Courier').text(f.rpad(formato.length > 0 ?
                                        etapa && etapa.codigo == 10 ? formato[0].largura + ' x ' + formato[0].espessura :
                                            etapa && etapa.codigo == 20 ? formato[0].implargura + ' x ' + formato[0].impespessura :
                                                etapa && (etapa.codigo == 30 || etapa.codigo == 35) ?
                                                    formato[0].larguralam + ' x ' + formato[0].espessuralam : ''
                                        : ''
                                        , width1val, padstr), { continued: true })
                                    .font('Courier-Bold').text(f.lpad('Peso: ', width2, padstr), { continued: true })
                                    .font('Courier').text(f.rpad(application.formatters.fe.decimal(volume.qtdreal, 4) + ' KG', width2val, padstr), { continued: true })
                                    .font('Courier-Bold').text(f.lpad('Mts: ', width3, padstr), { continued: true })
                                    .font('Courier').text(f.rpad(application.formatters.fe.decimal(volume.metragem || 0, 4) + ' M', width3val, padstr))
                                    .moveDown(md);

                                doc
                                    .font('Courier-Bold').text(f.lpad('Pedido: ', width1, padstr), { continued: true })
                                    .font('Courier').text(f.rpad(pedido ? pedido.codigo : opmaepedidoitem ? opmaepedido.codigo : '', width1val, padstr), { continued: true })
                                    .font('Courier-Bold').text(f.lpad('Ordem de Compra: ', width2, padstr), { continued: true })
                                    .font('Courier').text(f.rpad(nfentradaitem ? nfentradaitem.oc : '', width2val, padstr), { continued: true })
                                    .font('Courier-Bold').text(f.lpad('OP: ', width3, padstr), { continued: true })
                                    .font('Courier-Bold').text(f.rpad(op ? op.codigo : '', width3val, padstr))
                                    .moveDown(md);

                                doc
                                    .font('Courier-Bold').fontSize(7.5).text(f.lpad('Produto: ', width1, padstr), { continued: true })
                                    .font('Courier').text(f.rpad(opmae ? opmae.pcp_versao.descricaocompleta : '', width1val + width2val + 24, padstr) + ' ', { continued: true })
                                    .font('Courier-Bold').text(f.lpad('OP Mãe: ', 8, padstr), { continued: true })
                                    .font('Courier-Bold').text(f.rpad(opmae ? opmae.codigo : '', width3val - 5, padstr))
                                    .moveDown(md);

                                doc
                                    .font('Courier-Bold').fontSize(7.5).text(f.lpad('Cliente: ', width1, padstr), { continued: true })
                                    .font('Courier').text(f.rpad(cliente ? cliente.nome : '', 87, padstr))
                                    .moveDown(md);

                                doc
                                    .font('Courier-Bold').text(f.lpad('Formato após Revisão: ', width1, padstr), { continued: true })
                                    .font('Courier').text(f.rpad('', width1val, padstr), { continued: true })
                                    .font('Courier-Bold').text(f.lpad('Peso após Revisão: ', width2, padstr), { continued: true })
                                    .font('Courier').text(f.rpad('', width2val, padstr), { continued: true })
                                    .font('Courier-Bold').text(f.lpad('Mts: ', width3, padstr), { continued: true })
                                    .font('Courier').text(f.rpad('', width3val, padstr))
                                    .moveDown(md);

                                doc
                                    .font('Courier-Bold').text(f.lpad('Formato após Laminação: ', width1, padstr), { continued: true })
                                    .font('Courier').text(f.rpad('', width1val, padstr), { continued: true })
                                    .font('Courier-Bold').text(f.lpad('Peso após Laminação: ', width2, padstr), { continued: true })
                                    .font('Courier').text(f.rpad('', width2val, padstr), { continued: true })
                                    .font('Courier-Bold').text(f.lpad('Mts: ', width3, padstr), { continued: true })
                                    .font('Courier').text(f.rpad('', width3val, padstr))
                                    .moveDown(md);

                                doc
                                    .font('Courier-Bold').text(f.lpad('Formato após 2ª Laminação: ', width1, padstr), { continued: true })
                                    .font('Courier').text(f.rpad('', width1val, padstr), { continued: true })
                                    .font('Courier-Bold').text(f.lpad('Peso após 2ª Laminação: ', width2, padstr), { continued: true })
                                    .font('Courier').text(f.rpad('', width2val, padstr), { continued: true })
                                    .font('Courier-Bold').text(f.lpad('Mts: ', width3, padstr), { continued: true })
                                    .font('Courier').text(f.rpad('', width3val, padstr))
                                    .moveDown(md);

                                doc
                                    .font('Courier-Bold')
                                    .text(
                                        f.lpad('Tratamento', 15, padstr) +
                                        f.lpad('Turno', 16, padstr) +
                                        f.lpad('Nº da', 13, padstr) +
                                        f.lpad('Operador', 14, padstr) +
                                        f.lpad('Hora', 11, padstr) +
                                        f.lpad('Hora', 13, padstr) +
                                        f.lpad('Data', 10, padstr) +
                                        f.lpad('Aprovado /', 15, padstr) +
                                        f.lpad('Aprovado /', 14, padstr)
                                    )
                                    .moveDown(md);

                                doc
                                    .font('Courier-Bold').fontSize(6.5)
                                    .text(f.lpad('[ ]Interno [ ]Externo', 21, padstr), { continued: true })
                                    .fontSize(7.5)
                                    .text(
                                        f.lpad('Máquina', 27, padstr) +
                                        f.lpad('Inicial', 25, padstr) +
                                        f.lpad('Final', 12, padstr) +
                                        f.lpad('Reprovado', 24, padstr) +
                                        f.lpad('Reprovado', 14, padstr)
                                    )
                                    .moveDown(md);

                                doc
                                    .font('Courier-Bold')
                                    .text(
                                        f.lpad('Operador', 106, padstr) +
                                        f.lpad('C/Q', 11, padstr)
                                    )
                                    .moveDown(md);

                                let str = '';
                                if (approducaotempos.length > 0) {
                                    let hora = application.formatters.fe.datetime(approducaotempos[0].dataini);
                                    hora = hora.split(' ')[1].split(':');
                                    let horaint = parseInt((hora[0] * 60)) + parseInt(hora[1]);
                                    if (horaint >= 415 && horaint <= 915) {
                                        str = '[x]A [ ]B [ ]C';
                                    } else if (horaint >= 916 && horaint <= 1400) {
                                        str = '[ ]A [x]B [ ]C';
                                    } else {
                                        str = '[ ]A [ ]B [x]C';
                                    }
                                } else {
                                    str = '[ ]A [ ]B [ ]C';
                                }

                                // doc
                                //     .font('Courier-Bold')
                                //     .text(
                                //     f.lpad('Extrusão:', 14, padstr) +
                                //     f.lpad('[ ]A [ ]B [ ]C', 21, padstr) +
                                //     f.lpad('[ ] A [ ] R', 72, padstr) +
                                //     f.lpad('[ ] A [ ] R', 14, padstr)
                                //     )
                                //     .moveDown(md);

                                let operador = volume['users.fullname'].split(' ');

                                doc
                                    .font('Courier-Bold')
                                    .text(
                                        f.lpad('Extrusão:', 14, padstr) +
                                        f.lpad(etapa && [10].indexOf(etapa.codigo) >= 0 ? str : '[ ]A [ ]B [ ]C', 21, padstr) +
                                        f.lpad(etapa && [10].indexOf(etapa.codigo) >= 0 && oprecurso_recurso ? oprecurso_recurso.codigo : '', 8, padstr) +
                                        f.lpad(etapa && [10].indexOf(etapa.codigo) >= 0 ? '     ' + (operador.length >= 3 ? operador[2] : '') : '', 16, padstr) +
                                        f.lpad(etapa && [10].indexOf(etapa.codigo) >= 0 && approducaotempos.length > 0 ? moment(approducaotempos[0].dataini, 'YYYY-MM-DD HH:mm').format('HH:mm') : '', 10, padstr) +
                                        f.lpad(etapa && [10].indexOf(etapa.codigo) >= 0 && approducaotempos.length > 0 ? moment(approducaotempos[approducaotempos.length - 1].datafim, 'YYYY-MM-DD HH:mm').format('HH:mm') : '', 13, padstr) +
                                        f.lpad(etapa && [10].indexOf(etapa.codigo) >= 0 && approducaotempos.length > 0 ? moment(approducaotempos[approducaotempos.length - 1].datafim, 'YYYY-MM-DD HH:mm').format('DD/MM/YY') : '', 13, padstr) +
                                        f.lpad('[ ] A [ ] R', 12, padstr) +
                                        f.lpad('[ ] A [ ] R', 14, padstr)
                                    )
                                    .moveDown(md);

                                doc
                                    .font('Courier-Bold')
                                    .text(
                                        f.lpad('Impressão:', 14, padstr) +
                                        f.lpad(etapa && [20].indexOf(etapa.codigo) >= 0 ? str : '[ ]A [ ]B [ ]C', 21, padstr) +
                                        f.lpad(etapa && [20].indexOf(etapa.codigo) >= 0 && oprecurso_recurso ? oprecurso_recurso.codigo : '', 8, padstr) +
                                        f.lpad(etapa && [20].indexOf(etapa.codigo) >= 0 ? '     ' + (operador.length >= 3 ? operador[2] : '') : '', 16, padstr) +
                                        f.lpad(etapa && [20].indexOf(etapa.codigo) >= 0 && approducaotempos.length > 0 ? moment(approducaotempos[0].dataini, 'YYYY-MM-DD HH:mm').format('HH:mm') : '', 10, padstr) +
                                        f.lpad(etapa && [20].indexOf(etapa.codigo) >= 0 && approducaotempos.length > 0 ? moment(approducaotempos[approducaotempos.length - 1].datafim, 'YYYY-MM-DD HH:mm').format('HH:mm') : '', 13, padstr) +
                                        f.lpad(etapa && [20].indexOf(etapa.codigo) >= 0 && approducaotempos.length > 0 ? moment(approducaotempos[approducaotempos.length - 1].datafim, 'YYYY-MM-DD HH:mm').format('DD/MM/YY') : '', 13, padstr) +
                                        f.lpad('[ ] A [ ] R', 12, padstr) +
                                        f.lpad('[ ] A [ ] R', 14, padstr)
                                    )
                                    .moveDown(md);

                                doc
                                    .font('Courier-Bold')
                                    .text(
                                        f.lpad('Laminação:', 14, padstr) +
                                        f.lpad(etapa && [30].indexOf(etapa.codigo) >= 0 ? str : '[ ]A [ ]B [ ]C', 21, padstr) +
                                        f.lpad(etapa && [30].indexOf(etapa.codigo) >= 0 && oprecurso_recurso ? oprecurso_recurso.codigo : '', 8, padstr) +
                                        f.lpad(etapa && [30].indexOf(etapa.codigo) >= 0 ? '     ' + (operador.length >= 3 ? operador[2] : '') : '', 16, padstr) +
                                        f.lpad(etapa && [30].indexOf(etapa.codigo) >= 0 && approducaotempos.length > 0 ? moment(approducaotempos[0].dataini, 'YYYY-MM-DD HH:mm').format('HH:mm') : '', 10, padstr) +
                                        f.lpad(etapa && [30].indexOf(etapa.codigo) >= 0 && approducaotempos.length > 0 ? moment(approducaotempos[approducaotempos.length - 1].datafim, 'YYYY-MM-DD HH:mm').format('HH:mm') : '', 13, padstr) +
                                        f.lpad(etapa && [30].indexOf(etapa.codigo) >= 0 && approducaotempos.length > 0 ? moment(approducaotempos[approducaotempos.length - 1].datafim, 'YYYY-MM-DD HH:mm').format('DD/MM/YY') : '', 13, padstr) +
                                        f.lpad('[ ] A [ ] R', 12, padstr) +
                                        f.lpad('[ ] A [ ] R', 14, padstr)
                                    )
                                    .moveDown(md);

                                doc
                                    .font('Courier-Bold')
                                    .text(
                                        f.lpad('2ª Laminação:', 14, padstr) +
                                        f.lpad(etapa && [35].indexOf(etapa.codigo) >= 0 ? str : '[ ]A [ ]B [ ]C', 21, padstr) +
                                        f.lpad(etapa && [35].indexOf(etapa.codigo) >= 0 && oprecurso_recurso ? oprecurso_recurso.codigo : '', 8, padstr) +
                                        f.lpad(etapa && [35].indexOf(etapa.codigo) >= 0 ? '     ' + (operador.length >= 3 ? operador[2] : '') : '', 16, padstr) +
                                        f.lpad(etapa && [35].indexOf(etapa.codigo) >= 0 && approducaotempos.length > 0 ? moment(approducaotempos[0].dataini, 'YYYY-MM-DD HH:mm').format('HH:mm') : '', 10, padstr) +
                                        f.lpad(etapa && [35].indexOf(etapa.codigo) >= 0 && approducaotempos.length > 0 ? moment(approducaotempos[approducaotempos.length - 1].datafim, 'YYYY-MM-DD HH:mm').format('HH:mm') : '', 13, padstr) +
                                        f.lpad(etapa && [35].indexOf(etapa.codigo) >= 0 && approducaotempos.length > 0 ? moment(approducaotempos[approducaotempos.length - 1].datafim, 'YYYY-MM-DD HH:mm').format('DD/MM/YY') : '', 13, padstr) +
                                        f.lpad('[ ] A [ ] R', 12, padstr) +
                                        f.lpad('[ ] A [ ] R', 14, padstr)
                                    )
                                    .moveDown(md);

                                doc
                                    .moveTo(117, 169)
                                    .lineTo(117, 260)
                                    .stroke()
                                    .moveTo(195, 169)
                                    .lineTo(195, 260)
                                    .stroke()
                                    .moveTo(240, 130)
                                    .lineTo(240, 260)
                                    .stroke()
                                    .moveTo(303, 169)
                                    .lineTo(303, 260)
                                    .stroke()
                                    .moveTo(358, 169)
                                    .lineTo(358, 260)
                                    .stroke()
                                    .moveTo(415, 169)
                                    .lineTo(415, 260)
                                    .stroke()
                                    .moveTo(460, 130)
                                    .lineTo(460, 260)
                                    .stroke()
                                    .moveTo(523, 169)
                                    .lineTo(523, 260)
                                    .stroke()
                                    ;

                                doc
                                    .font('Courier-Bold')
                                    .text(
                                        'Visto do Encarregado:' +
                                        f.lpad('Visto do C/Q:', 66, padstr)
                                    )
                                    .moveDown(md);

                                doc
                                    .font('Courier-Bold')
                                    .text('Observações:')
                                    .moveDown(md).text(sequenciaProducao && sequenciaProducao.length > 0 && sequenciaProducao[0]['seq'] > 0 ? (approducao ? `GRUPO ${approducao.id}  / ` : '') + ` SEQUENCIAL DO VOLUME: ${sequenciaProducao[0]['seq']}` : ' ')
                                    .moveDown(md);

                                doc
                                    .font('Courier-Bold')
                                    .text(
                                        'Fornecedor:' +
                                        f.rpad(nfentrada ? nfentrada.razaosocial : '', 35, padstr) +
                                        '  Código do Produto: ' +
                                        f.rpad(versao.descricaocompleta, 55, padstr)
                                    )
                                    .moveDown(md);

                                doc
                                    .font('Courier-Bold')
                                    .text('Motivo da Reprovação:')
                                    .moveDown(md).text(' ')
                                    .moveDown(md);

                                // Lines
                                doc.y = 78;

                                let nolines = [7, 8, 15];
                                for (let z = 0; z < 20; z++) {
                                    doc.y = doc.y + 13;
                                    if (nolines.indexOf(z) < 0) {
                                        doc
                                            .moveTo(25, doc.y)
                                            .lineTo(589, doc.y)
                                            .stroke();
                                    }
                                }

                                doc
                                    .font('Courier-Bold')
                                    .text('Observações do Volume:', 30, 342);

                                str = [];
                                if (approducaotempos.length > 0) {
                                    let paradas = await db.sequelize.query(`
                                    (select	
                                        app.dataini
                                        , app.emenda
                                        , mp.descricaocompleta
                                        , app.observacao
                                    from
                                        pcp_apparada app
                                    left join pcp_motivoparada mp on (app.idmotivoparada = mp.id)
                                    where
                                        app.idoprecurso = :idoprecurso
                                        and app.dataini >= :dataini
                                        and app.datafim <= :datafim
                                    
                                    union all
                                    
                                    select
                                        datahora
                                        , false
                                        , motivo
                                        , ''
                                    from
                                        pcp_apmarcacaovolume
                                    where
                                        idoprecurso = :idoprecurso
                                        and datahora >= :dataini
                                        and datahora <= :datafim )
                                        
                                    order by dataini desc`,
                                        {
                                            type: db.Sequelize.QueryTypes.SELECT
                                            , replacements: {
                                                idoprecurso: approducao.idoprecurso
                                                , dataini: approducaotempos[0].dataini
                                                , datafim: approducaotempos[approducaotempos.length - 1].datafim
                                            }
                                        });

                                    for (let z = 0; z < paradas.length; z++) {
                                        str.push('(' + (z + 1) + ') ' + (paradas[z].emenda ? 'EMENDA ' : '') + paradas[z].descricaocompleta + (paradas[z].observacao ? ' (' + paradas[z].observacao + ') ' : ''));
                                    }
                                }

                                doc
                                    .font('Courier')
                                    .text(f.rpad(str.join(', ') + (' ' + (volume.observacao || '')), 700), 131, 342, { width: 450, height: 70, underline: true });

                                doc
                                    .font('Courier-Bold')
                                    .text('ATENÇÃO: O ESTORNO DEVERÁ RETORNAR AO DEPÓSITO COM ESTA ETIQUETA', 227, 398);

                                svgtopdfkit(
                                    doc
                                    , barcode('-10-' + f.lpad(volume.id, 9, '0'), 'code39', { width: 380, barHeight: 40, toFile: false })
                                    , 230, 405
                                );
                                doc
                                    .font('Courier')
                                    .text('-10-' + f.lpad(volume.id, 9, '0'), 345, 438);

                                doc
                                    .font('Courier-Bold')
                                    .text('Data Inc.:', 530, 410, { width: 50 })
                                    .font('Courier')
                                    .text(application.formatters.fe.date(volume.datahora), 530, 420, { width: 50 });

                                doc
                                    .font('Courier-Bold')
                                    .fontSize(9)
                                    .text('1', 76, 355)
                                    .text('2', 76, 363)
                                    .text('3', 76, 371)
                                    .text('4', 76, 379)
                                    .text('5', 76, 387)
                                    ;
                                doc.circle(78, 398, 45)
                                    .stroke()
                                    .circle(78, 398, 5)
                                    .stroke();
                            }

                            // Part 2

                            doc.moveTo(25, 460)
                                .lineTo(589, 460) //top
                                .lineTo(589, 623) //right
                                .lineTo(25, 623) //bottom
                                .lineTo(25, 460) //left
                                .stroke()
                                ;

                            // Title
                            if (fs.existsSync(`files/${process.env.NODE_APPNAME}/${image.id}.${image.type}`)) {
                                doc.image(`files/${process.env.NODE_APPNAME}/${image.id}.${image.type}`, 35, 467, { width: 50 });
                            }

                            doc.moveTo(25, 510)
                                .lineTo(589, 510) // Cabeçalho
                                .stroke();

                            doc
                                .font('Courier-Bold')
                                .fontSize(11)
                                .text('IDENTIFICAÇÃO E STATUS DO VOLUME Nº ' + volume.id, 165, 480);

                            width1 = 15;
                            width1val = 107;

                            doc
                                .fontSize(7.5)
                                .font('Courier-Bold').text(f.lpad('Fornecedor: ', width1, padstr), 30, 515, { continued: true })
                                .font('Courier').text(f.rpad(nfentrada ? nfentrada.razaosocial : '', width1val, padstr))
                                .moveDown(md);

                            doc
                                .font('Courier-Bold').text(f.lpad('Produto: ', width1, padstr), { continued: true })
                                .font('Courier').text(f.rpad(versao ? versao.descricaocompleta : '', width1val, padstr))
                                .moveDown(md);

                            doc
                                .font('Courier-Bold').text(f.lpad('Observação: ', width1, padstr), { continued: true })
                                .font('Courier').text(f.rpad(application.functions.singleSpace(volume.observacao || ''), width1val, padstr))
                                .moveDown(md);

                            width1 = 15;
                            width1val = 15;
                            width2 = 25;
                            width2val = 15;
                            width3 = 25;
                            width3val = 25;

                            doc
                                .font('Courier-Bold').text(f.lpad('Nota Fiscal: ', width1, padstr), { continued: true })
                                .font('Courier').text(f.rpad(nfentrada ? nfentrada.documento : '', width1val, padstr), { continued: true })
                                .font('Courier-Bold').text(f.lpad('Data Emi.: ', width1, padstr), { continued: true })
                                .font('Courier').text(f.rpad(nfentrada ? application.formatters.fe.date(nfentrada.dataemissao) : '', width1val, padstr), { continued: true })
                                .font('Courier-Bold').text(f.lpad('Data Inc.: ', width1, padstr), { continued: true })
                                .font('Courier').text(f.rpad(application.formatters.fe.date(volume.datahora), width1val, padstr), { continued: true })
                                .font('Courier-Bold').text(f.lpad('Data Validade: ', width1, padstr), { continued: true })
                                .font('Courier').text(f.rpad(application.formatters.fe.date(volume.datavalidade), width1val, padstr))
                                .moveDown(md);

                            doc
                                .font('Courier-Bold').text(f.lpad('Qtde: ', width1, padstr), { continued: true })
                                .font('Courier').text(f.rpad(application.formatters.fe.decimal(volume.qtdreal, 4), width1val, padstr), { continued: true })
                                .font('Courier-Bold').text(f.lpad('OC: ', width1, padstr), { continued: true })
                                .font('Courier').text(f.rpad(nfentradaitem ? nfentradaitem.oc : '', width1val, padstr), { continued: true })
                                .font('Courier-Bold').text(f.lpad('Vol.: ', width1, padstr), { continued: true })
                                .font('Courier').text(f.rpad(volume.id, width1val, padstr), { continued: true })
                                .font('Courier-Bold').text(f.lpad('Lote: ', width1, padstr), { continued: true })
                                .font('Courier').text(f.rpad(volume.lote, width1val, padstr))
                                .moveDown(md);

                            doc.moveTo(25, 578)
                                .lineTo(589, 578)
                                .stroke();

                            svgtopdfkit(
                                doc
                                , barcode('-10-' + f.lpad(volume.id, 9, '0'), 'code39', { width: 380, barHeight: 40, toFile: false })
                                , 170, 582
                            );
                            doc
                                .font('Courier')
                                .text('-10-' + f.lpad(volume.id, 9, '0'), 285, 615);

                            doc
                                .font('Courier')
                                .fontSize(120)
                                .text(volume.id, 25, 630);
                        }

                        doc.end();
                        stream.on('finish', function () {
                            return application.success(obj.res, {
                                openurl: '/download/' + filename
                            });
                        });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }

                , gerarVolumes: async function (obj) {
                    if (obj.req.method == 'GET') {
                        if (obj.ids.length == 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }
                        if (obj.ids.length > 1) {
                            return application.error(obj.res, { msg: 'Selecione apenas 1 item para gerar volumes' });
                        }

                        let body = '';
                        body += application.components.html.hidden({ name: 'ids', value: obj.ids.join(',') });
                        body += application.components.html.integer({
                            width: 4
                            , label: 'Volumes a serem Gerados*'
                            , name: 'qtd'
                        });
                        body += application.components.html.decimal({
                            width: 4
                            , label: 'Quantidade por Volume'
                            , name: 'qtdvolume'
                            , precision: 4
                        });
                        body += application.components.html.date({
                            width: 4
                            , label: 'Data de Validade'
                            , name: 'datavalidade'
                        });
                        body += application.components.html.text({
                            width: 12
                            , label: 'Lote*'
                            , name: 'lote'
                        });

                        return application.success(obj.res, {
                            modal: {
                                form: true
                                , action: '/event/' + obj.event.id
                                , id: 'modalevt'
                                , title: 'Gerar Volume'
                                , body: body
                                , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Gerar</button>'
                            }
                        });
                    } else {

                        let invalidfields = application.functions.getEmptyFields(obj.req.body, ['ids', 'qtd', 'lote']);
                        if (invalidfields.length > 0) {
                            return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                        }

                        try {

                            let bulkvolume = [];
                            let nfitem = await db.getModel('est_nfentradaitem').findOne({
                                where: {
                                    id: obj.req.body.ids
                                }
                            });
                            let nf = await db.getModel('est_nfentrada').findOne({
                                where: {
                                    id: nfitem.idnfentrada
                                }
                            });

                            if (nf.finalizado) {
                                return application.error(obj.res, { msg: 'Não é possível gerar volumes de uma nota finalizada' });
                            }

                            let qtdvolume = 0;
                            if (obj.req.body.qtdvolume) {
                                qtdvolume = application.formatters.be.decimal(obj.req.body.qtdvolume, 4);
                            } else {
                                qtdvolume = (nfitem.qtd / obj.req.body.qtd).toFixed(4);
                            }

                            for (let i = 0; i < obj.req.body.qtd; i++) {
                                let volume = await db.getModel('est_volume').create({
                                    idversao: nfitem.idversao
                                    , iddeposito: nf.iddeposito
                                    , iduser: obj.req.user.id
                                    , datahora: moment()
                                    , qtd: qtdvolume
                                    , qtdreal: qtdvolume
                                    , consumido: false
                                    , idnfentradaitem: nfitem.id
                                    , lote: obj.req.body.lote
                                    , datavalidade: obj.req.body.datavalidade ? application.formatters.be.date(obj.req.body.datavalidade) : null
                                });

                                let results = await db.sequelize.query(`
                                    select
                                        *
                                        , round(qtd / (largura::decimal / 10) / ((case when tipoitem = 13 then espessura::decimal * 100 else espessura::decimal end) / 10) / (densidade / 10), 2) as metragem
                                    from
                                        (select
                                            ev.id
                                            , ev.qtd
                                            , (select f.valor from pcp_ficha f left join pcp_atribficha af on (f.idatributo = af.id) where f.valor is not null and f.idversao = v.id and af.codigo in (15028, 176, 150028, 150038, 22)) as espessura
                                            , (select f.valor from pcp_ficha f left join pcp_atribficha af on (f.idatributo = af.id) where f.valor is not null and f.idversao = v.id and af.codigo in (15046, 175, 150029, 150039, 20)) as largura
                                            , c.densidade
                                            , tpi.codigo as tipoitem
                                        from
                                            est_volume ev
                                        left join pcp_versao v on (ev.idversao = v.id)
                                        left join cad_item i on (v.iditem = i.id)
                                        left join est_tpitem tpi on (i.idtpitem = tpi.id)
                                        left join est_classe c on (i.idclasse = c.id)
                                        left join cad_unidade u on (i.idunidade = u.id)
                                        where
                                            ev.id = :v1
                                        ) as x
                                    `
                                    , {
                                        type: db.sequelize.QueryTypes.SELECT
                                        , replacements: { v1: volume.id }
                                    });

                                if (results.length > 0) {
                                    volume.metragem = results[0].metragem;
                                    volume.save({ iduser: obj.req.user.id });
                                }
                            }

                            nfitem.qtdvolumes = await db.getModel('est_volume').count({ where: { idnfentradaitem: nfitem.id } });
                            await nfitem.save({ iduser: obj.req.user.id });

                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });

                        } catch (err) {
                            return application.fatal(obj.res, err);
                        }

                    }
                }

                , _removerVolume: async function (obj) {
                    try {

                        if (obj.ids.length == 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }

                        let volumes = await db.getModel('est_volume').findAll({
                            where: {
                                id: { [db.Op.in]: obj.ids }
                            }
                        });

                        let nfitem = await db.getModel('est_nfentradaitem').findOne({
                            where: {
                                id: volumes[0].idnfentradaitem
                            }
                        });

                        let nf = await db.getModel('est_nfentrada').findOne({
                            where: {
                                id: nfitem.idnfentrada
                            }
                        });

                        if (nf.finalizado) {
                            return application.error(obj.res, { msg: 'Não é possível remover volumes de uma nota finalizada' });
                        }

                        nfitem.qtdvolumes = nfitem.qtdvolumes - obj.ids.length;

                        await db.getModel('est_volume').destroy({
                            where: {
                                id: { [db.Op.in]: obj.ids }
                            }
                        });
                        await nfitem.save({ iduser: obj.req.user.id });

                        //unbound files
                        let filestounbound = [];
                        for (let i = 0; i < volumes.length; i++) {
                            if (volumes[i].fotos) {
                                let j = JSON.parse(volumes[i].fotos);
                                for (let z = 0; z < j.length; z++) {
                                    filestounbound.push(j[z].id);
                                }
                            }
                        }
                        if (filestounbound.length > 0) {
                            await db.getModel('file').update({
                                bounded: false
                            }, {
                                    where: {
                                        id: { [db.Op.in]: filestounbound }
                                    }
                                });
                        }

                        return application.success(obj.res, { msg: application.message.success, reloadtables: true });

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }


                }
                , onsave: async function (obj, next) {
                    try {

                        if (obj.view.id == 66) { // Geração de Volume - Item - Volume
                            let volume = await db.getModel('est_volume').findOne({ where: { id: obj.id } });
                            let nfitem = await db.getModel('est_nfentradaitem').findOne({ where: { id: volume.idnfentradaitem } });
                            let nf = await db.getModel('est_nfentrada').findOne({ where: { id: nfitem.idnfentrada } });
                            if (nf.finalizado) {
                                return application.error(obj.res, { msg: 'Não é possível alterar volumes de uma nota finalizada' });
                            }
                            obj.register.qtdreal = obj.register.qtd;
                        }

                        let saved = await next(obj);
                        if (saved.success) {
                            if (obj.view.id == 66) { // Geração de Volume - Item - Volume
                                let results = await db.sequelize.query(`
                                    select
                                        *
                                        , round(qtd / (largura::decimal / 10) / ((case when tipoitem = 13 then espessura::decimal * 100 else espessura::decimal end) / 10) / (densidade / 10), 2) as metragem
                                    from
                                        (select
                                            ev.id
                                            , ev.qtd
                                            , (select f.valor from pcp_ficha f left join pcp_atribficha af on (f.idatributo = af.id) where f.valor is not null and f.idversao = v.id and af.codigo in (15028, 176, 150028, 150038, 22)) as espessura
                                            , (select f.valor from pcp_ficha f left join pcp_atribficha af on (f.idatributo = af.id) where f.valor is not null and f.idversao = v.id and af.codigo in (15046, 175, 150029, 150039, 20)) as largura
                                            , c.densidade
                                            , tpi.codigo as tipoitem
                                        from
                                            est_volume ev
                                        left join pcp_versao v on (ev.idversao = v.id)
                                        left join cad_item i on (v.iditem = i.id)
                                        left join est_tpitem tpi on (i.idtpitem = tpi.id)
                                        left join est_classe c on (i.idclasse = c.id)
                                        left join cad_unidade u on (i.idunidade = u.id)
                                        where
                                            ev.id = :v1
                                        ) as x
                                    `
                                    , {
                                        type: db.sequelize.QueryTypes.SELECT
                                        , replacements: { v1: saved.register.id }
                                    });

                                if (results.length > 0) {
                                    saved.register.metragem = results[0].metragem;
                                    saved.register.save({ iduser: obj.req.user.id });
                                }
                            }
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_movimentar: async function (obj) {
                    let t;
                    try {
                        if (obj.req.method == 'GET') {
                            if (obj.ids.length <= 0) {
                                return application.error(obj.res, { msg: application.message.selectOneEvent });
                            }

                            let volumes = await db.getModel('est_volume').findAll({ where: { id: { [db.Op.in]: obj.ids } } });
                            for (let i = 0; i < volumes.length; i++) {
                                if (volumes[i].consumido) {
                                    return application.error(obj.res, { msg: 'Não é possível movimentar volumes consumidos' });
                                }
                            }

                            let body = '';
                            body += application.components.html.hidden({ name: 'ids', value: obj.ids.join(',') });
                            body += application.components.html.autocomplete({
                                width: 12
                                , label: 'Depósito'
                                , name: 'iddeposito'
                                , model: 'est_deposito'
                                , attribute: 'descricao'
                            });
                            body += application.components.html.checkbox({
                                width: 12
                                , name: 'consumido'
                                , checked: ''
                                , label: 'Consumido?'
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt'
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Movimentar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['ids', 'iddeposito']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }
                            t = await db.sequelize.transaction();
                            let consumido = 'consumido' in obj.req.body;
                            let changes = { iddeposito: obj.req.body.iddeposito, consumido: consumido, iddepositoendereco: null };
                            if (consumido) {
                                changes = lodash.extend(changes, { qtdreal: '0.0000' });
                            }
                            let depdestino = await db.getModel('est_deposito').findOne({ where: { id: obj.req.body.iddeposito } });
                            let volumes = await db.getModel('est_volume').findAll({ include: [{ all: true }], where: { id: { [db.Op.in]: obj.req.body.ids.split(',') } } });
                            await db.getModel('est_volume').update(changes, { transaction: t, where: { id: { [db.Op.in]: obj.req.body.ids.split(',') } } });
                            let config = await db.getModel('config').findOne();
                            let empresa = config.cnpj == "90816133000123" ? 2 : 1;
                            for (let i = 0; i < volumes.length; i++) {
                                let item = await db.getModel('cad_item').findOne({ include: [{ all: true }], where: { id: volumes[i].pcp_versao.iditem } });
                                if (item.est_grupo.codigo == 504 && item.est_tpitem.codigo == 5) {
                                    await db.getModel('est_integracaotrf').create({
                                        query: `call p_transfere_estoque(${empresa}, '${item.codigo}', '${volumes[i].pcp_versao.codigo}', ${volumes[i].qtdreal}, '${moment().format(application.formatters.fe.date_format)}', ${volumes[i].est_deposito.codigo}, ${depdestino.codigo}, '9999', 'TRF'||'${empresa}'||'#'||'${moment().format(application.formatters.fe.datetime_format)}:00'||'#'||'${item.codigo}'||'#'||'${volumes[i].pcp_versao.codigo}', ${volumes[i].id}, null, 'S', 7, 'N', null, null, 2, ${empresa})`
                                        , integrado: 'N'
                                    }, { iduser: obj.req.user.id, transaction: t });
                                }
                            }
                            await t.commit();
                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }
                    } catch (err) {
                        t.rollback();
                        return application.fatal(obj.res, err);
                    }
                }
                , e_estornar: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {
                            if (obj.ids.length != 1) {
                                return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                            }

                            let volume = await db.getModel('est_volume').findOne({ where: { id: { [db.Op.in]: obj.ids } } });
                            if (!volume.consumido) {
                                return application.error(obj.res, { msg: 'Não é possível estornar um volume que não foi consumido' });
                            }
                            let apinsumo = await db.getModel('pcp_apinsumo').findOne({ where: { idvolume: volume.id } });
                            if (apinsumo) {
                                return application.error(obj.res, { msg: 'Não é possível estornar um volume que foi consumido por um apontamento' });
                            }

                            let body = '';
                            body += application.components.html.hidden({ name: 'id', value: obj.ids[0] });
                            body += application.components.html.decimal({
                                width: 12
                                , label: 'Quantidade'
                                , name: 'qtd'
                                , precision: '4'
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt'
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Estornar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['id', 'qtd']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }

                            let volume = await db.getModel('est_volume').findOne({ where: { id: obj.req.body.id } });
                            volume.consumido = false;
                            volume.qtdreal = application.formatters.be.decimal(obj.req.body.qtd, 4);

                            if (parseFloat(volume.qtdreal) > parseFloat(volume.qtd)) {
                                return application.error(obj.res, { msg: 'O peso do estorno é maior que o peso original do volume' });
                            }
                            await volume.save({ iduser: obj.req.user.id });

                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_alterarEndereco: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {
                            if (obj.ids.length <= 0) {
                                return application.error(obj.res, { msg: application.message.selectOneEvent });
                            }

                            let body = '';
                            body += application.components.html.hidden({ name: 'ids', value: obj.ids.join(',') });
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'Endereço'
                                , name: 'iddepositoendereco'
                                , model: 'est_depositoendereco'
                                , attribute: 'descricaocompleta'
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt'
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Alterar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['ids', 'iddepositoendereco']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }
                            await db.getModel('est_volume').update({ iddepositoendereco: obj.req.body.iddepositoendereco }, { where: { id: { [db.Op.in]: obj.req.body.ids.split(',') } } });
                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_reservar: async function (obj) {
                    try {
                        if (obj.req.method == 'GET') {
                            if (obj.ids.length <= 0) {
                                return application.error(obj.res, { msg: application.message.selectOneEvent });
                            }
                            let body = '';
                            body += application.components.html.hidden({ name: 'ids', value: obj.ids.join(',') });
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'OP'
                                , name: 'idopetapa'
                                , model: 'pcp_opetapa'
                                , query: "(select op.codigo from pcp_op op where op.id = pcp_opetapa.idop) || '/'  || (select e.codigo from pcp_etapa e where e.id = pcp_opetapa.idetapa)"
                            });
                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt'
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Reservar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['ids', 'idopetapa']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }
                            bulkreservas = [];
                            let volumes = await db.getModel('est_volume').findAll({ where: { id: { [db.Op.in]: obj.req.body.ids.split(',') } } });
                            for (let i = 0; i < volumes.length; i++) {
                                let reservas = await db.getModel('est_volumereserva').findAll({ where: { idvolume: volumes[i].id } });
                                let opetapa = await db.getModel('pcp_opetapa').findOne({ where: { id: obj.req.body.idopetapa } });
                                let op = await db.getModel('pcp_op').findOne({ where: { id: opetapa.idop } });
                                let pcp_opep = await db.getModel('pcp_opep').findOne({ where: { idop: op.id } });
                                let ven_pedidoitem = await db.getModel('ven_pedidoitem').findOne({ where: { idpedido: pcp_opep ? pcp_opep.idpedido : 0, idversao: op.idversao } });
                                if (!ven_pedidoitem) {
                                    return application.error(obj.res, { msg: 'Não foi encontrado nenhum vínculo de pedido/item com a OP informada' });
                                }
                                switch (reservas.length) {
                                    case 0:
                                        bulkreservas.push({
                                            idvolume: volumes[i].id
                                            , idpedidoitem: ven_pedidoitem.id
                                            , qtd: volumes[i].qtdreal
                                            , idopetapa: obj.req.body.idopetapa
                                            , apontado: false
                                        });
                                        break;
                                    case 1:
                                        if (reservas[0].idpedidoitem = ven_pedidoitem.id) {
                                            reservas[0].idopetapa = opetapa.id;
                                            await reservas[0].save({ iduser: obj.req.user.id });
                                        } else {
                                            return application.error(obj.res, { msg: 'A reserva do volume ' + volumes[i].id + ' não pertence a OP informada' });
                                        }
                                        break;
                                    default:
                                        return application.error(obj.res, { msg: 'O volume ' + volumes[i].id + ' possui mais de uma reserva' });
                                }
                            }
                            if (bulkreservas.length > 0) {
                                await db.getModel('est_volumereserva').bulkCreate(bulkreservas);
                            }
                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_requisitar: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {
                            if (obj.ids.length <= 0) {
                                return application.error(obj.res, { msg: application.message.selectOneEvent });
                            }

                            let volumes = await db.getModel('est_volume').findAll({
                                include: [{ all: true }]
                                , where: {
                                    id: { [db.Op.in]: obj.ids }
                                }
                            });

                            for (let i = 0; i < volumes.length; i++) {
                                let caditem = await db.getModel('cad_item').findOne({ include: [{ all: true }], where: { id: volumes[i].pcp_versao.iditem } });
                                if (volumes[i].consumido) {
                                    return application.error(obj.res, { msg: `O volume ID ${volumes[i].id} está consumido` });
                                }
                                let requisicao = await db.getModel('est_requisicaovolume').findOne({ where: { idvolume: volumes[i].id, datahoraatendido: null } });
                                if (requisicao) {
                                    return application.error(obj.res, { msg: `O volume ID ${volumes[i].id} já possui uma requisição em aberto` });
                                }
                                if ([1, 2, 504, 543].indexOf(caditem.est_grupo.codigo) >= 0) {
                                    let reservas = await db.getModel('est_volumereserva').findAll({ where: { idvolume: volumes[i].id } });
                                    if (reservas.length <= 0) {
                                        return application.error(obj.res, { msg: `O volume ID ${volumes[i].id} não possui reservas` });
                                    }
                                    for (let z = 0; z < reservas.length; z++) {
                                        if (!reservas[z].idopetapa) {
                                            return application.error(obj.res, { msg: `O volume ID ${volumes[i].id} possui uma reserva sem OP` });
                                        }
                                    }
                                }
                                if (['Almoxarifado', 'Copapa', 'Devolucao', 'Produtos de Transferência'].indexOf(volumes[i].est_deposito.descricao) == -1) {
                                    return application.error(obj.res, { msg: `O volume ID ${volumes[i].id} está em um depósito não permitido para requisição` });
                                }
                                if (volumes[i].iddepositoendereco && volumes[i].est_depositoendereco.retido) {
                                    return application.error(obj.res, { msg: `O volume ID ${volumes[i].id} está retido` });
                                }
                            }

                            let body = '';
                            body += application.components.html.hidden({ name: 'ids', value: obj.ids.join(',') });
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'Depósito*'
                                , name: 'iddeposito'
                                , model: 'est_deposito'
                                , attribute: 'descricao'
                            });
                            body += application.components.html.datetime({
                                width: '12'
                                , label: 'Data/Hora para Entregar*'
                                , name: 'datahora'
                            });
                            body += application.components.html.textarea({
                                width: '12'
                                , label: 'Observações'
                                , name: 'observacao'
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt'
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Requisitar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['ids', 'iddeposito', 'datahora']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }

                            let ids = obj.req.body.ids.split(',');
                            for (let i = 0; i < ids.length; i++) {
                                await db.getModel('est_requisicaovolume').create({
                                    iduser: obj.req.user.id
                                    , datahora: application.formatters.be.datetime(obj.req.body.datahora)
                                    , iddeposito: obj.req.body.iddeposito
                                    , idvolume: ids[i]
                                    , observacao: obj.req.body.observacao || null
                                }, { iduser: obj.req.user.id });
                            }

                            let param = await main.platform.parameter.f_get('est_requisicao_notificacao');
                            if (param) {
                                main.platform.notification.create(param, {
                                    title: 'Requisição Solicitada'
                                    , description: `${ids.length} solicitações`
                                });
                            }

                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , r_balanco: async function (obj) {
                    try {

                        let f = {
                            getAtual: async (obj) => {

                                let dep = await db.getModel('est_deposito').findOne({ where: { id: obj.req.body.iddeposito } });
                                let deps = `(${dep.codigo})`
                                if ([7, 8, 9, 10].indexOf(dep.codigo) >= 0) {
                                    deps = '(7,8,9,10)';
                                }

                                let notfound = await db.sequelize.query(`
                                select
                                    v.id
                                    , de.descricao as depositoendereco
                                    , v.qtdreal
                                    , cl.descricao as classe
                                    , ver.descricaocompleta as produto
                                from
                                    est_volume v
                                left join est_deposito d on (v.iddeposito = d.id)
                                left join est_depositoendereco de on (v.iddepositoendereco = de.id)
                                left join pcp_versao ver on (v.idversao = ver.id)
                                left join cad_item i on (ver.iditem = i.id)
                                left join est_classe cl on (i.idclasse = cl.id)
                                where
                                    consumido = false
                                    and d.codigo in ${deps}
                                    and v.id not in (select vb.idvolume from est_volumebalanco vb where v.iddeposito = :v1 and vb.iduser = :v2)
                                `, {
                                        type: db.sequelize.QueryTypes.SELECT
                                        , replacements: {
                                            v1: obj.req.body.iddeposito
                                            , v2: obj.req.user.id
                                        }
                                    });

                                let found = await db.sequelize.query(`
                                select
                                    v.id
                                    , de.descricao as depositoendereco
                                    , v.qtdreal
                                    , cl.descricao as classe
                                    , ver.descricaocompleta as produto
                                from
                                    est_volumebalanco vb
                                left join est_volume v on (vb.idvolume = v.id)
                                left join est_depositoendereco de on (v.iddepositoendereco = de.id)
                                left join pcp_versao ver on (v.idversao = ver.id)                                
                                left join cad_item i on (ver.iditem = i.id)
                                left join est_classe cl on (i.idclasse = cl.id)
                                where
                                    v.consumido = false
                                    and vb.iddeposito = :v1
                                    and vb.iduser = :v2                                    
                                `, {
                                        type: db.sequelize.QueryTypes.SELECT
                                        , replacements: {
                                            v1: obj.req.body.iddeposito
                                            , v2: obj.req.user.id
                                        }
                                    });

                                return application.success(obj.res
                                    , {
                                        data: {
                                            notfound: notfound
                                            , found: found
                                        }
                                    });
                            }
                            , salvar: async (obj) => {
                                if (!obj.req.body.iddeposito) {
                                    return application.error(obj.res, { msg: 'Selecione um depósito' });
                                }
                                if (!obj.req.body.idsfound) {
                                    return application.error(obj.res, { msg: 'Encontre pelo menos um volume' });
                                }
                                await db.getModel('est_volumebalanco').destroy({ where: { iduser: obj.req.user.id, iddeposito: obj.req.body.iddeposito } });
                                let bulk = [];
                                for (let i = 0; i < obj.req.body.idsfound.length; i++) {
                                    bulk.push({
                                        idvolume: obj.req.body.idsfound[i]
                                        , iduser: obj.req.user.id
                                        , iddeposito: obj.req.body.iddeposito
                                    })
                                }
                                await db.getModel('est_volumebalanco').bulkCreate(bulk);
                                return application.success(obj.res, { msg: application.message.success });
                            }
                            , reiniciar: async (obj) => {
                                if (!obj.req.body.iddeposito) {
                                    return application.error(obj.res, { msg: 'Selecione um depósito' });
                                }
                                await db.getModel('est_volumebalanco').destroy({ where: { iduser: obj.req.user.id, iddeposito: obj.req.body.iddeposito } });
                                f.getAtual(obj);
                            }
                            , imprimir: async (obj) => {
                                try {

                                    if (!obj.req.body.iddeposito) {
                                        return application.error(obj.res, { msg: 'Selecione um depósito' });
                                    }

                                    let pdfMakePrinter = require('pdfmake');
                                    let fontDescriptors = {
                                        Roboto: {
                                            normal: __dirname + '/../../fonts/cour.ttf',
                                            bold: __dirname + '/../../fonts/courbd.ttf',
                                            italics: __dirname + '/../../fonts/couri.ttf',
                                            bolditalics: __dirname + '/../../fonts/courbi.ttf'
                                        }
                                    };
                                    let printer = new pdfMakePrinter(fontDescriptors);

                                    let body = [];

                                    let registers = await db.sequelize.query(`
                                    select distinct
                                        v.id
                                        , de.descricao as depositoendereco
                                        , v.qtdreal
                                        , coalesce(ver.descricaocompleta, ' ') as produto
                                    from
                                        est_volume v
                                    left join est_depositoendereco de on (v.iddepositoendereco = de.id)
                                    left join pcp_versao ver on (v.idversao = ver.id)
                                    where
                                        v.id in (:v1)  
                                    order by 1                               
                                    `, {
                                            type: db.sequelize.QueryTypes.SELECT
                                            , replacements: {
                                                v1: obj.req.body.idsfound || 0
                                            }
                                        });

                                    let count = registers.length;
                                    if (registers.length <= 0) {
                                        body.push([]);
                                        body[body.length - 1].push({
                                            text: 'Nenhuma Encontrada'
                                            , fontSize: 7
                                            , alignment: 'center'
                                            , colSpan: 4
                                        });
                                        body[body.length - 1].push({ text: '' });
                                        body[body.length - 1].push({ text: '' });
                                        body[body.length - 1].push({ text: '' });
                                    }

                                    for (let i = 0; i < registers.length; i++) {
                                        body.push([]);
                                        body[body.length - 1].push({
                                            text: registers[i].id
                                            , fontSize: 7
                                            , alignment: 'left'
                                        });
                                        body[body.length - 1].push({
                                            text: registers[i].depositoendereco || ''
                                            , fontSize: 7
                                            , alignment: 'left'
                                        });
                                        body[body.length - 1].push({
                                            text: registers[i].produto
                                            , fontSize: 7
                                            , alignment: 'left'
                                        });
                                        body[body.length - 1].push({
                                            text: application.formatters.fe.decimal(registers[i].qtdreal, 4)
                                            , fontSize: 7
                                            , alignment: 'right'
                                        });
                                    }

                                    let body2 = [];

                                    let dep = await db.getModel('est_deposito').findOne({ where: { id: obj.req.body.iddeposito } });
                                    let deps = `(${dep.codigo})`
                                    if ([7, 8, 9, 10].indexOf(dep.codigo) >= 0) {
                                        deps = '(7,8,9,10)';
                                    }

                                    registers = await db.sequelize.query(`
                                    select distinct
                                        v.id
                                        , de.descricao as depositoendereco
                                        , v.qtdreal
                                        , coalesce(ver.descricaocompleta, '') as produto
                                    from
                                        est_volume v
                                    left join est_deposito d on (v.iddeposito = d.id)
                                    left join est_depositoendereco de on (v.iddepositoendereco = de.id)
                                    left join pcp_versao ver on (v.idversao = ver.id)
                                    where
                                        v.consumido = false
                                        and v.id not in (:v1) 
                                        and d.codigo in ${deps}
                                    order by 1                             
                                    `, {
                                            type: db.sequelize.QueryTypes.SELECT
                                            , replacements: {
                                                v1: obj.req.body.idsfound || 0
                                            }
                                        });

                                    let count2 = registers.length;
                                    if (registers.length <= 0) {
                                        body2.push([]);
                                        body2[body2.length - 1].push({
                                            text: 'Nenhuma Restante'
                                            , fontSize: 7
                                            , alignment: 'center'
                                            , colSpan: 4
                                        });
                                        body2[body2.length - 1].push({ text: '' });
                                        body2[body2.length - 1].push({ text: '' });
                                        body2[body2.length - 1].push({ text: '' });
                                    }

                                    for (let i = 0; i < registers.length; i++) {
                                        body2.push([]);
                                        body2[body2.length - 1].push({
                                            text: registers[i].id
                                            , fontSize: 7
                                            , alignment: 'left'
                                        });
                                        body2[body2.length - 1].push({
                                            text: registers[i].depositoendereco || ''
                                            , fontSize: 7
                                            , alignment: 'left'
                                        });
                                        body2[body2.length - 1].push({
                                            text: registers[i].produto
                                            , fontSize: 7
                                            , alignment: 'left'
                                        });
                                        body2[body2.length - 1].push({
                                            text: application.formatters.fe.decimal(registers[i].qtdreal, 4)
                                            , fontSize: 7
                                            , alignment: 'right'
                                        });
                                    }

                                    let dd = {
                                        footer: function (currentPage, pageCount) {
                                            return { text: 'Página ' + currentPage + '/' + pageCount, alignment: 'center', fontSize: 8, italic: true };
                                        }
                                        , pageOrientation: 'portait'
                                        , content: [
                                            {
                                                table: {
                                                    headerRows: 1
                                                    , widths: ['*']
                                                    , body: [[{
                                                        text: 'Bobinas Encontradas  (' + count + ')'
                                                        , fontSize: 12
                                                        , alignment: 'center'
                                                        , bold: true
                                                        , border: [false, false, false, false]
                                                    }]]
                                                }
                                            }
                                            , {
                                                table: {
                                                    headerRows: 1
                                                    , widths: ['auto', 'auto', '*', 'auto']
                                                    , body: body
                                                }
                                            }
                                            , {
                                                table: {
                                                    headerRows: 1
                                                    , widths: ['*']
                                                    , body: [[{
                                                        text: 'Bobinas Restantes (' + count2 + ')'
                                                        , fontSize: 12
                                                        , alignment: 'center'
                                                        , bold: true
                                                        , border: [false, false, false, false]
                                                    }]]
                                                }
                                            }
                                            , {
                                                table: {
                                                    headerRows: 1
                                                    , widths: ['auto', 'auto', '*', 'auto']
                                                    , body: body2
                                                }
                                            }
                                        ]
                                        , styles: {
                                            table: {
                                                margin: [0, 5, 0, 15]
                                            }
                                        }
                                    };

                                    let doc = printer.createPdfKitDocument(dd);
                                    let filename = process.hrtime()[1] + '.pdf';
                                    let stream = doc.pipe(fs.createWriteStream(`${__dirname}/../../tmp/${process.env.NODE_APPNAME}/${filename}`));
                                    doc.end();
                                    stream.on('finish', function () {
                                        return application.success(obj.res, {
                                            openurl: '/download/' + filename
                                        });
                                    });
                                } catch (error) {
                                    console.error(error);
                                }

                            }
                            , ajustes: async (obj) => {
                                try {
                                    if (!obj.req.body.ajustes || Object.keys(obj.req.body.ajustes).length <= 0) {
                                        return application.error(obj.res, { msg: 'Não possui ajustes a serem aplicados' });
                                    }
                                    for (let k in obj.req.body.ajustes) {
                                        let qtd = application.formatters.be.decimal(obj.req.body.ajustes[k]);
                                        if (qtd < 0) {
                                            return application.error(obj.res, { msg: `Não é possível aplicar um ajuste negativo, ID ${k}` });
                                        }
                                    }
                                    for (let k in obj.req.body.ajustes) {
                                        let qtd = application.formatters.be.decimal(obj.req.body.ajustes[k]);
                                        let volume = await db.getModel('est_volume').findOne({ where: { id: k } });
                                        let dif = qtd - parseFloat(volume.qtdreal);
                                        volume.qtdreal = qtd;
                                        volume.consumido = false;
                                        if (volume.qtdreal == 0) {
                                            volume.consumido = true;
                                        }
                                        let va = await db.getModel('est_volumeajuste').create({
                                            qtd: dif.toFixed(4)
                                            , idvolume: k
                                            , idvolumeajustemotivo: 4
                                            , datahora: moment()
                                        }, { iduser: obj.req.user.id });
                                        if (va) {
                                            volume.save({ iduser: obj.req.user.id });
                                        }
                                    }
                                    return application.success(obj.res, { msg: application.message.success });
                                } catch (err) {
                                    return application.fatal(obj.res, err);
                                }
                            }
                        }

                        if (obj.req.body.function in f) {
                            f[obj.req.body.function](obj);
                        } else {
                            return application.error(obj.res, { msg: 'Função não encontrada' });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_gerarVolumes: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {

                            let body = '';
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'Depósito*'
                                , name: 'iddeposito'
                                , model: 'est_deposito'
                                , attribute: 'descricao'
                            });
                            body += application.components.html.integer({
                                width: '12'
                                , label: 'Quantidade de Volumes*'
                                , name: 'qtdvolumes'
                            });
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'Produto*'
                                , name: 'idversao'
                                , model: 'pcp_versao'
                                , attribute: 'descricaocompleta'
                            });
                            body += application.components.html.decimal({
                                width: '12'
                                , label: 'Quantidade por Volume*'
                                , name: 'qtd'
                            });
                            body += application.components.html.text({
                                width: '6'
                                , label: 'Lote'
                                , name: 'lote'
                            });
                            body += application.components.html.date({
                                width: '6'
                                , label: 'Data de Validade'
                                , name: 'datavalidade'
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt' + obj.event.id
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Gerar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['iddeposito', 'qtdvolumes', 'idversao', 'qtd']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }

                            let ids = [];

                            for (let i = 0; i < obj.req.body.qtdvolumes; i++) {
                                let volume = await db.getModel('est_volume').create({
                                    idversao: obj.req.body.idversao
                                    , iduser: obj.req.user.id
                                    , datahora: moment()
                                    , qtd: application.formatters.be.decimal(obj.req.body.qtd, 4)
                                    , consumido: false
                                    , qtdreal: application.formatters.be.decimal(obj.req.body.qtd, 4)
                                    , iddeposito: obj.req.body.iddeposito
                                    , lote: obj.req.body.lote || null
                                    , datavalidade: application.formatters.be.date(obj.req.body.datavalidade) || null
                                }, { iduser: obj.req.user.id });
                                ids.push(volume.id);
                            }

                            return application.success(obj.res, {
                                modal: {
                                    id: 'modalevt2' + obj.event.id
                                    , title: obj.event.description
                                    , body: '<div class="col-md-12">IDs gerados: ' + ids.join(', ') + '</div>'
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Ok</button>'
                                }
                                , reloadtables: true
                            });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_inventarioAlmox: async function (obj) {
                    try {
                        if (obj.req.method == 'GET') {

                            let body = '';
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'Depósito*'
                                , name: 'iddeposito'
                                , model: 'est_deposito'
                                , attribute: 'descricao'
                            });
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'Grupo'
                                , name: 'idgrupo'
                                , model: 'est_grupo'
                                , query: `codigo ||  ' - ' || descricao`
                                , multiple: 'multiple="multiple"'
                            });

                            body += application.components.html.radio({
                                width: '12'
                                , label: 'Ordem'
                                , name: 'ordem'
                                , value: 'Grupo/Subgrupo'
                                , options: ['Grupo/Subgrupo', 'Código']
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt' + obj.event.id
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Gerar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['iddeposito']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }
                            let deposito = await db.getModel('est_deposito').findOne({ where: { id: obj.req.body.iddeposito } });
                            let grupo = '';
                            if (obj.req.body.idgrupo) {
                                grupo = ` and g.id in (${obj.req.body.idgrupo})`;
                            }
                            let sql = await db.sequelize.query(`
                                select * from (select
                                    g.descricao as grupo
                                    , sg.descricao as subgrupo
                                    , v.descricaocompleta
                                    , sum(vol.qtdreal) as qtd
                                from
                                    est_volume vol
                                left join pcp_versao v on (vol.idversao = v.id)
                                left join cad_item i on (v.iditem = i.id)
                                left join est_grupo g on (i.idgrupo = g.id)
                                left join est_subgrupo sg on (i.idsubgrupo = sg.id)
                                where
                                    vol.consumido = false
                                    and vol.iddeposito = :iddeposito
                                    ${grupo}
                                group by 1,2,3
                                order by ${obj.req.body.ordem == 'Código' ? '3,1,2' : '1,2,3'}) as x

                                union all

                                select * from (select
                                    'Total' as grupo
                                    , ''::text
                                    , ''::text
                                    , sum(vol.qtdreal) as qtd
                                from
                                    est_volume vol
                                left join pcp_versao v on (vol.idversao = v.id)
                                left join cad_item i on (v.iditem = i.id)
                                left join est_grupo g on (i.idgrupo = g.id)
                                where
                                    vol.consumido = false
                                    and vol.iddeposito = :iddeposito
                                    ${grupo}
                                group by 1,2
                                order by 1,2) as x
                            `, {
                                    type: db.sequelize.QueryTypes.SELECT
                                    , replacements: { iddeposito: obj.req.body.iddeposito }
                                });

                            let report = {};
                            report.__title = `Inventário ${deposito.descricao}`;
                            report.__table = `
                            <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                                <tr>
                                    <td style="text-align:center;"><strong>Grupo</strong></td>
                                    <td style="text-align:center;"><strong>Subgrupo</strong></td>
                                    <td style="text-align:center;"><strong>Produto</strong></td>
                                    <td style="text-align:center;"><strong>Quantidade</strong></td>
                                </tr>
                            `;
                            for (let i = 0; i < sql.length; i++) {
                                report.__table += `
                                <tr>
                                    <td style="text-align:left;"> ${sql[i]['grupo']} </td>
                                    <td style="text-align:left;"> ${sql[i]['subgrupo']} </td>
                                    <td style="text-align:left;"> ${sql[i]['descricaocompleta']} </td>
                                    <td style="text-align:right;"> ${application.formatters.fe.decimal(sql[i]['qtd'], 4)} </td>
                                </tr>
                                `;
                            }
                            report.__table += `
                            </table>
                            `;

                            let filename = await main.platform.report.f_generate('Geral - Listagem', report);
                            return application.success(obj.res, {
                                openurl: '/download/' + filename
                            });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_xlsAlmox: async (obj) => {
                    try {
                        let sql = await db.sequelize.query(`
                        SELECT 
                            "est_volume"."id"
                            , to_char("est_volume"."datahora", 'dd/MM/YYYY') as datahora
                            , i.codigo as "codigo"
                            , '/' as barra
                            , "pcp_versao".codigo as "versao"
                            , i."descricao" AS "produto"
                            , "est_deposito"."descricao" AS "deposito"
                            , "est_depositoendereco"."descricao" AS "endereco"
                            , trim(to_char("est_volume"."qtdreal", '9999990D99')) as "qtdemestoque"
                            , trim(to_char(est_volume.qtdreal - coalesce((select sum(vr.qtd) from est_volumereserva vr where vr.apontado = false and vr.idvolume = est_volume.id),0), '9999990D99')) AS "qtddisponivel"
                            , (select cad_unidade.unidade from cad_unidade where cad_unidade.id = (select cad_item.idunidade from cad_item where cad_item.id = pcp_versao.iditem)) AS "unidade"
                            , case when "est_volume"."consumido" = true then 'SIM' else 'NAO' end as consumido
                            , "est_volume"."lote"
                            , to_char("est_volume"."datavalidade", 'dd/MM/YYYY') as datavalidade
                            , case when "est_volume"."fotos" is null then 'NAO' else 'SIM' end as possuifoto
                            , case when "est_nfentradaitem"."laudos" is null then 'NAO' else 'SIM' end as possuilaudo
                            , c.descricao as estrutura
                            , nv.chave
                            , nv.razaosocial as fornecedor
                            , nv.datainclusao as dataentrada
                            , nv.documento
                        FROM "est_volume" AS "est_volume"
                        LEFT OUTER JOIN "pcp_apretorno" AS "pcp_apretorno" ON "est_volume"."idapretorno" = "pcp_apretorno"."id"
                        LEFT OUTER JOIN "est_deposito" AS "est_deposito" ON "est_volume"."iddeposito" = "est_deposito"."id"
                        LEFT OUTER JOIN "est_nfentradaitem" AS "est_nfentradaitem" ON "est_volume"."idnfentradaitem" = "est_nfentradaitem"."id"
                        LEFT OUTER JOIN "pcp_versao" AS "pcp_versao" ON "est_volume"."idversao" = "pcp_versao"."id"
                        LEFT OUTER JOIN "users" AS "users" ON "est_volume"."iduser" = "users"."id"
                        LEFT OUTER JOIN "est_depositoendereco" AS "est_depositoendereco" ON "est_volume"."iddepositoendereco" = "est_depositoendereco"."id"
                        LEFT OUTER JOIN "pcp_approducaovolume" AS "pcp_approducaovolume" ON "est_volume"."idapproducaovolume" = "pcp_approducaovolume"."id"
                        LEFT OUTER JOIN cad_item i on ("pcp_versao".iditem = i.id)
                        LEFT OUTER JOIN est_classe c on (i.idclasse = c.id)
                        left join est_nfentradaitem nvi on ("est_volume".idnfentradaitem = nvi.id)
                        left join est_nfentrada nv on (nvi.idnfentrada = nv.id)
                        WHERE ("est_volume"."consumido" = 'false' AND "est_volume"."iddeposito" IN ('1'))
                        `, { type: db.Sequelize.QueryTypes.SELECT });
                        let XLSX = require('xlsx');
                        let wb = XLSX.utils.book_new();
                        wb.SheetNames.push('Sheet1');
                        let ws = XLSX.utils.json_to_sheet(sql, {
                            header: [
                                'id'
                                , 'estrutura'
                                , 'codigo'
                                , 'barra'
                                , 'versao'
                                , 'produto'
                                , 'dataentrada'
                                , 'fornecedor'
                                , 'documento'
                                , 'deposito'
                                , 'endereco'
                                , 'qtdemestoque'
                                , 'qtddisponivel'
                                , 'unidade'
                                , 'lote'
                                , 'datavalidade'
                                , 'possuilaudo'
                                , 'possuifoto'
                                , 'consumido'
                                , 'chave'
                            ], cellDates: true
                        });
                        let filename = process.hrtime()[1] + '.xls';
                        wb.Sheets['Sheet1'] = ws;
                        XLSX.writeFile(wb, `${__dirname}/../../tmp/${process.env.NODE_APPNAME}/${filename}`);
                        return application.success(obj.res, { openurl: '/download/' + filename });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , volumereserva: {
                onsave: async function (obj, next) {
                    try {
                        let volume = await db.getModel('est_volume').findOne({ where: { id: obj.register.idvolume } });
                        let qtdreservada = await db.getModel('est_volumereserva').sum('qtd', {
                            where: {
                                id: { [db.Op.ne]: obj.register.id }
                                , idvolume: volume.id
                                , apontado: false
                            }
                        });

                        if ((qtdreservada + parseFloat(obj.register.qtd)).toFixed(4) > parseFloat(volume.qtdreal)) {
                            return application.error(obj.res, { msg: 'Este volume não possui essa quantidade para ser reservado' });
                        }

                        next(obj);

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , volumemistura: {
                ondelete: async function (obj, next) {
                    try {

                        return application.error(obj.res, { msg: 'Não é possível excluir este registro' });

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , est_mov: {
                onsave: async function (obj, next) {
                    const f = main.plastrela.estoque;
                    if (obj.id == 0) {
                        obj.register.iduser = obj.req.user.id;
                    }

                    let movimentar = await f._movimentar(obj.data);

                    if (movimentar.success) {
                        return application.success(obj.res, {
                            msg: application.message.success
                            , data: movimentar.register
                            , redirect: '/view/' + obj.view.id + '/' + movimentar.register.id
                        });
                    } else {
                        return application.error(obj.res, { msg: movimentar.msg, invalidfields: movimentar.invalidfields || [] });
                    }

                }
            }
            , est_depositoendereco: {

                onsave: async function (obj, next) {
                    try {

                        let saved = await next(obj);
                        if (saved.success) {
                            db.sequelize.query("update est_depositoendereco set descricaocompleta = (select descricao from est_deposito where id = iddeposito) || '(' || descricao || ')';", { type: db.sequelize.QueryTypes.UPDATE });
                            if (saved.register.depositopadrao) {
                                db.sequelize.query("update est_depositoendereco set depositopadrao = false where id != :v1 and iddeposito = :v2", {
                                    type: db.sequelize.QueryTypes.UPDATE
                                    , replacements: {
                                        v1: saved.register.id
                                        , v2: saved.register.iddeposito
                                    }
                                });
                            }
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }

                , e_gerarEnderecos: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {
                            let body = '';
                            body += application.components.html.hidden({
                                name: 'iddeposito'
                                , value: obj.id
                            });
                            body += application.components.html.text({
                                width: 4
                                , label: 'Prefixo'
                                , name: 'prefixo'
                            });
                            body += application.components.html.integer({
                                width: 4
                                , label: 'Inicial'
                                , name: 'inicial'
                            });
                            body += application.components.html.integer({
                                width: 4
                                , label: 'Final'
                                , name: 'final'
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt'
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Gerar</button>'
                                }
                            });
                        } else {

                            let fieldsrequired = ['iddeposito', 'prefixo', 'inicial', 'final'];
                            let invalidfields = [];

                            for (let i = 0; i < fieldsrequired.length; i++) {
                                if (!(fieldsrequired[i] in obj.req.body && obj.req.body[fieldsrequired[i]])) {
                                    invalidfields.push(fieldsrequired[i]);
                                }
                            }
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }

                            let deposito = await db.getModel('est_deposito').findOne({ where: { id: obj.req.body.iddeposito } })
                            let inicial = parseInt(obj.req.body.inicial);
                            let final = parseInt(obj.req.body.final);
                            let bulkEndereco = [];

                            for (let i = inicial; i <= final; i++) {
                                if (i < 10) {
                                    bulkEndereco.push({
                                        descricao: obj.req.body.prefixo + '00' + i
                                        , iddeposito: obj.req.body.iddeposito
                                        , depositopadrao: false
                                        , descricaocompleta: `${deposito.descricao}(${obj.req.body.prefixo + '00' + i})`
                                    });
                                } else if (i < 100) {
                                    bulkEndereco.push({
                                        descricao: obj.req.body.prefixo + '0' + i
                                        , iddeposito: obj.req.body.iddeposito
                                        , depositopadrao: false
                                        , descricaocompleta: `${deposito.descricao}(${obj.req.body.prefixo + '0' + i})`
                                    });
                                } else {
                                    bulkEndereco.push({
                                        descricao: obj.req.body.prefixo + i
                                        , iddeposito: obj.req.body.iddeposito
                                        , depositopadrao: false
                                        , descricaocompleta: `${deposito.descricao}(${obj.req.body.prefixo + i})`
                                    });
                                }
                            }

                            await db.getModel('est_depositoendereco').bulkCreate(bulkEndereco);

                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , nfentradaitem: {
                _imprimirEtiquetas: async function (obj) {
                    try {
                        if (obj.ids.length == 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }
                        let volumes = await db.getModel('est_volume').findAll({ where: { idnfentradaitem: { [db.Op.in]: obj.ids } } });
                        let ids = [];
                        for (let i = 0; i < volumes.length; i++) {
                            ids.push(volumes[i].id);
                        }
                        obj.ids = ids;
                        main.plastrela.estoque.est_volume._imprimirEtiqueta(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , solicitacaonf: {
                onsave: async function (obj, next) {
                    try {
                        if (obj.id == 0) {
                            obj.register.idsolicitante = obj.req.user.id;
                            obj.register.datahora = moment();
                        }
                        next(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_finalizarfaturamento: async function (obj) {
                    try {
                        if (obj.req.method == 'GET') {
                            if (obj.ids.length <= 0) {
                                return application.error(obj.res, { msg: application.message.selectOneEvent });
                            }
                            let body = '';
                            body += application.components.html.hidden({ name: 'ids', value: obj.ids.join(',') });
                            body += application.components.html.datetime({
                                width: '12'
                                , label: 'Data/Hora Faturamento*'
                                , name: 'datahora'
                            });
                            body += application.components.html.integer({
                                width: '12'
                                , label: 'NF nº'
                                , name: 'nf'
                            });
                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt'
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Finalizar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['ids', 'datahora', 'nf']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }
                            let solicitacaoitens = await db.getModel('est_solicitacaonfitem').findAll({ where: { id: { [db.Op.in]: obj.req.body.ids.split(',') } } });
                            for (let i = 0; i < solicitacaoitens.length; i++) {
                                solicitacaoitens[i].datahorafaturamento = application.formatters.be.datetime(obj.req.body.datahora);
                                solicitacaoitens[i].nf = obj.req.body.nf;
                                solicitacaoitens[i].faturada = true;
                                await solicitacaoitens[i].save({ iduser: obj.req.user.id });
                            }

                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , solicitacaonfitem: {
                onsave: async function (obj, next) {
                    try {
                        let saved = await next(obj);
                        if (saved.success) {
                            let setor = null;
                            if (saved.register.valorun) {
                                setor = await db.getModel('cad_setor').findOne({ where: { descricao: 'Expedição' } });
                            } else {
                                setor = await db.getModel('cad_setor').findOne({ where: { descricao: 'Compras' } });
                            }

                            if (setor) {
                                let usuarios = await db.getModel('cad_setorusuario').findAll({ where: { idsetor: setor.id } });
                                let arr = [];
                                for (let i = 0; i < usuarios.length; i++) {
                                    arr.push(usuarios[i].idusuario);
                                }
                                main.platform.notification.create(arr, {
                                    title: 'Solicitação de NF'
                                    , description: 'Solicitação NF ' + saved.register.idsolicitacaonf
                                    , link: '/v/solicitacao_nf/' + saved.register.idsolicitacaonf
                                });
                            }
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , requisicao: {
                e_entregar: async function (obj) {
                    let t;
                    try {
                        if (obj.ids.length <= 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }

                        t = await db.sequelize.transaction();
                        let requisicoes = await db.getModel('est_requisicaovolume').findAll({ include: [{ all: true }], where: { id: { [db.Op.in]: obj.ids } } });

                        for (let i = 0; i < requisicoes.length; i++) {
                            if (requisicoes[i].datahoraatendido) {
                                return application.error(obj.res, { msg: `A requisição ${requisicoes[i].id} já foi atendida` });
                            }
                        }

                        let config = await db.getModel('config').findOne();
                        let empresa = config.cnpj == "90816133000123" ? 2 : 1;

                        for (let i = 0; i < requisicoes.length; i++) {
                            let volume = await db.getModel('est_volume').findOne({ include: [{ all: true }], where: { id: requisicoes[i].idvolume } });
                            let item = await db.getModel('cad_item').findOne({ include: [{ all: true }], where: { id: volume.pcp_versao.iditem } });
                            if (item.est_grupo.codigo == 504 && item.est_tpitem.codigo == 5) {
                                await db.getModel('est_integracaotrf').create({
                                    query: `call p_transfere_estoque(${empresa}, '${item.codigo}', '${volume.pcp_versao.codigo}', ${volume.qtdreal}, '${moment().format(application.formatters.fe.date_format)}', ${volume.est_deposito.codigo}, ${requisicoes[i].est_deposito.codigo}, '9999', 'TRF'||'${empresa}'||'#'||'${moment().format(application.formatters.fe.datetime_format)}:00'||'#'||'${item.codigo}'||'#'||'${volume.pcp_versao.codigo}', ${volume.id}, null, 'S', 7, 'N', null, null, 2, ${empresa})`
                                    , integrado: 'N'
                                }, { iduser: obj.req.user.id, transaction: t });
                            }
                            requisicoes[i].datahoraatendido = moment();
                            requisicoes[i].iduseratendimento = obj.req.user.id;
                            requisicoes[i].iddepositoorigem = volume.iddeposito;
                            requisicoes[i].iddepositoenderecoorigem = volume.iddepositoendereco;
                            requisicoes[i].qtd = volume.qtdreal;
                            volume.iddeposito = requisicoes[i].iddeposito;
                            volume.iddepositoendereco = null;
                            await volume.save({ iduser: obj.req.user.id, transaction: t });
                            await requisicoes[i].save({ iduser: obj.req.user.id, transaction: t });
                        }

                        await t.commit();
                        application.success(obj.res, { msg: application.message.success, reloadtables: true });

                        let param = await main.platform.parameter.f_get('est_requisicao_notificacao');
                        if (param) {
                            main.platform.notification.create(param, {
                                title: 'Requisição Entregue'
                                , description: `${requisicoes.length} requisições entregues.`
                            });
                        }
                    } catch (err) {
                        t.rollback();
                        return application.fatal(obj.res, err);
                    }
                }
                , e_undoentregar: async function (obj) {
                    let t;
                    try {
                        if (obj.ids.length <= 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }

                        t = await db.sequelize.transaction();
                        let requisicoes = await db.getModel('est_requisicaovolume').findAll({ include: [{ all: true }], where: { id: { [db.Op.in]: obj.ids } } });

                        for (let i = 0; i < requisicoes.length; i++) {
                            if (!requisicoes[i].datahoraatendido) {
                                return application.error(obj.res, { msg: `A requisição ${requisicoes[i].id} não foi atendida` });
                            }
                        }

                        let config = await db.getModel('config').findOne();
                        let empresa = config.cnpj == "90816133000123" ? 2 : 1;

                        for (let i = 0; i < requisicoes.length; i++) {
                            let volume = await db.getModel('est_volume').findOne({ include: [{ all: true }], where: { id: requisicoes[i].idvolume } });
                            if (parseFloat(volume.qtdreal) != parseFloat(requisicoes[i].qtd)) {
                                t.rollback();
                                return application.error(obj.res, { msg: `A quantidade atual do volume ${volume.id} (${application.formatters.fe.decimal(volume.qtdreal, 4)}) difere da quantidade original (${application.formatters.fe.decimal(requisicoes[i].qtd, 4)}) da requisição` });
                            }

                            requisicoes[i].datahoraatendido = null;
                            requisicoes[i].iduseratendimento = null;
                            requisicoes[i].qtd = null;
                            let item = await db.getModel('cad_item').findOne({ include: [{ all: true }], where: { id: volume.pcp_versao.iditem } });
                            if (item.est_grupo.codigo == 504 && item.est_tpitem.codigo == 5) {
                                await db.getModel('est_integracaotrf').create({
                                    query: `call p_transfere_estoque(${empresa}, '${item.codigo}', '${volume.pcp_versao.codigo}', ${volume.qtdreal}, '${moment().format(application.formatters.fe.date_format)}', ${requisicoes[i].est_deposito.codigo}, ${requisicoes[i].depositoorigem.codigo}, '9999', 'TRF'||'${empresa}'||'#'||'${moment().format(application.formatters.fe.datetime_format)}:00'||'#'||'${item.codigo}'||'#'||'${volume.pcp_versao.codigo}', ${volume.id}, null, 'S', 7, 'N', null, null, 2, ${empresa})`
                                    , integrado: 'N'
                                }, { iduser: obj.req.user.id, transaction: t });
                            }

                            volume.iddeposito = requisicoes[i].iddepositoorigem;
                            volume.iddepositoendereco = requisicoes[i].iddepositoenderecoorigem;
                            requisicoes[i].iddepositoorigem = null;
                            requisicoes[i].iddepositoenderecoorigem = null;
                            await volume.save({ iduser: obj.req.user.id, transaction: t });
                            await requisicoes[i].save({ iduser: obj.req.user.id, transaction: t });
                        }
                        await t.commit();
                        return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                    } catch (err) {
                        t.rollback();
                        return application.fatal(obj.res, err);
                    }
                }
                , e_relentregues: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {
                            let body = '';
                            body += application.components.html.datetime({
                                width: '6'
                                , label: 'Data Inicial'
                                , name: 'dataini'
                                , value: moment().subtract(1, 'day').format(application.formatters.fe.date_format) + ' 07:00'
                            });
                            body += application.components.html.datetime({
                                width: '6'
                                , label: 'Data Final'
                                , name: 'datafim'
                                , value: moment().format(application.formatters.fe.date_format) + ' 07:00'
                            });
                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt' + obj.event.id
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Imprimir</button>'
                                }
                            });
                        } else {

                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['dataini', 'datafim']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }

                            let sql = await db.sequelize.query(`
                            select * from (select
                                v.descricaocompleta as produto
                                , (select e.codigo || ' - ' || e.descricao from pcp_etapa e where rv.iddeposito = e.iddeposito limit 1) as etapa
                                , string_agg(vol.id::text, ' ,') as ids
                                , sum(rv.qtd) as qtd
                            from
                                est_requisicaovolume rv
                            left join est_volume vol on (rv.idvolume = vol.id)	
                            left join pcp_versao v on (vol.idversao = v.id)
                            left join cad_item i on (v.iditem = i.id)
                            where
                                rv.datahoraatendido between :dataini and :datafim
                            group by 1,2
                            order by 1,2) as x

                            union all

                            select count(*)::text, '', '', sum(qtd) from (select
                                v.descricaocompleta as produto
                                , (select e.codigo || ' - ' || e.descricao from pcp_etapa e where rv.iddeposito = e.iddeposito limit 1) as etapa
                                , sum(rv.qtd) as qtd
                            from
                                est_requisicaovolume rv
                            left join est_volume vol on (rv.idvolume = vol.id)	
                            left join pcp_versao v on (vol.idversao = v.id)
                            left join cad_item i on (v.iditem = i.id)
                            where
                                rv.datahoraatendido between :dataini and :datafim
                            group by 1,2) as x
                            `, {
                                    type: db.sequelize.QueryTypes.SELECT
                                    , replacements: {
                                        dataini: application.formatters.be.datetime(obj.req.body.dataini)
                                        , datafim: application.formatters.be.datetime(obj.req.body.datafim)
                                    }
                                });

                            let report = {};
                            report.__title = `Requisições Atendidas</br>${obj.req.body.dataini} até ${obj.req.body.datafim}`;
                            report.__table = `
                            <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                                <tr>
                                    <td style="text-align:center;"><strong>Produto</strong></td>
                                    <td style="text-align:center;"><strong>IDs</strong></td>
                                    <td style="text-align:center;"><strong>Etapa</strong></td>
                                    <td style="text-align:center;"><strong>Quantidade</strong></td>                                    
                                </tr>
                            `;
                            for (let i = 0; i < sql.length; i++) {
                                report.__table += `
                                <tr>
                                    <td style="text-align:left;"> ${sql[i]['produto']} </td>
                                    <td style="text-align:left;"> ${sql[i]['ids']} </td>
                                    <td style="text-align:left;"> ${sql[i]['etapa']} </td>
                                    <td style="text-align:right;"> ${application.formatters.fe.decimal(sql[i]['qtd'], 4)} </td>
                                </tr>
                                `;
                            }
                            report.__table += `
                            </table>
                            `;

                            let filename = await main.platform.report.f_generate('Geral - Listagem', report);
                            return application.success(obj.res, {
                                openurl: '/download/' + filename
                            });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , volumeajuste: {
                onsave: async (obj, next) => {
                    try {
                        if (obj.register.id != 0) {
                            return application.error(obj.res, { msg: 'Não é permitido alteração neste registro.' });
                        }
                        obj.register.datahora = moment();

                        let volume = await db.getModel('est_volume').findOne({ where: { id: obj.register.idvolume || 0 } });
                        if (!volume) {
                            return application.error(obj.res, { msg: 'Volume não encontrado' });
                        }

                        volume.qtdreal = parseFloat(volume.qtdreal) + obj.register.qtd;
                        volume.consumido = false;

                        if (volume.qtdreal < 0) {
                            return application.error(obj.res, { msg: `Não é possível aplicar um ajuste deixando a quantidade negativa (Qtd em Estoque: ${application.formatters.fe.decimal(volume._previousDataValues.qtdreal, 4)})` });
                        } else if (volume.qtdreal == 0) {
                            volume.consumido = true;
                        }

                        let saved = await next(obj);
                        if (saved.success) {
                            volume.save({ _iduser: obj.req.user.id });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , ondelete: async (obj, next) => {
                    try {
                        return application.error(obj.res, { msg: 'Não é permitido exclusões.' });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_realizarAjuste: async (obj) => {
                    try {
                        if (obj.req.method == 'GET') {
                            let body = '';
                            body += application.components.html.text({
                                width: 12
                                , label: 'Código de Barra'
                                , name: 'codbar'
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevtg'
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Confirmar</button>'
                                }
                            });
                        } else {
                            if (obj.req.body.codbar) {

                                let codigodebarra = obj.req.body.codbar.split('-');
                                codigodebarra = parseInt(codigodebarra[codigodebarra.length - 1]);
                                let volume = await db.getModel('est_volume').findOne({ include: [{ all: true }], where: { id: codigodebarra || 0 } });
                                if (!volume) {
                                    return application.error(obj.res, { msg: 'Volume não encontrado' });
                                }
                                if (volume.iddeposito == 1) {
                                    return application.error(obj.res, { msg: 'Não é possível ajustar volumes do Almoxarifado' });
                                }

                                let body = '';
                                body += application.components.html.hidden({ name: 'idvolume', value: volume.id });
                                body += application.components.html.text({ width: 4, label: 'ID', value: volume.id, disabled: 'disabled="disabled"' });
                                body += application.components.html.text({ width: 8, label: 'Produto', value: volume.pcp_versao ? volume.pcp_versao.descricaocompleta : volume.observacao || '', disabled: 'disabled="disabled"' });
                                body += application.components.html.decimal({ width: 4, label: 'Qtd', value: application.formatters.fe.decimal(volume.qtdreal, 4), precision: 4, disabled: 'disabled="disabled"' });
                                body += application.components.html.text({ width: 8, label: 'Depósito', value: volume.est_deposito.descricao, disabled: 'disabled="disabled"' });
                                body += application.components.html.decimal({ width: 4, name: 'qtdajuste', label: 'Qtd Ajuste', precision: 4 });
                                body += application.components.html.autocomplete({ width: 8, name: 'idajustemotivo', label: 'Motivo', model: 'est_volumeajustemotivo', attribute: 'descricao', where: 'ativo = true' });


                                return application.success(obj.res, {
                                    modal: {
                                        form: true
                                        , action: '/event/' + obj.event.id
                                        , id: 'modalevtf'
                                        , title: obj.event.description
                                        , body: body
                                        , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Confirmar</button>'
                                    }
                                });
                            } else {
                                let invalidfields = application.functions.getEmptyFields(obj.req.body, ['idvolume', 'idajustemotivo', 'qtdajuste']);
                                if (invalidfields.length > 0) {
                                    return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                                }

                                let volume = await db.getModel('est_volume').findOne({ include: [{ all: true }], where: { id: obj.req.body.idvolume || 0 } });
                                if (!volume) {
                                    return application.error(obj.res, { msg: 'Volume não encontrado' });
                                }

                                volume.qtdreal = parseFloat(volume.qtdreal) + application.formatters.be.decimal(obj.req.body.qtdajuste);
                                volume.consumido = false;

                                if (volume.qtdreal < 0) {
                                    return application.error(obj.res, { msg: `Não é possível aplicar um ajuste deixando a quantidade negativa (Qtd em Estoque: ${application.formatters.fe.decimal(volume._previousDataValues.qtdreal, 4)})` });
                                } else if (volume.qtdreal == 0) {
                                    volume.consumido = true;
                                }
                                await volume.save({ _iduser: obj.req.user.id });
                                await db.getModel('est_volumeajuste').create({
                                    datahora: moment()
                                    , idvolume: volume.id
                                    , idvolumeajustemotivo: obj.req.body.idajustemotivo
                                    , qtd: application.formatters.be.decimal(obj.req.body.qtdajuste)
                                });
                                return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                            }
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
        }
        , pcp: {
            ap: {
                f_dataUltimoAp: function (idoprecurso) {
                    return new Promise((resolve) => {
                        db.getModel('pcp_oprecurso').findOne({ where: { id: idoprecurso } }).then(oprecurso => {
                            db.sequelize.query(`
                                select
                                    max(datafim) as max
                                from
                                    (select
                                        apt.dataini
                                        , apt.datafim
                                        , opr.idrecurso
                                    from
                                        pcp_approducaotempo apt
                                    left join pcp_approducao app on (apt.idapproducao = app.id)
                                    left join pcp_oprecurso opr on (app.idoprecurso = opr.id)
                                    
                                    union all
                                    
                                    select
                                        app.dataini
                                        , app.datafim
                                        , opr.idrecurso
                                    from
                                        pcp_apparada app
                                    left join pcp_oprecurso opr on (app.idoprecurso = opr.id)
                                    ) as x
                                where
                                    idrecurso = :v1
                                `
                                , {
                                    replacements: { v1: oprecurso.idrecurso }
                                    , type: db.sequelize.QueryTypes.SELECT
                                }
                            ).then(results => {
                                resolve(results[0].max);
                            });
                        });
                    });
                }
                , f_usuarioUltimoAp: function (idoprecurso) {
                    return new Promise((resolve) => {
                        db.getModel('pcp_oprecurso').findOne({ where: { id: idoprecurso } }).then(oprecurso => {
                            db.sequelize.query(`
                                select
                                    x.*
                                    , u.fullname
                                from
                                    (select
                                        datahora, iduser
                                    from
                                        pcp_apinsumo api
                                    where api.idoprecurso = :v1
                                
                                    union all
                                
                                    select
                                        datahora, iduser
                                    from
                                        pcp_apperda app
                                    where app.idoprecurso = :v1
                                
                                    union all
                                
                                    select
                                        datafim, iduser
                                    from
                                        pcp_apparada app
                                    where app.idoprecurso = :v1
                                
                                    union all
                                
                                    select
                                        v.datahora, apv.iduser
                                    from
                                        pcp_approducao app
                                    inner join pcp_approducaovolume apv on (app.id = apv.idapproducao)
                                    left join est_volume v on (apv.id = v.idapproducaovolume)
                                    where app.idoprecurso = :v1) as x
                                left join users u on (x.iduser = u.id)
                                order by datahora desc
                                limit 1                          
                                `
                                , {
                                    replacements: { v1: idoprecurso }
                                    , type: db.sequelize.QueryTypes.SELECT
                                }).then(sql => {
                                    let data = { id: null, text: null };
                                    if (sql.length > 0) {
                                        data.id = sql[0].iduser;
                                        data.text = sql[0].fullname;
                                    }
                                    resolve(data);
                                });
                        });
                    });
                }
                , js_usuarioUltimoAp: async function (obj) {
                    try {

                        let oprecurso = null;
                        if ('idoprecurso' in obj.data) {
                            oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.data.idoprecurso } });
                        } else if ('idapproducao' in obj.data) {
                            let approducao = await db.getModel('pcp_approducao').findOne({ where: { id: obj.data.idapproducao } });
                            oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: approducao.idoprecurso } });
                        } else {
                            return application.error(obj.res, { msg: 'sem id' });
                        }

                        let sql = await db.sequelize.query(`
                            select
                                x.*
                                , u.fullname
                            from
                                (select
                                    datahora, iduser
                                from
                                    pcp_apinsumo api
                                where api.idoprecurso = :v1
                            
                                union all
                            
                                select
                                    datahora, iduser
                                from
                                    pcp_apperda app
                                where app.idoprecurso = :v1
                            
                                union all
                            
                                select
                                    datafim, iduser
                                from
                                    pcp_apparada app
                                where app.idoprecurso = :v1
                            
                                union all
                            
                                select
                                    v.datahora, apv.iduser
                                from
                                    pcp_approducao app
                                inner join pcp_approducaovolume apv on (app.id = apv.idapproducao)
                                left join est_volume v on (apv.id = v.idapproducaovolume)
                                where app.idoprecurso = :v1) as x
                            left join users u on (x.iduser = u.id)
                            order by datahora desc
                            limit 1                          
                            `
                            , {
                                replacements: { v1: oprecurso ? oprecurso.id : 0 }
                                , type: db.sequelize.QueryTypes.SELECT
                            });

                        let data = { id: null, text: null };
                        if (sql.length > 0) {
                            data.id = sql[0].iduser;
                            data.text = sql[0].fullname;
                        }
                        return application.success(obj.res, { data: data });

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_recipienteUltimoAp: async function (obj) {
                    try {
                        let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.data.idoprecurso } });
                        let sql = await db.sequelize.query(`
                            select
                                datahora, recipiente
                            from
                                pcp_apinsumo api
                            where api.idoprecurso = :v1
                            order by datahora desc
                            limit 1                           
                            `
                            , {
                                replacements: { v1: oprecurso ? oprecurso.id : 0 }
                                , type: db.sequelize.QueryTypes.SELECT
                            });
                        let data = { id: null, text: null };
                        if (sql.length > 0) {
                            data.id = sql[0].recipiente;
                            data.text = sql[0].recipiente;
                        }
                        return application.success(obj.res, { data: data });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_dataUltimoAp: async function (obj) {
                    try {

                        let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.data.idoprecurso } });

                        let results = await db.sequelize.query(`
                            select
                                max(datafim) as max
                            from
                                (select
                                    apt.dataini
                                    , apt.datafim
                                    , opr.idrecurso
                                from
                                    pcp_approducaotempo apt
                                left join pcp_approducao app on (apt.idapproducao = app.id)
                                left join pcp_oprecurso opr on (app.idoprecurso = opr.id)
                                
                                union all
                                
                                select
                                    app.dataini
                                    , app.datafim
                                    , opr.idrecurso
                                from
                                    pcp_apparada app
                                left join pcp_oprecurso opr on (app.idoprecurso = opr.id)
                                ) as x
                            where
                                idrecurso = :v1
                            `
                            , {
                                replacements: { v1: oprecurso.idrecurso }
                                , type: db.sequelize.QueryTypes.SELECT
                            });
                        if (results[0].max) {
                            return application.success(obj.res, {
                                data: moment(results[0].max, 'YYYY-MM-DD HH:mm').add(1, 'minutes').format('DD/MM/YYYY HH:mm')
                            });
                        } else {
                            return application.success(obj.res, {
                                data: ''
                            });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , f_corrigeEstadoOps: function (idoprecurso) {
                    return new Promise((resolve) => {
                        db.getModel('pcp_config').findOne().then(config => {
                            db.getModel('pcp_oprecurso').findOne({ where: { id: idoprecurso } }).then(oprecurso => {

                                db.getModel('pcp_oprecurso').update({
                                    idestado: config.idestadoproducao
                                }, { where: { id: oprecurso.id } });

                                db.sequelize.query(`
                                select
                                    opr.id
                                from
                                    pcp_oprecurso opr
                                inner join pcp_config c on (opr.idestado = c.idestadoproducao)
                                where
                                    opr.idrecurso = :v1
                                    and opr.id != :v2
                                `
                                    , {
                                        replacements: {
                                            v1: oprecurso.idrecurso
                                            , v2: oprecurso.id
                                        }
                                        , type: db.sequelize.QueryTypes.SELECT
                                    }
                                ).then(results => {
                                    let ids = [];
                                    for (let i = 0; i < results.length; i++) {
                                        ids.push(results[i].id);
                                    }
                                    if (ids.length > 0) {
                                        db.getModel('pcp_oprecurso').update({
                                            idestado: config.idestadointerrompida
                                        }, { where: { id: { [db.Op.in]: ids } } });
                                    }
                                });
                            });
                        });
                    });
                }
                , f_solvente: function () {
                    let needle = require('needle');
                    needle.get('http://intranet.plastrela.com.br/SistemaH/content/Integracao/solvente205.php', {},
                        function (err, resp) {
                            if (err) {
                                console.error(err);
                                return;
                            }
                            let data = resp.body;
                            if (data) {
                                data = data.replace("{'Total de Solvente': ", '').replace('}', '');
                                db.getModel('pcp_solvente').create({
                                    recurso: 205
                                    , datahora: moment()
                                    , valor: data
                                });
                            }
                        });
                    needle.get('http://intranet.plastrela.com.br/SistemaH/content/Integracao/solvente206.php', {},
                        function (err, resp) {
                            if (err) {
                                console.error(err);
                                return;
                            }
                            let data = resp.body;
                            if (data) {
                                data = data.replace("{'Total de Solvente': ", '').replace('}', '');
                                db.getModel('pcp_solvente').create({
                                    recurso: 206
                                    , datahora: moment()
                                    , valor: data
                                });
                            }
                        });
                }
            }
            , apclichemontagem: {
                e_listaUltimaMontagem: async (obj) => {
                    try {
                        let item = await db.sequelize.query(`
                            select ver.id, cli.datahora, rec.idrecurso
                            from pcp_versao ver
                            left join pcp_op op on (ver.id = op.idversao)
                            left join pcp_opetapa eta on (op.id = eta.idop)
                            left join pcp_oprecurso rec on (eta.id = rec.idopetapa)
                            left join pcp_apcliche cli on (rec.id = cli.idoprecurso) 
                            where cli.id = :idapcliche`
                            , { type: db.Sequelize.QueryTypes.SELECT, replacements: { idapcliche: obj.id } }
                        );
                        let ultimaMontagem = await db.sequelize.query(`
                            select cli.id, op.codigo as op, datahora
                            from pcp_apcliche cli
                            left join pcp_oprecurso rec on (cli.idoprecurso = rec.id)
                            left join pcp_opetapa eta on (rec.idopetapa = eta.id)
                            left join pcp_op op on (eta.idop = op.id)
                            left join pcp_versao ver on (op.idversao = ver.id)
                            where ver.id = :idversao
                            and rec.idrecurso = :idrecurso
                            and cli.datahora < :datahora
                            order by cli.datahora desc
                            limit 1`
                            , { type: db.Sequelize.QueryTypes.SELECT, replacements: { idversao: item[0].id, datahora: item[0].datahora, idrecurso: item[0].idrecurso } }
                        );
                        if (ultimaMontagem.length <= 0) {
                            return application.error(obj.res, { msg: 'Não possui produções anteriores' });
                        }
                        let consumos = await db.sequelize.query(`
                            select 
                                mon.estacao
                                , ite.descricao as cor
                                , mon.viscosidade
                                , ani.descricao as anilox
                                , 'ID ' || cam.id || ' - ' || cam.descricao as camisa, 
                                coalesce((select string_agg(df.descricao,' | ') 
                                    from pcp_apclichemontconsumo com 
                                    left join est_duplaface df on (com.idduplaface = df.id) 
                                    where mon.id = com.idapclichemontagem),'') as duplaface
                            from pcp_apclichemontagem mon
                            left join est_camisa cam on (mon.idcamisa = cam.id) 
                            left join pcp_versao ver on (mon.idversao = ver.id)
                            left join cad_item ite on (ver.iditem = ite.id)
                            left join est_anilox ani on (mon.idanilox = ani.id)
                            where idapcliche = :idapcliche
                            order by 1`
                            , { type: db.Sequelize.QueryTypes.SELECT, replacements: { idapcliche: ultimaMontagem[0].id } }
                        );

                        let body = `
                        <div class="col-md-12">
                        <h4> OP: ${ultimaMontagem[0].op} - ${application.formatters.fe.datetime(ultimaMontagem[0].datahora)} </h4>
                        <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                            <tr>
                                <td style="text-align:center;"><strong>Estação</strong></td>
                                <td style="text-align:center;"><strong>Cor</strong></td>
                                <td style="text-align:center;"><strong>Viscosidade</strong></td>
                                <td style="text-align:center;"><strong>Camisa</strong></td>
                                <td style="text-align:center;"><strong>Dupla Face</strong></td>
                                <td style="text-align:center;"><strong>Anilox</strong></td>
                            </tr>
                        `;
                        for (let i = 0; i < consumos.length; i++) {
                            body += `
                            <tr>
                                <td style="text-align:center;"> ${consumos[i].estacao || ''}   </td>
                                <td style="text-align:left;">  ${consumos[i].cor || ''}   </td>
                                <td style="text-align:left;">  ${consumos[i].viscosidade || ''}   </td>
                                <td style="text-align:left;">   ${consumos[i].camisa || ''}   </td>
                                <td style="text-align:left;">  ${consumos[i].duplaface || ''}   </td>
                                <td style="text-align:left;">  ${consumos[i].anilox || ''}   </td>
                            </tr>
                            `;
                        }
                        body += `
                        </table>
                        </div>
                        `;

                        return application.success(obj.res, {
                            modal: {
                                id: 'modalevtg'
                                , title: obj.event.description
                                , body: body
                                , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">OK</button>'
                                , fullscreen: true
                            }
                        });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_definicoes: async (obj) => {
                    try {
                        if (obj.req.method == 'GET') {
                            let ids = []
                            let regs = await main.platform.model.findAll('pcp_apclichemontagem', {
                                where: {
                                    [db.Op.col]: db.Sequelize.literal(`pcp_apcliche.idoprecurso = ${obj.id}`)
                                }
                                , order: [['estacao', 'asc']]
                            });
                            let body = '<div class="row no-margin">';
                            body += application.components.html.decimal({
                                width: '3'
                                , label: 'Temperatura (°C)*'
                                , name: 'temperatura'
                                , precision: 1
                            });
                            body += application.components.html.integer({
                                width: '3'
                                , label: 'Umidade (%)*'
                                , name: 'umidade'
                            });
                            body += '</div>';
                            for (let i = 0; i < regs.count; i++) {
                                body += '<hr><div class="row no-margin">';
                                ids.push(regs.rows[i].id);
                                body += application.components.html.integer({
                                    width: '1'
                                    , label: 'Estação*'
                                    , name: 'estacao' + regs.rows[i].id
                                    , value: regs.rows[i].estacao || ''
                                });
                                body += application.components.html.text({
                                    width: '3'
                                    , label: 'Cor'
                                    , value: regs.rows[i].idversao || ''
                                    , disabled: 'disabled="disabled"'
                                });
                                let anilox = await db.getModel('est_anilox').findOne({ where: { id: regs.original[i].idanilox || 0 } });
                                body += application.components.html.autocomplete({
                                    width: '3'
                                    , label: 'Anilox'
                                    , name: 'idanilox' + regs.rows[i].id
                                    , model: 'est_anilox'
                                    , option: anilox ? '<option value="' + anilox.id + '" selected>' + anilox.descricao + '</option>' : ''
                                    , query: "'Nº ' || coalesce(est_anilox.id,'0') || ' - ' || est_anilox.descricao || ' - ' || est_anilox.bcmatual || ' BCM' || coalesce('<span style=color:red> ' || est_anilox.problema ||'</span>', '')"
                                    , where: 'ativo = true'
                                });
                                body += application.components.html.integer({
                                    width: '1'
                                    , label: 'Viscosidade'
                                    , name: 'viscosidade' + regs.rows[i].id
                                    , value: regs.rows[i].viscosidade || ''
                                });

                                body += application.components.html.time({
                                    width: '1'
                                    , label: 'Secagem'
                                    , name: 'secagem' + regs.rows[i].id
                                    , placeholder: 'mm:ss'
                                });
                                body += application.components.html.checkbox({
                                    width: '1'
                                    , label: 'Retardador?'
                                    , name: 'retardador' + regs.rows[i].id
                                });
                                body += application.components.html.text({
                                    width: '2'
                                    , label: 'Observação'
                                    , name: 'observacao' + regs.rows[i].id
                                });
                                let config = await db.getModel('config').findOne();
                                if (config.cnpj == '90816133000123') {
                                    body += application.components.html.integer({
                                        width: '4'
                                        , label: 'Nº OP da Tinta'
                                        , name: 'optinta' + regs.rows[i].id
                                        , value: regs.rows[i].optinta || ''
                                    });
                                    body += application.components.html.decimal({
                                        width: '3'
                                        , label: 'Consumo de Tinta'
                                        , name: 'consumotinta' + regs.rows[i].id
                                        , precision: 2
                                        , value: regs.rows[i].consumotinta || ''
                                    });
                                }
                                body += '</div>';
                            }
                            body += application.components.html.hidden({ name: 'ids', value: ids.join(',') });
                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , fullscreen: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt' + obj.event.id
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Confirmar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['ids']);
                            let ids = obj.req.body.ids.split(',');
                            for (let i = 0; i < ids.length; i++) {
                                invalidfields = invalidfields.concat(application.functions.getEmptyFields(obj.req.body, ['estacao' + ids[i]]));
                                if (obj.req.body['secagem' + ids[i]] && (!obj.req.body.temperatura || !obj.req.body.umidade)) {
                                    invalidfields = invalidfields.concat(['temperatura', 'umidade']);
                                }
                            }
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }

                            for (let i = 0; i < ids.length; i++) {
                                let montagem = await db.getModel('pcp_apclichemontagem').findOne({ where: { id: ids[i] } });
                                montagem.estacao = obj.req.body['estacao' + ids[i]];
                                montagem.viscosidade = obj.req.body['viscosidade' + ids[i]] || null;
                                montagem.idanilox = obj.req.body['idanilox' + ids[i]] || null;
                                montagem.optinta = obj.req.body['optinta' + ids[i]] || null;
                                montagem.consumotinta = obj.req.body['consumotinta' + ids[i]] ? application.formatters.be.decimal(obj.req.body['consumotinta' + ids[i]]) : null;
                                await montagem.save({ iduser: obj.req.user.id });

                                if (obj.req.body['secagem' + ids[i]]) {
                                    await db.getModel('pcp_apclichemontsecagem').create({
                                        idapclichemontagem: montagem.id
                                        , datahora: moment()
                                        , secagem: application.formatters.be.time(obj.req.body['secagem' + ids[i]])
                                        , temperatura: application.formatters.be.decimal(obj.req.body.temperatura)
                                        , umidade: obj.req.body.umidade
                                        , retardador: 'retardador' + ids[i] in obj.req.body && obj.req.body['retardador' + ids[i]] == 'on'
                                        , observacao: obj.req.body['observacao' + ids[i]] || null
                                    });
                                }
                            }

                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_cadastrarCamisas: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {

                            let body = '';

                            body += application.components.html.text({
                                width: '12'
                                , label: 'Descrição*'
                                , name: 'descricao'
                            });
                            body += application.components.html.integer({
                                width: '6'
                                , label: 'Quantidade*'
                                , name: 'qtd'
                            });
                            body += application.components.html.decimal({
                                width: '6'
                                , label: 'Fechamento*'
                                , name: 'fechamento'
                                , precision: 2
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt' + obj.event.id
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Gerar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, [
                                'descricao'
                                , 'qtd'
                                , 'fechamento'
                            ]);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }

                            obj.req.body.fechamento = application.formatters.be.decimal(obj.req.body.fechamento, 2);

                            if (obj.req.body.qtd <= 0 || obj.req.body.qtd > 50) {
                                return application.error(obj.res, { msg: 'A quantidade deve ser entre 1 e 50', invalidfields: ['qtd'] });
                            }

                            for (let i = 0; i < obj.req.body.qtd; i++) {

                                await db.getModel('est_camisa').create({
                                    numero: i + 1
                                    , descricao: obj.req.body.descricao
                                    , fechamento: obj.req.body.fechamento
                                    , ativa: true
                                }, { iduser: obj.req.body.iduser });
                            }

                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_cadastrarAnilox: async function (obj) {
                    try {
                        if (obj.req.method == 'GET') {
                            let body = '';
                            body += application.components.html.date({
                                width: '4'
                                , label: 'Data compra*'
                                , name: 'datacompra'
                            });
                            body += application.components.html.integer({
                                width: '4'
                                , label: 'Quantidade*'
                                , name: 'qtd'
                            });
                            body += application.components.html.integer({
                                width: '4'
                                , label: 'BCM*'
                                , name: 'bcm'
                            });
                            body += application.components.html.text({
                                width: '12'
                                , label: 'Descrição*'
                                , name: 'descricao'
                            });
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'Fornecedor*'
                                , name: 'fornecedor'
                                , model: 'cad_corr'
                                , attribute: 'nome'
                            });
                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt' + obj.event.id
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Gerar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, [
                                'datacompra'
                                , 'qtd'
                                , 'descricao'
                                , 'bcm'
                                , 'fornecedor'
                            ]);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }
                            if (obj.req.body.qtd <= 0 || obj.req.body.qtd > 50) {
                                return application.error(obj.res, { msg: 'A quantidade deve ser entre 1 e 50', invalidfields: ['qtd'] });
                            }
                            for (let i = 0; i < obj.req.body.qtd; i++) {
                                await db.getModel('est_anilox').create({
                                    datacompra: application.formatters.be.date(obj.req.body.datacompra)
                                    , descricao: obj.req.body.descricao
                                    , bcm: obj.req.body.bcm
                                    , bcmatual: obj.req.body.bcm
                                    , idcadcorr: obj.req.body.fornecedor
                                    , ativo: true
                                }, { iduser: obj.req.body.iduser });
                            }
                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_acompanhamento: async function (obj) {
                    try {
                        if (obj.req.method == 'GET') {
                            let body = '';
                            body += application.components.html.date({
                                width: '6'
                                , label: 'Data Inicio*'
                                , name: 'datainicio'
                            });
                            body += application.components.html.date({
                                width: '6'
                                , label: 'Data Fim*'
                                , name: 'datafim'
                            });
                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt' + obj.event.id
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Gerar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['datainicio', 'datafim']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }
                            let sql = await db.sequelize.query(`
                            select * 
                            from (select ped.codigo as pedido
                               ,ite.codigo as produto
                               ,(select count(*) 
                                from pcp_apclichemontagem mon 
                                left join pcp_apcliche              cli on (mon.idapcliche = cli.id)
                                left join pcp_oprecurso             rec on (cli.idoprecurso = rec.id)
                                left join pcp_opetapa               eta on (rec.idopetapa = eta.id)
                                where eta.idop = op.id)             as total_cores
                               ,(select min(datahoraini)
                                from pcp_apclichemontagem mon 
                                left join pcp_apclichemonttempo     tem on (mon.id = tem.idapclichemontagem) 
                                left join pcp_apcliche              cli on (mon.idapcliche = cli.id)
                                left join pcp_oprecurso             rec on (cli.idoprecurso = rec.id)
                                left join pcp_opetapa               eta on (rec.idopetapa = eta.id)
                                where eta.idop = op.id)             as datainicio
                               ,(select max(datahorafim) 
                                from pcp_apclichemontagem mon 
                                left join pcp_apclichemonttempo     tem on (mon.id = tem.idapclichemontagem) 
                                left join pcp_apcliche              cli on (mon.idapcliche = cli.id)
                                left join pcp_oprecurso             rec on (cli.idoprecurso = rec.id)
                                left join pcp_opetapa               eta on (rec.idopetapa = eta.id)
                                where eta.idop = op.id)             as datafim
                               ,(select use.fullname 
                                from pcp_apclichemontagem mon 
                                left join pcp_apclichemonttempo     tem on (mon.id = tem.idapclichemontagem) 
                                left join pcp_apcliche              cli on (mon.idapcliche = cli.id)
                                left join pcp_oprecurso             rec on (cli.idoprecurso = rec.id)
                                left join pcp_opetapa               eta on (rec.idopetapa = eta.id)
                                left join users                     use on (tem.iduser = use.id)
                                where eta.idop = op.id limit 1)     as colaborador
                               ,(select string_agg(mot.descricao, '<br>') 
                                from pcp_apclichemontagem mon 
                                left join pcp_apclichemonttempo     tem on (mon.id = tem.idapclichemontagem) 
                                left join pcp_apcliche              cli on (mon.idapcliche = cli.id)
                                left join pcp_oprecurso             rec on (cli.idoprecurso = rec.id)
                                left join pcp_opetapa               eta on (rec.idopetapa = eta.id)
                                left join users                     use on (tem.iduser = use.id)
                                left join pcp_apclicherecolagemmotivo mot on (tem.idapclicherecolagemmotivo = mot.id)
                                where eta.idop = op.id)             as motivo_recolagem
                            from pcp_op op
                            left join pcp_versao 	ver on (op.idversao = ver.id)
                            left join cad_item 	    ite on (ver.iditem = ite.id)
                            left join pcp_opep 	    opep on (op.id = opep.idop)
                            left join ven_pedido 	ped on (opep.idpedido = ped.id)
                            left join pcp_opetapa 	eta on (op.id = eta.idop)
                            left join pcp_etapa 	e on (eta.idetapa = e.id) 
                            left join pcp_tprecurso trec on (e.idtprecurso = trec.id)
                            where trec.codigo = 2) as x
                            where x.datainicio >= :datainicio
                            and x.datafim <= :datafim
                            order by x.datainicio asc`
                                , { type: db.Sequelize.QueryTypes.SELECT, replacements: { datainicio: obj.req.body.datainicio, datafim: obj.req.body.datafim } }
                            );
                            let report = {};
                            report.__title = obj.event.description;
                            report.__table = `
                            <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                                <tr>
                                    <td style="text-align:center;"><strong>Pedido</strong></td>
                                    <td style="text-align:center;"><strong>Produto</strong></td>
                                    <td style="text-align:center;"><strong>Nº Cores</strong></td>
                                    <td style="text-align:center;"><strong>Data/Hora Inicio</strong></td>
                                    <td style="text-align:center;"><strong>Data/Hora Fim</strong></td>
                                    <td style="text-align:center;"><strong>Colaborador</strong></td>
                                    <td style="text-align:center;"><strong>Motivo Recolagem</strong></td>
                                </tr>
                            `;
                            for (let i = 0; i < sql.length; i++) {
                                report.__table += `
                                <tr>
                                    <td style="text-align:center;"> ${sql[i]['pedido'] || ''} </td>
                                    <td style="text-align:center;"> ${sql[i]['produto']} </td>
                                    <td style="text-align:center;"> ${sql[i]['total_cores']} </td>
                                    <td style="text-align:center;"> ${application.formatters.fe.datetime(sql[i]['datainicio'])} </td>
                                    <td style="text-align:center;"> ${application.formatters.fe.datetime(sql[i]['datafim'])} </td>
                                    <td style="text-align:left;"> ${sql[i]['colaborador']} </td>
                                    <td style="text-align:left;"> ${sql[i]['motivo_recolagem'] || ''} </td>
                                </tr>
                                `;
                            }
                            report.__table += `
                            </table>
                            `;
                            let filename = await main.platform.report.f_generate('Geral - Listagem', report);
                            return application.success(obj.res, {
                                openurl: '/download/' + filename
                            });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , apclichemonttempo: {
                onsave: async function (obj, next) {
                    try {
                        if (obj.register.recolagem && !obj.register['idapclicherecolagemmotivo']) {
                            return application.error(obj.res, { msg: 'Informe o motivo da recolagem', invalidfields: ['idapclicherecolagemmotivo'] });
                        }
                        let dataini = moment(obj.register.datahoraini);
                        let datafim = moment(obj.register.datahorafim);
                        let duracao = datafim.diff(dataini, 'm');
                        let minutosafrente = datafim.diff(moment(), 'm');
                        if (minutosafrente > 10) {
                            return application.error(obj.res, { msg: 'Verifique o dia e a hora da data final' });
                        }
                        if (duracao <= 0) {
                            return application.error(obj.res, { msg: 'Datas incorretas, verifique' });
                        }
                        await next(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_ultimoapontamento: async (obj) => {
                    try {
                        let montagem = await db.getModel('pcp_apclichemontagem').findOne({ where: { id: obj.data.idmontagem }, include: [{ all: true }] });
                        let sql = await db.sequelize.query(`
                                select
                                    max(datahorafim) as max
                                from
                                    (select 
                                        mt.datahoraini
                                        , mt.datahorafim
                                        , cl.idrecurso
                                    from pcp_apclichemonttempo mt
                                    left join pcp_apclichemontagem m on (mt.idapclichemontagem = m.id)
                                    left join pcp_apcliche cl on (m.idapcliche = cl.id)
                                    ) as x
                                where
                                    idrecurso = :v1
                                `
                            , {
                                replacements: { v1: montagem['pcp_apcliche'].idrecurso }
                                , type: db.sequelize.QueryTypes.SELECT
                            }
                        );
                        application.success(obj.res, {
                            datahoraini: sql[0].max ? moment(sql[0].max, 'YYYY-MM-DD HH:mm').add(1, 'minutes').format(application.formatters.fe.datetime_format) : null
                            , datahorafim: moment().format(application.formatters.fe.datetime_format)
                        });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , approducao: {
                _recalcula: function (id) {
                    return new Promise((resolve, reject) => {
                        db.getModel('pcp_approducao').findOne({ where: { id: id } }).then(approducao => {
                            db.getModel('pcp_approducaovolume').findAll({
                                where: { idapproducao: approducao.id }
                            }).then(volumes => {
                                db.getModel('pcp_approducaotempo').findAll({
                                    where: { idapproducao: approducao.id }
                                    , order: [['dataini', 'desc']]
                                }).then(tempos => {
                                    let intervalos = [];
                                    let pesoliquido = 0;
                                    let qtd = 0;
                                    for (let i = 0; i < tempos.length; i++) {
                                        intervalos.push(moment(tempos[i].dataini).format('DD/MM HH:mm') + ' - ' + moment(tempos[i].datafim).format('DD/MM HH:mm'));
                                    }
                                    for (let i = 0; i < volumes.length; i++) {
                                        pesoliquido += parseFloat(volumes[i].pesoliquido);
                                        qtd += parseFloat(volumes[i].qtd);
                                    }
                                    approducao.intervalo = intervalos.join('<br>');
                                    approducao.qtd = qtd.toFixed(4);
                                    approducao.pesoliquido = pesoliquido.toFixed(4);
                                    approducao.save({ iduser: obj.req.user.id }).then(() => {
                                        resolve(true);
                                    });
                                });
                            });
                        });
                    });
                }
                , __adicionar: async function (obj) {
                    try {
                        let config = await db.getModel('pcp_config').findOne();
                        let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.data.idoprecurso } });
                        if (oprecurso.idestado == config.idestadoencerrada) {
                            return application.error(obj.res, { msg: 'Não é possível realizar apontamentos de OP encerrada' });
                        }
                        let results = await db.sequelize.query(
                            'select'
                            + ' ap.id'
                            + ' , (select sum(apv.qtd) from pcp_approducaovolume apv where ap.id = apv.idapproducao) as volumes'
                            + ' from'
                            + ' pcp_oprecurso opr'
                            + ' inner join pcp_approducao ap on (opr.id = ap.idoprecurso)'
                            + ' where opr.id = :v1'
                            , {
                                replacements: {
                                    v1: oprecurso.id
                                }
                                , type: db.sequelize.QueryTypes.SELECT
                            });
                        for (let i = 0; i < results.length; i++) {
                            if (!results[i].volumes) {
                                return application.success(obj.res, { redirect: '/v/apontamento_de_producao_-_producao/' + results[i].id + '?parent=' + oprecurso.id });
                            }
                        }
                        let newapproducao = await db.getModel('pcp_approducao').create({ idoprecurso: oprecurso.id });
                        return application.success(obj.res, { redirect: '/v/apontamento_de_producao_-_producao/' + newapproducao.id + '?parent=' + oprecurso.id });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , ondelete: async function (obj, next) {
                    try {
                        let config = await db.getModel('pcp_config').findOne();
                        let approducao = await db.getModel('pcp_approducao').findAll({ where: { id: { [db.Op.in]: obj.ids } }, include: [{ all: true }] });
                        for (let i = 0; i < approducao.length; i++) {
                            if (approducao[i].pcp_oprecurso.idestado == config.idestadoencerrada) {
                                return application.error(obj.res, { msg: 'Não é possível apagar apontamentos de OP encerrada' });
                            }
                        }
                        let deleted = await next(obj);
                        if (deleted.success) {
                            let gconfig = await db.getModel('config').findOne();
                            for (let i = 0; i < approducao.length; i++) {
                                db.getModel('pcp_apintegracao').create({
                                    integrado: false
                                    , texto: '10|' + (gconfig.cnpj == '90816133000557' ? 1 : 2) + '|||||||||.1.' + approducao[i].id + '|||'
                                });
                            }
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , approducaotempo: {
                onsave: async function (obj, next) {
                    try {
                        let config = await db.getModel('pcp_config').findOne();
                        let approducao = await db.getModel('pcp_approducao').findOne({ where: { id: obj.register.idapproducao } })
                        let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: approducao.idoprecurso } });
                        if (oprecurso.idestado == config.idestadoencerrada) {
                            return application.error(obj.res, { msg: 'Não é possível realizar apontamentos de OP encerrada' });
                        }
                        let opconjugada = await db.getModel('pcp_opconjugada').findOne({ where: { idopconjugada: oprecurso.id } });
                        if (opconjugada && opconjugada.idopprincipal != oprecurso.id) {
                            let opr = await main.platform.model.findAll('pcp_oprecurso', { where: { id: opconjugada.idopprincipal } });
                            return application.error(obj.res, { msg: 'OP Conjugada. Só é possível realizar apontamentos na OP principal ' + opr.rows[0]['op'] });
                        }
                        if (!obj.register.dataini || !obj.register.datafim) {
                            return application.error(obj.res, { msg: 'Informe as datas corretamente', invalidfields: ['dataini', 'datafim'] });
                        }
                        let dataini = moment(obj.register.dataini);
                        let datafim = moment(obj.register.datafim);
                        let duracao = datafim.diff(dataini, 'm');
                        let minutosafrente = datafim.diff(moment(), 'm');
                        if (minutosafrente > 10) {
                            return application.error(obj.res, { msg: 'Verifique o dia e a hora da data final' });
                        }
                        if (duracao <= 0) {
                            return application.error(obj.res, { msg: 'Datas incorretas, verifique' });
                        }
                        obj.register.duracao = duracao;
                        let results = await db.sequelize.query(`
                            select
                                *
                            from
                                (select
                                    'produção' as tipo
                                    , apt.dataini
                                    , apt.datafim
                                from
                                    pcp_oprecurso opr
                                left join pcp_approducao ap on (opr.id = ap.idoprecurso)
                                left join pcp_approducaotempo apt on (ap.id = apt.idapproducao)
                                where
                                    opr.idrecurso = :v1 and apt.id != :v2
                                union all
                                select
                                    'parada' as tipo
                                    , app.dataini
                                    , app.datafim
                                from
                                    pcp_oprecurso opr
                                left join pcp_apparada app on (opr.id = app.idoprecurso)
                                where
                                    opr.idrecurso = :v1) as x
                            where 
                                (:v3::timestamp between dataini and datafim or :v4::timestamp between dataini and datafim) 
                                or
                                (dataini between :v3::timestamp and :v4::timestamp and datafim between :v3::timestamp and :v4::timestamp)
                            `
                            , {
                                replacements: {
                                    v1: oprecurso.idrecurso
                                    , v2: obj.register.id
                                    , v3: dataini.format()
                                    , v4: datafim.format()
                                }
                                , type: db.sequelize.QueryTypes.SELECT
                            });
                        if (results.length > 0) {
                            return application.error(obj.res, { msg: 'Existe um apontamento de ' + results[0].tipo + ' neste horário' });
                        }
                        main.plastrela.pcp.ap.f_corrigeEstadoOps(oprecurso.id);
                        let saved = await next(obj);
                        if (saved.success) {
                            approducao.integrado = false;
                            approducao.save({ iduser: obj.req.user.id });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , ondelete: async function (obj, next) {
                    try {

                        let config = await db.getModel('pcp_config').findOne();
                        let tempos = await db.getModel('pcp_approducaotempo').findAll({ where: { id: { [db.Op.in]: obj.ids } }, include: [{ all: true }] });
                        for (let i = 0; i < tempos.length; i++) {
                            let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: tempos[i].pcp_approducao.idoprecurso } })
                            if (oprecurso.idestado == config.idestadoencerrada) {
                                return application.error(obj.res, { msg: 'Não é possível apagar apontamentos de OP encerrada' });
                            }
                        }

                        let deleted = await next(obj);
                        if (deleted.success) {
                            db.getModel('pcp_approducao').update({ integrado: false }, { where: { idoprecurso: tempos[0].idoprecurso } });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_dataUltimoAp: async function (obj) {
                    try {

                        let approducao = await db.getModel('pcp_approducao').findOne({ where: { id: obj.data.idapproducao } });
                        let dataUltimoAp = await main.plastrela.pcp.ap.f_dataUltimoAp(approducao.idoprecurso);

                        if (dataUltimoAp) {
                            return application.success(obj.res, { data: moment(dataUltimoAp, 'YYYY-MM-DD HH:mm').add(1, 'minutes').format('DD/MM/YYYY HH:mm') });
                        } else {
                            return application.success(obj.res, { data: '' });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , approducaovolume: {
                onsave: async function (obj, next) {
                    try {

                        let config = await db.getModel('pcp_config').findOne();
                        let approducao = await db.getModel('pcp_approducao').findOne({ where: { id: obj.register.idapproducao } });
                        let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: approducao.idoprecurso } });
                        let user = await db.getModel('users').findOne({ where: { id: obj.register.iduser } });
                        if (oprecurso.idestado == config.idestadoencerrada) {
                            return application.error(obj.res, { msg: 'Não é possível realizar apontamentos de OP encerrada' });
                        }
                        let opconjugada = await db.getModel('pcp_opconjugada').findOne({ where: { idopconjugada: oprecurso.id } });
                        if (opconjugada && opconjugada.idopprincipal != oprecurso.id) {
                            let opr = await main.platform.model.findAll('pcp_oprecurso', { where: { id: opconjugada.idopprincipal } });
                            return application.error(obj.res, { msg: 'OP Conjugada. Só é possível realizar apontamentos na OP principal ' + opr.rows[0]['op'] });
                        }
                        if (user && !user.code) {
                            return application.error(obj.res, { msg: 'Usuário/Operador Inválido', invalidfields: ['iduser'] });
                        }
                        if (obj.register.qtd <= 0) {
                            return application.error(obj.res, { msg: 'A quantidade deve ser maior que 0', invalidfields: ['qtd'] });
                        }
                        if (obj.register.pesobruto <= 0) {
                            return application.error(obj.res, { msg: 'O peso deve ser maior que 0', invalidfields: ['pesobruto'] });
                        }

                        let volume = await db.getModel('est_volume').findOne({
                            where: { idapproducaovolume: obj.register.id }
                        });
                        if (volume && (parseFloat(volume.qtd) != parseFloat(volume.qtdreal))) {
                            return application.error(obj.res, { msg: 'Não é possível modificar um volume já utilizado' });
                        }

                        obj.register.pesoliquido = (obj.register.pesobruto - obj.register.tara).toFixed(4);

                        let opr = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.register.idopreferente || oprecurso.id } });

                        let opetapa = await db.getModel('pcp_opetapa').findOne({ where: { id: opr.idopetapa } });
                        let etapa = await db.getModel('pcp_etapa').findOne({ where: { id: opetapa.idetapa } });
                        let tprecurso = await db.getModel('pcp_tprecurso').findOne({ where: { id: etapa.idtprecurso } });
                        let op = await db.getModel('pcp_op').findOne({ where: { id: opetapa.idop } });

                        let sql = [];
                        if (tprecurso.codigo == 8) {
                            let deprevisora = await db.getModel('est_deposito').findOne({ where: { codigo: 11 } });
                            sql.push({ idopetapa: opetapa.id, iddeposito: deprevisora.id });
                        } else {
                            sql = await db.sequelize.query([1].indexOf(tprecurso.codigo) >= 0 ?
                                `with et as (
                                select distinct
                                    d.id as iddeposito
                                from
                                    est_deposito d
                                left join pcp_etapa e on (d.id = e.iddeposito)
                                where
                                    d.codigo = (
                                        select
                                            case
                                            when destino = 'EXP' then 1
                                            when destino = 'EXT' then 6
                                            when destino = 'IMP' then 7
                                            when destino = 'LAM' then 8
                                            when destino = 'COR' then 9
                                            when destino = 'REB' then 10
                                            else null end as dep
                                        from
                                            (select
                                                substr(f.valor,1,3) as destino
                                            from pcp_ficha f
                                            left join pcp_atribficha af on (f.idatributo = af.id)
                                            where
                                                f.valor is not null
                                                and f.idversao = ${op.idversao}
                                                and af.codigo in (6005)) as x)
                                )                                
                                (select
                                    ope.id as idopetapa
                                    , (select e.iddeposito from pcp_etapa e where ope.idetapa = e.id and e.iddeposito is not null limit 1) as iddeposito
                                from
                                    pcp_op op
                                left join pcp_op opmae on (op.idopmae = opmae.id)
                                left join pcp_opetapa ope on (opmae.id = ope.idop)
                                left join pcp_etapa e on (ope.idetapa = e.id)
                                inner join et et on (e.iddeposito = et.iddeposito)
                                where
                                    op.id = ${op.id})

                                union all

                                (select ope.id as idopetapa, e.iddeposito 
                                from
                                    pcp_op op
                                left join pcp_op opmae on (op.idopmae = opmae.id)
                                left join pcp_opetapa ope on (opmae.id = ope.idop)
                                left join pcp_etapa e on (ope.idetapa = e.id)
                                where
                                    op.id = ${op.id} and e.iddeposito is not null
                                order by ope.seq)

                                union all

                                (
                                    select 
                                        null as idopetapa
                                        , d.id as iddeposito
                                    from
                                        (select
                                            case
                                            when destino = 'EXP' then 1
                                            when destino = 'EXT' then 6
                                            when destino = 'IMP' then 7
                                            when destino = 'LAM' then 8
                                            when destino = 'COR' then 9
                                            when destino = 'REB' then 10
                                            else null end as deposito
                                        from
                                            (select
                                            substr(f.valor,1,3) as destino
                                            from pcp_ficha f
                                            left join pcp_atribficha af on (f.idatributo = af.id)
                                            where
                                            f.valor is not null
                                            and f.idversao = ${op.idversao}
                                            and af.codigo in (6005)) as x) as x
                                    left join est_deposito d on (d.codigo = x.deposito)
                                )
                                `
                                :
                                `select
                                    ope.seq
                                    , ope.id as idopetapa
                                    , (select e.iddeposito from pcp_etapa e where ope.idetapa = e.id and e.iddeposito is not null limit 1) as iddeposito
                                from
                                    pcp_op op
                                left join pcp_opetapa ope on (op.id = ope.idop)
                                where
                                    op.id = ${op.id}
                                    and ope.seq > ${opetapa.seq}
                                order by ope.seq
                                `,
                                { type: db.Sequelize.QueryTypes.SELECT });

                            if (sql.length > 0 && sql[0].iddeposito) {
                            } else {
                                return application.error(obj.res, { msg: 'Depósito não configurado' });
                            }
                        }

                        let saved = await next(obj);

                        if (saved.success) {
                            approducao.integrado = false;
                            approducao.save({ iduser: obj.req.user.id });
                            main.plastrela.pcp.ap.f_corrigeEstadoOps(oprecurso.id);

                            let qtd = saved.register.qtd;
                            let metragem = null;
                            if ([1, 2, 3, 5, 8].indexOf(tprecurso.codigo) >= 0) {
                                qtd = saved.register.pesoliquido;
                                metragem = saved.register.qtd;
                            }
                            volume = await db.getModel('est_volume').findOne({
                                where: { idapproducaovolume: saved.register.id }
                            });
                            let sqlped = await db.sequelize.query(`
                            select 
                                pi.id as idpedidoitem
                            from pcp_opep ep
                            left join pcp_op op on (ep.idop = op.id)
                            left join ven_pedidoitem pi on (ep.idpedido = pi.idpedido)
                            where op.id = ${[1].indexOf(tprecurso.codigo) >= 0 ? op.idopmae : op.id} and pi.idversao = op.idversao
                            `, { type: db.Sequelize.QueryTypes.SELECT });
                            let idpedidoitem = sqlped.length > 0 ? sqlped[0].idpedidoitem : null;
                            if (volume) {
                                volume.qtd = qtd;
                                volume.qtdreal = qtd;
                                volume.observacao = saved.register.observacao;
                                volume.metragem = metragem;
                                volume.iduser = saved.register.iduser;
                                volume.idversao = op.idversao;
                                volume.iddeposito = sql[0].iddeposito;
                                volume.save({ iduser: obj.req.user.id });
                                await db.getModel('est_volumereserva').destroy({ where: { idvolume: volume.id } });
                            } else {
                                volume = await db.getModel('est_volume').create({
                                    idapproducaovolume: saved.register.id
                                    , idversao: op.idversao
                                    , iddeposito: sql[0].iddeposito
                                    , iduser: saved.register.iduser
                                    , datahora: moment()
                                    , qtd: qtd
                                    , metragem: metragem
                                    , consumido: false
                                    , qtdreal: qtd
                                    , observacao: saved.register.observacao
                                });
                            }
                            if (sql.length > 0 && sql[0].idopetapa) {
                                await db.getModel('est_volumereserva').create({
                                    idvolume: volume.id
                                    , idpedidoitem: idpedidoitem
                                    , idopetapa: sql[0].idopetapa
                                    , qtd: qtd
                                    , apontado: false
                                });
                            }
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , ondelete: async function (obj, next) {
                    try {

                        let config = await db.getModel('pcp_config').findOne();
                        let volumes = await db.getModel('est_volume').findAll({ where: { idapproducaovolume: { [db.Op.in]: obj.ids } }, include: [{ all: true }] });
                        let approducaovolumes = await db.getModel('pcp_approducaovolume').findAll({ where: { id: { [db.Op.in]: obj.ids } }, include: [{ all: true }] });

                        for (let i = 0; i < volumes.length; i++) {
                            let approducao = await db.getModel('pcp_approducao').findOne({ where: { id: volumes[i].pcp_approducaovolume.idapproducao }, include: [{ all: true }] })
                            if (approducao.pcp_oprecurso.idestado == config.idestadoencerrada) {
                                return application.error(obj.res, { msg: 'Não é possível apagar apontamentos de OP encerrada' });
                            }
                        }

                        for (let i = 0; i < volumes.length; i++) {
                            if (volumes[i].consumido) {
                                return application.error(obj.res, { msg: 'O volume ' + volumes[i].id + ' se encontra consumido, verifique' });
                            } else if (parseFloat(volumes[i].qtd) != parseFloat(volumes[i].qtdreal)) {
                                return application.error(obj.res, { msg: 'O volume ' + volumes[i].id + ' se encontra parcialmente consumido, verifique' });
                            }
                        }

                        let deleted = await next(obj);
                        if (deleted.success) {
                            for (let i = 0; i < volumes.length; i++) {
                                let approducao = await db.getModel('pcp_approducao').findOne({ where: { id: volumes[i].pcp_approducaovolume.idapproducao }, include: [{ all: true }] })
                                let opr = await db.getModel('pcp_oprecurso').findOne({ where: { id: approducao.idoprecurso } });
                                let opetapa = await db.getModel('pcp_opetapa').findOne({ where: { id: opr.idopetapa } });
                                let etapa = await db.getModel('pcp_etapa').findOne({ where: { id: opetapa.idetapa } });
                                let tprecurso = await db.getModel('pcp_tprecurso').findOne({ where: { id: etapa.idtprecurso } });
                                if (tprecurso.codigo = 7) {
                                    db.getModel('pcp_apinsumo').update({ recipiente: null }, { where: { idoprecurso: opr.id, recipiente: '' + volumes[i].id } });
                                }
                                approducao.integrado = false;
                                approducao.save({ iduser: obj.req.user.id });
                            }
                            let gconfig = await db.getModel('config').findOne();
                            db.getModel('pcp_apintegracao').create({
                                integrado: false
                                , texto: '10|' + (gconfig.cnpj == '90816133000557' ? 1 : 2) + '|||||||||.1.' + approducaovolumes[0].pcp_approducao.id + '|||'
                            });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , _imprimirEtiqueta: async function (obj) {
                    if (obj.ids.length == 0) {
                        return application.error(obj.res, { msg: application.message.selectOneEvent });
                    }
                    let ids = [];

                    let volumes = await db.getModel('est_volume').findAll({ where: { idapproducaovolume: { [db.Op.in]: obj.ids } } })

                    for (let i = 0; i < volumes.length; i++) {
                        ids.push(volumes[i].id);
                    }
                    obj.ids = ids;
                    main.plastrela.estoque.est_volume._imprimirEtiqueta(obj);
                }
                , e_gerarVolumes: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {

                            let body = '';
                            body += application.components.html.hidden({
                                name: 'idapproducao'
                                , value: obj.id
                            });

                            let approducao = await db.getModel('pcp_approducao').findOne({ where: { id: obj.id } });
                            let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: approducao.idoprecurso } });
                            let opetapa = await db.getModel('pcp_opetapa').findOne({ where: { id: oprecurso.idopetapa } });
                            let etapa = await db.getModel('pcp_etapa').findOne({ where: { id: opetapa.idetapa } });
                            let tprecurso = await db.getModel('pcp_tprecurso').findOne({ where: { id: etapa.idtprecurso } });
                            let usuarioultimoap = await main.plastrela.pcp.ap.f_usuarioUltimoAp(approducao.idoprecurso);
                            let tintas = false;
                            if (tprecurso.codigo == 7) {
                                tintas = {};
                                tintas.qtdvolumes = 1;
                                tintas.qtd = parseFloat(await db.getModel('pcp_apinsumo').sum('qtd', { where: { idoprecurso: oprecurso.id, recipiente: null } })) || 0;
                                if (tintas.qtd <= 0) {
                                    return application.error(obj.res, { msg: 'Nenhum insumo na pesagem' });
                                }
                            }

                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'Usuário*'
                                , name: 'iduser'
                                , model: 'users'
                                , attribute: 'fullname'
                                , where: 'active and code is not null'
                                , option: usuarioultimoap.id ? `<option value="${usuarioultimoap.id}" selected>${usuarioultimoap.text}</option>` : ''
                            });
                            body += application.components.html.integer({
                                width: '12'
                                , label: 'Quantidade de Volumes*'
                                , name: 'qtdvolumes'
                                , value: tintas ? tintas.qtdvolumes : ''
                            });
                            body += application.components.html.decimal({
                                width: '4'
                                , label: 'Quantidade*'
                                , name: 'qtd'
                                , value: tintas ? application.formatters.fe.decimal(tintas.qtd, 2) : ''
                                , precision: 2
                            });
                            body += application.components.html.decimal({
                                width: '4'
                                , label: 'Peso Bruto(Kg)*'
                                , name: 'pesobruto'
                                , value: tintas ? application.formatters.fe.decimal(tintas.qtd + 1.5, 2) : ''
                                , precision: 4
                            });
                            body += application.components.html.decimal({
                                width: '4'
                                , label: 'Tara(Kg)*'
                                , name: 'tara'
                                , value: tintas ? '1,5000' : ''
                                , precision: 4
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt' + obj.event.id
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Gerar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, [
                                'idapproducao'
                                , 'qtdvolumes'
                                , 'iduser'
                                , 'qtd'
                                , 'pesobruto'
                                , 'tara'
                            ]);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }

                            if (obj.req.body.qtdvolumes > 100) {
                                return application.error(obj.res, { msg: 'Não é possível gerar mais que 100 volumes de uma vez só' });
                            }

                            obj.req.body.qtd = application.formatters.be.decimal(obj.req.body.qtd, 4);
                            obj.req.body.pesobruto = application.formatters.be.decimal(obj.req.body.pesobruto, 4)
                            obj.req.body.tara = application.formatters.be.decimal(obj.req.body.tara, 4);

                            let config = await db.getModel('pcp_config').findOne();
                            let approducao = await db.getModel('pcp_approducao').findOne({ where: { id: obj.req.body.idapproducao } });
                            let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: approducao.idoprecurso } });
                            if (oprecurso.idestado == config.idestadoencerrada) {
                                return application.error(obj.res, { msg: 'Não é possível realizar apontamentos de OP encerrada' });
                            }
                            if (obj.req.body.qtd <= 0) {
                                return application.error(obj.res, { msg: 'A quantidade deve ser maior que 0', invalidfields: ['qtd'] });
                            }
                            if (obj.req.body.pesobruto <= 0) {
                                return application.error(obj.res, { msg: 'O peso deve ser maior que 0', invalidfields: ['pesobruto'] });
                            }

                            let pesoliquido = (obj.req.body.pesobruto - obj.req.body.tara).toFixed(4);

                            let opetapa = await db.getModel('pcp_opetapa').findOne({ where: { id: oprecurso.idopetapa } });
                            let etapa = await db.getModel('pcp_etapa').findOne({ where: { id: opetapa.idetapa } });
                            let tprecurso = await db.getModel('pcp_tprecurso').findOne({ where: { id: etapa.idtprecurso } });
                            let op = await db.getModel('pcp_op').findOne({ where: { id: opetapa.idop } });

                            let sql = [];
                            if (tprecurso.codigo == 8) {
                                let deprevisora = await db.getModel('est_deposito').findOne({ where: { codigo: 11 } });
                                sql.push({ idopetapa: opetapa.id, iddeposito: deprevisora.id });
                            } else {
                                sql = await db.sequelize.query([1].indexOf(tprecurso.codigo) >= 0 ?
                                    `with et as (
                                    select distinct
                                        d.id as iddeposito
                                    from
                                        est_deposito d
                                    left join pcp_etapa e on (d.id = e.iddeposito)
                                    where
                                        d.codigo = (
                                            select
                                                case
                                                when destino = 'EXP' then 1
                                                when destino = 'EXT' then 6
                                                when destino = 'IMP' then 7
                                                when destino = 'LAM' then 8
                                                when destino = 'COR' then 9
                                                when destino = 'REB' then 10
                                                else null end as dep
                                            from
                                                (select
                                                    substr(f.valor,1,3) as destino
                                                from pcp_ficha f
                                                left join pcp_atribficha af on (f.idatributo = af.id)
                                                where
                                                    f.valor is not null
                                                    and f.idversao = ${op.idversao}
                                                    and af.codigo in (6005)) as x)
                                    )                                
                                    (select
                                        ope.id as idopetapa
                                        , (select e.iddeposito from pcp_etapa e where ope.idetapa = e.id and e.iddeposito is not null limit 1) as iddeposito
                                    from
                                        pcp_op op
                                    left join pcp_op opmae on (op.idopmae = opmae.id)
                                    left join pcp_opetapa ope on (opmae.id = ope.idop)
                                    left join pcp_etapa e on (ope.idetapa = e.id)
                                    inner join et et on (e.iddeposito = et.iddeposito)
                                    where
                                        op.id = ${op.id})

                                    union all

                                    (select ope.id as idopetapa, e.iddeposito 
                                    from
                                        pcp_op op
                                    left join pcp_op opmae on (op.idopmae = opmae.id)
                                    left join pcp_opetapa ope on (opmae.id = ope.idop)
                                    left join pcp_etapa e on (ope.idetapa = e.id)
                                    where
                                        op.id = ${op.id} and e.iddeposito is not null
                                    order by ope.seq)

                                    union all

                                    (
                                        select 
                                            null as idopetapa
                                            , d.id as iddeposito
                                        from
                                            (select
                                                case
                                                when destino = 'EXP' then 1
                                                when destino = 'EXT' then 6
                                                when destino = 'IMP' then 7
                                                when destino = 'LAM' then 8
                                                when destino = 'COR' then 9
                                                when destino = 'REB' then 10
                                                else null end as deposito
                                            from
                                                (select
                                                substr(f.valor,1,3) as destino
                                                from pcp_ficha f
                                                left join pcp_atribficha af on (f.idatributo = af.id)
                                                where
                                                f.valor is not null
                                                and f.idversao = ${op.idversao}
                                                and af.codigo in (6005)) as x) as x
                                        left join est_deposito d on (d.codigo = x.deposito)
                                    )
                                    `
                                    :
                                    `select
                                        ope.seq
                                        , ope.id as idopetapa
                                        , (select e.iddeposito from pcp_etapa e where ope.idetapa = e.id and e.iddeposito is not null limit 1) as iddeposito
                                    from
                                        pcp_op op
                                    left join pcp_opetapa ope on (op.id = ope.idop)
                                    where
                                        op.id = ${op.id}
                                        and ope.seq > ${opetapa.seq}
                                    order by ope.seq
                                    `,
                                    { type: db.Sequelize.QueryTypes.SELECT });
                                if (sql.length > 0 && sql[0].iddeposito) {
                                } else {
                                    return application.error(obj.res, { msg: 'Depósito não configurado' });
                                }
                            }
                            let sqlped = await db.sequelize.query(`
                            select 
                                pi.id as idpedidoitem
                            from pcp_opep ep
                            left join pcp_op op on (ep.idop = op.id)
                            left join ven_pedidoitem pi on (ep.idpedido = pi.idpedido)
                            where op.id = ${[1].indexOf(tprecurso.codigo) >= 0 ? op.idopmae : op.id} and pi.idversao = op.idversao
                            `, { type: db.Sequelize.QueryTypes.SELECT });
                            let idpedidoitem = sqlped.length > 0 ? sqlped[0].idpedidoitem : null;

                            let qtd = obj.req.body.qtd;
                            let metragem = null;
                            if ([1, 2, 3, 5].indexOf(tprecurso.codigo) >= 0) {
                                qtd = pesoliquido;
                                metragem = obj.req.body.qtd;
                            }

                            for (let i = 0; i < obj.req.body.qtdvolumes; i++) {

                                let approducaovolume = await db.getModel('pcp_approducaovolume').create({
                                    iduser: obj.req.body.iduser
                                    , pesobruto: obj.req.body.pesobruto
                                    , pesoliquido: pesoliquido
                                    , tara: obj.req.body.tara
                                    , idapproducao: approducao.id
                                    , qtd: obj.req.body.qtd
                                }, { iduser: obj.req.body.iduser });

                                let volume = await db.getModel('est_volume').create({
                                    idapproducaovolume: approducaovolume.id
                                    , idversao: op.idversao
                                    , iddeposito: sql[0].iddeposito
                                    , iduser: obj.req.body.iduser
                                    , datahora: moment()
                                    , qtd: qtd
                                    , metragem: metragem
                                    , consumido: false
                                    , qtdreal: qtd
                                }, { iduser: obj.req.body.iduser });

                                if (sql[0].idopetapa) {
                                    await db.getModel('est_volumereserva').create({
                                        idvolume: volume.id
                                        , idpedidoitem: idpedidoitem
                                        , idopetapa: sql[0].idopetapa
                                        , qtd: qtd
                                        , apontado: false
                                    });
                                }

                                if (tprecurso.codigo = 7) {
                                    let apinsumos = await db.getModel('pcp_apinsumo').findAll({ where: { idoprecurso: oprecurso.id, recipiente: null } });
                                    for (let z = 0; z < apinsumos.length; z++) {
                                        apinsumos[z].recipiente = volume.id;
                                        apinsumos[z].save({ iduser: obj.req.user.id });
                                        db.getModel('est_volumemistura').create({
                                            idvolume: volume.id
                                            , idvmistura: apinsumos[z].idvolume
                                            , qtd: apinsumos[z].qtd
                                        }, { iduser: obj.req.body.iduser });
                                    }
                                }

                                approducao.integrado = false;
                                approducao.save({ iduser: obj.req.user.id });
                            }
                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_gravarRFID: async (obj) => {
                    try {
                        if (obj.ids.length != 1) {
                            return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                        }

                        let volume = await db.getModel('est_volume').findOne({ where: { idapproducaovolume: obj.ids[0] } })

                        let needle = require('needle');
                        let req = await needle('get', 'http://172.10.30.111:8082/write/' + volume.id);
                        if (req) {
                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        } else {
                            return application.error(obj.res, { msg: 'algo deu errado' });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , apperda: {
                onsave: async function (obj, next) {
                    try {
                        obj.register.integrado = false;
                        let config = await db.getModel('pcp_config').findOne();
                        let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.register.idoprecurso } });
                        if (oprecurso.idestado == config.idestadoencerrada) {
                            return application.error(obj.res, { msg: 'Não é possível realizar apontamentos em OP encerrada' });
                        }
                        let opconjugada = await db.getModel('pcp_opconjugada').findOne({ where: { idopconjugada: oprecurso.id } });
                        if (opconjugada && opconjugada.idopprincipal != oprecurso.id) {
                            let opr = await main.platform.model.findAll('pcp_oprecurso', { where: { id: opconjugada.idopprincipal } });
                            return application.error(obj.res, { msg: 'OP Conjugada. Só é possível realizar apontamentos na OP principal ' + opr.rows[0]['op'] });
                        }
                        if (obj.register.peso <= 0) {
                            return application.error(obj.res, { msg: 'O peso deve ser maior que 0', invalidfields: ['peso'] });
                        }
                        let tipoperda = await db.getModel('pcp_tipoperda').findOne({ where: { id: obj.register.idtipoperda } });

                        if (tipoperda && [300, 322].indexOf(tipoperda.codigo) >= 0) {
                            return next(obj);
                        }
                        let qtdapinsumo = parseFloat((await db.sequelize.query('select sum(qtd) as sum from pcp_apinsumo where idoprecurso = ' + oprecurso.id, { type: db.sequelize.QueryTypes.SELECT }))[0].sum || 0);
                        let qtdapperda = parseFloat((await db.sequelize.query('select sum(app.peso) as sum from pcp_apperda app left join pcp_tipoperda tp on (app.idtipoperda = tp.id) where tp.codigo not in (300, 322) and app.id != ' + obj.register.id + ' and app.idoprecurso = ' + oprecurso.id, { type: db.sequelize.QueryTypes.SELECT }))[0].sum || 0);
                        let qtdapproducaovolume = parseFloat((await db.sequelize.query('select sum(apv.pesoliquido) as sum from pcp_approducaovolume apv left join pcp_approducao ap on (apv.idapproducao = ap.id) where ap.idoprecurso = ' + oprecurso.id, { type: db.sequelize.QueryTypes.SELECT }))[0].sum || 0);

                        if ((qtdapinsumo * 1.15) - (qtdapperda + qtdapproducaovolume + parseFloat(obj.register.peso)) < 0) {
                            // return application.error(obj.res, { msg: 'Insumos insuficientes para realizar este apontamento' });
                        }

                        main.plastrela.pcp.ap.f_corrigeEstadoOps(oprecurso.id);
                        next(obj);

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , ondelete: async function (obj, next) {
                    try {

                        let config = await db.getModel('pcp_config').findOne();
                        let apperdas = await db.getModel('pcp_apperda').findAll({ where: { id: { [db.Op.in]: obj.ids } }, include: [{ all: true }] });
                        for (let i = 0; i < apperdas.length; i++) {
                            if (apperdas[i].pcp_oprecurso.idestado == config.idestadoencerrada) {
                                return application.error(obj.res, { msg: 'Não é possível apagar apontamentos de OP encerrada' });
                            }
                        }

                        let deleted = await next(obj);
                        if (deleted.success) {
                            let gconfig = await db.getModel('config').findOne();
                            for (let i = 0; i < apperdas.length; i++) {
                                db.getModel('pcp_apintegracao').create({
                                    integrado: false
                                    , texto: '30|' + (gconfig.cnpj == '90816133000557' ? 1 : 2) + '|||||||.2.' + apperdas[i].id + '||||||'
                                });
                            }
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , apparada: {
                onsave: async function (obj, next) {
                    try {
                        obj.register.integrado = false;
                        let invalidfields = application.functions.getEmptyFields(obj.register, ['iduser', 'dataini', 'datafim', 'idmotivoparada']);
                        if (invalidfields.length > 0) {
                            return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                        }

                        let config = await db.getModel('pcp_config').findOne();
                        let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.register.idoprecurso } });
                        if (oprecurso.idestado == config.idestadoencerrada) {
                            return application.error(obj.res, { msg: 'Não é possível realizar apontamentos em OP encerrada' });
                        }
                        let opconjugada = await db.getModel('pcp_opconjugada').findOne({ where: { idopconjugada: oprecurso.id } });
                        if (opconjugada && opconjugada.idopprincipal != oprecurso.id) {
                            let opr = await main.platform.model.findAll('pcp_oprecurso', { where: { id: opconjugada.idopprincipal } });
                            return application.error(obj.res, { msg: 'OP Conjugada. Só é possível realizar apontamentos na OP principal ' + opr.rows[0]['op'] });
                        }

                        let motivoparada = await db.getModel('pcp_motivoparada').findOne({ where: { id: obj.register.idmotivoparada } });
                        if (motivoparada.complemento && !obj.req.body.complemento) {
                            return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: ['complemento'] });
                        }
                        obj.register.complemento = obj.req.body.complemento || null;

                        let dataini = moment(obj.register.dataini);
                        let datafim = moment(obj.register.datafim);
                        let duracao = datafim.diff(dataini, 'm');

                        let minutosafrente = datafim.diff(moment(), 'm');
                        if (minutosafrente > 10) {
                            return application.error(obj.res, { msg: 'Verifique o dia e a hora da data final' });
                        }
                        if (duracao <= 0) {
                            return application.error(obj.res, { msg: 'Datas incorretas, verifique' });
                        }
                        obj.register.duracao = duracao;

                        let results = await db.sequelize.query(`
                            select
                                *
                            from
                                (select
                                    'produção' as tipo
                                    , apt.dataini
                                    , apt.datafim
                                from
                                    pcp_oprecurso opr
                                left join pcp_approducao ap on (opr.id = ap.idoprecurso)
                                left join pcp_approducaotempo apt on (ap.id = apt.idapproducao)
                                where
                                    opr.idrecurso = :v1
                                union all
                                select
                                    'parada' as tipo
                                    , app.dataini
                                    , app.datafim
                                from
                                    pcp_oprecurso opr
                                left join pcp_apparada app on (opr.id = app.idoprecurso)
                                where
                                    opr.idrecurso = :v1 and app.id != :v2) as x
                            where 
                                (:v3::timestamp between dataini and datafim or :v4::timestamp between dataini and datafim) 
                                or
                                (dataini between :v3::timestamp and :v4::timestamp and datafim between :v3::timestamp and :v4::timestamp)
                            `
                            , {
                                replacements: {
                                    v1: oprecurso.idrecurso
                                    , v2: obj.register.id
                                    , v3: dataini.format()
                                    , v4: datafim.format()
                                }
                                , type: db.sequelize.QueryTypes.SELECT
                            });
                        if (results.length > 0) {
                            return application.error(obj.res, { msg: 'Existe um apontamento de ' + results[0].tipo + ' neste horário' });
                        }

                        let dataUltimoAp = moment((await main.plastrela.pcp.ap.f_dataUltimoAp(oprecurso.id)), application.formatters.be.datetime_format).add(1, 'minutes');
                        duracao = dataini.diff(dataUltimoAp, 'm');
                        if (duracao > 0) {
                            // Precisa criar tempo
                            let sql = await db.sequelize.query(`
                                select
                                    app.id
                                    , (select max(apt.datafim) from pcp_approducaotempo apt where apt.idapproducao = app.id) as max
                                    , (select count(*) from pcp_approducaovolume apv where apv.idapproducao = app.id) as qtdvolume
                                from
                                    pcp_approducao app
                                where
                                    app.idoprecurso = :v1
                                order by 2 desc
                                limit 1
                                `
                                , {
                                    replacements: {
                                        v1: oprecurso.id
                                    }
                                    , type: db.sequelize.QueryTypes.SELECT
                                });
                            if (sql.length > 0 && parseInt(sql[0].qtdvolume) == 0) {
                                await db.getModel('pcp_approducaotempo').create({
                                    idapproducao: sql[0].id
                                    , duracao: duracao
                                    , dataini: dataUltimoAp.format(application.formatters.be.datetime_format)
                                    , datafim: dataini.format(application.formatters.be.datetime_format)
                                });
                            } else {
                                let approducao = await db.getModel('pcp_approducao').create({
                                    idoprecurso: oprecurso.id
                                });

                                await db.getModel('pcp_approducaotempo').create({
                                    idapproducao: approducao.id
                                    , duracao: duracao - 1
                                    , dataini: dataUltimoAp.format(application.formatters.be.datetime_format)
                                    , datafim: dataini.add(-1, 'minutes').format(application.formatters.be.datetime_format)
                                });
                            }
                        }

                        main.plastrela.pcp.ap.f_corrigeEstadoOps(oprecurso.id);
                        let saved = await next(obj);
                        if (saved.success) {
                            db.getModel('pcp_approducao').update({ integrado: false }, { where: { idoprecurso: saved.register.idoprecurso } });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , ondelete: async function (obj, next) {
                    try {
                        let config = await db.getModel('pcp_config').findOne();
                        let apparadas = await db.getModel('pcp_apparada').findAll({ where: { id: { [db.Op.in]: obj.ids } }, include: [{ all: true }] });
                        for (let i = 0; i < apparadas.length; i++) {
                            if (apparadas[i].pcp_oprecurso.idestado == config.idestadoencerrada) {
                                return application.error(obj.res, { msg: 'Não é possível apagar apontamentos de OP encerrada' });
                            }
                        }
                        let deleted = await next(obj);
                        if (deleted.success) {
                            let gconfig = await db.getModel('config').findOne();
                            for (let i = 0; i < apparadas.length; i++) {
                                db.getModel('pcp_apintegracao').create({
                                    integrado: false
                                    , texto: '20|' + (gconfig.cnpj == '90816133000557' ? 1 : 2) + '||||||||||.3.' + apparadas[i].id
                                });
                            }
                            db.getModel('pcp_approducao').update({ integrado: false }, { where: { idoprecurso: apparadas[0].idoprecurso } });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_getComplemento: async (obj) => {
                    try {
                        let motivoparada = await db.getModel('pcp_motivoparada').findOne({ where: { id: obj.data.id } });
                        let apparada = await db.getModel('pcp_apparada').findOne({ where: { id: obj.data.idapparada } });
                        return application.success(obj.res, { data: motivoparada.complemento, current: apparada ? apparada.complemento : null });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , apinsumo: {
                __adicionarModal: function (obj) {

                    let body = '';

                    body += application.components.html.autocomplete({
                        width: 12
                        , label: 'Operador'
                        , name: 'iduser'
                        , model: 'users'
                        , attribute: 'fullname'
                        , where: 'active and code is not null'
                    });

                    let letters = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
                    body += '<div class="' + (obj.data.etapa != 10 ? 'hidden' : '') + '"><div class="col-md-6 no-padding">';
                    for (let i = 1; i <= 10; i++) {
                        if (i == 6) {
                            body += '</div><div class="col-md-6 no-padding">';
                        }
                        body += application.components.html.checkbox({
                            width: '4'
                            , name: 'recipiente' + i
                            , label: letters[i] + '/' + i
                        });
                        body += application.components.html.decimal({
                            width: '8'
                            , name: 'perc' + i
                            , placeholder: '%'
                        });
                    }
                    body += '</div></div>';

                    body += '<div class="' + (obj.data.etapa == 70 ? 'hidden' : '') + '">';
                    body += application.components.html.text({
                        width: 12
                        , label: 'Código de Barra'
                        , name: 'codigodebarra'
                    });
                    body += '</div>';
                    if (obj.data.etapa == 70) {
                        body += '<div class="col-md-12 no-padding text-center"><h3>Aguardando leitura RFID</h3></div>';
                    }

                    body += application.components.html.text({
                        width: '12'
                        , name: 'produto'
                        , label: 'Produto'
                        , disabled: 'disabled="disabled"'
                    });

                    body += application.components.html.text({
                        width: '4'
                        , name: 'idvolume'
                        , label: 'ID Volume'
                        , disabled: 'disabled="disabled"'
                    });

                    body += application.components.html.decimal({
                        width: '4'
                        , label: 'Qtd Disponível'
                        , name: 'qtdreal'
                        , precision: '4'
                        , disabled: 'disabled="disabled"'
                    });

                    body += application.components.html.decimal({
                        width: '4'
                        , label: 'Qtd para Consumir'
                        , name: 'qtd'
                        , precision: '4'
                    });

                    body += '<div class="hidden">';
                    body += application.components.html.autocomplete({
                        width: 12
                        , label: 'Insumo Substituto'
                        , name: 'idsubstituto'
                        , model: 'pcp_versao'
                        , attribute: 'descricaocompleta'
                        , where: ''
                    });
                    body += '</div>';

                    return application.success(obj.res, {
                        modal: {
                            id: 'apinsumoAdicionarModal'
                            , title: 'Apontamento de Insumo'
                            , body: body
                            , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button id="apontar" type="button" class="btn btn-primary">Apontar</button>'
                        }
                    });
                }
                , __pegarVolume: async function (obj) {
                    try {

                        if (!obj.data.codigodebarra) {
                            return application.error(obj.res, { msg: 'Informe o código de barra' });
                        }

                        switch (obj.data.codigodebarra.toLowerCase().substring(0, 1)) {
                            case '-':
                                let codigodebarra = obj.data.codigodebarra.split('-');
                                codigodebarra = parseInt(codigodebarra[codigodebarra.length - 1]);

                                let volume = await db.getModel('est_volume').findOne({ include: [{ all: true }], where: { id: codigodebarra } });
                                if (volume) {
                                    if (volume.consumido) {
                                        return application.error(obj.res, { msg: 'Volume já se encontra consumido' });
                                    } else {

                                        // let sql = await db.sequelize.query(`
                                        // select 
                                        //     c.*
                                        // from
                                        //     pcp_oprecurso opr
                                        // left join pcp_opetapa ope on (opr.idopetapa = ope.id)
                                        // left join pcp_op op on (ope.idop = op.id)
                                        // left join pcp_versao v on (op.idversao = v.id)
                                        // left join pcp_componente c on (v.idcomposicao = c.idcomposicao)
                                        // where
                                        //     opr.id = ${obj.data.idoprecurso}
                                        //     and c.idversao = ${volume.idversao}`, {
                                        //         type: db.Sequelize.QueryTypes.SELECT
                                        //     });

                                        return application.success(obj.res, {
                                            data: {
                                                id: volume.id
                                                , qtdreal: application.formatters.fe.decimal(volume.qtdreal, 4)
                                                , produto: (volume.pcp_versao ? volume.pcp_versao.descricaocompleta : volume.observacao) + (volume.lote ? ' - Lote: ' + volume.lote : '')
                                                , substituido: 1//sql.length
                                                , where: `id in (select 
                                                        c.idversao
                                                    from
                                                        pcp_oprecurso opr
                                                    left join pcp_opetapa ope on (opr.idopetapa = ope.id)
                                                    left join pcp_op op on (ope.idop = op.id)
                                                    left join pcp_versao v on (op.idversao = v.id)
                                                    left join pcp_componente c on (v.idcomposicao = c.idcomposicao)
                                                    where
                                                        opr.id = ${obj.data.idoprecurso})`
                                            }
                                        });
                                    }
                                } else {
                                    return application.error(obj.res, { msg: 'Volume não encontrado' });
                                }
                                break;

                            case '#':
                                let bc = obj.data.codigodebarra.substring(1, obj.data.codigodebarra.length).split('-');
                                let item = await db.getModel('cad_item').findOne({ where: { codigo: bc[0].split('/')[0] } })
                                if (!item) {
                                    return application.error(obj.res, { msg: 'Código de produto não encontrado' });
                                }
                                let versao = await db.getModel('pcp_versao').findOne({ where: { iditem: item.id, codigo: bc[0].split('/')[1] } });
                                if (!versao) {
                                    return application.error(obj.res, { msg: 'Versão de produto não encontrado' });
                                }
                                let volumeb = await db.getModel('est_volume').create({
                                    idversao: versao.id
                                    , iduser: obj.req.user.id
                                    , datahora: moment()
                                    , qtd: application.formatters.be.decimal(bc[1], 4)
                                    , consumido: false
                                    , qtdreal: application.formatters.be.decimal(bc[1], 4)
                                    , observacao: 'Gerada pelo Setor'
                                });
                                if (volumeb) {
                                    return application.success(obj.res, {
                                        data: {
                                            id: volumeb.id
                                            , qtdreal: application.formatters.fe.decimal(volumeb.qtdreal, 4)
                                            , produto: versao.descricaocompleta
                                        }
                                    });
                                } else {
                                    return application.error(obj.res, { msg: 'Volume com problema' });
                                }
                                break;
                            default:
                                return application.error(obj.res, { msg: 'Código de barra incorreto' });
                                break;
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , __apontarVolume: async function (obj) {
                    try {
                        let invalidfields = application.functions.getEmptyFields(obj.data, ['idoprecurso', 'idvolume', 'iduser', 'qtd']);
                        if (invalidfields.length > 0) {
                            return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                        }

                        let user = await db.getModel('users').findOne({ where: { id: obj.data.iduser } });
                        let config = await db.getModel('pcp_config').findOne();
                        let gconfig = await db.getModel('config').findOne();
                        let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.data.idoprecurso } });
                        if (!oprecurso) {
                            return application.error(obj.res, { msg: 'Volte a listagem e verifique a OP' });
                        }
                        let opetapa = await db.getModel('pcp_opetapa').findOne({ where: { id: oprecurso.idopetapa } });
                        let etapa = await db.getModel('pcp_etapa').findOne({ where: { id: opetapa.idetapa } });
                        let op = await db.getModel('pcp_op').findOne({ where: { id: opetapa.idop } });
                        let recurso = await db.getModel('pcp_recurso').findOne({ where: { id: oprecurso.idrecurso } });
                        let volume = await db.getModel('est_volume').findOne({ where: { id: obj.data.idvolume } });
                        let versao = await db.getModel('pcp_versao').findOne({ where: { id: volume.idversao } });
                        let volumereservas = await db.getModel('est_volumereserva').findAll({ where: { idvolume: volume.id } });
                        let deposito = await db.getModel('est_deposito').findOne({ where: { id: volume.iddeposito } });
                        let qtd = application.formatters.be.decimal(obj.data.qtd);
                        let qtdreal = parseFloat(volume.qtdreal);

                        // let sql = await db.sequelize.query(`
                        // select 
                        //     c.*
                        // from
                        //     pcp_oprecurso opr
                        // left join pcp_opetapa ope on (opr.idopetapa = ope.id)
                        // left join pcp_op op on (ope.idop = op.id)
                        // left join pcp_versao v on (op.idversao = v.id)
                        // left join pcp_componente c on (v.idcomposicao = c.idcomposicao)
                        // where
                        //     opr.id = ${obj.data.idoprecurso}
                        //     and c.idversao = ${volume.idversao}`, {
                        //         type: db.Sequelize.QueryTypes.SELECT
                        //     });
                        // if (sql.length <= 0 && !obj.data.idsubstituto) {
                        //     return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: ['idsubstituto'] });
                        // }

                        if (deposito && deposito.descricao == 'Almoxarifado') {
                            return application.error(obj.res, { msg: 'Não é possível consumir volumes que estão no almoxarifado' });
                        }
                        if (oprecurso.idestado == config.idestadoencerrada) {
                            return application.error(obj.res, { msg: 'Não é possível realizar apontamentos em OP encerrada' });
                        }
                        let opconjugada = await db.getModel('pcp_opconjugada').findOne({ where: { idopconjugada: oprecurso.id } });
                        if (opconjugada && opconjugada.idopprincipal != oprecurso.id) {
                            let opr = await main.platform.model.findAll('pcp_oprecurso', { where: { id: opconjugada.idopprincipal } });
                            return application.error(obj.res, { msg: 'OP Conjugada. Só é possível realizar apontamentos na OP principal ' + opr.rows[0]['op'] });
                        }
                        if (qtd <= 0) {
                            return application.error(obj.res, { msg: 'A quantidade apontada deve ser maior que 0', invalidfields: ['qtd'] });
                        }
                        if (qtd > qtdreal) {
                            return application.error(obj.res, { msg: 'Verifique a quantidade apontada', invalidfields: ['qtd'] });
                        }
                        if (!user.code) {
                            return application.error(obj.res, { msg: 'Usuário/Operador Inválido', invalidfields: ['iduser'] });
                        }

                        let alpha = ['', 'A/1', 'B/2', 'C/3', 'D/4', 'E/5', 'F/6', 'G/7', 'H/8', 'I/9', 'J/10'];
                        let selects = [];
                        let perc = 0.0;
                        for (let i = 1; i <= 10; i++) {
                            if (obj.data['recipiente' + i] == 'true') {
                                selects.push(i);
                            }
                        }
                        if (gconfig.cnpj == '90816133000557') {//RS
                            if (etapa.codigo == 10 && selects.length <= 0) {
                                return application.error(obj.res, { msg: `Selecione uma Camada` });
                            }
                        }
                        if (selects.length == 1) {
                            for (let i = 1; i <= 10; i++) {
                                obj.data['perc' + i] = '';
                            }
                            obj.data['perc' + selects[0]] = '100,00';
                        } else if (selects.length > 1) {
                            for (let i = 1; i <= 10; i++) {
                                if (obj.data['recipiente' + i] == 'true') {
                                    if (obj.data['perc' + i] == '') {
                                        return application.error(obj.res, { msg: `A Camada/Estação ${i} não possui valor` });
                                    }
                                    perc += application.formatters.be.decimal(obj.data['perc' + i]);
                                } else {
                                    obj.data['perc' + i] = '';
                                }
                            }
                            if (perc != 100) {
                                return application.error(obj.res, { msg: `Os % não fecham 100% (${perc}%)` });
                            }
                        }

                        volume.qtdreal = (qtdreal - qtd).toFixed(4);
                        if (parseFloat(volume.qtdreal) == 0) {
                            volume.consumido = true;
                        }
                        volume.iddeposito = recurso.iddepositoprodutivo;

                        if (selects.length > 0) {
                            for (let i = 0; i < selects.length; i++) {
                                await db.getModel('pcp_apinsumo').create({
                                    integrado: false
                                    , iduser: obj.data.iduser
                                    , idvolume: obj.data.idvolume
                                    , idoprecurso: obj.data.idoprecurso
                                    , datahora: moment()
                                    , qtd: (qtd * (application.formatters.be.decimal(obj.data['perc' + selects[i]]) / 100)).toFixed(4)
                                    , produto: obj.data.idvolume + ' - ' + (versao ? versao.descricaocompleta : volume.observacao || '') + (volume.lote ? ' - Lote: ' + volume.lote : '')
                                    , recipiente: alpha[selects[i]]
                                });
                            }
                        } else {
                            await db.getModel('pcp_apinsumo').create({
                                integrado: false
                                , iduser: obj.data.iduser
                                , idvolume: obj.data.idvolume
                                , idoprecurso: obj.data.idoprecurso
                                , datahora: moment()
                                , qtd: qtd
                                , produto: obj.data.idvolume + ' - ' + (versao ? versao.descricaocompleta : volume.observacao || '') + (volume.lote ? ' - Lote: ' + volume.lote : '')
                                , idsubstituto: obj.data.idsubstituto || null
                            });
                        }
                        main.plastrela.pcp.ap.f_corrigeEstadoOps(oprecurso.id);

                        await volume.save({ iduser: obj.req.user.id });

                        for (let i = 0; i < volumereservas.length; i++) {
                            if (volumereservas[i].opetapa = opetapa.id) {
                                volumereservas[i].apontado = true;
                                volumereservas[i].save({ iduser: obj.req.user.id });
                            }
                        }

                        return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , ondelete: async function (obj, next) {
                    try {
                        if (obj.ids.length != 1) {
                            return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                        }
                        let config = await db.getModel('pcp_config').findOne();
                        let apinsumos = await db.getModel('pcp_apinsumo').findAll({ where: { id: { [db.Op.in]: obj.ids } }, include: [{ all: true }] });
                        let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: apinsumos[0].idoprecurso } });
                        let opetapa = await db.getModel('pcp_opetapa').findOne({ where: { id: oprecurso.idopetapa } });
                        let op = await db.getModel('pcp_op').findOne({ where: { id: opetapa.idop } });

                        for (let i = 0; i < apinsumos.length; i++) {
                            if (apinsumos[i].pcp_oprecurso.idestado == config.idestadoencerrada) {
                                return application.error(obj.res, { msg: 'Não é possível apagar apontamentos de OP encerrada' });
                            }
                            let apretorno = await db.getModel('pcp_apretorno').findOne({ where: { idoprecurso: apinsumos[i].idoprecurso, estacao: apinsumos[i].recipiente } });
                            if (apretorno) {
                                return application.error(obj.res, { msg: 'Não é possível apagar insumos com retornos gerados sobre este recipiente' });
                            }
                        }

                        let volumes = [];
                        let volumesreservas = [];
                        for (let i = 0; i < apinsumos.length; i++) {
                            let apinsumo = apinsumos[i];
                            let volume = await db.getModel('est_volume').findOne({ where: { id: apinsumo.idvolume } });
                            let volumereservas = await db.getModel('est_volumereserva').findAll({ where: { idvolume: volume.id } });

                            // if (volume.metragem) {
                            //     volume.metragem = ((parseFloat(volume.qtdreal) + parseFloat(apinsumo.qtd)) * parseFloat(volume.metragem)) / parseFloat(volume.qtdreal).toFixed(2);
                            //     if (isNaN(volume.metragem) || isFinite(volume.metragem)) {
                            //         volume.metragem = null;
                            //     }
                            // }

                            volume.qtdreal = (parseFloat(volume.qtdreal) + parseFloat(apinsumo.qtd)).toFixed(4);
                            volume.consumido = false;
                            volumes.push(volume);
                            volumesreservas = volumesreservas.concat(volumereservas);
                        }

                        let deleted = await next(obj);
                        if (deleted.success) {
                            let gconfig = await db.getModel('config').findOne();
                            let misturas = await db.getModel('est_volumemistura').findAll({ where: { idvolume: apinsumos[0].idvolume } });
                            if (misturas.length > 0) {
                                for (let i = 0; i < misturas.length; i++) {
                                    await db.getModel('pcp_apintegracao').create({
                                        integrado: false
                                        , texto: '40|' + (gconfig.cnpj == '90816133000557' ? 1 : 2) + '|||||||||||||||.4.' + apinsumos[0].id + '-' + misturas[i].id
                                    });
                                }
                            } else {
                                await db.getModel('pcp_apintegracao').create({
                                    integrado: false
                                    , texto: '40|' + (gconfig.cnpj == '90816133000557' ? 1 : 2) + '|||||||||||||||.4.' + apinsumos[0].id
                                });
                            }

                            for (let i = 0; i < volumes.length; i++) {
                                await volumes[i].save({ iduser: obj.req.user.id });
                            }
                            for (let i = 0; i < volumesreservas.length; i++) {
                                if (volumesreservas[i].idopetapa = opetapa.id) {
                                    volumesreservas[i].apontado = false;
                                    await volumesreservas[i].save({ iduser: obj.req.user.id });
                                }
                            }
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , apretorno: {
                onsave: async function (obj, next) {
                    try {

                        if (obj.register.id == 0) {

                            let apinsumos = await db.getModel('pcp_apinsumo').findAll({
                                where: {
                                    idoprecurso: obj.register.idoprecurso
                                    , recipiente: obj.register.estacao
                                }
                            });

                            if (apinsumos.length <= 0) {
                                return application.error(obj.res, { msg: 'Esta estação não foi apontada nos insumos desta OP' });
                            } else {

                                let sum = 0;
                                for (let i = 0; i < apinsumos.length; i++) {
                                    sum += parseFloat(apinsumos[i].qtd);
                                }

                                let info = [];
                                for (let i = 0; i < apinsumos.length; i++) {
                                    let perc = parseFloat(apinsumos[i].qtd) / sum;
                                    let qtd = (parseFloat(obj.register.qtd) * perc).toFixed(4);
                                    apinsumos[i].qtd = (parseFloat(apinsumos[i].qtd) - parseFloat(qtd)).toFixed(4);
                                    info.push({ idinsumo: apinsumos[i].id, qtd: qtd })
                                    await apinsumos[i].save({ iduser: obj.req.user.id });
                                }
                                obj.register.info = JSON.stringify(info);
                            }

                            let saved = await next(obj);

                            let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.register.idoprecurso } });
                            let recurso = await db.getModel('pcp_recurso').findOne({ where: { id: oprecurso.idrecurso } });
                            let deposito = await db.getModel('est_deposito').findOne({ where: { id: recurso.iddepositoprodutivo } });

                            db.getModel('est_volume').create({
                                idapretorno: saved.register.id
                                , idversao: saved.register.idversao
                                , iddeposito: deposito.id
                                , iduser: obj.req.user.id
                                , datahora: moment()
                                , qtd: saved.register.qtd
                                , consumido: false
                                , qtdreal: saved.register.qtd
                            });
                        } else {
                            return application.error(obj.res, { msg: 'Não é permitido a edição em retornos, exclua se necessário' });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , ondelete: async function (obj, next) {
                    try {

                        if (obj.ids.length != 1) {
                            return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                        }

                        let apretorno = await db.getModel('pcp_apretorno').findOne({ where: { id: obj.ids[0] } });

                        let info = JSON.parse(apretorno.info);

                        for (let i = 0; i < info.length; i++) {
                            let apinsumo = await db.getModel('pcp_apinsumo').findOne({ where: { id: info[i].idinsumo } });
                            apinsumo.qtd = (parseFloat(apinsumo.qtd) + parseFloat(info[i].qtd)).toFixed(4);
                            await apinsumo.save({ iduser: obj.req.user.id });
                        }

                        let volume = await db.getModel('est_volume').findOne({ where: { idapretorno: obj.ids[0] } });
                        await volume.destroy();

                        next(obj);

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_imprimirEtiquetas: async function (obj) {
                    try {
                        if (obj.ids.length <= 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }
                        let ids = [];
                        let results = await db.sequelize.query('select v.id from pcp_apretorno apr left join est_volume v on (apr.id = v.idapretorno) where apr.id in (' + obj.ids.join(',') + ')', { type: db.sequelize.QueryTypes.SELECT });

                        for (let i = 0; i < results.length; i++) {
                            ids.push(results[i].id);
                        }
                        obj.ids = ids;
                        main.plastrela.estoque.est_volume._imprimirEtiqueta(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , apsobra: {
                onsave: async function (obj, next) {
                    try {

                        if (obj.register.id > 0) {
                            return application.error(obj.res, { msg: 'Não é possível editar uma sobra, apague o registro e aponte novamente' });
                        }
                        obj.register.datahora = moment();

                        let config = await db.getModel('pcp_config').findOne();
                        let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.register.idoprecurso } });
                        if (oprecurso.idestado == config.idestadoencerrada) {
                            return application.error(obj.res, { msg: 'Não é possível realizar apontamentos em OP encerrada' });
                        }
                        let opconjugada = await db.getModel('pcp_opconjugada').findOne({ where: { idopconjugada: oprecurso.id } });
                        if (opconjugada && opconjugada.idopprincipal != oprecurso.id) {
                            let opr = await main.platform.model.findAll('pcp_oprecurso', { where: { id: opconjugada.idopprincipal } });
                            return application.error(obj.res, { msg: 'OP Conjugada. Só é possível realizar apontamentos na OP principal ' + opr.rows[0]['op'] });
                        }

                        if (parseFloat(obj.register.qtd) <= 0) {
                            return application.error(obj.res, { msg: 'A quantidade apontada deve ser maior que 0', invalidfields: ['qtd'] });
                        }

                        let apinsumo = await db.getModel('pcp_apinsumo').findOne({ where: { id: obj.register.idapinsumo } });
                        if (!apinsumo) {
                            return application.error(obj.res, { msg: 'Este insumo não está mais apontado, verifique' });
                        }
                        let volume = await db.getModel('est_volume').findOne({ where: { id: apinsumo.idvolume } });

                        if (volume.metragem) {
                            volume.metragem = (((parseFloat(volume.qtdreal) + parseFloat(obj.register.qtd)) * parseFloat(volume.metragem)) / parseFloat(apinsumo.qtd)).toFixed(2);
                        }

                        apinsumo.qtd = (parseFloat(apinsumo.qtd) - parseFloat(obj.register.qtd)).toFixed(4);
                        volume.qtdreal = (parseFloat(volume.qtdreal) + parseFloat(obj.register.qtd)).toFixed(4);
                        volume.consumido = false;

                        if (parseFloat(apinsumo.qtd) < 0) {
                            return application.error(obj.res, { msg: 'Não é possível sobrar mais do que o componente' });
                        }

                        // Valida Pesos
                        // let qtdapinsumo = parseFloat((await db.sequelize.query('select sum(qtd) as sum from pcp_apinsumo where id != ' + obj.register.idapinsumo + ' and idoprecurso = ' + oprecurso.id, { type: db.sequelize.QueryTypes.SELECT }))[0].sum || 0);
                        // let qtdapperda = parseFloat((await db.sequelize.query('select sum(app.peso) as sum from pcp_apperda app left join pcp_tipoperda tp on (app.idtipoperda = tp.id) where tp.codigo not in (300, 322) and app.idoprecurso = ' + oprecurso.id, { type: db.sequelize.QueryTypes.SELECT }))[0].sum || 0);
                        // let qtdapproducaovolume = parseFloat((await db.sequelize.query('select sum(apv.pesoliquido) as sum from pcp_approducaovolume apv left join pcp_approducao ap on (apv.idapproducao = ap.id) where ap.idoprecurso = ' + oprecurso.id, { type: db.sequelize.QueryTypes.SELECT }))[0].sum || 0);
                        // if (((qtdapinsumo + parseFloat(apinsumo.qtd) - parseFloat(obj.register.qtd)) * 1.15) - (qtdapperda + qtdapproducaovolume) < 0) {
                        //     return application.error(obj.res, { msg: 'Insumos insuficientes para realizar este apontamento' });
                        // }

                        let saved = await next(obj);
                        if (saved.success) {
                            apinsumo.integrado = false;
                            apinsumo.save({ iduser: obj.req.user.id });
                            volume.save({ iduser: obj.req.user.id });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , ondelete: async function (obj, next) {
                    try {

                        let config = await db.getModel('pcp_config').findOne();
                        let apsobras = await db.getModel('pcp_apsobra').findAll({ where: { id: { [db.Op.in]: obj.ids } }, include: [{ all: true }] });

                        for (let i = 0; i < apsobras.length; i++) {
                            if (apsobras[i].pcp_oprecurso.idestado == config.idestadoencerrada) {
                                return application.error(obj.res, { msg: 'Não é possível apagar apontamentos de OP encerrada' });
                            }
                        }

                        for (let i = 0; i < apsobras.length; i++) {
                            let apinsumo = await db.getModel('pcp_apinsumo').findOne({ where: { id: apsobras[i].idapinsumo } });
                            apinsumo.qtd = (parseFloat(apinsumo.qtd) + parseFloat(apsobras[i].qtd)).toFixed(4);
                            apinsumo.integrado = false;
                            apinsumo.save({ iduser: obj.req.user.id });

                            let volume = await db.getModel('est_volume').findOne({ where: { id: apinsumo.idvolume } });

                            if (volume.metragem) {
                                volume.metragem = (((parseFloat(apinsumo.qtd)) * parseFloat(volume.metragem)) / parseFloat(apsobras[i].qtd)).toFixed(2);
                            }

                            volume.qtdreal = (parseFloat(volume.qtdreal) - parseFloat(apsobras[i].qtd)).toFixed(4);
                            if (parseFloat(volume.qtdreal) == 0) {
                                volume.consumido = true;
                            }
                            volume.save({ iduser: obj.req.user.id });
                        }

                        next(obj);

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , _imprimirEtiqueta: async function (obj) {
                    try {
                        if (obj.ids.length == 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }
                        let ids = [];
                        let results = await db.sequelize.query('select v.id from pcp_apsobra aps left join pcp_apinsumo api on (aps.idapinsumo = api.id) left join est_volume v on (api.idvolume = v.id) where aps.id in (' + obj.ids.join(',') + ')', { type: db.sequelize.QueryTypes.SELECT });

                        for (let i = 0; i < results.length; i++) {
                            ids.push(results[i].id);
                        }
                        obj.ids = ids;
                        main.plastrela.estoque.est_volume._imprimirEtiqueta(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , apmarcacaovolume: {
                onsave: async function (obj, next) {
                    try {
                        if (obj.register.id == 0) {
                            obj.register.datahora = moment();
                        }
                        next(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , apmistura: {
                e_imprimirEtiqueta: async function (obj) {
                    try {
                        if (obj.ids.length == 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }
                        let ids = [];
                        let misturas = await db.getModel('pcp_apmistura').findAll({ where: { id: { [db.Op.in]: obj.ids } } });

                        for (let i = 0; i < misturas.length; i++) {
                            if (!misturas[i].idvolume) {
                                return application.error(obj.res, { msg: 'Selecione uma mistura com volume criado para imprimir etiquetas' });
                            }
                            ids.push(misturas[i].idvolume);
                        }
                        obj.ids = ids;
                        main.plastrela.estoque.est_volume._imprimirEtiqueta(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , ondelete: async function (obj, next) {
                    try {

                        if (obj.ids.length != 1) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }

                        let mistura = await db.getModel('pcp_apmistura').findOne({ where: { id: obj.ids[0] } });
                        let volume = await db.getModel('est_volume').findOne({ where: { id: mistura.idvolume || 0 } });
                        if (mistura.idvolume) {
                            if (parseFloat(volume.qtd) - parseFloat(volume.qtdreal) != 0) {
                                return application.error(obj.res, { msg: 'Esta mistura já se encontra utilizada' });
                            }
                        }

                        let misturas = await db.getModel('pcp_apmisturavolume').findAll({ where: { idapmistura: mistura.id } });
                        let deleted = await next(obj);
                        if (deleted.success) {
                            if (volume) {
                                volume.destroy();
                                for (let i = 0; i < misturas.length; i++) {
                                    let vol = await db.getModel('est_volume').findOne({ where: { id: misturas[i].idvolume } });
                                    vol.qtdreal = (parseFloat(vol.qtdreal) + parseFloat(misturas[i].qtd)).toFixed(4);
                                    vol.consumido = false;
                                    await vol.save({ iduser: obj.req.user.id });
                                }
                            }
                        }


                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , onsave: async (obj, next) => {
                    try {
                        if (obj.register.idvolume) {
                            return application.error(obj.res, { msg: 'Não é possível modificar uma mistura finalizada' });
                        }
                        let selects = [];
                        let perc = 0.0;
                        for (let i = 1; i <= 10; i++) {
                            if (obj.register['recipiente' + i]) {
                                selects.push(i);
                            }
                        }
                        if (selects.length == 0) {
                            return application.error(obj.res, { msg: 'Selecione pelo menos uma Camada/Estação' });
                        }
                        if (selects.length == 1) {
                            for (let i = 1; i <= 10; i++) {
                                obj.register['perc' + i] = null;
                            }
                            obj.register['perc' + selects[0]] = '100.00';
                        } else {
                            for (let i = 1; i <= 10; i++) {
                                if (obj.register['recipiente' + i]) {
                                    if (!obj.register['perc' + i]) {
                                        return application.error(obj.res, { msg: `A Camada/Estação ${i} não possui valor` });
                                    }
                                    perc += parseFloat(obj.register['perc' + i]);
                                } else {
                                    obj.register['perc' + i] = null;
                                }
                            }
                            if (perc != 100) {
                                return application.error(obj.res, { msg: `Os % não fecham 100% (${perc}%)` });
                            }
                        }
                        await next(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_apontarMistura: async function (obj) {
                    try {
                        let invalidfields = application.functions.getEmptyFields(obj.data, ['idapmistura', 'idvolume', 'produto', 'qtd']);
                        if (invalidfields.length > 0) {
                            return application.error(obj.res, { invalidfields: invalidfields });
                        }

                        let mistura = await db.getModel('pcp_apmistura').findOne({ where: { id: obj.data.idapmistura } });
                        if (!mistura) {
                            return application.error(obj.res, { msg: 'Mistura não encontrada' });
                        }
                        if (mistura.idvolume) {
                            return application.error(obj.res, { msg: 'Esta mistura já foi apontada, caso deseje alterar, apague o INSUMO e a MISTURA e aponte novamente' });
                        }
                        let volume = await db.getModel('est_volume').findOne({ where: { id: obj.data.idvolume } });
                        let deposito = await db.getModel('est_deposito').findOne({ where: { id: volume.iddeposito } });
                        if (deposito && deposito.descricao == 'Almoxarifado') {
                            return application.error(obj.res, { msg: 'Não é possível consumir volumes que estão no almoxarifado' });
                        }

                        if (volume.idversao) {
                            let versao = await db.getModel('pcp_versao').findOne({ where: { id: volume.idversao } });
                            let item = await db.getModel('cad_item').findOne({ where: { id: versao.iditem } });
                            let grupo = await db.getModel('est_grupo').findOne({ where: { id: item.idgrupo } });
                            if ([
                                500 // Polietileno
                                , 501 // Pigmentos e Aditivos
                                , 506 // Peletizado
                            ].indexOf(grupo.codigo) < 0) {
                                return application.error(obj.res, { msg: 'Não é possível realizar uma mistura com este insumo' });
                            }
                        }

                        let qtd = parseFloat(application.formatters.be.decimal(obj.data.qtd, 4));
                        if (qtd <= 0) {
                            return application.error(obj.res, { msg: 'A quantidade apontada deve ser maior que 0', invalidfields: ['qtd'] });
                        }

                        await db.getModel('pcp_apmisturavolume').create({
                            idapmistura: obj.data.idapmistura
                            , idvolume: obj.data.idvolume
                            , qtd: application.formatters.be.decimal(obj.data.qtd, 4)
                            , produto: obj.data.produto
                        });

                        return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_finalizarMistura: async function (obj) {
                    try {
                        let mistura = await db.getModel('pcp_apmistura').findOne({ where: { id: obj.data.idapmistura || 0 } });
                        if (!mistura) {
                            return application.error(obj.res, { msg: 'Mistura não encontrada' });
                        }
                        if (mistura.idvolume) {
                            return application.error(obj.res, { msg: 'Mistura já finalizada' });
                        }
                        let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: mistura.idoprecurso } });
                        let recurso = await db.getModel('pcp_recurso').findOne({ where: { id: oprecurso.idrecurso } });

                        if (mistura.idvolume) {
                            return application.error(obj.res, { msg: 'Esta mistura já possui volume gerado' });
                        }
                        let volumes = await db.getModel('pcp_apmisturavolume').findAll({ include: [{ all: true }], where: { idapmistura: mistura.id } });
                        if (volumes.length <= 0) {
                            return application.error(obj.res, { msg: 'A Mistura deve conter no mínimo 1 volume' });
                        }
                        let qtdtotal = 0.0;
                        for (let i = 0; i < volumes.length; i++) {
                            let vol = await db.getModel('est_volume').findOne({ where: { id: volumes[i].idvolume } });
                            if (parseFloat(parseFloat(vol.qtdreal).toFixed(4)) < parseFloat(parseFloat(volumes[i].qtd).toFixed(4))) {
                                return application.error(obj.res, { msg: 'O volume ' + vol.id + ' possui apenas ' + application.formatters.fe.decimal(vol.qtdreal, 4) + ' - (apontado ' + application.formatters.fe.decimal(volumes[i].qtd, 4) + ')' });
                            }
                            qtdtotal += parseFloat(volumes[i].qtd);
                        }

                        let volume = await db.getModel('est_volume').create({
                            iduser: obj.req.user.id
                            , datahora: moment()
                            , qtd: qtdtotal
                            , consumido: true
                            , iddeposito: recurso.iddepositoprodutivo
                            , qtdreal: 0
                            , observacao: mistura.descricao
                        });

                        for (let i = 0; i < volumes.length; i++) {
                            if (volumes[i].est_volume.idversao) {
                                await db.getModel('est_volumemistura').create({
                                    idvolume: volume.id
                                    , idvmistura: volumes[i].idvolume
                                    , qtd: volumes[i].qtd
                                });
                            } else {
                                let misturas = await db.getModel('est_volumemistura').findAll({ include: [{ all: true }], where: { idvolume: volumes[i].idvolume } });
                                for (let z = 0; z < misturas.length; z++) {
                                    await db.getModel('est_volumemistura').create({
                                        idvolume: volume.id
                                        , idvmistura: misturas[z].idvmistura
                                        , qtd: (misturas[z].qtd / misturas[z].est_volume.qtd) * volumes[i].qtd
                                    });
                                }
                            }
                            let vol = await db.getModel('est_volume').findOne({ where: { id: volumes[i].idvolume } });
                            vol.qtdreal = (parseFloat(vol.qtdreal) - parseFloat(volumes[i].qtd)).toFixed(4);
                            if (parseFloat(vol.qtdreal) == 0) {
                                vol.consumido = true;
                            }
                            await vol.save({ iduser: obj.req.user.id });
                        }

                        mistura.idvolume = volume.id;
                        await mistura.save({ iduser: obj.req.user.id });

                        let selects = {};
                        let alpha = ['', 'A/1', 'B/2', 'C/3', 'D/4', 'E/5', 'F/6', 'G/7', 'H/8', 'I/9', 'J/10'];
                        for (let i = 1; i <= 10; i++) {
                            if (mistura['recipiente' + i]) {
                                selects[i] = mistura['perc' + i];
                            }
                        }
                        for (let k in selects) {
                            await db.getModel('pcp_apinsumo').create({
                                integrado: false
                                , iduser: mistura.iduser
                                , idvolume: volume.id
                                , idoprecurso: oprecurso.id
                                , datahora: moment()
                                , qtd: (qtdtotal * (parseFloat(selects[k]) / 100)).toFixed(4)
                                , produto: volume.id + ' - ' + volume.observacao
                                , recipiente: alpha[k]
                            });
                        }

                        return application.success(obj.res, { msg: application.message.success, historyBack: true });

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , apmisturavolume: {
                ondelete: async function (obj, next) {
                    try {

                        if (obj.ids.length != 1) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }

                        let misturavolume = await db.getModel('pcp_apmisturavolume').findOne({ where: { id: obj.ids[0] } });
                        let mistura = await db.getModel('pcp_apmistura').findOne({ where: { id: misturavolume.idapmistura } });
                        if (mistura.idvolume) {
                            return application.error(obj.res, { msg: 'Esta mistura já foi finalizada' });
                        }

                        await next(obj);

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , oprecurso: {
                onsave: async function (obj, next) {
                    if (obj.id == 0) {
                        let config = await db.getModel('pcp_config').findOne();
                        if (config && config.idestadoinicial) {
                            obj.register.idestado = config.idestadoinicial;
                            next(obj);
                        } else {
                            return application.error(obj.res, { msg: 'Falta configuração em: Estado Inicial da OP' });
                        }
                    } else {

                        let apparada = await db.getModel('pcp_apparada').findOne({ where: { idoprecurso: obj.register.id } });
                        if (obj.register.idrecurso != obj.register._previousDataValues.idrecurso && apparada) {
                            return application.error(obj.res, { msg: 'Não é possível alterar a máquina de uma OP com apontamentos' });
                        }

                        next(obj);
                    }
                }
                , js_encerrar: async function (obj) {
                    try {
                        let config = await db.getModel('pcp_config').findOne();
                        let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.data.idoprecurso } });
                        if (oprecurso.idestado == config.idestadoencerrada) {
                            return application.error(obj.res, { msg: 'OP já se encontra encerrada' });
                        }
                        let opetapa = await db.getModel('pcp_opetapa').findOne({ where: { id: oprecurso.idopetapa } });
                        let etapa = await db.getModel('pcp_etapa').findOne({ where: { id: opetapa.idetapa } });
                        let tprecurso = await db.getModel('pcp_tprecurso').findOne({ where: { id: etapa.idtprecurso } });

                        // if (etapa.codigo == 10) {
                        //     let api = await db.getModel('pcp_apinsumo').findAll({ where: { idoprecurso: oprecurso.id, recipiente: null } });
                        //     if (api.length > 0) {
                        //         return application.error(obj.res, { msg: 'OPs na extrusão devem ser feito o rateio/apontadas na camada antes de serem encerradas' });
                        //     }
                        // }

                        let apps = await db.getModel('pcp_approducao').findAll({ where: { idoprecurso: oprecurso.id } });
                        for (let i = 0; i < apps.length; i++) {
                            let appt = await db.getModel('pcp_approducaotempo').findOne({ where: { idapproducao: apps[i].id } });
                            let appv = await db.getModel('pcp_approducaovolume').findOne({ where: { idapproducao: apps[i].id } });
                            if (!appt && !appv) {
                                await apps[i].destroy();
                            }
                        }
                        apps = await db.getModel('pcp_approducao').findAll({ where: { idoprecurso: oprecurso.id } });
                        for (let i = 0; i < apps.length; i++) {
                            let appt = await db.getModel('pcp_approducaotempo').findOne({ where: { idapproducao: apps[i].id } });
                            let appv = await db.getModel('pcp_approducaovolume').findOne({ where: { idapproducao: apps[i].id } });
                            if (!appt || !appv) {
                                return application.error(obj.res, { msg: 'Existe uma produção sem tempo ou volume apontado, verifique' });
                            }
                        }

                        let qtdapinsumo = parseFloat((await db.sequelize.query('select sum(qtd) as sum from pcp_apinsumo where idoprecurso = ' + oprecurso.id, { type: db.sequelize.QueryTypes.SELECT }))[0].sum || 0);
                        let qtdapperda = parseFloat((await db.sequelize.query('select sum(app.peso) as sum from pcp_apperda app left join pcp_tipoperda tp on (app.idtipoperda = tp.id) where tp.codigo not in (300, 322) and app.idoprecurso = ' + oprecurso.id, { type: db.sequelize.QueryTypes.SELECT }))[0].sum || 0);
                        let qtdapproducaovolume = parseFloat((await db.sequelize.query('select sum(apv.pesoliquido) as sum from pcp_approducaovolume apv left join pcp_approducao ap on (apv.idapproducao = ap.id) where ap.idoprecurso =' + oprecurso.id, { type: db.sequelize.QueryTypes.SELECT }))[0].sum || 0);

                        if (qtdapinsumo > 0) {
                            let dif = Math.trunc(100 - (((qtdapproducaovolume + qtdapperda) / qtdapinsumo) * 100));

                            if (etapa.tol_min != null) {
                                if (dif > etapa.tol_min) {
                                    return application.error(obj.res, { msg: 'Os apontamentos possuem diferença de ' + dif + '% a menos' });
                                }
                            }
                            dif = Math.abs(dif);
                            if (etapa.tol_max != null) {
                                if (dif > etapa.tol_max) {
                                    return application.error(obj.res, { msg: 'Os apontamentos possuem diferença de ' + dif + '% a mais' });
                                }
                            }
                        } else {
                            return application.error(obj.res, { msg: 'Nâo é possível encerrar uma OP sem insumos' });
                        }

                        if (tprecurso.codigo == 2) { // Impressão
                            let apcliche = await db.getModel('pcp_apcliche').findOne({ where: { idoprecurso: oprecurso.id } });
                            if (!apcliche) {
                                return application.error(obj.res, { msg: 'Não é possível encerrar uma OP de Impressão sem clichês montados' });
                            }
                            let montagens = await db.getModel('pcp_apclichemontagem').findAll({ where: { idapcliche: apcliche.id }, order: [['estacao', 'asc']] });
                            if (montagens.length <= 0) {
                                return application.error(obj.res, { msg: 'Não é possível encerrar uma OP de Impressão sem clichês montados' });
                            }
                            let config = await db.getModel('config').findOne();
                            let msg = [];
                            for (let i = 0; i < montagens.length; i++) {
                                if (!montagens[i].idanilox) {
                                    msg.push('Anilox');
                                }
                                if (!montagens[i].viscosidade) {
                                    msg.push('Viscosidade');
                                }
                                let secagem = await db.getModel('pcp_apclichemontsecagem').findOne({ where: { idapclichemontagem: montagens[i].id } });
                                if (!secagem) {
                                    msg.push('Medição de Secagem');
                                }
                                if (config.cnpj == "90816133000123") {//MS
                                    if (!montagens[i].optinta) {
                                        msg.push('OP de Tinta');
                                    }
                                    if (!montagens[i].consumotinta) {
                                        msg.push('Consumo de Tinta');
                                    }
                                }
                                if (msg.length > 0) {
                                    return application.error(obj.res, { msg: `Campos obrigatórios na Estação ${montagens[i].estacao} não preenchidos: ` + msg.join(', ') });
                                }
                            }
                            if (!Number.isInteger(parseInt(oprecurso.qtdlavagens))) {
                                return application.error(obj.res, { msg: 'Favor informar a Quantidade de Lavagens e salvar antes do encerramento da OP' });
                            }
                        }

                        //Conferência
                        let sql = await db.sequelize.query(`
                        select
                            *
                        from
                            (select
                                ac.descricao as atributo
                                , g.description as grupo
                                , acg.qtdpessoas
                                , (select
                                    count(*)
                                from
                                    pcp_oprecursoconferencia oprc
                                left join users u on (oprc.iduser = u.id)
                                where oprc.idoprecurso = ${oprecurso.id}
                                and u.idgroupusers = acg.idgroupusers
                                and oprc.idatributoconferencia = ac.id) as qtd
                            from
                                pcp_atributoconferencia ac
                            inner join pcp_atributoconferenciagrupo acg on (ac.id = acg.idatributoconferencia)
                            left join groupusers g on (acg.idgroupusers = g.id)
                            where
                                ac.idtprecurso = ${etapa.idtprecurso}) as x
                        where
                            qtd < qtdpessoas
                        `
                            , { type: db.Sequelize.QueryTypes.SELECT });
                        if (sql.length > 0) {
                            let body = `
                            <div class="col-md-12">
                                <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                                    <tr>
                                        <td style="text-align:center;"><strong>Atributo</strong></td>
                                        <td style="text-align:center;"><strong>Setor</strong></td>
                                        <td style="text-align:center;"><strong>Quantidade de pessoas à conferir</strong></td>
                                    </tr>
                            `;
                            for (let i = 0; i < sql.length; i++) {
                                body += `
                                <tr>
                                    <td style="text-align:left;"> ${sql[i].atributo}   </td>
                                    <td style="text-align:left;">  ${sql[i].grupo}   </td>
                                    <td style="text-align:center;">   ${parseInt(sql[i].qtdpessoas) - parseInt(sql[i].qtd)}   </td>
                                </tr>
                            `;
                            }
                            body += `
                                </table>
                            </div>
                            `;

                            return application.success(obj.res, {
                                modal: {
                                    id: 'modalevtg'
                                    , title: 'Atributos que necessitam de conferência'
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Voltar</button>'
                                }
                            });
                        }

                        oprecurso.idestado = config.idestadoencerrada;
                        oprecurso.integrado = 'P';
                        await oprecurso.save({ iduser: obj.req.user.id });

                        return application.success(obj.res, { msg: application.message.success, redirect: '/v/apontamento_de_producao' });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_totalperda: async function (obj) {
                    try {
                        let sql = await db.sequelize.query(`
                        select
                            sum(p.peso) as soma
                            , count(*) as qtd
                        from
                            pcp_apperda p
                        left join pcp_tipoperda tp on (p.idtipoperda = tp.id)
                        where
                            idoprecurso = :v1
                            and tp.codigo not in (300, 322)
                      `, { type: db.sequelize.QueryTypes.SELECT, replacements: { v1: obj.data.idoprecurso } });
                        if (sql.length > 0 && sql[0].soma) {
                            return application.success(obj.res, { qtd: sql[0].qtd, peso: application.formatters.fe.decimal(sql[0].soma, 4) });
                        } else {
                            return application.success(obj.res, { qtd: 0, peso: '0,0000' });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_totalparada: async function (obj) {
                    try {
                        let sql = await db.sequelize.query(`
                        select
                            sum(p.duracao) as soma
                            , count(*) as qtd
                        from
                            pcp_apparada p
                        where
                            p.idoprecurso = :v1
                      `, { type: db.sequelize.QueryTypes.SELECT, replacements: { v1: obj.data.idoprecurso } });

                        if (sql.length > 0 && sql[0].soma) {
                            return application.success(obj.res, { qtd: sql[0].qtd, duracao: application.formatters.fe.time(sql[0].soma) });
                        } else {
                            return application.success(obj.res, { qtd: 0, duracao: '0:00' });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_totalinsumo: async function (obj) {
                    try {
                        let sql = await db.sequelize.query(`
                        select
                            sum(i.qtd) as soma
                            , count(*) as qtd
                        from
                            pcp_apinsumo i
                        where
                            i.idoprecurso = :v1
                      `, { type: db.sequelize.QueryTypes.SELECT, replacements: { v1: obj.data.idoprecurso } });

                        if (sql.length > 0 && sql[0].soma) {
                            return application.success(obj.res, { volumes: sql[0].qtd, qtd: application.formatters.fe.decimal(sql[0].soma, 4) });
                        } else {
                            return application.success(obj.res, { volumes: 0, qtd: '0,0000' });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_totalproducao: async function (obj) {
                    try {
                        let sql = await db.sequelize.query(`
                        select
                            sum((select count(*) from pcp_approducaovolume apv where apv.idapproducao = ap.id)) as volumes
                            , sum((select sum(apv.qtd) from pcp_approducaovolume apv where apv.idapproducao = ap.id)) as qtd
                            , sum((select sum(apv.pesoliquido) from pcp_approducaovolume apv where apv.idapproducao = ap.id)) as peso
                        from
                            pcp_approducao ap
                        where
                            ap.idoprecurso = :v1
                      `, { type: db.sequelize.QueryTypes.SELECT, replacements: { v1: obj.data.idoprecurso } });
                        if (sql.length > 0 && sql[0].qtd) {
                            return application.success(obj.res, { volumes: sql[0].volumes, qtd: application.formatters.fe.decimal(sql[0].qtd, 4), peso: application.formatters.fe.decimal(sql[0].peso, 4) });
                        } else {
                            return application.success(obj.res, { volumes: 0, qtd: '0,0000', peso: '0,0000' });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_indicadores: async function (obj) {
                    try {
                        let sql = await db.sequelize.query(`
                        select
                            *
                            , (select sum(case when x.codigo = 1 then apv.pesoliquido else apv.qtd end) from pcp_approducao ap left join pcp_approducaovolume apv on (apv.idapproducao = ap.id) where ap.idoprecurso = x.idoprecurso) 
                            / ( coalesce((select sum(extract(epoch from ap.datafim - ap.dataini) / 60) from pcp_apparada ap where ap.idoprecurso = x.idoprecurso and ap.dataini > x.datainiproducao), 0)
                            + (select sum(extract(epoch from apt.datafim - apt.dataini) / 60) from pcp_approducao ap left join pcp_approducaotempo apt on (ap.id = apt.idapproducao) where ap.idoprecurso = x.idoprecurso)) 
                            * case when x.codigo = 1 then 60 else 1 end as efetiva
                        from
                            (select
                                opr.id as idoprecurso
                                , tpr.codigo
                                , (select min(apt.dataini) from pcp_approducao ap left join pcp_approducaotempo apt on (apt.idapproducao = ap.id) where ap.idoprecurso = opr.id) as datainiproducao
                            from
                                pcp_oprecurso opr
                            left join pcp_opetapa ope on (opr.idopetapa = ope.id)
                            left join pcp_etapa e on (ope.idetapa = e.id)
                            left join pcp_tprecurso tpr on (e.idtprecurso = tpr.id)
                            where
                                opr.id = :v1) as x
                      `, { type: db.sequelize.QueryTypes.SELECT, replacements: { v1: obj.data.idoprecurso } });
                        if (sql.length > 0 && sql[0].efetiva) {
                            return application.success(obj.res, { efetiva: application.formatters.fe.decimal(sql[0].efetiva, 2) });
                        } else {
                            return application.success(obj.res, { efetiva: '0,00' });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_retornarProducao: async function (obj) {
                    try {

                        if (obj.ids.length != 1) {
                            return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                        }

                        let config = await db.getModel('pcp_config').findOne();

                        await db.getModel('pcp_oprecurso').update({ idestado: config.idestadoinicial }
                            , { where: { id: obj.ids[0] }, iduser: obj.req.user.id });

                        let opr = (await main.platform.model.findAll('pcp_oprecurso', { where: { id: obj.ids[0] } })).rows[0];

                        application.success(obj.res, { msg: application.message.success, reloadtables: true });

                        let setor = await db.getModel('cad_setor').findOne({ where: { descricao: 'PCP (Apontamento)' } });
                        if (setor) {
                            let usuarios = await db.getModel('cad_setorusuario').findAll({ where: { idsetor: setor.id } });
                            let arr = [];
                            for (let i = 0; i < usuarios.length; i++) {
                                arr.push(usuarios[i].idusuario);
                            }
                            main.platform.notification.create(arr, {
                                title: `Retorno de OP para Produção`
                                , description: `OP ${opr.op}/${opr.etapa}`
                                , link: `/v/apontamento_de_producao/${opr.id}`
                            });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_resumoProducao: async function (obj) {
                    try {

                        let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.data.idoprecurso || 0 } })
                        if (!oprecurso) {
                            return application.error(obj.res, { msg: 'OP não encontrada' });
                        }
                        let recurso = await db.getModel('pcp_recurso').findOne({ where: { id: oprecurso.idrecurso } })
                        let opetapa = await db.getModel('pcp_opetapa').findOne({ where: { id: oprecurso.idopetapa } });
                        let etapa = await db.getModel('pcp_etapa').findOne({ where: { id: opetapa.idetapa } });
                        let op = await db.getModel('pcp_op').findOne({ where: { id: opetapa.idop } });
                        let versao = await db.getModel('pcp_versao').findOne({ where: { id: op.idversao } });
                        let opep = await db.getModel('pcp_opep').findOne({ where: { idop: op.id } });
                        let pedido = await db.getModel('ven_pedido').findOne({ where: { id: opep ? opep.idpedido : 0 } });

                        let report = {};
                        report.__title = `Resumo OP ${op.codigo}`;
                        report.pedido = pedido ? pedido.codigo : '';
                        report.produto = versao.descricaocompleta;
                        report.etapa = etapa.codigo;
                        report.recurso = recurso.codigo;

                        let sql = await db.sequelize.query(`
                        select
                            (select count(*) from pcp_approducao ap inner join pcp_approducaovolume apv on (ap.id = apv.idapproducao) where ap.idoprecurso = opr.id) as producaoqtdvolumes
                            , (select coalesce(sum(apv.pesoliquido), 0) from pcp_approducao ap inner join pcp_approducaovolume apv on (ap.id = apv.idapproducao) where ap.idoprecurso = opr.id) as producaopeso
                            , (select coalesce(sum(apt.duracao), 0) from pcp_approducao ap inner join pcp_approducaotempo apt on (ap.id = apt.idapproducao) where ap.idoprecurso = opr.id) as producaotempo
                            , (select count(*) from pcp_apperda ap where ap.idoprecurso = opr.id) as perdaqtd
                            , (select coalesce(sum(ap.peso), 0) from pcp_apperda ap where ap.idoprecurso = opr.id) as perdapeso
                            , (select coalesce(sum(ap.duracao), 0) from pcp_apparada ap where ap.idoprecurso = opr.id) as paradatempo    
                        from
                            pcp_oprecurso opr
                        where
                            opr.id = :idoprecurso
                        `
                            , {
                                type: db.Sequelize.QueryTypes.SELECT
                                , replacements: {
                                    idoprecurso: oprecurso.id
                                }
                            });

                        if (sql.length <= 0) {
                            return application.error(obj.res, { msg: 'Ordem de Produção ainda não possui dados para montar o resumo' });
                        }
                        report.volume_qtd = sql[0].producaoqtdvolumes;
                        report.volume_peso = application.formatters.fe.decimal(sql[0].producaopeso, 4);
                        report.perda_qtd = sql[0].perdaqtd;
                        report.perda_peso = application.formatters.fe.decimal(sql[0].perdapeso, 4);
                        report.producao_tempo = application.formatters.fe.time(sql[0].producaotempo);
                        report.parada_tempo = application.formatters.fe.time(sql[0].paradatempo);
                        report.insumo_qtd = (await db.getModel('pcp_apinsumo').sum('qtd', { where: { idoprecurso: oprecurso.id } }) || 0);

                        sql = await db.sequelize.query(`
                            select
                                api.recipiente
                                , sum(api.qtd) as total
                            from
                                pcp_oprecurso opr
                            left join pcp_apinsumo api on (api.idoprecurso = opr.id)
                            where
                                opr.id = :idoprecurso
                            group by 1
                            order by 1
                            `
                            , {
                                type: db.Sequelize.QueryTypes.SELECT
                                , replacements: {
                                    idoprecurso: oprecurso.id
                                }
                            });

                        report.table_insumo = '<table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">';
                        for (let i = 0; i < sql.length; i++) {
                            report.table_insumo += `
                                <tr>
                                    <td style="text-align:center;"><strong>Recipiente</strong></td>
                                    <td style="text-align:center;"><strong>${sql[i]['recipiente']}</strong></td>
                                    <td style="text-align:right;"><strong>${application.formatters.fe.decimal(sql[i]['total'], 4)} KG</strong></td>
                                    <td style="text-align:right;"><strong>${application.formatters.fe.decimal((sql[i]['total'] / report.insumo_qtd) * 100, 2)}%</strong></td>
                                </tr>
                                `;

                            let sql2 = await db.sequelize.query(

                                `
                                select descricao, qtd from (select
                                    coalesce(v.descricaocompleta, vol.observacao, 'Mistura') as descricao
                                    , sum(round(api.qtd * (volm.qtd / vol.qtd), 4)) as qtd
                                from
                                    pcp_oprecurso opr
                                left join pcp_apinsumo api on (api.idoprecurso = opr.id)
                                left join est_volume vol on (api.idvolume = vol.id)
                                left join est_volumemistura volm on (vol.id = volm.idvolume)
                                left join est_volume volmv on (volm.idvmistura = volmv.id)
                                left join pcp_versao v on (volmv.idversao = v.id)
                                where
                                    opr.id = :idoprecurso
                                    and vol.idversao is null
                                    and api.recipiente = :recipiente
                                group by 1
                                
                                
                                union all

                                select
                                    i.descricao
                                    , sum(api.qtd) as qtd
                                from
                                    pcp_oprecurso opr
                                left join pcp_apinsumo api on (api.idoprecurso = opr.id)
                                left join est_volume vol on (api.idvolume = vol.id)
                                inner join pcp_versao v on (vol.idversao = v.id)
                                left join cad_item i on (v.iditem = i.id)
                                where
                                    opr.id = :idoprecurso
                                    and api.recipiente = :recipiente
                                group by 1
                                ) as x
                                order by 1
                                `
                                , {
                                    type: db.Sequelize.QueryTypes.SELECT
                                    , replacements: {
                                        idoprecurso: oprecurso.id
                                        , recipiente: sql[i]['recipiente']
                                    }
                                });
                            for (let z = 0; z < sql2.length; z++) {
                                report.table_insumo += `
                                <tr>
                                    <td></td>
                                    <td style="text-align:left;">${sql2[z]['descricao']}</td>
                                    <td style="text-align:right;">${application.formatters.fe.decimal(sql2[z]['qtd'], 4)} KG</td>
                                    <td style="text-align:right;">${application.formatters.fe.decimal((sql2[z]['qtd'] / sql[i]['total']) * 100, 2)}%</td>
                                </tr>
                                `;
                            }
                        }
                        report.table_insumo += `
                            <tr>
                                <td></td>
                                <td></td>
                                <td style="text-align:right;"><strong>${application.formatters.fe.decimal(report.insumo_qtd, 4)} KG</strong></td>
                                <td></td>
                            </tr>
                        </table>
                        `;

                        let filename = await main.platform.report.f_generate('PCP - Resumo Produção OP', report);
                        return application.success(obj.res, {
                            openurl: '/download/' + filename
                        });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_duplicarOP: async (obj) => {
                    try {
                        if (obj.req.method == 'GET') {
                            if (obj.ids.length != 1) {
                                return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                            }
                            let body = '';
                            body += application.components.html.hidden({ name: 'id', value: obj.ids[0] });
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'Recurso'
                                , name: 'idrecurso'
                                , model: 'pcp_recurso'
                                , attribute: 'codigo'
                            });
                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt' + obj.event.id
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Confirmar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['id', 'idrecurso']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }
                            let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.req.body.id } });
                            let opnova = oprecurso.dataValues;
                            delete opnova['id'];
                            opnova.integrado = null;
                            opnova.qtdlavagens = null;
                            opnova.idestado = 1;
                            opnova.idrecurso = obj.req.body.idrecurso;
                            let opr = await db.getModel('pcp_oprecurso').create(opnova);
                            let apcliche = await db.getModel('pcp_apcliche').findOne({ where: { idoprecurso: obj.req.body.id } });
                            if (apcliche) {
                                let apc = await db.getModel('pcp_apcliche').create({
                                    idoprecurso: opr.id
                                    , datahora: apcliche.datahora
                                    , idrecurso: apcliche.idrecurso
                                    , passo: apcliche.passo
                                });
                                let montagens = await db.getModel('pcp_apclichemontagem').findAll({ where: { idapcliche: apcliche.id } });
                                for (let i = 0; i < montagens.length; i++) {
                                    let apcm = await db.getModel('pcp_apclichemontagem').create({
                                        idapcliche: apc.id
                                        , cliche: montagens[i].cliche
                                        , estacao: montagens[i].estacao
                                        , idversao: montagens[i].idversao
                                        , observacao: montagens[i].observacao
                                        , idcamisa: montagens[i].idcamisa
                                        , camerondistancia: montagens[i].camerondistancia
                                        , idanilox: montagens[i].idanilox
                                        , viscosidade: montagens[i].viscosidade
                                    });
                                    let secagem = await db.getModel('pcp_apclichemontsecagem').findOne({ where: { idapclichemontagem: montagens[i].id }, order: [['datahora', 'desc']] });
                                    if (secagem) {
                                        await db.getModel('pcp_apclichemontagem').create({
                                            datahora: secagem.datahora
                                            , idapclichemontagem: apcm.id
                                            , observacao: secagem.observacao
                                            , retardador: secagem.retardador
                                            , secagem: secagem.secagem
                                            , temperatura: secagem.temperatura
                                            , umidade: secagem.umidade
                                        });
                                    }
                                }
                            }
                            let conferencias = await db.getModel('pcp_oprecursoconferencia').findAll({ where: { idoprecurso: oprecurso.id } })
                            for (let i = 0; i < conferencias.length; i++) {
                                await db.getModel('pcp_oprecursoconferencia').create({
                                    idoprecurso: opr.id
                                    , datahora: conferencias[i].datahora
                                    , idatributoconferencia: conferencias[i].idatributoconferencia
                                    , iduser: conferencias[i].iduser
                                    , observacao: conferencias[i].observacao
                                    , resultado: conferencias[i].resultado
                                });
                            }
                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_carregarMontagem: async (obj) => {
                    try {
                        if (obj.req.method == 'GET') {
                            let apcliche = await db.getModel('pcp_apcliche').findOne({ where: { idoprecurso: obj.id } });
                            if (apcliche) {
                                return application.error(obj.res, { msg: 'Este apontamento já possui montagem de clichê' });
                            }
                            let body = '';
                            body += application.components.html.hidden({ name: 'id', value: obj.id });
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'OP'
                                , name: 'idoprecurso'
                                , model: 'pcp_oprecurso'
                                , query: `(select op.codigo::text from pcp_opetapa ope left join pcp_etapa e on (ope.idetapa = e.id) left join pcp_op op on (ope.idop = op.id) where ope.id = pcp_oprecurso.idopetapa)`
                                , where: `(select tpr.codigo from pcp_opetapa ope left join pcp_etapa e on (ope.idetapa = e.id) left join pcp_tprecurso tpr on (e.idtprecurso = tpr.id) where ope.id = pcp_oprecurso.idopetapa) = 2`
                            });
                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt' + obj.event.id
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Confirmar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['id', 'idoprecurso']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidfields, invalidfields: invalidfields });
                            }
                            let opr = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.req.body.id } });
                            let apcliche = await db.getModel('pcp_apcliche').findOne({ where: { idoprecurso: obj.req.body.idoprecurso } });
                            if (apcliche) {
                                let apc = await db.getModel('pcp_apcliche').create({
                                    idoprecurso: opr.id
                                    , datahora: apcliche.datahora
                                    , idrecurso: apcliche.idrecurso
                                    , passo: apcliche.passo
                                });
                                let montagens = await db.getModel('pcp_apclichemontagem').findAll({ where: { idapcliche: apcliche.id } });
                                for (let i = 0; i < montagens.length; i++) {
                                    let apcm = await db.getModel('pcp_apclichemontagem').create({
                                        idapcliche: apc.id
                                        , cliche: montagens[i].cliche
                                        , estacao: montagens[i].estacao
                                        , idversao: montagens[i].idversao
                                        , observacao: montagens[i].observacao
                                        , idcamisa: montagens[i].idcamisa
                                        , camerondistancia: montagens[i].camerondistancia
                                        , idanilox: montagens[i].idanilox
                                        , viscosidade: montagens[i].viscosidade
                                    });
                                    let secagem = await db.getModel('pcp_apclichemontsecagem').findOne({ where: { idapclichemontagem: montagens[i].id }, order: [['datahora', 'desc']] });
                                    if (secagem) {
                                        await db.getModel('pcp_apclichemontagem').create({
                                            datahora: secagem.datahora
                                            , idapclichemontagem: apcm.id
                                            , observacao: secagem.observacao
                                            , retardador: secagem.retardador
                                            , secagem: secagem.secagem
                                            , temperatura: secagem.temperatura
                                            , umidade: secagem.umidade
                                        });
                                    }
                                }
                            }
                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_chamarColoristaModal: async (obj) => {
                    try {
                        let body = '';
                        body += application.components.html.hidden({ name: 'name', value: 'plastrela.pcp.oprecurso.js_chamarColorista' });
                        body += application.components.html.hidden({ name: 'idoprecurso', value: obj.data.idoprecurso });
                        body += application.components.html.radio({
                            width: '12'
                            , label: 'Motivo'
                            , name: 'motivo'
                            , options: [
                                'Fazer secagem'
                                , 'Ajuste de cor'
                                , 'Acerto de cor'
                                , 'Reposição'
                                , 'Reposição (Branco)'
                                , 'Reposição (Amarelo)'
                                , 'Reposição (Magenta)'
                                , 'Reposição (Cyan)'
                                , 'Reposição (Preto)'
                                , 'Reposição (Verniz)'
                                , 'Pré-Setup próximo pedido'
                                , 'Colorista comparecer na máquina'
                            ]
                        });
                        return application.success(obj.res, {
                            modal: {
                                form: true
                                , action: '/jsfunction'
                                , id: 'modaljs'
                                , title: 'Chamar Colorista'
                                , body: body
                                , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Confirmar</button>'
                            }
                        });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_chamarColorista: async (obj) => {
                    try {
                        let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.req.body.idoprecurso } });
                        let recurso = await db.getModel('pcp_recurso').findOne({ where: { id: oprecurso.idrecurso } });
                        let opetapa = await db.getModel('pcp_opetapa').findOne({ where: { id: oprecurso.idopetapa } });
                        let op = await db.getModel('pcp_op').findOne({ where: { id: opetapa.idop } });
                        main.platform.notification.create([2744], {
                            title: obj.req.body.motivo
                            , description: recurso.codigo + ' / ' + op.codigo
                        });
                        return application.success(obj.res, { msg: application.message.success });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_chamarCQModal: async (obj) => {
                    try {
                        let body = '';
                        body += application.components.html.hidden({ name: 'name', value: 'plastrela.pcp.oprecurso.js_chamarCQ' });
                        body += application.components.html.hidden({ name: 'idoprecurso', value: obj.data.idoprecurso });
                        body += application.components.html.radio({
                            width: '12'
                            , label: 'Motivo'
                            , name: 'motivo'
                            , options: [
                                'Comparecer em Máquina'
                            ]
                        });
                        return application.success(obj.res, {
                            modal: {
                                form: true
                                , action: '/jsfunction'
                                , id: 'modaljs'
                                , title: 'Chamar CQ'
                                , body: body
                                , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Confirmar</button>'
                            }
                        });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_chamarCQ: async (obj) => {
                    try {
                        let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.req.body.idoprecurso } });
                        let recurso = await db.getModel('pcp_recurso').findOne({ where: { id: oprecurso.idrecurso } });
                        let opetapa = await db.getModel('pcp_opetapa').findOne({ where: { id: oprecurso.idopetapa } });
                        let op = await db.getModel('pcp_op').findOne({ where: { id: opetapa.idop } });
                        main.platform.notification.create([2750], {
                            title: obj.req.body.motivo
                            , description: recurso.codigo + ' / ' + op.codigo
                        });
                        return application.success(obj.res, { msg: application.message.success });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_conjugarOP: async (obj) => {
                    try {
                        if (obj.req.method == 'GET') {
                            if (obj.ids.length < 2) {
                                return application.error(obj.res, { msg: 'Selecione pelo menos 2 OPs para conjugar' });
                            }
                            let body = '';
                            body += application.components.html.hidden({ name: 'ids', value: obj.ids.join(',') });
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'OP Principal'
                                , name: 'idopprincipal'
                                , model: 'pcp_oprecurso'
                                , query: '(select op.codigo::text || \'/\' || e.codigo from pcp_opetapa ope left join pcp_etapa e on (ope.idetapa = e.id) left join pcp_op op on (ope.idop = op.id) where ope.id = pcp_oprecurso.idopetapa)'
                                , where: 'id in (' + obj.ids.join(',') + ')'
                            });
                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt'
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Confirmar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['ids', 'idopprincipal']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }
                            let ids = obj.req.body.ids.split(',');
                            await db.getModel('pcp_opconjugada').destroy({ where: { idopprincipal: obj.req.body.idopprincipal } });
                            //Conjugação
                            for (let i = 0; i < ids.length; i++) {
                                await db.getModel('pcp_opconjugada').create({
                                    idopprincipal: obj.req.body.idopprincipal
                                    , idopconjugada: ids[i]
                                });
                                await db.getModel('pcp_apcliche').update({ idoprecurso: obj.req.body.idopprincipal }, { where: { idoprecurso: ids[i] } });
                            }
                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_montagemCliche: async (obj) => {
                    try {
                        if (obj.req.method == 'GET') {
                            if (obj.ids.length != 1) {
                                return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                            }
                            let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.ids[0] } });
                            let opetapa = await db.getModel('pcp_opetapa').findOne({ where: { id: oprecurso ? oprecurso.idopetapa : 0 } });
                            let etapa = await db.getModel('pcp_etapa').findOne({ where: { id: opetapa ? opetapa.idetapa : 0 }, include: [{ all: true }] });

                            if (etapa.pcp_tprecurso.codigo != 2) {
                                return application.error(obj.res, { msg: "Só é permitido montagem de clichê para OPs de impressão" });
                            }
                            if (oprecurso.idestado == 2 || oprecurso.idestado == 7) {
                                return application.error(obj.res, { msg: "Não é permitido montagem de clichê para OPs que não estão em produção" });
                            }
                            let checkCliche = await db.getModel('pcp_apcliche').findOne({ where: { idoprecurso: obj.ids[0] } });
                            if (checkCliche) {
                                return application.success(obj.res, { redirect: "/v/apontamento_cliche/" + checkCliche.id });
                            }
                            let body = '';
                            body += application.components.html.hidden({
                                name: 'idoprecurso'
                                , value: obj.ids[0]
                            });
                            body += application.components.html.autocomplete({
                                width: 12
                                , label: 'Recurso*'
                                , name: 'recurso'
                                , model: 'pcp_recurso'
                                , attribute: 'descricao'
                                , where: '(select tp.codigo from pcp_tprecurso tp where pcp_recurso.idtprecurso = tp.id) = 11 and ativo = true'
                            });
                            body += application.components.html.decimal({
                                width: 12
                                , label: 'Passo(cm)*'
                                , name: 'passo'
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevtg'
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Confirmar</button>'
                                }
                            });
                        } else {
                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['idoprecurso', 'recurso', 'passo']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }
                            let cliche = await db.getModel('pcp_apcliche').create({ datahora: moment(), idoprecurso: obj.req.body.idoprecurso, idrecurso: obj.req.body.recurso, passo: application.formatters.be.decimal(obj.req.body.passo) });
                            if (!cliche) {
                                return application.error(obj.res, { msg: "Não foi possível criar o clichê" });
                            }
                            let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.req.body.idoprecurso } });
                            let opetapa = await db.getModel('pcp_opetapa').findOne({ where: { id: oprecurso ? oprecurso.idopetapa : 0 } });
                            let etapa = await db.getModel('pcp_etapa').findOne({ where: { id: opetapa ? opetapa.idetapa : 0 } });
                            let op = await db.getModel('pcp_op').findOne({ where: { id: opetapa ? opetapa.idop : 0 } });
                            let versao = await db.getModel('pcp_versao').findOne({ where: { id: op ? op.idversao : 0 } });

                            let ultimaMontagem = await db.sequelize.query(`
                            select cli.id
                            from pcp_apcliche cli
                            left join pcp_oprecurso rec on (cli.idoprecurso = rec.id)
                            left join pcp_opetapa eta on (rec.idopetapa = eta.id)
                            left join pcp_op op on (eta.idop = op.id)
                            left join pcp_versao ver on (op.idversao = ver.id)
                            where ver.id = :idversao
                            and rec.idrecurso = :idrecurso
                            and cli.id != :idcliche
                            order by cli.datahora desc
                            limit 1`
                                , {
                                    type: db.Sequelize.QueryTypes.SELECT
                                    , replacements: {
                                        idversao: versao.id
                                        , idcliche: cliche.id
                                        , idrecurso: oprecurso.idrecurso
                                    }
                                }
                            );
                            if (ultimaMontagem.length > 0) {

                                let ultimaMontagemItens = await db.getModel('pcp_apclichemontagem').findAll({ where: { idapcliche: ultimaMontagem[0].id }, include: [{ all: true }] });
                                for (let i = 0; i < ultimaMontagemItens.length; i++) {
                                    let apmontagem = await db.getModel('pcp_apclichemontagem').create({
                                        idapcliche: cliche.id
                                        , estacao: ultimaMontagemItens[i].estacao
                                        , idversao: ultimaMontagemItens[i].pcp_versao.id
                                        , idanilox: ultimaMontagemItens[i].idanilox
                                        , idcamisa: ultimaMontagemItens[i].idcamisa
                                        , viscosidade: ultimaMontagemItens[i].viscosidade
                                        , observacao: ultimaMontagemItens[i].observacao
                                    });

                                    let consumosAnteriores = await db.getModel('pcp_apclichemontconsumo').findAll({ where: { idapclichemontagem: ultimaMontagemItens[i].id } });
                                    for (let j = 0; j < consumosAnteriores.length; j++) {
                                        await db.getModel('pcp_apclichemontconsumo').create({
                                            idapclichemontagem: apmontagem.id
                                            , idduplaface: consumosAnteriores[j].idduplaface
                                        });
                                    }
                                }

                            } else {
                                let composicao = await db.getModel('pcp_composicao').findOne({ where: { id: versao ? versao.idcomposicao : 0 } });
                                let componentes = await db.getModel('pcp_componente').findAll({ where: { idcomposicao: composicao ? composicao.id : 0 }, include: [{ all: true }] });

                                for (let i = 0; i < componentes.length; i++) {
                                    let item = await db.getModel('cad_item').findOne({ where: { id: componentes[i].pcp_versao.iditem }, include: [{ all: true }] });
                                    if (item.est_grupo.codigo == 533) { // Tintas
                                        await db.getModel('pcp_apclichemontagem').create({
                                            estacao: componentes[i].estacao
                                            , idapcliche: cliche.id
                                            , idversao: componentes[i].pcp_versao.id
                                        });
                                    }
                                }

                            }
                            return application.success(obj.res, { redirect: "/v/apontamento_cliche/" + cliche.id });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_listarInsumos: async (obj) => {
                    try {
                        if (!obj.data.idoprecurso) {
                            return application.error(obj.res, { msg: 'OP Não informada' });
                        }

                        let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.data.idoprecurso } });
                        let recurso = await db.getModel('pcp_recurso').findOne({ where: { id: oprecurso.idrecurso } });
                        let opetapa = await db.getModel('pcp_opetapa').findOne({ where: { id: oprecurso.idopetapa } });
                        let op = await db.getModel('pcp_op').findOne({ where: { id: opetapa.idop } });

                        let sql = await db.sequelize.query(`
                        select
                            v.id
                            , i.descricao
                            , v.qtdreal as qtd
                            , vr.qtd as qtdreservada
                            , d.descricao as deposito
                            , case when v.consumido = true then 'Sim' else 'Não' end as consumido
                        from
                            est_volume v
                        left join pcp_versao ver on (v.idversao = ver.id)
                        left join cad_item i on (ver.iditem = i.id)
                        left join est_deposito d on (v.iddeposito = d.id)
                        inner join est_volumereserva vr on (v.id = vr.idvolume)
                        where
                            d.id = ${recurso.iddepositoprodutivo}
                             and vr.idop = ${op.id}
                        order by 1
                        `, { type: db.Sequelize.QueryTypes.SELECT });

                        let body = `
                        <div class="col-md-12">
                        <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                            <tr>
                                <td style="text-align:center;"><strong>ID</strong></td>
                                <td style="text-align:center;"><strong>Insumo</strong></td>
                                <td style="text-align:center;"><strong>Qtd</strong></td>
                                <td style="text-align:center;"><strong>Qtd para OP</strong></td>
                                <td style="text-align:center;"><strong>Depósito</strong></td>
                                <td style="text-align:center;"><strong>Consumido</strong></td>
                            </tr>
                        `;
                        for (let i = 0; i < sql.length; i++) {
                            body += `
                            <tr>
                                <td style="text-align:center;"> ${sql[i].id}   </td>
                                <td style="text-align:left;">  ${sql[i].descricao}   </td>
                                <td style="text-align:right;">  ${application.formatters.fe.decimal(sql[i].qtd, 4)}   </td>
                                <td style="text-align:right;">  ${application.formatters.fe.decimal(sql[i].qtdreservada, 4)}   </td>
                                <td style="text-align:center;">   ${sql[i].deposito}   </td>
                                <td style="text-align:center;">   ${sql[i].consumido}   </td>
                            </tr>
                            `;
                        }
                        body += `
                        </table>
                        </div>
                        `;

                        return application.success(obj.res, {
                            modal: {
                                id: 'modalevtg'
                                , title: 'Insumos'
                                , fullscreen: true
                                , body: body
                                , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">OK</button>'
                            }
                        });

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_listaUltimoSetupImp: async (obj) => {
                    try {
                        let apcliche = await db.getModel('pcp_apcliche').findOne({ where: { idoprecurso: obj.id } });
                        if (!apcliche) {
                            return application.error(obj.res, { msg: 'APCliche não encontrado' });
                        }
                        obj.id = apcliche.id;
                        main.plastrela.pcp.apclichemontagem.e_listaUltimaMontagem(obj);

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_secagem: async (obj) => {
                    try {
                        if (obj.ids.length != 1) {
                            return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                        }
                        let body = '';
                        let sql = await db.sequelize.query(`
                        select
                            *
                        from
                            pcp_apclichemontsecagem
                        where
                            idapclichemontagem = ${obj.ids[0]}
                        order by datahora desc
                        `, { type: db.Sequelize.QueryTypes.SELECT });

                        body += `
                        <div class="col-md-12">
                        <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                            <tr>
                                <td style="text-align:center;"><strong>Data/hora</strong></td>
                                <td style="text-align:center;"><strong>Secagem (min)</strong></td>
                                <td style="text-align:center;"><strong>Temperatura (ºC)</strong></td>
                                <td style="text-align:center;"><strong>Umidade (%)</strong></td>
                                <td style="text-align:center;"><strong>Retardador?</strong></td>
                                <td style="text-align:center;"><strong>Observação</strong></td>
                            </tr>
                        `;
                        for (let i = 0; i < sql.length; i++) {
                            body += `
                            <tr>
                                <td style="text-align:center;"> ${application.formatters.fe.datetime(sql[i].datahora)}   </td>
                                <td style="text-align:right;">  ${application.formatters.fe.time(sql[i].secagem)}   </td>
                                <td style="text-align:right;">  ${application.formatters.fe.decimal(sql[i].temperatura, 1)}   </td>
                                <td style="text-align:right;">  ${sql[i].umidade}   </td>
                                <td style="text-align:center;">   ${sql[i].retardador ? 'Sim' : 'Não'}   </td>
                                <td style="text-align:left;">   ${sql[i].observacao || ''}   </td>
                            </tr>
                            `;
                        }
                        body += `
                        </table>
                        </div>
                        `;

                        return application.success(obj.res, {
                            modal: {
                                title: 'Secagens Anteriores'
                                , body: body
                                , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button>'
                            }
                        });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_ratearInsumos: async (obj) => {
                    try {
                        let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.data.idoprecurso || 0 } });
                        if (!oprecurso) {
                            return application.error(obj.res, { msg: 'OP Não encontrada' });
                        }
                        let opetapa = await db.getModel('pcp_opetapa').findOne({ where: { id: oprecurso.idopetapa } });
                        let op = await db.getModel('pcp_op').findOne({ where: { id: opetapa.idop } });

                        let sql = await db.sequelize.query(`
                        with componente as (
                            select vcom.id
                            from
                                pcp_oprecurso opr
                            left join pcp_opetapa ope on (opr.idopetapa = ope.id)
                            left join pcp_op op on (ope.idop = op.id)
                            left join pcp_versao v on (op.idversao = v.id)
                            left join pcp_componente c on (v.idcomposicao = c.idcomposicao)
                            left join pcp_versao vcom on (c.idversao = vcom.id)
                            where
                                opr.id = ${oprecurso.id}
                            order by c.grupo
                        )
                        
                        select
                            api.produto
                        from
                            pcp_oprecurso opr
                        left join pcp_opetapa ope on (opr.idopetapa = ope.id)
                        left join pcp_op op on (ope.idop = op.id)
                        left join pcp_apinsumo api on (api.idoprecurso = opr.id)
                        left join est_volume v on (api.idvolume = v.id)
                        left join pcp_versao ver on (v.idversao = ver.id)
                        where
                            opr.id = ${oprecurso.id}
                            and v.idversao not in (select * from componente)
                        
                        union all
                        
                        select
                            'MISTURA ID ' || v.id || ' - ' || ver.descricaocompleta
                        from
                            pcp_oprecurso opr
                        left join pcp_opetapa ope on (opr.idopetapa = ope.id)
                        left join pcp_op op on (ope.idop = op.id)
                        left join pcp_apinsumo api on (api.idoprecurso = opr.id)
                        left join est_volume v on (api.idvolume = v.id)
                        left join est_volumemistura vm on (vm.idvolume = v.id)
                        left join est_volume vmv on (vm.idvmistura = vmv.id)
                        left join pcp_versao ver on (vmv.idversao = ver.id)
                        where
                            opr.id = ${oprecurso.id}
                            and v.idversao is null
                            and ver.id not in (select * from componente)
                        `, { type: db.Sequelize.QueryTypes.SELECT });
                        let produtosforadacomp = [];
                        for (let i = 0; i < sql.length; i++) {
                            produtosforadacomp.push(sql[i].produto);
                        }
                        if (sql.length > 0) {
                            return application.error(obj.res, { msg: 'Os produtos a seguir não estão na composiçao:<br>' + produtosforadacomp.join('<br>') });
                        }

                        sql = await db.sequelize.query(`
                        with percentuais as (
                            select
                                vcom.id
                                , vcom.descricaocompleta
                                , sum((c.quantidade_aplicada * perc_cobertura) / 100) as perc
                            from
                                pcp_versao v
                            left join pcp_componente c on (v.idcomposicao = c.idcomposicao)
                            left join pcp_versao vcom on (c.idversao = vcom.id)
                            where v.id = ${op.idversao}
                            group by 1,2
                            ), percentuaisindiv as (
                            select
                                vcom.id
                                , vcom.descricaocompleta
                                , c.grupo
                                , (c.quantidade_aplicada * perc_cobertura) / 100 as perc
                            from
                                pcp_versao v
                            left join pcp_componente c on (v.idcomposicao = c.idcomposicao)
                            left join pcp_versao vcom on (c.idversao = vcom.id)
                            where v.id = ${op.idversao}
                            )
    
                            select
                                x.*
                                , wp.perc
                                , wpi.grupo
                                , wpi.perc
                                , x.qtd * (wpi.perc / wp.perc) as qtdrateada
                            from
                                ( select idversao, insumo, descricaocompleta, sum(qtd) as qtd from (select
                                    op.idversao
                                    , ver.id as insumo
                                    , ver.descricaocompleta
                                    , api.qtd as qtd
                                from
                                    pcp_oprecurso opr
                                left join pcp_opetapa ope on (opr.idopetapa = ope.id)
                                left join pcp_op op on (ope.idop = op.id)
                                left join pcp_apinsumo api on (api.idoprecurso = opr.id)
                                left join est_volume v on (api.idvolume = v.id)
                                inner join pcp_versao ver on (v.idversao = ver.id)
                                where
                                    opr.id = ${oprecurso.id}
    
                            union all
    
                            select
                                            op.idversao
                                            , ver.id as insumo
                                            , ver.descricaocompleta
                                            , round(api.qtd * (vm.qtd / v.qtd), 4) as qtd
                                        from
                                            pcp_oprecurso opr
                                        left join pcp_opetapa ope on (opr.idopetapa = ope.id)
                                        left join pcp_op op on (ope.idop = op.id)
                                        left join pcp_apinsumo api on (api.idoprecurso = opr.id)
                                        left join est_volume v on (api.idvolume = v.id)
                            left join est_volumemistura vm on (vm.idvolume = v.id)
                            left join est_volume vmv on (vm.idvmistura = vmv.id)
                            left join pcp_versao ver on (vmv.idversao = ver.id)
                                        where
                            v.idversao is null
                                            and opr.id = ${oprecurso.id}
                                        ) as x  group by 1,2,3) as x
                            left join percentuais wp on (x.insumo = wp.id)
                            left join percentuaisindiv wpi on (x.insumo = wpi.id)
                            order by wpi.grupo, x.descricaocompleta
                        `, { type: db.Sequelize.QueryTypes.SELECT });

                        let body = `
                        <div class="col-md-12">
                        <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                            <tr>
                                <td style="text-align:center;"><strong>Recipiente</strong></td>
                                <td style="text-align:center;"><strong>Insumo</strong></td>
                                <td style="text-align:center;"><strong>Qtd</strong></td>
                            </tr>
                        `;
                        let total = 0;
                        for (let i = 0; i < sql.length; i++) {
                            body += `
                            <tr>
                                <td style="text-align:center;"><strong> ${sql[i].grupo}</strong></td>
                                <td style="text-align:left;">  ${sql[i].descricaocompleta}   </td>
                                <td style="text-align:right;">  ${application.formatters.fe.decimal(sql[i].qtdrateada, 4)}   </td>
                            </tr>
                            `;
                            total += parseFloat(sql[i].qtdrateada);
                        }
                        body += `
                            <tr>
                                <td style="text-align:center;">  TOTAL  </td>
                                <td style="text-align:left;">     </td>
                                <td style="text-align:right;">  ${application.formatters.fe.decimal(total, 4)}   </td>
                            </tr>
                        </table>
                        </div>
                        `;

                        return application.success(obj.res, {
                            modal: {
                                id: 'modalevt'
                                , title: 'Insumos'
                                , body: body
                                , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Voltar</button><button id="aplicarRateio" type="button" class="btn btn-primary">Aplicar</button>'
                            }
                        });

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_aplicarRateio: async (obj) => {
                    try {
                        let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.data.idoprecurso || 0 } });
                        if (!oprecurso) {
                            return application.error(obj.res, { msg: 'OP Não encontrada' });
                        }
                        let opetapa = await db.getModel('pcp_opetapa').findOne({ where: { id: oprecurso.idopetapa } });
                        let op = await db.getModel('pcp_op').findOne({ where: { id: opetapa.idop } });

                        let sql = await db.sequelize.query(`
                        with componente as (
                            select vcom.id
                            from
                                pcp_oprecurso opr
                            left join pcp_opetapa ope on (opr.idopetapa = ope.id)
                            left join pcp_op op on (ope.idop = op.id)
                            left join pcp_versao v on (op.idversao = v.id)
                            left join pcp_componente c on (v.idcomposicao = c.idcomposicao)
                            left join pcp_versao vcom on (c.idversao = vcom.id)
                            where
                                opr.id = ${oprecurso.id}
                            order by c.grupo
                        )
                        
                        select
                            api.produto
                        from
                            pcp_oprecurso opr
                        left join pcp_opetapa ope on (opr.idopetapa = ope.id)
                        left join pcp_op op on (ope.idop = op.id)
                        left join pcp_apinsumo api on (api.idoprecurso = opr.id)
                        left join est_volume v on (api.idvolume = v.id)
                        left join pcp_versao ver on (v.idversao = ver.id)
                        where
                            opr.id = ${oprecurso.id}
                            and v.idversao not in (select * from componente)
                        
                        union all
                        
                        select
                            'MISTURA ID ' || v.id || ' - ' || ver.descricaocompleta
                        from
                            pcp_oprecurso opr
                        left join pcp_opetapa ope on (opr.idopetapa = ope.id)
                        left join pcp_op op on (ope.idop = op.id)
                        left join pcp_apinsumo api on (api.idoprecurso = opr.id)
                        left join est_volume v on (api.idvolume = v.id)
                        left join est_volumemistura vm on (vm.idvolume = v.id)
                        left join est_volume vmv on (vm.idvmistura = vmv.id)
                        left join pcp_versao ver on (vmv.idversao = ver.id)
                        where
                            opr.id = ${oprecurso.id}
                            and v.idversao is null
                            and ver.id not in (select * from componente)
                        `, { type: db.Sequelize.QueryTypes.SELECT });
                        let produtosforadacomp = [];
                        for (let i = 0; i < sql.length; i++) {
                            produtosforadacomp.push(sql[i].produto);
                        }
                        if (sql.length > 0) {
                            return application.error(obj.res, { msg: 'Os produtos a seguir não estão na composiçao:<br>' + produtosforadacomp.join('<br>') });
                        }

                        sql = await db.sequelize.query(`
                        with percentuais as (
                            select
                                vcom.id
                                , vcom.descricaocompleta
                                , sum((c.quantidade_aplicada * perc_cobertura) / 100) as perc
                            from
                                pcp_versao v
                            left join pcp_componente c on (v.idcomposicao = c.idcomposicao)
                            left join pcp_versao vcom on (c.idversao = vcom.id)
                            where v.id = ${op.idversao}
                            group by 1,2
                            ), percentuaisindiv as (
                            select
                                vcom.id
                                , vcom.descricaocompleta
                                , c.grupo
                                , (c.quantidade_aplicada * perc_cobertura) / 100 as perc
                            from
                                pcp_versao v
                            left join pcp_componente c on (v.idcomposicao = c.idcomposicao)
                            left join pcp_versao vcom on (c.idversao = vcom.id)
                            where v.id = ${op.idversao}
                            )
    
                            select
                                x.*
                                , wp.perc
                                , wpi.grupo
                                , wpi.perc
                                , x.qtd * (wpi.perc / wp.perc) as qtdrateada
                            from
                                ( select idversao, insumo, descricaocompleta, sum(qtd) as qtd from (select
                                    op.idversao
                                    , ver.id as insumo
                                    , ver.descricaocompleta
                                    , api.qtd as qtd
                                from
                                    pcp_oprecurso opr
                                left join pcp_opetapa ope on (opr.idopetapa = ope.id)
                                left join pcp_op op on (ope.idop = op.id)
                                left join pcp_apinsumo api on (api.idoprecurso = opr.id)
                                left join est_volume v on (api.idvolume = v.id)
                                inner join pcp_versao ver on (v.idversao = ver.id)
                                where
                                    opr.id = ${oprecurso.id}
    
                            union all
    
                            select
                                            op.idversao
                                            , ver.id as insumo
                                            , ver.descricaocompleta
                                            , round(api.qtd * (vm.qtd / v.qtd), 4) as qtd
                                        from
                                            pcp_oprecurso opr
                                        left join pcp_opetapa ope on (opr.idopetapa = ope.id)
                                        left join pcp_op op on (ope.idop = op.id)
                                        left join pcp_apinsumo api on (api.idoprecurso = opr.id)
                                        left join est_volume v on (api.idvolume = v.id)
                            left join est_volumemistura vm on (vm.idvolume = v.id)
                            left join est_volume vmv on (vm.idvmistura = vmv.id)
                            left join pcp_versao ver on (vmv.idversao = ver.id)
                                        where
                            v.idversao is null
                                            and opr.id = ${oprecurso.id}
                                        ) as x  group by 1,2,3) as x
                            left join percentuais wp on (x.insumo = wp.id)
                            left join percentuaisindiv wpi on (x.insumo = wpi.id)
                            order by wpi.grupo, x.descricaocompleta
                        `, { type: db.Sequelize.QueryTypes.SELECT });

                        //desmembra as misturas, aponta e deleta as misturas nos insumos
                        let misturas = await db.sequelize.query(`
                        select
                            vmv.id
                            , ver.descricaocompleta
                            , round(api.qtd * (vm.qtd / v.qtd), 4) as qtd
                            , api.iduser
                            , api.datahora
                            , api.id as idapinsumo
                        from
                            pcp_oprecurso opr
                        left join pcp_opetapa ope on (opr.idopetapa = ope.id)
                        left join pcp_op op on (ope.idop = op.id)
                        left join pcp_apinsumo api on (api.idoprecurso = opr.id)
                        left join est_volume v on (api.idvolume = v.id)
                        left join est_volumemistura vm on (vm.idvolume = v.id)
                        left join est_volume vmv on (vm.idvmistura = vmv.id)
                        left join pcp_versao ver on (vmv.idversao = ver.id)
                        where
                            v.idversao is null
                            and opr.id = ${oprecurso.id}
                            `, { type: db.Sequelize.QueryTypes.SELECT });
                        let misturasdelete = [];
                        for (let i = 0; i < misturas.length; i++) {
                            await db.getModel('pcp_apinsumo').create({
                                iduser: misturas[i].iduser
                                , idvolume: misturas[i].id
                                , idoprecurso: oprecurso.id
                                , datahora: misturas[i].datahora
                                , qtd: misturas[i].qtd
                                , produto: misturas[i].descricaocompleta
                            });
                            misturasdelete.push(misturas[i].idapinsumo);
                        }
                        await db.getModel('pcp_apinsumo').destroy({ where: { id: { [db.Op.in]: misturasdelete } } });

                        let apinsumodeleted = [];
                        for (let i = 0; i < sql.length; i++) {

                            let restante = parseFloat((parseFloat(sql[i].qtdrateada).toFixed(4)));
                            let insumos = await db.sequelize.query(`
                            select api.* from pcp_apinsumo api left join est_volume v on (api.idvolume = v.id) where api.idoprecurso = ${oprecurso.id} and v.idversao = ${sql[i].insumo} and recipiente is null`
                                , { type: db.Sequelize.QueryTypes.SELECT });

                            for (let z = 0; z < insumos.length; z++) {
                                let pesolancamento = 0;
                                if (parseFloat(insumos[z].qtd) < restante) {
                                    pesolancamento = parseFloat(insumos[z].qtd);
                                    restante -= parseFloat(pesolancamento);
                                } else {
                                    pesolancamento = restante;
                                    restante = 0;
                                }

                                let apinsumo = await db.getModel('pcp_apinsumo').findOne({
                                    where: { id: insumos[z].id }
                                });
                                apinsumo.qtd = (parseFloat(apinsumo.qtd) - pesolancamento).toFixed(4);
                                if (apinsumo.qtd > 0) {
                                    await apinsumo.save({ iduser: obj.req.user.id });
                                } else {
                                    await apinsumo.destroy({ iduser: obj.req.user.id });
                                }

                                await db.getModel('pcp_apinsumo').create({
                                    iduser: insumos[z].iduser
                                    , idvolume: insumos[z].idvolume
                                    , idoprecurso: insumos[z].idoprecurso
                                    , datahora: insumos[z].datahora
                                    , qtd: pesolancamento.toFixed(4)
                                    , produto: insumos[z].produto
                                    , recipiente: sql[i].grupo
                                });

                                if (restante == 0) {
                                    break;
                                }
                            }
                        }

                        return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_buscaObservacao: async (obj) => {
                    try {

                        let oprecurso = await db.getModel('pcp_oprecurso').findOne({ where: { id: obj.data.idoprecurso || 0 } });
                        if (!oprecurso) {
                            return application.error(obj.res, { msg: 'OP Não encontrada' });
                        }

                        let opetapa = await db.getModel('pcp_opetapa').findOne({ where: { id: oprecurso ? oprecurso.idopetapa : 0 } });
                        let op = await db.getModel('pcp_op').findOne({ where: { id: opetapa ? opetapa.idop : 0 } });

                        let ultimaObservacao = await db.sequelize.query(`
                            select rec.observacao
                            from pcp_oprecurso rec
                            left join pcp_opetapa eta on (rec.idopetapa = eta.id)
                            left join pcp_op op on (eta.idop = op.id)
                            left join pcp_versao ver on (op.idversao = ver.id)
                            inner join pcp_apinsumo api on (rec.id = api.idoprecurso)
                            where ver.id = :idversao
                            and rec.idrecurso = :idrecurso
                            and rec.id != :idoprecurso
                            order by api.datahora desc
                            limit 1`
                            , {
                                type: db.Sequelize.QueryTypes.SELECT
                                , replacements: {
                                    idversao: op.idversao
                                    , idoprecurso: oprecurso.id
                                    , idrecurso: oprecurso.idrecurso
                                }
                            }
                        );
                        return application.success(obj.res, { data: ultimaObservacao.length > 0 ? ultimaObservacao[0].observacao || '' : '' });

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_reintegrar: async (obj) => {
                    try {
                        if (obj.ids.length != 1) {
                            return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                        }
                        let param = await db.getModel('parameter').findOne({ where: { key: 'pcp_oprecurso_reintegrar' } });
                        if (!param) {
                            return application.error(obj.res, { msg: 'Parâmetro não configurado' });
                        }
                        param = JSON.parse(param.value);
                        if (param.indexOf(obj.req.user.id) < 0) {
                            return application.error(obj.res, { msg: 'Você não tem permissão para realizar esta ação' });
                        }
                        await db.getModel('pcp_apinsumo').update({ integrado: false }, { where: { idoprecurso: obj.ids[0] } });
                        await db.getModel('pcp_apperda').update({ integrado: false }, { where: { idoprecurso: obj.ids[0] } });
                        await db.getModel('pcp_apparada').update({ integrado: false }, { where: { idoprecurso: obj.ids[0] } });
                        await db.getModel('pcp_approducao').update({ integrado: false }, { where: { idoprecurso: obj.ids[0] } });
                        let oprecurso = await db.getModel('pcp_oprecurso').findOne({ include: [{ all: true }], where: { id: obj.ids[0] } });
                        oprecurso.integrado = 'P';
                        await oprecurso.save({ iduser: obj.req.user.id });
                        return application.success(obj.res, { msg: application.message.success });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_insumoAuxiliarModal: async (obj) => {
                    try {
                        let param = (await db.getModel('parameter').findOrCreate({ where: { key: 'pcp_oprecurso_insumoauxiliar' } }))[0];
                        if (!param.value)
                            param.value = '{}';
                        param = JSON.parse(param.value);

                        let oprecurso = (await main.platform.model.findAll('pcp_oprecurso', { where: { id: obj.data.idoprecurso } })).rows[0];

                        let body = '';
                        body += application.components.html.hidden({ name: 'name', value: 'plastrela.pcp.oprecurso.js_insumoAuxiliar' });
                        body += application.components.html.hidden({ name: 'idoprecurso', value: obj.data.idoprecurso });
                        if (oprecurso.etapa == '20') {
                            let option = '';
                            if (param['r' + oprecurso.idrecurso] && param['r' + oprecurso.idrecurso]['solvente']) {
                                let versao = await db.getModel('pcp_versao').findOne({ where: { id: param['r' + oprecurso.idrecurso]['solvente'] } });
                                if (versao)
                                    option = '<option value="' + versao.id + '" selected>' + versao.descricaocompleta + '</option>';
                            }
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'Solvente'
                                , name: 'solvente'
                                , model: 'pcp_versao'
                                , attribute: 'descricaocompleta'
                                , option: option
                            });
                        }

                        return application.success(obj.res, {
                            modal: {
                                form: true
                                , action: '/jsfunction'
                                , id: 'modaljs'
                                , title: 'Insumos Auxiliares'
                                , body: body
                                , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Confirmar</button>'
                            }
                        });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_insumoAuxiliar: async (obj) => {
                    try {
                        let oprecurso = (await main.platform.model.findAll('pcp_oprecurso', { where: { id: obj.req.body.idoprecurso } })).rows[0];

                        let paramm = (await db.getModel('parameter').findOrCreate({ where: { key: 'pcp_oprecurso_insumoauxiliar' } }))[0];
                        if (!paramm.value)
                            paramm.value = '{}';
                        param = JSON.parse(paramm.value);
                        if (!param['r' + oprecurso.idrecurso])
                            param['r' + oprecurso.idrecurso] = {};

                        if (oprecurso.etapa == '20') {
                            if (!obj.req.body.solvente) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: ['solvente'] });
                            }
                            param['r' + oprecurso.idrecurso]['solvente'] = obj.req.body.solvente;
                        }

                        paramm.value = JSON.stringify(param);

                        await paramm.save({ iduser: obj.req.user.id });

                        return application.success(obj.res, { msg: application.message.success });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_volumesXparadas: async (obj) => {
                    try {
                        if (obj.ids.length != 1) {
                            return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                        }

                        let sql = await db.sequelize.query(`
                        select
                            op
                            , idvolume 
                            , (select count(*) from pcp_apparada app where app.idoprecurso = x.idoprecurso and app.dataini >= x.min and app.datafim <= x.max ) as qtd
                        from
                            (select
                                v.id as idvolume
                                , opr.id as idoprecurso
                                , op.codigo as op
                                , (select min(dataini) from pcp_approducaotempo apt where apt.idapproducao = ap.id) as min
                                , (select max(datafim) from pcp_approducaotempo apt where apt.idapproducao = ap.id) as max
                            from
                                pcp_oprecurso opr
                            left join pcp_opetapa ope on (opr.idopetapa = ope.id)
                            left join pcp_op op on (ope.idop = op.id)
                            left join pcp_approducao ap on (opr.id = ap.idoprecurso)
                            left join pcp_approducaovolume apv on (ap.id = apv.idapproducao)
                            left join est_volume v on (apv.id = v.idapproducaovolume)
                            where
                                opr.id = ${obj.ids[0]}) as x
                        order by 1,2		
                        `, {
                                type: db.sequelize.QueryTypes.SELECT
                            });

                        let qtd = 0;
                        let report = {};
                        report.__title = obj.event.description;
                        report.__table = `
                        <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                            <tr>
                                <td style="text-align:center;"><strong>OP</strong></td>
                                <td style="text-align:center;"><strong>Volume</strong></td>
                                <td style="text-align:center;"><strong>Paradas</strong></td>
                            </tr>
                        `;
                        for (let i = 0; i < sql.length; i++) {
                            report.__table += `
                            <tr>
                                <td style="text-align:left;"> ${sql[i]['op']} </td>
                                <td style="text-align:left;"> ${sql[i]['idvolume'] || ''} </td>
                                <td style="text-align:right;"> ${sql[i]['qtd']} </td>
                            </tr>
                            `;
                            qtd += parseInt(sql[i]['qtd']);
                        }
                        report.__table += `
                            <tr>
                                <td style="text-align:right;" colspan="2"> Total </td>
                                <td style="text-align:right;"> ${qtd} </td>
                            </tr>
                        </table>
                        `;

                        let filename = await main.platform.report.f_generate('Geral - Listagem', report);
                        return application.success(obj.res, {
                            openurl: '/download/' + filename
                        });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_confatributo: async (obj) => {
                    try {
                        let atributoconf = await db.getModel('pcp_atributoconferencia').findOne({ where: obj.data });
                        return application.success(obj.res, { data: atributoconf.dataValues });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_adicionarAtributo: async (obj) => {
                    try {
                        let user = await db.getModel('users').findOne({ where: { username: obj.data.confuser, password: Cyjs.SHA3(`${application.sk}${obj.data.confpass}${application.sk}`).toString() } });
                        if (!user) {
                            return application.error(obj.res, { msg: 'Usuário inválido', invalidfields: ['confuser', 'confpass'] });
                        }
                        if (obj.data.confatributo == '' || obj.data.confresul == '') {
                            return application.error(obj.res, { msg: 'Informe o resultado para o atributo selecionado' });
                        }

                        await db.getModel('pcp_oprecursoconferencia').create({
                            datahora: moment()
                            , idoprecurso: obj.data.idoprecurso
                            , iduser: user.id
                            , idatributoconferencia: obj.data.confatributo
                            , resultado: obj.data.confresul
                            , observacao: obj.data.confobs || null
                        });

                        return application.success(obj.res, { reloadtables: true });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , oprecursoconferencia: {
                ondelete: async function (obj, next) {
                    try {
                        return application.error(obj.res, { msg: 'Não é possível apagar conferências' });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , r_conferenciaAp: async function (obj) {
                try {

                    let invalidfields = application.functions.getEmptyFields(obj.req.body, ['dataini', 'datafim', 'idrecurso']);
                    if (invalidfields.length > 0) {
                        return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                    }

                    let filterop = '';
                    if (obj.req.body.idop) {
                        filterop = ' and op.id = ' + obj.req.body.idop;
                    }

                    let unions = [];

                    if (obj.req.body.producao == 'true') {
                        unions.push(`
                            with maximo as (
                            select
                                app.id
                                , (select apt.id from pcp_approducaotempo apt where app.id = apt.idapproducao order by apt.datafim desc limit 1) as max
                            from
                                pcp_approducao app
                            left join pcp_oprecurso opr on (app.idoprecurso = opr.id)
                            inner join pcp_approducaotempo apt on (apt.idapproducao = app.id)
                            where apt.datafim >= :v1 and apt.datafim <= :v2 and opr.idrecurso = :v4)
                            select
                                *
                                , case when ultimaprod > 0 then (select sum(extract(epoch from apt.datafim - apt.dataini) / 60) from pcp_approducaotempo apt where apt.idapproducao = x.id) else null end as duracaototal
                                , case when ultimaprod > 0 then (select sum(apv.pesoliquido) from pcp_approducaovolume apv where apv.idapproducao = x.id) else null end as peso
                                    , case when ultimaprod > 0 then (select sum(apv.qtd) from pcp_approducaovolume apv where apv.idapproducao = x.id) else null end as qtd
                                    , (select string_agg('ID ' || vol.id::text || ' - ' || i.codigo || '/' || v.codigo, ',') from pcp_approducaovolume apv left join est_volume vol on (apv.id = vol.idapproducaovolume) left join pcp_versao v on (vol.idversao = v.id) left join cad_item i on (v.iditem = i.id) where apv.idapproducao = x.id) as adicionais
                            from
                                (select
                                    'producao'::text as tipo
                                    , app.id
                                    , op.codigo as op
                                    , apt.dataini
                                    , apt.datafim
                                    , (select count(*) from maximo m where m.max = apt.id) as ultimaprod
                                from
                                    pcp_oprecurso opr
                                left join pcp_opetapa ope on (opr.idopetapa = ope.id)
                                left join pcp_op op on (ope.idop = op.id)
                                inner join pcp_approducao app on (opr.id = app.idoprecurso)
                                inner join pcp_approducaotempo apt on (apt.idapproducao = app.id)
                                where
                                    apt.datafim >= :v1 and apt.datafim <= :v2
                                    and opr.idrecurso = :v4 ` + filterop + `) as x
                            `);
                    }
                    if (obj.req.body.perda == 'true') {
                        unions.push(`
                            select
                                'perda'::text as tipo
                                , app.id
                                , op.codigo as op
                                , app.datahora as dataini
                                , null as datafim
                                , 0 as ultimaprod
                                , 0 as duracaototal
                                , app.peso 
                                , 0 as qtd
                                , 'ID ' || app.id::text || ' - ' || tp.codigo || ' - ' || tp.descricao as adicionais
                            from
                                pcp_oprecurso opr
                            left join pcp_opetapa ope on (opr.idopetapa = ope.id)
                            left join pcp_op op on (ope.idop = op.id)
                            inner join pcp_apperda app on (opr.id = app.idoprecurso)
                            left join pcp_tipoperda tp on (app.idtipoperda = tp.id)
                            where
                                app.datahora >= :v1 and app.datahora <= :v2
                                and opr.idrecurso = :v4 ` + filterop);
                    }
                    if (obj.req.body.parada == 'true') {
                        unions.push(`
                            select
                                'parada'::text as tipo
                                , app.id
                                , op.codigo as op
                                , app.dataini
                                , app.datafim
                                , 0 as ultimaprod
                                , 0 as duracaototal
                                , 0 as peso 
                                , 0 as qtd
                                , mp.codigo || ' - ' || mp.descricao || coalesce(' @ ' || app.observacao, '') as adicionais
                            from
                                pcp_oprecurso opr
                            left join pcp_opetapa ope on (opr.idopetapa = ope.id)
                            left join pcp_op op on (ope.idop = op.id)
                            inner join pcp_apparada app on (opr.id = app.idoprecurso)
                            left join pcp_motivoparada mp on (app.idmotivoparada = mp.id)
                            where
                                app.dataini >= :v1 and app.datafim <= :v2
                                and opr.idrecurso = :v4 ` + filterop);
                    }
                    if (obj.req.body.insumo == 'true') {
                        unions.push(`
                            select
                                'insumo'::text as tipo
                                , api.id
                                , op.codigo as op
                                , api.datahora as dataini
                                , null as datafim
                                , 0 as ultimaprod
                                , 0 as duracaototal
                                , 0 as peso 
                                , api.qtd as qtd
                                , api.produto as adicionais
                            from
                                pcp_oprecurso opr
                            left join pcp_opetapa ope on (opr.idopetapa = ope.id)
                            left join pcp_op op on (ope.idop = op.id)
                            inner join pcp_apinsumo api on (opr.id = api.idoprecurso)
                            where
                                api.datahora >= :v1 and api.datahora <= :v2
                                and opr.idrecurso = :v4 ` + filterop);
                    }
                    if (obj.req.body.sobra == 'true') {
                        unions.push(`
                            select
                                'sobra'::text as tipo
                                , aps.id
                                , op.codigo as op
                                , aps.datahora as dataini
                                , null as datafim
                                , null as ultimaprod
                                , null as duracaototal
                                , null as peso 
                                , aps.qtd as qtd
                                , api.produto as adicionais
                            from
                                pcp_oprecurso opr
                            left join pcp_opetapa ope on (opr.idopetapa = ope.id)
                            left join pcp_op op on (ope.idop = op.id)
                            inner join pcp_apsobra aps on (opr.id = aps.idoprecurso)
                            left join pcp_apinsumo api on (aps.idapinsumo = api.id)
                            where
                                aps.datahora >= :v1 and aps.datahora <= :v2
                                and opr.idrecurso = :v4 ` + filterop);
                    }

                    if (unions.length > 0) {

                        let sql = await db.sequelize.query(
                            'select * from (' + unions.join(' union all ') + ') as x order by dataini'
                            ,
                            {
                                type: db.sequelize.QueryTypes.SELECT
                                , replacements: {
                                    v1: application.formatters.be.datetime(obj.req.body.dataini)
                                    , v2: application.formatters.be.datetime(obj.req.body.datafim)
                                    , v4: obj.req.body.idrecurso
                                }
                            });

                        let data = {
                            producao: {
                                nro: 0
                                , pesoliquido: 0
                                , qtd: 0
                                , tempo: 0
                            }
                            , parada: {
                                nro: 0
                                , tempo: 0
                            }
                            , insumo: {
                                nro: 0
                                , qtd: 0
                            }
                            , perda: {
                                nro: 0
                                , qtd: 0
                            }
                            , sobra: {
                                nro: 0
                                , qtd: 0
                            }
                            , ind: {
                                erro: 0
                                , velmedia: 0
                                , velefet: 0
                                , dif: 0
                            }
                        };
                        data.table = [];

                        let wdata = null;

                        for (let i = 0; i < sql.length; i++) {

                            if (sql[i].tipo == 'producao') {
                                data.table.push({
                                    seq: i + 1
                                    , tipo: sql[i].tipo
                                    , id: sql[i].id
                                    , op: sql[i].op
                                    , horario: moment(sql[i].dataini, application.formatters.be.datetime_format).format('DD/MM HH:mm') + ' - ' + moment(sql[i].datafim, application.formatters.be.datetime_format).format('DD/MM HH:mm')
                                    , duracao: sql[i].ultimaprod >= 1 ? application.formatters.fe.time(moment(sql[i].datafim, application.formatters.be.datetime_format).diff(moment(sql[i].dataini, application.formatters.be.datetime_format), 'm')) + ' / ' + application.formatters.fe.time(sql[i].duracaototal) : application.formatters.fe.time(moment(sql[i].datafim, application.formatters.be.datetime_format).diff(moment(sql[i].dataini, application.formatters.be.datetime_format), 'm'))
                                    , qtd: sql[i].peso ? application.formatters.fe.decimal(sql[i].peso, 4) + ' / ' + application.formatters.fe.decimal(sql[i].qtd, 4) : ''
                                    , adicionais: sql[i].adicionais
                                    , erro: ''
                                });

                                if (sql[i].ultimaprod >= 1) {
                                    data.producao.nro++;
                                    if (parseFloat(sql[i].peso)) {
                                        data.producao.pesoliquido += parseFloat(sql[i].peso);
                                        data.producao.qtd += parseFloat(sql[i].qtd);
                                    }
                                }
                                data.producao.tempo += moment(sql[i].datafim, application.formatters.be.datetime_format).diff(moment(sql[i].dataini, application.formatters.be.datetime_format), 'm') + 1;
                            } else if (sql[i].tipo == 'perda') {
                                data.table.push({
                                    seq: i + 1
                                    , tipo: sql[i].tipo
                                    , id: sql[i].id
                                    , op: sql[i].op
                                    , horario: moment(sql[i].dataini, application.formatters.be.datetime_format).format('DD/MM HH:mm')
                                    , duracao: ''
                                    , qtd: application.formatters.fe.decimal(sql[i].peso, 4)
                                    , adicionais: sql[i].adicionais
                                    , erro: ''
                                });
                                data.perda.nro++;
                                data.perda.qtd += parseFloat(sql[i].peso);
                            } else if (sql[i].tipo == 'parada') {
                                data.table.push({
                                    seq: i + 1
                                    , tipo: sql[i].tipo
                                    , id: sql[i].id
                                    , op: sql[i].op
                                    , horario: moment(sql[i].dataini, application.formatters.be.datetime_format).format('DD/MM HH:mm') + ' - ' + moment(sql[i].datafim, application.formatters.be.datetime_format).format('DD/MM HH:mm')
                                    , duracao: application.formatters.fe.time(moment(sql[i].datafim, application.formatters.be.datetime_format).diff(moment(sql[i].dataini, application.formatters.be.datetime_format), 'm'))
                                    , qtd: ''
                                    , adicionais: sql[i].adicionais
                                    , erro: ''
                                });
                                data.parada.nro++;
                                data.parada.tempo += moment(sql[i].datafim, application.formatters.be.datetime_format).diff(moment(sql[i].dataini, application.formatters.be.datetime_format), 'm') + 1;
                            } else if (sql[i].tipo == 'insumo') {
                                data.table.push({
                                    seq: i + 1
                                    , tipo: sql[i].tipo
                                    , id: sql[i].id
                                    , op: sql[i].op
                                    , horario: moment(sql[i].dataini, application.formatters.be.datetime_format).format('DD/MM HH:mm')
                                    , duracao: ''
                                    , qtd: application.formatters.fe.decimal(sql[i].qtd, 4)
                                    , adicionais: sql[i].adicionais
                                    , erro: ''
                                });
                                data.insumo.nro++;
                                data.insumo.qtd += parseFloat(sql[i].qtd);
                            } else if (sql[i].tipo == 'sobra') {
                                data.table.push({
                                    seq: i + 1
                                    , tipo: sql[i].tipo
                                    , id: sql[i].id
                                    , op: sql[i].op
                                    , horario: moment(sql[i].dataini, application.formatters.be.datetime_format).format('DD/MM HH:mm')
                                    , duracao: ''
                                    , qtd: application.formatters.fe.decimal(sql[i].qtd, 4)
                                    , adicionais: sql[i].adicionais
                                    , erro: ''
                                });
                                data.sobra.nro++;
                                data.sobra.qtd += parseFloat(sql[i].qtd);
                            }

                            if (obj.req.body.parada == 'true' && obj.req.body.producao == 'true') {
                                if (sql[i].tipo == 'producao' || sql[i].tipo == 'parada') {
                                    if (wdata == null) {
                                        wdata = moment(sql[i].datafim, application.formatters.be.datetime_format);
                                    } else {
                                        if (moment(sql[i].dataini, application.formatters.be.datetime_format).diff(wdata, 'm') > 1) {
                                            data.table[data.table.length - 1] = lodash.extend(data.table[data.table.length - 1], {
                                                erro: 'Intervalo de ' + moment(sql[i].dataini, application.formatters.be.datetime_format).diff(wdata, 'm') + ' minutos'
                                            });
                                            data.ind.erro++;
                                        }
                                        wdata = moment(sql[i].datafim, application.formatters.be.datetime_format);
                                    }
                                }
                            }

                        }

                        if (data.producao.qtd > 0 && data.producao.tempo > 0) {
                            data.ind.velmedia = application.formatters.fe.decimal(data.producao.qtd / (data.producao.tempo + data.parada.tempo), 2);
                            data.ind.velefet = application.formatters.fe.decimal(data.producao.qtd / data.producao.tempo, 2);
                            data.ind.dif = application.formatters.fe.decimal(data.insumo.qtd - data.producao.pesoliquido - data.perda.qtd, 4);
                        }

                        data.producao.pesoliquido = application.formatters.fe.decimal(data.producao.pesoliquido, 4);
                        data.producao.qtd = application.formatters.fe.decimal(data.producao.qtd, 4);
                        data.producao.tempo = application.formatters.fe.time(data.producao.tempo);
                        data.perda.qtd = application.formatters.fe.decimal(data.perda.qtd, 4);
                        data.parada.tempo = application.formatters.fe.time(data.parada.tempo);
                        data.insumo.qtd = application.formatters.fe.decimal(data.insumo.qtd, 4);
                        data.sobra.qtd = application.formatters.fe.decimal(data.sobra.qtd, 4);

                        return application.success(obj.res, { data: data });

                    } else {
                        return application.error(obj.res, { msg: 'Selecione um tipo de apontamento para visualizar' });
                    }

                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
            , r_pcp112: async (obj) => {
                try {
                    let invalidfields = application.functions.getEmptyFields(obj.req.body, ['datahoraini', 'datahorafim', 'idrecurso']);
                    if (invalidfields.length > 0) {
                        return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                    }
                    let rec = [];
                    if (typeof obj.req.body.idrecurso == 'string') {
                        obj.req.body.idrecurso = [obj.req.body.idrecurso];
                    }
                    let recursos = await db.getModel('pcp_recurso').findAll({ where: { id: { [db.Op.in]: obj.req.body.idrecurso } } });
                    for (let i = 0; i < recursos.length; i++) {
                        rec.push(recursos[i].codigo);
                    }
                    let config = await db.getModel('config').findOne();
                    let empresa = config.cnpj == "90816133000123" ? 2 : 1;
                    let needle = require('needle');
                    let query = await needle('post', 'http://172.10.30.18/SistemaH/scripts/socket/scripts2socket.php', {
                        function: 'PLAIniflexSQL', param: JSON.stringify([`
                        with ops as (
                                select empresa, etapa, recurso, op from pcpapproducao where empresa = ${empresa} and data_hora_ini >= cast('${obj.req.body.datahoraini}:00' as timestamp) and data_hora_fim <= cast('${obj.req.body.datahorafim}:00' as timestamp)
                                union
                                select empresa, etapa, recurso, op from pcpapparada where empresa = ${empresa} and data_hora_ini >= cast('${obj.req.body.datahoraini}:00' as timestamp) and data_hora_fim <= cast('${obj.req.body.datahorafim}:00' as timestamp)
                                union
                                select empresa, etapa, recurso, op from pcpapperda where empresa = ${empresa} and data_hora between cast('${obj.req.body.datahoraini}:00' as timestamp) and cast('${obj.req.body.datahorafim}:00' as timestamp)
                        )
                        select
                                x.*
                                , case when x.tipo_recurso = 1 then 
                                    case when x.tempoprod - x.parada - x.acerto = 0 then 0 else round(x.peso / ((x.tempoprod - x.parada - x.acerto)/60), 4) end
                                    else
                                    case when x.tempoprod - x.parada - x.acerto = 0 then 0 else round(x.qtd / (x.tempoprod - x.parada - x.acerto), 4) end
                                end as produtividade
                                , case when x.tipo_recurso = 1 then 
                                    case when x.tempoprod = 0 then 0 else round(x.peso / ((x.tempoprod)/60), 4) end
                                    else
                                    case when x.tempoprod = 0 then 0 else round(x.qtd / (x.tempoprod), 4) end
                                end as produtividademedia
                                , round(case when x.peso + x.perda = 0 then 0 else x.perda / (x.peso + x.perda) end, 4) * 100 as percperdido
                        from
                                (select
                                        r.tipo_recurso
                                        , ops.recurso
                                        , ops.op
                                        , i.descricao as produto
                                        , coalesce(round((select sum(ap.quantidade) from pcpapproducao ap where ap.data_hora_ini >= cast('${obj.req.body.datahoraini}:00' as timestamp) and ap.data_hora_ini <= cast('${obj.req.body.datahorafim}:00' as timestamp) and ap.empresa = ops.empresa and ap.op = ops.op and ap.etapa = ops.etapa and ap.recurso = ops.recurso),3),0) as qtd
                                        , coalesce(round((select sum(ap.peso - ap.peso_tara) from pcpapproducao ap where ap.data_hora_ini >= cast('${obj.req.body.datahoraini}:00' as timestamp) and ap.data_hora_ini <= cast('${obj.req.body.datahorafim}:00' as timestamp) and ap.empresa = ops.empresa and ap.op = ops.op and ap.etapa = ops.etapa and ap.recurso = ops.recurso),3),0) as peso
                                        , coalesce(round((select sum(ap.data_hora_fim - ap.data_hora_ini) * 24 * 60 from pcpapproducao ap where ap.data_hora_ini >= cast('${obj.req.body.datahoraini}:00' as timestamp) and ap.data_hora_ini <= cast('${obj.req.body.datahorafim}:00' as timestamp) and ap.empresa = ops.empresa and ap.op = ops.op and ap.etapa = ops.etapa and ap.recurso = ops.recurso),1),0) as tempoprod
                                        , coalesce(round((select sum(ap.peso) from pcpapperda ap where ap.data_hora >= cast('${obj.req.body.datahoraini}:00' as timestamp) and ap.data_hora <= cast('${obj.req.body.datahorafim}:00' as timestamp) and ap.empresa = ops.empresa and ap.op = ops.op and ap.etapa = ops.etapa and ap.recurso = ops.recurso),3),0) as perda
                                        , coalesce(round((select sum(ap.data_hora_fim - ap.data_hora_ini) * 24 * 60 from pcpapparada ap
                                                where ap.data_hora_ini >= cast('${obj.req.body.datahoraini}:00' as timestamp) and ap.data_hora_ini <= cast('${obj.req.body.datahorafim}:00' as timestamp) and ap.empresa = ops.empresa and ap.op = ops.op and ap.etapa = ops.etapa and ap.recurso = ops.recurso 
                                                and ap.motivo_parada not in (select mp.codigo from pcpmotivoparada mp where mp.acerto_maquina = 'S')),1),0) as parada
                                        , coalesce(round((select sum(ap.data_hora_fim - ap.data_hora_ini) * 24 * 60 from pcpapparada ap
                                                where ap.data_hora_ini >= cast('${obj.req.body.datahoraini}:00' as timestamp) and ap.data_hora_ini <= cast('${obj.req.body.datahorafim}:00' as timestamp) and ap.empresa = ops.empresa and ap.op = ops.op and ap.etapa = ops.etapa and ap.recurso = ops.recurso 
                                                and ap.motivo_parada in (select mp.codigo from pcpmotivoparada mp where mp.acerto_maquina = 'S')),1),0) as acerto
                                from
                                        ops
                                left join pcpop op on (ops.empresa = op.empresa and ops.op = op.op)
                                left join pcprecurso r on (ops.empresa = r.empresa and ops.recurso = r.codigo)
                                left join estitem i on (op.empresa = i.empresa and op.produto = i.codigo)
                                where op.empresa = ${empresa} and recurso in (${rec.join(',')})
                                ) x
                        order by recurso, op`
                        ])
                    });

                    query = JSON.parse(query.body);

                    let fd = function (val) {
                        return parseFloat(val.replace(',', '.'));
                    }

                    let report = {};
                    report.__title = `Resumo de Produção por Recurso<br>${obj.req.body.datahoraini} - ${obj.req.body.datahorafim}`;
                    report.__table = `
                    `;

                    let ultimorecurso = '';
                    let soma = {
                        count: 0
                        , qtd: 0
                        , peso: 0
                        , tempoprod: 0
                        , perda: 0
                        , parada: 0
                        , cprodutividade: 0
                        , produtividade: 0
                        , produtividademedia: 0
                        , cacerto: 0
                        , acerto: 0
                        , qtditem: 0
                    };
                    let somageral = {
                        count: 0
                        , qtd: 0
                        , peso: 0
                        , tempoprod: 0
                        , perda: 0
                        , parada: 0
                        , cprodutividade: 0
                        , produtividade: 0
                        , produtividademedia: 0
                        , cacerto: 0
                        , acerto: 0
                        , qtditem: 0
                    };
                    function resetasoma() {
                        soma.count = 0;
                        soma.qtd = 0;
                        soma.peso = 0;
                        soma.tempoprod = 0;
                        soma.perda = 0;
                        soma.parada = 0;
                        soma.cprodutividade = 0;
                        soma.produtividade = 0;
                        soma.produtividademedia = 0;
                        soma.cacerto = 0;
                        soma.acerto = 0;
                        soma.qtditem = 0;
                    }
                    function mostrasoma() {
                        for (let k in soma) {
                            somageral[k] += soma[k];
                        }
                        report.__table += `
                        </tbody>
                        <tfoot>
                            <tr style="font-weight: bold;">
                                <td style="text-align:center;"> TOTAL </td>
                                <td style="text-align:right;">  ${soma.count} Registros com ${soma.qtditem} Itens Produzidos</td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal(soma.qtd, 3)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal(soma.peso, 3)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal(soma.tempoprod, 2)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal(soma.perda, 3)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal((soma.perda / (soma.peso + soma.perda)) * 100, 2)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal(soma.parada, 2)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal(soma.produtividade / soma.cprodutividade, 3)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal(soma.produtividademedia / soma.cprodutividade, 3)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.time(soma.acerto / soma.cprodutividade)} / ${application.formatters.fe.time(soma.acerto / soma.cacerto)} </td>
                            </tr>
                        </tfoot>
                        `;
                    }
                    function mostrasomageral() {
                        for (let k in soma) {
                            somageral[k] += soma[k];
                        }
                        report.__table += `
                        </tbody>
                        <tfoot>
                            <tr style="font-weight: bold;">
                                <td style="text-align:center;"> TOTAL </td>
                                <td style="text-align:right;">  ${soma.count} Registros com ${soma.qtditem} Itens Produzidos</td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal(soma.qtd, 3)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal(soma.peso, 3)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal(soma.tempoprod, 2)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal(soma.perda, 3)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal((soma.perda / (soma.peso + soma.perda)) * 100, 2)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal(soma.parada, 2)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal(soma.produtividade / soma.cprodutividade, 3)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal(soma.produtividademedia / soma.cprodutividade, 3)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.time(soma.acerto / soma.cprodutividade)} / ${application.formatters.fe.time(soma.acerto / soma.cacerto)} </td>
                            </tr>
                            <tr style="font-weight: bold;">
                                <td style="text-align:center;"> TOTAL GERAL </td>
                                <td style="text-align:right;">  ${somageral.count} Registros com ${somageral.qtditem} Itens Produzidos</td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal(somageral.qtd, 3)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal(somageral.peso, 3)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal(somageral.tempoprod, 2)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal(somageral.perda, 3)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal((somageral.perda / (somageral.peso + somageral.perda)) * 100, 2)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal(somageral.parada, 2)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal(somageral.produtividade / somageral.cprodutividade, 3)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.decimal(somageral.produtividademedia / somageral.cprodutividade, 3)} </td>
                                <td style="text-align:right;"> ${application.formatters.fe.time(somageral.acerto / somageral.cprodutividade)} / ${application.formatters.fe.time(somageral.acerto / somageral.cacerto)} </td>
                            </tr>
                        </tfoot>
                        `;
                    }
                    for (let i = 0; i < query.count; i++) {
                        if (ultimorecurso != query.data['RECURSO'][i]) {
                            if (i > 0) {
                                mostrasoma();
                                report.__table += `</table><br><div style="page-break-after:always;"></div>`;
                            }
                            resetasoma();
                            report.__table += `
                            <h2>Recurso: ${query.data['RECURSO'][i]}</h2>
                            <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                                <thead>
                                    <tr>
                                        <td style="text-align:center;"><strong>OP</strong></td>
                                        <td style="text-align:center;"><strong>Produto</strong></td>
                                        <td style="text-align:center;"><strong>Qtd</strong></td>
                                        <td style="text-align:center;"><strong>Peso</strong></td>
                                        <td style="text-align:center;"><strong>Prod.(min)</strong></td>
                                        <td style="text-align:center;"><strong>Peso Perdido</strong></td>
                                        <td style="text-align:center;"><strong>% Perdido</strong></td>
                                        <td style="text-align:center;"><strong>Parada(min)</strong></td>
                                        <td style="text-align:center;"><strong>Produtividade</strong></td>
                                        <td style="text-align:center;"><strong>Produtividade Média</strong></td>
                                        <td style="text-align:center;"><strong>Acerto</strong></td>
                                    </tr>
                                </thead>
                                <tbody>
                            `;
                            ultimorecurso = query.data['RECURSO'][i];
                        }
                        report.__table += `
                        <tr>
                            <td style="text-align:center;"> ${query.data['OP'][i]} </td>
                            <td style="text-align:left;"> ${query.data['PRODUTO'][i]} </td>
                            <td style="text-align:right;"> ${application.formatters.fe.decimal(fd(query.data['QTD'][i]), 3)} </td>
                            <td style="text-align:right;"> ${application.formatters.fe.decimal(fd(query.data['PESO'][i]), 3)} </td>
                            <td style="text-align:right;"> ${fd(query.data['TEMPOPROD'][i])} </td>
                            <td style="text-align:right;"> ${application.formatters.fe.decimal(fd(query.data['PERDA'][i]), 3)} </td>
                            <td style="text-align:right;"> ${application.formatters.fe.decimal(fd(query.data['PERCPERDIDO'][i]), 2)} </td>
                            <td style="text-align:right;"> ${fd(query.data['PARADA'][i])} </td>
                            <td style="text-align:right;"> ${application.formatters.fe.decimal(fd(query.data['PRODUTIVIDADE'][i]), 3)} </td>
                            <td style="text-align:right;"> ${application.formatters.fe.decimal(fd(query.data['PRODUTIVIDADEMEDIA'][i]), 3)} </td>
                            <td style="text-align:right;"> ${application.formatters.fe.time(fd(query.data['ACERTO'][i]))} </td>
                        </tr>
                        `;
                        soma.count++;
                        soma.qtd += fd(query.data['QTD'][i]);
                        soma.peso += fd(query.data['PESO'][i]);
                        soma.tempoprod += fd(query.data['TEMPOPROD'][i]);
                        soma.perda += fd(query.data['PERDA'][i]);
                        soma.parada += fd(query.data['PARADA'][i]);
                        soma.cprodutividade += fd(query.data['PRODUTIVIDADE'][i]) > 0 ? 1 : 0;
                        soma.produtividade += fd(query.data['PRODUTIVIDADE'][i]);
                        soma.produtividademedia += fd(query.data['PRODUTIVIDADEMEDIA'][i]);
                        soma.cacerto += fd(query.data['ACERTO'][i]) > 0 ? 1 : 0;
                        soma.acerto += fd(query.data['ACERTO'][i]);
                        soma.qtditem += fd(query.data['TEMPOPROD'][i]) + fd(query.data['PARADA'][i]) > 0 ? 1 : 0
                    }
                    mostrasomageral();
                    report.__table += `
                        </table>
                    `;

                    let filename = await main.platform.report.f_generate('Geral - Listagem Paisagem', report);
                    return application.success(obj.res, {
                        openurl: '/download/' + filename
                    });
                } catch (err) {
                    return application.fatal(obj.res, err);
                }
            }
        }
        , rh: {
            curriculo: {
                onsave: async function (obj, next) {
                    try {
                        if (obj.register.id == 0) {
                            obj.register.data_inclusao = moment();
                            obj.register.validade = moment().add(365, 'd');
                        }

                        let invalidfields = [];

                        if (obj.register['possui_filhos'] == 'Sim' && !obj.register['quantidade_filhos']) {
                            invalidfields.push('quantidade_filhos');
                        }
                        if (obj.register['possui_cnh'] == 'Sim' && !obj.register['categoria_cnh']) {
                            invalidfields.push('categoria_cnh');
                        }
                        if (obj.register['deficiente'] == 'Sim' && !obj.register['deficiente_descricao']) {
                            invalidfields.push('deficiente_descricao');
                        }
                        if (obj.register['escolaridade'] && obj.register['escolaridade'].match(/Superior.*/) && !obj.register['curso']) {
                            invalidfields.push('curso');
                        }
                        if (obj.register['estudando'] == 'Sim' && !obj.register['horario_estudo']) {
                            invalidfields.push('horario_estudo');
                        }
                        if (obj.register['trabalhou_plastrela'] == 'Sim' && !obj.register['motivo_saida']) {
                            invalidfields.push('motivo_saida');
                        }
                        if (obj.register['conhecido_plastrela'] == 'Sim' && !obj.register['conhecido_relacao']) {
                            invalidfields.push('conhecido_relacao');
                        }
                        if (obj.register['conhecido_plastrela'] == 'Sim' && !obj.register['conhecido_identificacao']) {
                            invalidfields.push('conhecido_identificacao');
                        }

                        if (invalidfields.length > 0) {
                            return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                        }

                        obj._responseModifier = function (ret) {
                            ret['msg'] = 'Seu currículo foi recebido com sucesso. Será analisado e arquivado em nosso banco de dados. No momento que tivermos uma oportunidade e seu perfil for compatível com o desejado, entraremos em contato. Obrigado por ter enviado seu currículo para a Plastrela.';
                            return ret;
                        }

                        let saved = await next(obj);
                        if (saved.success) {
                            let notificationDescription = `Un: ${saved.register.unidade_interesse} - ${saved.register.nomecompleto}`;
                            let param = await db.getModel('parameter').findOne({ where: { key: 'rh_curriculoNotificationSystemRS' } });

                            if (saved.register.unidade_interesse == 'Estrela - RS') {
                                if (param) {
                                    let notificationUsers = JSON.parse(param.value);
                                    main.platform.notification.create(notificationUsers, {
                                        title: 'Novo currículo cadastrado!'
                                        , description: notificationDescription
                                        , link: '/v/curriculo/' + saved.register.id
                                    });
                                }
                            } else {
                                let notificationUsers = JSON.parse(param.value);
                                main.platform.notification.create(notificationUsers, {
                                    title: 'Novo currículo cadastrado!'
                                    , description: notificationDescription
                                    , link: '/v/curriculo/' + saved.register.id
                                });
                                let param2 = await db.getModel('parameter').findOne({ where: { key: 'rh_curriculoNotificationEmailMS' } });
                                if (param2) {
                                    main.platform.mail.f_sendmail({
                                        to: JSON.parse(param2.value)
                                        , subject: `Novo currículo cadastrado - ${notificationDescription}`
                                        , html: `<a href="http://intranet.plastrela.com.br:8084/v/curriculo_ms/${saved.register.id}" target="_blank">http://intranet.plastrela.com.br:8084/v/curriculo_ms</a>`
                                    });
                                }
                            }
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , f_validadeCurriculos: function () {
                    db.getModel('rh_curriculo').destroy({ where: { validade: { [db.Op.lt]: moment() } } });
                }
            }
        }
        , ti: {
            equipamento: {
                onsave: async (obj, next) => {
                    try {
                        let register = await db.getModel('cad_equipamento').findOne({ where: { id: { [db.Op.ne]: obj.id }, patrimonio: obj.register.patrimonio } })
                        if (register) {
                            return application.error(obj.res, { msg: 'Já existe um equipamento com este patrimônio' });
                        }
                        await next(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_softwareSemLicenca: async (obj) => {
                    try {

                        let sql = await db.sequelize.query(`
                        select
                            coalesce(e.hostname, '') as hostname
                            , u.fullname
                            , s.descricao
                        from
                            cad_equipamento e
                        left join cad_vinculacaosoftware vs on(e.id = vs.idequipamento)
                        left join cad_software s on(vs.idsoftware = s.id)
                        left join users u on(e.iduser = u.id)
                        where
                            (select count(*) from cad_vinculacaolicenca vl left join cad_licenca l on(vl.idlicenca = l.id) where vl.idequipamento = e.id and l.idsoftware = s.id) = 0
                            and s.licenciado = true
                            order by 1, 2, 3
                        `, {
                                type: db.sequelize.QueryTypes.SELECT
                                , replacements: { iddeposito: obj.req.body.iddeposito }
                            });

                        let report = {};
                        report.__title = obj.event.description;
                        report.__table = `
                        <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                            <tr>
                                <td style="text-align:center;"><strong>Hostname</strong></td>
                                <td style="text-align:center;"><strong>Usuário</strong></td>
                                <td style="text-align:center;"><strong>Software sem Licença</strong></td>
                            </tr>
                        `;
                        for (let i = 0; i < sql.length; i++) {
                            report.__table += `
                            <tr>
                                <td style="text-align:left;"> ${sql[i]['hostname']} </td>
                                <td style="text-align:left;"> ${sql[i]['fullname']} </td>
                                <td style="text-align:left;"> ${sql[i]['descricao']} </td>
                            </tr>
                            `;
                        }
                        report.__table += `
                        </table>
                        `;

                        let qtd = 0;
                        sql = await db.sequelize.query(`
                        select
                            s.descricao as software
                            , count(*) as qtd
                        from
                            cad_equipamento e
                        left join cad_vinculacaosoftware vs on(e.id = vs.idequipamento)
                        left join cad_software s on(vs.idsoftware = s.id)
                        left join users u on(e.iduser = u.id)
                        where
                            (select count(*) from cad_vinculacaolicenca vl left join cad_licenca l on(vl.idlicenca = l.id) where vl.idequipamento = e.id and l.idsoftware = s.id) = 0
                            and s.licenciado = true
                        group by 1
                        order by 1
                        `, {
                                type: db.sequelize.QueryTypes.SELECT
                                , replacements: { iddeposito: obj.req.body.iddeposito }
                            });

                        report.__table += `
                        <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:50%;margin-top: 15px;">
                            <tr>
                                <td style="text-align:center;"><strong>Software</strong></td>
                                <td style="text-align:center;"><strong>Qtd</strong></td>
                            </tr>
                        `;
                        for (let i = 0; i < sql.length; i++) {
                            report.__table += `
                            <tr>
                                <td style="text-align:left;"> ${sql[i]['software']} </td>
                                <td style="text-align:right;"> ${sql[i]['qtd']} </td>
                            </tr>
                            `;
                            qtd++;
                        }
                        report.__table += `
                            <tr>
                                <td><strong>Total</strong></td>
                                <td style="text-align:right;"> ${qtd} </td>
                            </tr>
                        </table>
                        `;

                        let filename = await main.platform.report.f_generate('Geral - Listagem', report);
                        return application.success(obj.res, {
                            openurl: '/download/' + filename
                        });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_resumo: async (obj) => {
                    try {

                        let sql = await db.sequelize.query(`
                        select
                            e.id
                            , e.hostname as "Hostname"
                            , u.fullname as "Usuário"
                            , case when e.hostname ilike 'PLAMS%' then 'MS' else 'RS' end as "Unidade"
                            , (select s.descricao from cad_vinculacaosoftware vs left join cad_software s on (vs.idsoftware = s.id) where vs.idequipamento = e.id and s.so = true limit 1) as "SO"
                            , (select s.descricao || ' - ' || coalesce(l.serial, '') from cad_vinculacaolicenca vl left join cad_licenca l on (vl.idlicenca = l.id) left join cad_software s on (l.idsoftware = s.id) where vl.idequipamento = e.id and s.so = true limit 1) as "Licença"
                        from
                            cad_equipamento e
                        left join users u on (e.iduser = u.id)
                        where
                            e.idequipamentotipo in (2,3,4,5,11) and ativo
                        order by e.hostname
                        `, {
                                type: db.sequelize.QueryTypes.SELECT
                            });

                        let report = {};
                        report.__title = obj.event.description;
                        report.__table = '';
                        if (sql.length > 0) {
                            report.__table = `<table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%"><tr>`;
                            for (let k in sql[0]) {
                                report.__table += `<td style="text-align:center;"><strong>${k}</strong></td>`
                            }
                            report.__table += `</tr>`;
                            for (let i = 0; i < sql.length; i++) {
                                report.__table += `<tr>`;
                                for (let k in sql[i]) {
                                    report.__table += `<td style="text-align:left;">${sql[i][k] || ''}</td>`
                                }
                                report.__table += `</tr>`;
                            }
                            report.__table += `</table>`;
                        }

                        //Resumo 
                        let keys = ['Unidade', 'SO'];
                        let resumo = {};
                        for (let k = 0; k < keys.length; k++) {
                            resumo[keys[k]] = {};
                            for (let i = 0; i < sql.length; i++) {
                                if (!resumo[keys[k]][sql[i][keys[k]]]) {
                                    resumo[keys[k]][sql[i][keys[k]]] = 1;
                                } else {
                                    resumo[keys[k]][sql[i][keys[k]]]++;
                                }
                            }
                            let ordered = {};
                            Object.keys(resumo[keys[k]]).sort().forEach(function (key) {
                                ordered[key] = resumo[keys[k]][key];
                            });
                            resumo[keys[k]] = ordered;
                        }

                        for (let k in resumo) {
                            report.__table += `
                            <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:20%;margin-top: 15px;">
                                <tr>
                                    <td style="text-align:center;" colspan="2"><strong>${k}</strong></td>
                                </tr>
                            `;
                            for (let z in resumo[k]) {
                                report.__table += `
                                <tr>
                                    <td style="text-align:center;"> ${z} </td>
                                    <td style="text-align:center;"> ${resumo[k][z]} </td>
                                </tr>
                                `;
                            }
                            report.__table += `</table>`;
                        }

                        let filename = await main.platform.report.f_generate('Geral - Listagem', report);
                        return application.success(obj.res, {
                            openurl: '/download/' + filename
                        });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
        }
        , venda: {
            embarque: {
                e_sincronizar: async (obj) => {
                    try {
                        let config = await db.getModel('config').findOne();
                        let empresa = config.cnpj == "90816133000123" ? 2 : 1;
                        await main.platform.kettle.f_runJob(`jobs/${empresa == 2 ? 'ms' : 'rs'}_sync/JobEmbarque.kjb`);
                        return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_solicitarPCP: async (obj) => {
                    try {
                        if (obj.ids.length <= 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }
                        let param = await db.getModel('parameter').findOne({ where: { key: 'ven_embarque_comercial' } });
                        if (!param) {
                            return application.error(obj.res, { msg: 'Parâmetro não configurado' });
                        }
                        param = JSON.parse(param.value);
                        if (param.indexOf(obj.req.user.id) < 0) {
                            return application.error(obj.res, { msg: 'Apenas o setor Comercial pode realizar esta ação' });
                        }
                        let embarques = await db.getModel('ven_embarque').findAll({ where: { id: { [db.Op.in]: obj.ids } } });
                        for (let i = 0; i < embarques.length; i++) {
                            if (embarques[i].solicitadapcp) {
                                return application.error(obj.res, { msg: 'Na seleção existe uma entrega já solicitada, verifique' });
                            }
                        }
                        await db.getModel('ven_embarque').update({ solicitadapcp: true }, { where: { id: { [db.Op.in]: obj.ids } }, iduser: obj.req.user.id });
                        application.success(obj.res, { msg: application.message.success, reloadtables: true });

                        let notificacao = await db.getModel('parameter').findOne({ where: { key: 'ven_embarque_pcp' } });
                        if (notificacao) {
                            notificacao = JSON.parse(notificacao.value);
                            let embs = await main.platform.model.findAll('ven_embarque', { where: { id: { [db.Op.in]: obj.ids } } });
                            for (let i = 0; i < embs.count; i++) {
                                main.platform.notification.create(notificacao, {
                                    title: 'Confirmação Pendente'
                                    , description: `${embs.rows[i].previsaodata} @ ${embs.rows[i].idpedido} ${embs.rows[i].idversao}`
                                    , link: '/v/entrega/' + embs.rows[i].id
                                });
                            }
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_desfazerSolicitarPCP: async (obj) => {
                    try {
                        if (obj.ids.length <= 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }
                        let param = await db.getModel('parameter').findOne({ where: { key: 'ven_embarque_comercial' } });
                        if (!param) {
                            return application.error(obj.res, { msg: 'Parâmetro não configurado' });
                        }
                        param = JSON.parse(param.value);
                        if (param.indexOf(obj.req.user.id) < 0) {
                            return application.error(obj.res, { msg: 'Apenas o setor Comercial pode realizar esta ação' });
                        }
                        let embarques = await db.getModel('ven_embarque').findAll({ where: { id: { [db.Op.in]: obj.ids } } });
                        for (let i = 0; i < embarques.length; i++) {
                            if (!embarques[i].solicitadapcp) {
                                return application.error(obj.res, { msg: 'Na seleção existe uma entrega já desfeita, verifique' });
                            }
                        }
                        await db.getModel('ven_embarque').update({ solicitadapcp: false }, { where: { id: { [db.Op.in]: obj.ids } }, iduser: obj.req.user.id });
                        return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_confirmarPCP: async (obj) => {
                    try {
                        if (obj.ids.length <= 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }
                        let param = await db.getModel('parameter').findOne({ where: { key: 'ven_embarque_pcp' } });
                        if (!param) {
                            return application.error(obj.res, { msg: 'Parâmetro não configurado' });
                        }
                        param = JSON.parse(param.value);
                        if (param.indexOf(obj.req.user.id) < 0) {
                            return application.error(obj.res, { msg: 'Apenas o setor PCP pode realizar esta ação' });
                        }
                        let embarques = await db.getModel('ven_embarque').findAll({ where: { id: { [db.Op.in]: obj.ids } } });
                        for (let i = 0; i < embarques.length; i++) {
                            if (embarques[i].confirmadapcp) {
                                return application.error(obj.res, { msg: 'Na seleção existe uma entrega já solicitada, verifique' });
                            }
                        }
                        await db.getModel('ven_embarque').update({ confirmadapcp: true }, { where: { id: { [db.Op.in]: obj.ids } }, iduser: obj.req.user.id });
                        application.success(obj.res, { msg: application.message.success, reloadtables: true });

                        let notificacao = await db.getModel('parameter').findOne({ where: { key: 'ven_embarque_comercial' } });
                        if (notificacao) {
                            notificacao = JSON.parse(notificacao.value);
                            let embs = await main.platform.model.findAll('ven_embarque', { where: { id: { [db.Op.in]: obj.ids } } });
                            for (let i = 0; i < embs.count; i++) {
                                main.platform.notification.create(notificacao, {
                                    title: 'Confirmação Realizada'
                                    , description: `${embs.rows[i].previsaodata} @ ${embs.rows[i].idpedido} ${embs.rows[i].idversao}`
                                    , link: '/v/entrega/' + embs.rows[i].id
                                });
                            }
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_desfazerConfirmarPCP: async (obj) => {
                    try {
                        if (obj.ids.length <= 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }
                        let param = await db.getModel('parameter').findOne({ where: { key: 'ven_embarque_comercial' } });
                        if (!param) {
                            return application.error(obj.res, { msg: 'Parâmetro não configurado' });
                        }
                        param = JSON.parse(param.value);
                        if (param.indexOf(obj.req.user.id) < 0) {
                            return application.error(obj.res, { msg: 'Apenas o setor Comercial pode realizar esta ação' });
                        }
                        let embarques = await db.getModel('ven_embarque').findAll({ where: { id: { [db.Op.in]: obj.ids } } });
                        for (let i = 0; i < embarques.length; i++) {
                            if (!embarques[i].confirmadapcp) {
                                return application.error(obj.res, { msg: 'Na seleção existe uma entrega já desfeita, verifique' });
                            }
                        }
                        await db.getModel('ven_embarque').update({ confirmadapcp: false }, { where: { id: { [db.Op.in]: obj.ids } }, iduser: obj.req.user.id });
                        return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_confirmarComercial: async (obj) => {
                    try {
                        if (obj.ids.length <= 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }
                        let param = await db.getModel('parameter').findOne({ where: { key: 'ven_embarque_comercial' } });
                        if (!param) {
                            return application.error(obj.res, { msg: 'Parâmetro não configurado' });
                        }
                        param = JSON.parse(param.value);
                        if (param.indexOf(obj.req.user.id) < 0) {
                            return application.error(obj.res, { msg: 'Apenas o setor Comercial pode realizar esta ação' });
                        }
                        let embarques = await db.getModel('ven_embarque').findAll({ where: { id: { [db.Op.in]: obj.ids } } });
                        for (let i = 0; i < embarques.length; i++) {
                            if (embarques[i].confirmadacomercial) {
                                return application.error(obj.res, { msg: 'Na seleção existe uma entrega já solicitada, verifique' });
                            }
                        }
                        await db.getModel('ven_embarque').update({ confirmadacomercial: true }, { where: { id: { [db.Op.in]: obj.ids } }, iduser: obj.req.user.id });
                        application.success(obj.res, { msg: application.message.success, reloadtables: true });

                        let notificacao = await db.getModel('parameter').findOne({ where: { key: 'ven_embarque_expedicao' } });
                        if (notificacao) {
                            notificacao = JSON.parse(notificacao.value);
                            let embs = await main.platform.model.findAll('ven_embarque', { where: { id: { [db.Op.in]: obj.ids } } });
                            for (let i = 0; i < embs.count; i++) {
                                main.platform.notification.create(notificacao, {
                                    title: moment().format(application.formatters.fe.date_format) == embs.rows[i].previsaodata ? 'EMBARQUE IMEDIATO' : 'Confirmação Entrega'
                                    , description: `${embs.rows[i].previsaodata} @ ${embs.rows[i].idpedido} ${embs.rows[i].idversao}`
                                });
                            }
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_desfazerConfirmarComercial: async (obj) => {
                    try {
                        if (obj.ids.length <= 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }
                        let param = await db.getModel('parameter').findOne({ where: { key: 'ven_embarque_expedicao' } });
                        if (!param) {
                            return application.error(obj.res, { msg: 'Parâmetro não configurado' });
                        }
                        param = JSON.parse(param.value);
                        if (param.indexOf(obj.req.user.id) < 0) {
                            return application.error(obj.res, { msg: 'Apenas o setor Expedição pode realizar esta ação' });
                        }
                        let embarques = await db.getModel('ven_embarque').findAll({ where: { id: { [db.Op.in]: obj.ids } } });
                        for (let i = 0; i < embarques.length; i++) {
                            if (!embarques[i].confirmadacomercial) {
                                return application.error(obj.res, { msg: 'Na seleção existe uma entrega já desfeita, verifique' });
                            }
                        }
                        await db.getModel('ven_embarque').update({ confirmadacomercial: false }, { where: { id: { [db.Op.in]: obj.ids } }, iduser: obj.req.user.id });
                        application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        let pm = await db.getModel('parameter').findAll({ where: { key: { [db.Op.in]: ['ven_embarque_comercial', 'ven_embarque_expedicao'] } } });
                        for (let i = 0; i < pm.length; i++) {
                            let notificacao = pm[i];
                            if (notificacao) {
                                notificacao = JSON.parse(notificacao.value);
                                let embs = await main.platform.model.findAll('ven_embarque', { where: { id: { [db.Op.in]: obj.ids } } });
                                for (let i = 0; i < embs.count; i++) {
                                    main.platform.notification.create(notificacao, {
                                        title: 'Entrega Desconfirmada'
                                        , description: `${embs.rows[i].previsaodata} @ ${embs.rows[i].idpedido} ${embs.rows[i].idversao} - ${obj.req.user.fullname}`
                                    });
                                }
                            }
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_aprovarRetirada: async (obj) => {
                    try {
                        if (obj.ids.length <= 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }
                        let param = await db.getModel('parameter').findOne({ where: { key: 'ven_embarque_expedicao' } });
                        if (!param) {
                            return application.error(obj.res, { msg: 'Parâmetro não configurado' });
                        }
                        param = JSON.parse(param.value);
                        if (param.indexOf(obj.req.user.id) < 0) {
                            return application.error(obj.res, { msg: 'Apenas o setor Expedição pode realizar esta ação' });
                        }
                        let embarques = await db.getModel('ven_embarque').findAll({ where: { id: { [db.Op.in]: obj.ids } } });
                        for (let i = 0; i < embarques.length; i++) {
                            if (embarques[i].aprovadoretirada) {
                                return application.error(obj.res, { msg: 'Na seleção existe uma entrega já aprovada, verifique' });
                            }
                        }
                        await db.getModel('ven_embarque').update({ aprovadoretirada: true }, { where: { id: { [db.Op.in]: obj.ids } }, iduser: obj.req.user.id });
                        return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_desfazerAprovarRetirada: async (obj) => {
                    try {
                        if (obj.ids.length <= 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }
                        let param = await db.getModel('parameter').findOne({ where: { key: 'ven_embarque_expedicao' } });
                        if (!param) {
                            return application.error(obj.res, { msg: 'Parâmetro não configurado' });
                        }
                        param = JSON.parse(param.value);
                        if (param.indexOf(obj.req.user.id) < 0) {
                            return application.error(obj.res, { msg: 'Apenas o setor Expedição pode realizar esta ação' });
                        }
                        let embarques = await db.getModel('ven_embarque').findAll({ where: { id: { [db.Op.in]: obj.ids } } });
                        for (let i = 0; i < embarques.length; i++) {
                            if (!embarques[i].aprovadoretirada) {
                                return application.error(obj.res, { msg: 'Na seleção existe uma entrega já aprovada, verifique' });
                            }
                        }
                        await db.getModel('ven_embarque').update({ aprovadoretirada: false }, { where: { id: { [db.Op.in]: obj.ids } }, iduser: obj.req.user.id });
                        application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        let notificacao = await db.getModel('parameter').findOne({ where: { key: 'ven_embarque_expedicao' } });
                        if (notificacao) {
                            notificacao = JSON.parse(notificacao.value);
                            let embs = await main.platform.model.findAll('ven_embarque', { where: { id: { [db.Op.in]: obj.ids } } });
                            for (let i = 0; i < embs.count; i++) {
                                main.platform.notification.create(notificacao, {
                                    title: 'Retirada Desaprovada'
                                    , description: `${embs.rows[i].previsaodata} @ ${embs.rows[i].idpedido} ${embs.rows[i].idversao}`
                                });
                            }
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_sugerirDataEntrega: async (obj) => {
                    try {
                        if (obj.req.method == 'GET') {
                            if (obj.ids.length != 1) {
                                return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                            }

                            let param = await db.getModel('parameter').findOne({ where: { key: 'ven_embarque_motivoalteracaoentrega' } });
                            if (!param) {
                                return application.error(obj.res, { msg: 'Parâmetro não configurado' });
                            }
                            param = JSON.parse(param.value);

                            let body = '';
                            body += application.components.html.hidden({ name: 'id', value: obj.ids[0] });
                            body += application.components.html.date({
                                width: '12'
                                , label: 'Data Sugerida*'
                                , name: 'data'
                            });
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'Motivo*'
                                , name: 'motivo'
                                , options: param.join(',')
                            });
                            body += application.components.html.textarea({
                                width: '12'
                                , label: 'Observação'
                                , name: 'observacao'
                                , rows: '3'
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt'
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Confirmar</button>'
                                }
                            });
                        } else {

                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['id', 'data', 'motivo']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }

                            await db.getModel('ven_embarquealteracao').create({
                                idembarque: obj.req.body.id
                                , iduser: obj.req.user.id
                                , data: application.formatters.be.date(obj.req.body.data)
                                , motivo: obj.req.body.motivo
                                , observacao: obj.req.body.observacao || null
                                , lido: false
                            }, { iduser: obj.req.user.id });

                            application.success(obj.res, { msg: application.message.success, reloadtables: true });

                            let notificacao = await db.getModel('parameter').findOne({ where: { key: 'ven_embarque_comercial' } });
                            if (notificacao) {
                                notificacao = JSON.parse(notificacao.value);
                                let embs = await main.platform.model.findAll('ven_embarque', { where: { id: obj.req.body.id } });
                                for (let i = 0; i < embs.count; i++) {
                                    main.platform.notification.create(notificacao, {
                                        title: 'Alteração de Entrega'
                                        , description: `De ${embs.rows[i].previsaodata} para ${obj.req.body.data} @ ${embs.rows[i].idpedido} ${embs.rows[i].idversao}`
                                        , link: '/v/entrega/' + embs.rows[i].id
                                    });
                                }
                            }
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_imprimir: async (obj) => {
                    try {
                        if (obj.req.method == 'GET') {

                            let body = '';
                            body += application.components.html.date({
                                width: '6'
                                , label: 'Previsão Entrega Inicial*'
                                , name: 'dataini'
                            });
                            body += application.components.html.date({
                                width: '6'
                                , label: 'Previsão Entrega Final*'
                                , name: 'datafim'
                            });
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'Situação'
                                , name: 'situacao'
                                , multiple: 'multiple="multiple"'
                                , options: 'Ativo,Encerrado,Finalizado,Cancelado'
                            });
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'UF'
                                , name: 'uf'
                                , multiple: 'multiple="multiple"'
                                , options: 'AC,AL,AP,AM,BA,CE,DF,ES,GO,MA,MT,MS,MG,PA,PB,PR,PE,PI,RJ,RN,RS,RO,RR,SC,SP,SE,TO'
                            });
                            body += `<div class="col-md-12"> <div class="form-group"> <label>Solic PCP?</label>
                                <div class="row" style="text-align: center;">
                                    <div class="col-xs-4"> <label> <input type="radio" name="solicitadapcp" value="" checked="checked"> Todos </label> </div>
                                    <div class="col-xs-4"> <label> <input type="radio" name="solicitadapcp" value="true"> Sim </label> </div>
                                    <div class="col-xs-4"> <label> <input type="radio" name="solicitadapcp" value="false"> Não </label> </div>
                                </div> </div> </div>`;
                            body += `<div class="col-md-12"> <div class="form-group"> <label>Conf PCP?</label>
                                <div class="row" style="text-align: center;">
                                    <div class="col-xs-4"> <label> <input type="radio" name="confirmadapcp" value="" checked="checked"> Todos </label> </div> 
                                    <div class="col-xs-4"> <label> <input type="radio" name="confirmadapcp" value="true"> Sim </label> </div> 
                                    <div class="col-xs-4"> <label> <input type="radio" name="confirmadapcp" value="false"> Não </label> </div> 
                                </div> </div> </div>`;
                            body += `<div class="col-md-12"> <div class="form-group"> <label>Conf Comercial?</label> 
                                <div class="row" style="text-align: center;"> 
                                    <div class="col-xs-4"> <label> <input type="radio" name="confirmadacomercial" value="" checked="checked"> Todos </label> </div> 
                                    <div class="col-xs-4"> <label> <input type="radio" name="confirmadacomercial" value="true"> Sim </label> </div> 
                                    <div class="col-xs-4"> <label> <input type="radio" name="confirmadacomercial" value="false"> Não </label> </div> 
                                </div> </div> </div>`;
                            body += `<div class="col-md-12"> <div class="form-group"> <label>Aprovado Retirada?</label> 
                                <div class="row" style="text-align: center;"> 
                                    <div class="col-xs-4"> <label> <input type="radio" name="aprovadoretirada" value="" checked="checked"> Todos </label> </div> 
                                    <div class="col-xs-4"> <label> <input type="radio" name="aprovadoretirada" value="true"> Sim </label> </div> 
                                    <div class="col-xs-4"> <label> <input type="radio" name="aprovadoretirada" value="false"> Não </label> </div> 
                                </div> </div> </div>`;
                            // body += application.components.html.checkbox({
                            //     width: '12'
                            //     , name: 'apenasestoque'
                            //     , label: 'Apenas com Estoque'
                            // });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt'
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Confirmar</button>'
                                }
                            });
                        } else {

                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['dataini', 'datafim']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }

                            let where = {
                                previsaodata: {
                                    [db.Op.gte]: application.formatters.be.date(obj.req.body.dataini)
                                    , [db.Op.lte]: application.formatters.be.date(obj.req.body.datafim)
                                }
                            };
                            if (obj.req.body.situacao && typeof obj.req.body.situacao == 'string') {
                                obj.req.body.situacao = [obj.req.body.situacao];
                            }
                            if (obj.req.body.uf && typeof obj.req.body.uf == 'string') {
                                obj.req.body.uf = [obj.req.body.uf];
                            }

                            let arr = [];
                            if (obj.req.body.situacao) {
                                where.situacao = { [db.Op.in]: obj.req.body.situacao };
                            }
                            if (obj.req.body.uf) {
                                where.uf = { [db.Op.in]: obj.req.body.uf };
                            }
                            if (obj.req.body.solicitadapcp) {
                                where.solicitadapcp = { [db.Op.eq]: obj.req.body.solicitadapcp }
                            }
                            if (obj.req.body.confirmadapcp) {
                                where.confirmadapcp = { [db.Op.eq]: obj.req.body.confirmadapcp }
                            }
                            if (obj.req.body.confirmadacomercial) {
                                where.confirmadacomercial = { [db.Op.eq]: obj.req.body.confirmadacomercial }
                            }
                            if (obj.req.body.aprovadoretirada) {
                                where.aprovadoretirada = { [db.Op.eq]: obj.req.body.aprovadoretirada }
                            }
                            if (obj.req.body.apenasestoque) {
                                where.qtdestoque = { [db.Op.gt]: 0 }
                            }

                            if (arr.length > 0) {
                                Object.assign(where, { [db.Op.col]: db.Sequelize.literal(arr.join(' and ')) })
                            }
                            let embarques = await main.platform.model.findAll('ven_embarque', {
                                where: where
                                , order: [
                                    ['previsaodata', 'asc']
                                    , ['uf', 'asc']
                                    , [db.Sequelize.literal('ven_pedido.idcliente'), 'asc']
                                ]
                            });

                            let report = {};
                            report.__title = `Lista de Embarques (${embarques.count})`;
                            report.__table = `
                            <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                                <thead>
                                    <tr>
                                        <td style="text-align:center;"><strong>Prev. Entrega</strong></td>
                                        <td style="text-align:center;"><strong>Cliente</strong></td>
                                        <td style="text-align:center;"><strong>Pedido</strong></td>
                                        <td style="text-align:center;"><strong>OP</strong></td>
                                        <td style="text-align:center;"><strong>Item</strong></td>
                                        <td style="text-align:center;"><strong>UN</strong></td>
                                        <td style="text-align:center;"><strong>Qtd Entrega</strong></td>
                                        <td style="text-align:center;"><strong>Qtd Atendido</strong></td>
                                        <td style="text-align:center;"><strong>Qtd Est. OP</strong></td>
                                        <td style="text-align:center;"><strong>Qtd Est. Item</strong></td>
                                        <td style="text-align:center;"><strong>Qtd Prod. OP</strong></td>
                                        <td style="text-align:center;"><strong>Cidade - UF</strong></td>
                                        <td style="text-align:center;"><strong>Representante</strong></td>
                                    </tr>
                                </thead>
                            `;
                            for (let i = 0; i < embarques.count; i++) {
                                report.__table += `
                                <tr>
                                    <td style="text-align:center;"> ${embarques.rows[i]['previsaodata']} </td>
                                    <td style="text-align:left;"> ${embarques.rows[i]['cliente'].substring(0, 25)} </td>
                                    <td style="text-align:center;"> ${embarques.rows[i]['idpedido']} </td>
                                    <td style="text-align:center;"> ${embarques.rows[i]['idop'] || ''} </td>
                                    <td style="text-align:left;"> ${embarques.rows[i]['idversao'].substring(0, 50)} </td>
                                    <td style="text-align:left;"> ${embarques.rows[i]['unidade']} </td>
                                    <td style="text-align:right;"> ${embarques.rows[i]['qtdentrega']} </td>
                                    <td style="text-align:right;"> ${embarques.rows[i]['qtdatendido']} </td>
                                    <td style="text-align:right;"> ${embarques.rows[i]['qtdestoque'] || ''} </td>
                                    <td style="text-align:right;"> ${embarques.rows[i]['qtdestoquetotal'] || ''} </td>
                                    <td style="text-align:right;"> ${embarques.rows[i]['qtdproduzido'] || ''} </td>
                                    <td style="text-align:left;"> ${embarques.rows[i]['cidade'] + ' - ' + embarques.rows[i]['uf']} </td>
                                    <td style="text-align:left;"> ${embarques.rows[i]['representante'].substring(0, 20)} </td>
                                </tr>
                                `;
                            }
                            report.__table += `
                            </table>
                            `;

                            let file = await main.platform.report.f_generate('Geral - Listagem Paisagem', report);
                            return application.success(obj.res, {
                                openurl: '/download/' + file
                            });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_imprimirPCP: async (obj) => {
                    try {
                        if (obj.req.method == 'GET') {

                            let body = '';
                            body += application.components.html.date({
                                width: '6'
                                , label: 'Previsão Entrega Inicial*'
                                , name: 'dataini'
                            });
                            body += application.components.html.date({
                                width: '6'
                                , label: 'Previsão Entrega Final*'
                                , name: 'datafim'
                            });
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'Situação'
                                , name: 'situacao'
                                , multiple: 'multiple="multiple"'
                                , options: 'Ativo,Encerrado,Finalizado,Cancelado'
                            });
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'UF'
                                , name: 'uf'
                                , multiple: 'multiple="multiple"'
                                , options: 'AC,AL,AP,AM,BA,CE,DF,ES,GO,MA,MT,MS,MG,PA,PB,PR,PE,PI,RJ,RN,RS,RO,RR,SC,SP,SE,TO'
                            });
                            body += `<div class="col-md-12"> <div class="form-group"> <label>Solic PCP?</label>
                                <div class="row" style="text-align: center;">
                                    <div class="col-xs-4"> <label> <input type="radio" name="solicitadapcp" value="" checked="checked"> Todos </label> </div>
                                    <div class="col-xs-4"> <label> <input type="radio" name="solicitadapcp" value="true"> Sim </label> </div>
                                    <div class="col-xs-4"> <label> <input type="radio" name="solicitadapcp" value="false"> Não </label> </div>
                                </div> </div> </div>`;
                            body += `<div class="col-md-12"> <div class="form-group"> <label>Conf PCP?</label>
                                <div class="row" style="text-align: center;">
                                    <div class="col-xs-4"> <label> <input type="radio" name="confirmadapcp" value="" checked="checked"> Todos </label> </div> 
                                    <div class="col-xs-4"> <label> <input type="radio" name="confirmadapcp" value="true"> Sim </label> </div> 
                                    <div class="col-xs-4"> <label> <input type="radio" name="confirmadapcp" value="false"> Não </label> </div> 
                                </div> </div> </div>`;
                            body += `<div class="col-md-12"> <div class="form-group"> <label>Conf Comercial?</label> 
                                <div class="row" style="text-align: center;"> 
                                    <div class="col-xs-4"> <label> <input type="radio" name="confirmadacomercial" value="" checked="checked"> Todos </label> </div> 
                                    <div class="col-xs-4"> <label> <input type="radio" name="confirmadacomercial" value="true"> Sim </label> </div> 
                                    <div class="col-xs-4"> <label> <input type="radio" name="confirmadacomercial" value="false"> Não </label> </div> 
                                </div> </div> </div>`;
                            body += `<div class="col-md-12"> <div class="form-group"> <label>Aprovado Retirada?</label> 
                                <div class="row" style="text-align: center;"> 
                                    <div class="col-xs-4"> <label> <input type="radio" name="aprovadoretirada" value="" checked="checked"> Todos </label> </div> 
                                    <div class="col-xs-4"> <label> <input type="radio" name="aprovadoretirada" value="true"> Sim </label> </div> 
                                    <div class="col-xs-4"> <label> <input type="radio" name="aprovadoretirada" value="false"> Não </label> </div> 
                                </div> </div> </div>`;
                            // body += application.components.html.checkbox({
                            //     width: '12'
                            //     , name: 'apenasestoque'
                            //     , label: 'Apenas com Estoque'
                            // });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , action: '/event/' + obj.event.id
                                    , id: 'modalevt'
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Confirmar</button>'
                                }
                            });
                        } else {

                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['dataini', 'datafim']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }

                            let where = {
                                previsaodata: {
                                    [db.Op.gte]: application.formatters.be.date(obj.req.body.dataini)
                                    , [db.Op.lte]: application.formatters.be.date(obj.req.body.datafim)
                                }
                            };
                            if (obj.req.body.situacao && typeof obj.req.body.situacao == 'string') {
                                obj.req.body.situacao = [obj.req.body.situacao];
                            }
                            if (obj.req.body.uf && typeof obj.req.body.uf == 'string') {
                                obj.req.body.uf = [obj.req.body.uf];
                            }

                            let arr = [];
                            if (obj.req.body.situacao) {
                                where.situacao = { [db.Op.in]: obj.req.body.situacao };
                            }
                            if (obj.req.body.uf) {
                                where.uf = { [db.Op.in]: obj.req.body.uf };
                            }
                            if (obj.req.body.solicitadapcp) {
                                where.solicitadapcp = { [db.Op.eq]: obj.req.body.solicitadapcp }
                            }
                            if (obj.req.body.confirmadapcp) {
                                where.confirmadapcp = { [db.Op.eq]: obj.req.body.confirmadapcp }
                            }
                            if (obj.req.body.confirmadacomercial) {
                                where.confirmadacomercial = { [db.Op.eq]: obj.req.body.confirmadacomercial }
                            }
                            if (obj.req.body.aprovadoretirada) {
                                where.aprovadoretirada = { [db.Op.eq]: obj.req.body.aprovadoretirada }
                            }
                            if (obj.req.body.apenasestoque) {
                                where.qtdestoque = { [db.Op.gt]: 0 }
                            }

                            if (arr.length > 0) {
                                Object.assign(where, { [db.Op.col]: db.Sequelize.literal(arr.join(' and ')) });
                            }
                            let embarques = await main.platform.model.findAll('ven_embarque', {
                                where: where
                                , order: [
                                    ['previsaodata', 'asc']
                                    , ['uf', 'asc']
                                    , [db.Sequelize.literal('ven_pedido.idcliente'), 'asc']
                                ]
                            });

                            let report = {};
                            report.__title = `Lista de Embarques (${embarques.count})`;
                            report.__table = `
                            <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                                <tr>
                                    <td style="text-align:center;"><strong>Prev. Entrega</strong></td>
                                    <td style="text-align:center;"><strong>Pedido</strong></td>
                                    <td style="text-align:center;"><strong>OP</strong></td>
                                    <td style="text-align:center;"><strong>Item</strong></td>
                                    <td style="text-align:center;"><strong>UN</strong></td>
                                    <td style="text-align:center;"><strong>Qtd Entrega</strong></td>
                                    <td style="text-align:center;"><strong>Qtd Est. Item</strong></td>
                                    <td style="text-align:center;"><strong>Cidade - UF</strong></td>
                                </tr>
                            `;
                            for (let i = 0; i < embarques.count; i++) {
                                report.__table += `
                                <tr>
                                    <td style="text-align:center;"> ${embarques.rows[i]['previsaodata']} </td>
                                    <td style="text-align:center;"> ${embarques.rows[i]['idpedido']} </td>
                                    <td style="text-align:center;"> ${embarques.rows[i]['idop'] || ''} </td>
                                    <td style="text-align:left;"> ${embarques.rows[i]['idversao']} </td>
                                    <td style="text-align:left;"> ${embarques.rows[i]['unidade']} </td>
                                    <td style="text-align:right;"> ${embarques.rows[i]['qtdentrega']} </td>
                                    <td style="text-align:right;"> ${embarques.rows[i]['qtdestoquetotal'] || ''} </td>
                                    <td style="text-align:left;"> ${embarques.rows[i]['cidade'] + ' - ' + embarques.rows[i]['uf']} </td>
                                </tr>
                                `;
                            }
                            report.__table += `
                            </table>
                            `;

                            let file = await main.platform.report.f_generate('Geral - Listagem Paisagem', report);
                            return application.success(obj.res, {
                                openurl: '/download/' + file
                            });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , proposta: {
                onsave: async function (obj, next) {
                    try {
                        if (obj.register.id == 0) {
                            obj.register.datahora = moment();
                            obj.register.idusuario = obj.req.user.id;
                        } else {
                            if (obj.register.digitado) {
                                return application.error(obj.res, { msg: 'Não é possível editar uma proposta completamente digitada' });
                            }
                        }
                        let invalidfields = [];
                        let alreadyinvalid = [];

                        function nextStep() {
                            obj._responseModifier = function (ret) {
                                delete ret['msg'];
                                delete ret['historyBack'];
                                return ret;
                            }
                            obj._cookies = [{ key: 'wizard-step', value: parseInt(obj.req.body['wizard-step']) + 1 }];
                        }
                        switch (obj.req.body['wizard-step']) {
                            case '0'://Cliente
                                if (obj.register.cliente_selecao == 'Novo') {
                                    invalidfields = application.functions.getEmptyFields(obj.register, [
                                        'cliente_nome'
                                        , 'cliente_endereco'
                                        , 'cliente_bairro'
                                        , 'cliente_uf'
                                        , 'cliente_cidade'
                                        , 'cliente_cep'
                                        , 'cliente_cnpj'
                                        , 'cliente_inscr_estadual'
                                        , 'cliente_fone'
                                        , 'cliente_endereco_cobranca'
                                        , 'cliente_endereco_entrega'
                                        , 'cliente_hora_recebimento'
                                    ]);
                                } else if (obj.register.cliente_selecao == 'Existe') {
                                    invalidfields = application.functions.getEmptyFields(obj.register, [
                                        'idcorrentista'
                                    ]);
                                    let cliente = await db.getModel('cad_corr').findOne({ where: { id: obj.register.idcorrentista } });
                                    if (cliente) {
                                        obj.register.condicao_pgto = cliente.condicaopgto;
                                    }
                                } else {
                                    invalidfields = ['cliente_selecao'];
                                }
                                if (invalidfields.length > 0) {
                                    return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                                }
                                nextStep();
                                break;
                            case '1'://Produto
                                let validar_produto_geral = [
                                    'produto_nome'
                                    , 'produto_tipo_pedido'
                                    , 'produto_pigmentado'
                                    , 'produto_laminado'
                                    , 'produto_liso_imp'
                                    , 'produto_estrutura'
                                    , 'produto_embalar'
                                    , 'produto_peso_envasar'
                                    , 'produto_peso_envasar_un'
                                ];

                                if (obj.register['produto_tipo_pedido'] == 'Teste' && !obj.register['produto_anexo_ficha_tecnica']) {
                                    alreadyinvalid = alreadyinvalid.concat(['produto_anexo_ficha_tecnica']);
                                }

                                if (obj.register['produto_pigmentado'] == 'Sim' && !obj.register['produto_cor_pigmento']) {
                                    alreadyinvalid = alreadyinvalid.concat(['produto_cor_pigmento']);
                                }

                                if (obj.register.produto_tipo == 'Saco') {
                                    invalidfields = application.functions.getEmptyFields(obj.register, [
                                        's_largura_final'
                                        , 's_altura_final'
                                        , 's_espessura_final'
                                        , 's_tipo_solda'
                                        , 's_pingo_solda'
                                        , 's_facilitador'
                                        , 's_aplicar_valvula'
                                        , 's_aplicar_ziper'
                                        , 's_aplicar_ziper_facil'
                                        , 's_picote'
                                    ].concat(validar_produto_geral));

                                    if (obj.register['s_pingo_solda'] == 'Sim' && !obj.register['s_qtd_pingo_solda']) {
                                        alreadyinvalid = alreadyinvalid.concat(['s_qtd_pingo_solda']);
                                    }

                                    if (obj.register['s_pingo_solda'] == 'Sim' && !obj.register['s_localizacao_pingo_solda']) {
                                        alreadyinvalid = alreadyinvalid.concat(['s_localizacao_pingo_solda']);
                                    }

                                    if (obj.register['s_aplicar_valvula'] == 'Sim' && !obj.register['s_posicao_valvula']) {
                                        alreadyinvalid = alreadyinvalid.concat(['s_posicao_valvula']);
                                    }

                                    if (obj.register['s_aplicar_ziper_facil'] == 'Sim' && !obj.register['s_tamanho_ziper_facil']) {
                                        alreadyinvalid = alreadyinvalid.concat(['s_tamanho_ziper_facil']);
                                    }

                                    if (obj.register['s_possui_furos'] == 'Sim' && !obj.register['s_qtd_furo'] && !obj.register['s_tipo_furo'] && !obj.register['s_localizacao_furos']) {
                                        alreadyinvalid = alreadyinvalid.concat(['s_qtd_furo', 's_tipo_furo']);
                                    }

                                } else if (obj.register.produto_tipo == 'Película') {

                                    if (!obj.register['p_diametro_maximo_bob'] && !obj.register['p_peso_maximo_bob']) {
                                        alreadyinvalid = alreadyinvalid.concat(['p_diametro_maximo_bob', 'p_peso_maximo_bob']);
                                    }

                                    invalidfields = application.functions.getEmptyFields(obj.register, [
                                        'p_largura_final'
                                        , 'p_espessura_final'
                                        , 'p_tipo_tubete'
                                        , 'p_diametro_tubete'
                                        , 'p_tipo_emenda'
                                        , 'p_aplicar_microfuros'
                                        , 'p_aplicar_ziper_facil'
                                    ].concat(validar_produto_geral));

                                    if (obj.register.produto_liso_imp == 'Impresso') {
                                        invalidfields = application.functions.getEmptyFields(obj.register, [
                                            'p_passo_fotocelula'
                                            , 'produto_aplicar_logo'
                                            , 'p_sentidoembob'
                                            , 'produto_qtd_pasta_padrao'
                                            , 'produto_aprovacao_arte'
                                            , 'produto_clicheria_cliente'
                                        ].concat(validar_produto_geral));
                                    }

                                    if (obj.register['p_aplicar_microfuros'] == 'Sim' && !obj.register['p_quantidade_microfuros']) {
                                        alreadyinvalid = alreadyinvalid.concat(['p_quantidade_microfuros']);
                                    }

                                    if (obj.register['p_aplicar_microfuros'] == 'Sim' && !obj.register['p_posicao_microfuros']) {
                                        alreadyinvalid = alreadyinvalid.concat(['p_posicao_microfuros']);
                                    }

                                    if (obj.register['p_aplicar_ziper_facil'] == 'Sim' && !obj.register['p_tamanho_zip_facil']) {
                                        alreadyinvalid = alreadyinvalid.concat(['p_tamanho_zip_facil']);
                                    }

                                    if (obj.register['p_possui_sanfona'] == 'Sim' && !obj.register['p_sanfona_direita'] && !obj.register['p_sanfona_esquerda']) {
                                        alreadyinvalid = alreadyinvalid.concat(['p_sanfona_esquerda', 'p_sanfona_direita']);
                                    }

                                } else {
                                    invalidfields = ['produto_tipo'];
                                }
                                if (invalidfields.concat(alreadyinvalid).length > 0) {
                                    return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields.concat(alreadyinvalid) });
                                }
                                nextStep();
                                break;
                            case '2'://Quantidades
                                invalidfields = application.functions.getEmptyFields(obj.register, [
                                    'entrega_quantidade'
                                    , 'entrega_unidade'
                                    , 'entrega_preco'
                                    , 'qtd_tpvenda'
                                ]);
                                if (!obj.register['entrega_tpreemb_caixa'] && !obj.register['entrega_tpreemb_cantoneira'] && !obj.register['entrega_tpreemb_pbolha'] && !obj.register['entrega_tpreemb_saco']) {
                                    invalidfields = invalidfields.concat(['entrega_tpreemb_caixa', 'entrega_tpreemb_cantoneira', 'entrega_tpreemb_pbolha', 'entrega_tpreemb_saco']);
                                }
                                if (invalidfields.length > 0) {
                                    return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                                }
                                nextStep();
                                break;
                            case '3'://Entregas
                                let sum = await db.getModel('ven_propostaentrega').sum('qtd', { where: { idproposta: obj.register.id } });
                                if (sum != obj.register.entrega_quantidade) {
                                    return application.error(obj.res, { msg: 'A quantidade das entregas é diferente da quantidade do pedido' });
                                }
                                nextStep();
                                break;
                            case '4'://Pagamento
                                invalidfields = application.functions.getEmptyFields(obj.register, [
                                    'condicao_pgto'
                                ]);
                                if (invalidfields.length > 0) {
                                    return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                                }
                                obj.register.digitado = true;
                                obj._redirect = '/v/proposta';
                                break;
                            default:
                                return application.error(obj.res, {});
                                break;
                        }

                        let saved = await next(obj);
                        if (saved.success) {
                            if (saved.register.digitado) {
                                let setor = await db.getModel('cad_setor').findOne({ where: { descricao: 'Comercial' } });
                                if (setor) {
                                    let usuarios = await db.getModel('cad_setorusuario').findAll({ where: { idsetor: setor.id } });
                                    let arr = [];
                                    for (let i = 0; i < usuarios.length; i++) {
                                        arr.push(usuarios[i].idusuario);
                                    }
                                    main.platform.notification.create(arr, {
                                        title: 'Nova Proposta'
                                        , description: 'ID ' + saved.register.id + ' / ' + saved.register.users.fullname
                                        , link: '/v/proposta/' + saved.register.id
                                    });
                                }
                                let file = await main.plastrela.venda.proposta.f_geraEspelho(saved.register.id);
                                if (file.success) {
                                    main.platform.mail.f_sendmail({
                                        to: [saved.register.users.email]
                                        , subject: `Proposta Número ${saved.register.id}`
                                        , html: `Segue em anexo o espelho da proposta.`
                                        , attachments: [{ path: `${__dirname}/../../tmp/${process.env.NODE_APPNAME}/${file.file}` }]
                                    })
                                }
                            }
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , ondelete: async function (obj, next) {
                    try {

                        let propostas = await db.getModel('ven_proposta').findAll({ where: { id: { [db.Op.in]: obj.ids } } });
                        for (let i = 0; i < propostas.length; i++) {
                            if (propostas[i].digitado) {
                                return application.error(obj.res, { msg: 'Não é possível apagar uma proposta completamente digitada' });
                            }
                        }

                        next(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , f_geraEspelho: (idproposta) => {
                    return new Promise((resolve, reject) => {
                        main.platform.model.findAll('ven_proposta', { include: [{ all: true }], where: { id: idproposta || 0 } }).then(proposta => {
                            if (!proposta) {
                                resolve({ success: false, msg: 'Proposta não encontrada' });
                            }
                            proposta = proposta.rows[0];
                            main.platform.model.findAll('ven_propostaentrega', { where: { idproposta: proposta.id } }).then(entregas => {
                                entregas = entregas.rows;
                                proposta._entregas = `
                                <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                                    <tr>
                                        <td style="text-align:center;"><strong>Entregas</strong></td>
                                        <td style="text-align:center;"><strong>Quantidades</strong></td>
                                        <td style="text-align:center;"><strong>Ordem de Compra</strong></td>
                                        <td style="text-align:center;"><strong>Endereço</strong></td>
                                    </tr>
                                `;
                                for (let i = 0; i < entregas.length; i++) {
                                    proposta._entregas += `
                                    <tr>
                                        <td style="text-align:center;"> ${entregas[i]['data'] || ''}          </td>
                                        <td style="text-align:right;">  ${entregas[i]['qtd'] || ''}           </td>
                                        <td style="text-align:left;">   ${entregas[i]['ordemcompra'] || ''}   </td>
                                        <td style="text-align:left;">   ${entregas[i]['endereco_entrega'] || ''}   </td>
                                    </tr>
                                `;
                                }
                                proposta._entregas += `
                                </table>
                                `;
                                proposta._tipo_reembalagem = [];
                                if (proposta.entrega_tpreemb_caixa) {
                                    proposta._tipo_reembalagem.push('Caixa');
                                }
                                if (proposta.entrega_tpreemb_cantoneira) {
                                    proposta._tipo_reembalagem.push('Cantoneira');
                                }
                                if (proposta.entrega_tpreemb_pbolha) {
                                    proposta._tipo_reembalagem.push('Plástico Bolha');
                                }
                                if (proposta.entrega_tpreemb_saco) {
                                    proposta._tipo_reembalagem.push('Saco');
                                }
                                proposta._tipo_reembalagem = proposta._tipo_reembalagem.join(', ');
                                main.platform.report.f_generate('Comercial - Espelho Pedido - ' + proposta.produto_tipo, proposta).then(file => {
                                    resolve({ success: true, file: file });
                                });
                            });
                        });
                    });
                }
                , e_imprimir: async function (obj) {
                    try {
                        if (obj.ids.length != 1) {
                            return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                        }
                        let file = await main.plastrela.venda.proposta.f_geraEspelho(obj.ids[0]);
                        if (file.success) {
                            return application.success(obj.res, {
                                openurl: '/download/' + file.file
                            });
                        } else {
                            return application.error(obj.res, {
                                msg: file.msg
                            });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_visualizado: async function (obj) {
                    try {
                        if (obj.ids.length <= 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }
                        await db.getModel('ven_proposta').update({ visualizadopor: obj.req.user.id }, { where: { id: { [db.Op.in]: obj.ids } } });
                        return application.success(obj.res, { msg: application.message.success });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_cancelar: async function (obj) {
                    try {
                        if (obj.ids.length <= 0) {
                            return application.error(obj.res, { msg: application.message.selectOneEvent });
                        }
                        await db.getModel('ven_proposta').update({ cancelada: true }, { where: { id: { [db.Op.in]: obj.ids } } });
                        return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , propostaentrega: {
                onsave: async function (obj, next) {
                    try {

                        let proposta = await db.getModel('ven_proposta').findOne({ where: { id: obj.register.idproposta } });
                        if (proposta.digitado) {
                            return application.error(obj.res, { msg: 'Não é possível editar uma proposta completamente digitada' });
                        }
                        if (obj.register['entrega_igual_faturamento'] == 'Não' && !obj.register['endereco_entrega']) {
                            return application.error(obj.res, { msg: 'Informar o endereço de entrega', invalidfields: ['endereco_entrega'] });
                        }

                        await next(obj);

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , ondelete: async function (obj, next) {
                    try {

                        let propostaentrega = await db.getModel('ven_propostaentrega').findOne({ include: [{ all: true }], where: { id: obj.ids[0] } });
                        if (propostaentrega.ven_proposta.digitado) {
                            return application.error(obj.res, { msg: 'Não é possível editar uma proposta completamente digitada' });
                        }

                        await next(obj);

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
        }
    }
}

//Agendamento de Atividades
db.sequelize.query("SELECT * FROM atv_atividadeag where ativo", { type: db.sequelize.QueryTypes.SELECT }).then(scheds => {
    scheds.map(sched => {
        main.atividade.atividadeag.f_ativar(sched);
    });
});

module.exports = main;