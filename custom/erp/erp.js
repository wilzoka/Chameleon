const application = require('../../routes/application')
    , db = require('../../models')
    , moment = require('moment')
    ;

let main = {
    platform: require('../platform.js')
    , erp: {
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
                            let pessoa = await db.getModel('cad_pessoa').find({ where: { id: saved.register.id } })
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
        , comercial: {
            venda: {
                onsave: async function (obj, next) {
                    try {

                        if (obj.register.id == 0) {
                            obj.register.idusuario = obj.req.user.id;
                            obj.register.datahora = moment();
                        } else {
                            if (obj.register.digitado) {
                                return application.error(obj.res, { msg: 'Não é possível alterar uma venda concluída' });
                            }
                        }

                        function nextStep() {
                            obj._responseModifier = function (ret) {
                                delete ret['msg'];
                                delete ret['historyBack'];
                                return ret;
                            }
                            obj._cookies = [{ key: 'wizard-step', value: parseInt(obj.req.body['wizard-step']) + 1 }];
                        }
                        let neednotification = false;

                        switch (obj.req.body['wizard-step']) {
                            case '0'://Cliente
                                nextStep();
                                break;
                            case '1'://Produto
                                nextStep();
                                break;
                            case '2'://Retorno
                                nextStep();
                                break;
                            case '3'://Pagamento
                                if (!obj.register.digitado) {
                                    obj.register.digitado = true;
                                    neednotification = true;

                                    let somavenda = await db.sequelize.query(`select sum(vi.qtd * vi.valorunitario) as total from com_vendaitem vi where vi.idvenda = :idvenda`, { type: db.Sequelize.QueryTypes.SELECT, replacements: { idvenda: obj.register.id } });
                                    let totalvenda = parseFloat(somavenda[0]['total']) - parseFloat(obj.register.desconto || 0) + parseFloat(obj.register.acrescimo || 0);
                                    if (!obj.register.identregador) {
                                        return application.error(obj.res, { msg: `É obrigatório informar o entregador` })
                                    }
                                    let tipovenda = await db.getModel('com_tipovenda').find({ where: { id: obj.register.idtipovenda } });
                                    if (!tipovenda.idcategoria) {
                                        return application.error(obj.res, { msg: `Tipo de venda "${tipovenda.description}" sem categoria definida` })
                                    }
                                    let vendaformaspgto = await db.getModel('com_vendapagamento').findAll({ where: { idvenda: obj.register.id } });
                                    let formaspgto = await db.getModel('fin_formapgto').findAll({ where: { disp_venda: true } });
                                    let conta = await db.getModel('users').find({ where: { id: obj.register.identregador } })
                                    let valorestante = totalvenda

                                    if (vendaformaspgto.length > 0) {
                                        for (let i = 0; i < vendaformaspgto.length; i++) {
                                            let prazo = 0
                                            let valortaxas = 0
                                            let totalparcelas = 0
                                            for (let j = 0; j < formaspgto.length; j++) {
                                                if (vendaformaspgto[i].idformapgto == formaspgto[j].id) {
                                                    if (formaspgto[j].formarecebimento == 'a Vista') {
                                                        let mov = await db.getModel('fin_mov').create({
                                                            datavcto: moment()
                                                            , idcategoria: tipovenda.idcategoria
                                                            , valor: vendaformaspgto[i].valor
                                                            , parcela: null
                                                            , quitado: true
                                                            , idpessoa: obj.register.idcliente
                                                            , idvenda: obj.register.id
                                                            , detalhe: `Venda ID ${obj.register.id}`
                                                        })
                                                        let movparc = await db.getModel('fin_movparc').create({
                                                            datahora: moment()
                                                            , idmov: mov.id
                                                            , valor: vendaformaspgto[i].valor
                                                            , idformapgto: vendaformaspgto[i].idformapgto
                                                            , idconta: conta.idconta
                                                        })
                                                    } else if (formaspgto[j].formarecebimento == 'a Prazo') {
                                                        prazo += formaspgto[j].prazo != null ? formaspgto[j].prazo : moment(vendaformaspgto[i].vencimento).diff(moment(), 'd') + 1
                                                        valortaxas += formaspgto[j].taxa != null ? parseFloat((parseFloat(vendaformaspgto[i].valor) * formaspgto[j].taxa) / 100) : 0
                                                        totalparcelas += formaspgto[j].parcelas != null ? formaspgto[j].parcelas : 0
                                                        let valorparcela = totalparcelas == 0 ? vendaformaspgto[i].valor : (vendaformaspgto[i].valor - valortaxas) / totalparcelas
                                                        let datavenc = moment().add(prazo, 'day')
                                                        if (totalparcelas > 0) {
                                                            for (let l = 0; l < totalparcelas; l++) {
                                                                let mov = await db.getModel('fin_mov').create({
                                                                    datavcto: datavenc
                                                                    , idcategoria: tipovenda.idcategoria
                                                                    , valor: valorparcela
                                                                    , parcela: totalparcelas == 0 ? null : (l + 1) + '/' + totalparcelas
                                                                    , quitado: false
                                                                    , preformapgto: vendaformaspgto[i].idformapgto
                                                                    , idpessoa: obj.register.idcliente
                                                                    , idvenda: obj.register.id
                                                                    , detalhe: `Venda ID ${obj.register.id}`
                                                                })
                                                                datavenc = datavenc.add(prazo, 'day')
                                                            }
                                                        } else {
                                                            let mov = await db.getModel('fin_mov').create({
                                                                datavcto: datavenc
                                                                , idcategoria: tipovenda.idcategoria
                                                                , valor: valorparcela
                                                                , parcela: totalparcelas == 0 ? null : (l + 1) + '/' + totalparcelas
                                                                , quitado: false
                                                                , preformapgto: vendaformaspgto[i].idformapgto
                                                                , idpessoa: obj.register.idcliente
                                                                , idvenda: obj.register.id
                                                                , detalhe: `Venda ID ${obj.register.id}`
                                                            })
                                                        }
                                                    } else if (formaspgto[j].formarecebimento == 'Vale') {
                                                        let retorno = await main.erp.comercial.venda.f_atualizarValeColetado(formaspgto[j], obj.register.idcliente);
                                                        if (!retorno) {
                                                            return application.error(obj.res, { msg: `Vale não cadastrado. Solicitar cadastro` })
                                                        }
                                                    } else {
                                                        main.erp.suprimentos.estoque.f_atualizarSaldoItemTroca(formaspgto[j]);
                                                    }
                                                    valorestante -= vendaformaspgto[i].valor
                                                }
                                            }
                                        }
                                        if (valorestante > 0) {
                                            let mov = await db.getModel('fin_mov').create({
                                                datavcto: moment().add(30, 'day')
                                                , idcategoria: tipovenda.idcategoria
                                                , valor: valorestante
                                                , quitado: false
                                                , idpessoa: obj.register.idcliente
                                                , idvenda: obj.register.id
                                                , detalhe: `Venda ID ${obj.register.id}`
                                            })
                                        }
                                    } else {
                                        let mov = await db.getModel('fin_mov').create({
                                            datavcto: moment().add(30, 'day')
                                            , idcategoria: tipovenda.idcategoria
                                            , valor: totalvenda
                                            , quitado: false
                                            , idpessoa: obj.register.idcliente
                                            , idvenda: obj.register.id
                                            , detalhe: `Venda ID ${obj.register.id}`
                                        })
                                    }

                                    /* if (atualizarEstoques) {
                                        let vendaitens = await db.getModel('com_vendaitem').findAll({ where: { idvenda: obj.register.id } });
                                        f_atualizarEstoque(vendaitens);
                                    } */
                                }
                                break;
                            default:
                                return application.error(obj.res, {});
                                break;
                        }

                        let saved = await next(obj);

                        if (saved.success && saved.register.identregador && neednotification) {
                            let cliente = await db.getModel('cad_pessoa').find({ where: { id: saved.register.idcliente } })
                            main.platform.notification.create([4], {
                                title: 'Nova Venda'
                                , description: cliente.fantasia
                                , link: '/v/venda/' + saved.register.id
                            });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_historicoCompras: async function (obj) {
                    try {
                        let historico = await db.sequelize.query(
                            `SELECT "com_venda"."datahora"
                                , "cad_pessoa"."nome" AS "cliente"
                                , (select sum(vi.qtd * vi.valorunitario) from com_vendaitem vi where vi.idvenda = com_venda.id) - coalesce(com_venda.desconto, 0) + coalesce(com_venda.acrescimo, 0)  AS "totalvenda"
                                , (select sum(valor) from fin_mov where idvenda = com_venda.id) AS "totalpendente"
                            FROM "com_venda" AS "com_venda" 
                            LEFT OUTER JOIN "cad_pessoa"        AS "cad_pessoa"     ON "com_venda"."idcliente" = "cad_pessoa"."id" 
                            WHERE com_venda.idcliente = :cliente
                            ORDER BY com_venda.datahora DESC`
                            , {
                                type: db.Sequelize.QueryTypes.SELECT
                                , replacements: {
                                    cliente: obj.data.idcliente
                                }
                            });

                        let body = `
                            <div id="tablebody" class="col-md-12">
                                <h4 align="center"> Pendências Financeiras </h4>
                                <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse; width:100%">
                                    <tr>
                                        <td style="text-align:center;"><strong>Data/Hora</strong></td>
                                        <td style="text-align:center;"><strong>Cliente</strong></td>
                                        <td style="text-align:center;"><strong>Total Venda</strong></td>
                                        <td style="text-align:center;"><strong>Total Pendente</strong></td>
                                    </tr>
                                    `;
                        for (let i = 0; i < historico.length; i++) {
                            body += `
                            <tr>
                                <td style="text-align:center;"> ${application.formatters.fe.date(historico[i].datahora)}   </td>
                                <td style="text-align:center;">  ${historico[i].cliente}   </td>
                                <td style="text-align:right;">  ${historico[i].totalvenda}   </td>
                                <td style="text-align:right;">  ${historico[i].totalpendente}   </td>
                            </tr>
                            `;
                        }
                        body += `
                        </table>
                        </div>`;

                        return application.success(obj.res, { body });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_cadastrarvales: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {

                            let vales = await db.getModel('fin_formapgto').findAll();
                            let itens = await db.getModel('cad_item').findAll();
                            let pessoas = await db.getModel('cad_pessoa').findAll();

                            let body = '';
                            body += application.components.html.date({
                                width: '4'
                                , label: 'Data'
                                , name: 'data'
                                , value: moment().format(application.formatters.fe.date_format)
                            });
                            body += application.components.html.autocomplete({
                                width: '4'
                                , label: 'Vale'
                                , name: 'idformapgto'
                                , model: 'fin_formapgto'
                                , attribute: 'descricao'
                                , where: `formarecebimento = 'Vale'`
                            });
                            body += application.components.html.autocomplete({
                                width: '4'
                                , label: 'Item'
                                , name: 'iditem'
                                , model: 'cad_item'
                                , attribute: 'descricao'
                            });
                            body += application.components.html.autocomplete({
                                width: '4'
                                , label: 'Pessoa'
                                , name: 'idpessoa'
                                , model: 'cad_pessoa'
                                , attribute: 'nome'
                            });
                            body += application.components.html.integer({
                                width: '4'
                                , label: 'Quantidade'
                                , name: 'qtd'
                            });
                            body += application.components.html.decimal({
                                width: '4'
                                , label: 'Valor Entrega'
                                , name: 'valorentrega'
                                , precision: '2'
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , id: 'modalevt'
                                    , action: '/event/' + obj.event.id
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Cadastrar</button>'
                                }
                            });

                        } else {

                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['data', 'idformapgto', 'iditem', 'qtd']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }

                            if (obj.req.body.qtd <= 0) {
                                return application.error(obj.res, { msg: 'A quantidade deve ser maior que 0', invalidfields: ['qtd'] });
                            }

                            for (let i = 0; i < obj.req.body.qtd; i++) {
                                let vale = await db.getModel('com_vale').create({
                                    data: application.formatters.be.date(obj.req.body.data)
                                    , idformapgto: obj.req.body.idformapgto
                                    , iditem: obj.req.body.iditem
                                    , idpessoa: typeof obj.req.body.idpessoa == 'undefined' ? null : obj.req.body.idpessoa
                                    , valorentrega: obj.req.body.valorentrega == '' ? null : application.formatters.be.decimal(obj.req.body.valorentrega)
                                });
                            }
                        }
                        return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , f_atualizarValeColetado: async function (obj, idcliente) {
                    try {
                        let vale = await db.getModel('com_vale').find({ where: { idformapgto: obj.id, idpessoa: idcliente, coletado: false }, order: [['data', 'asc']] });
                        if (vale) {
                            vale.coletado = true;
                            await vale.save()
                            return true;
                        } else {
                            return false;
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , precovenda: {
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
                , js_getValorUnitario: async function (obj) {
                    try {
                        if (!obj.data.iditem) {
                            return application.error(obj.res, {});
                        }
                        let item = await db.getModel('com_precovenda').find({ where: { iditem: obj.data.iditem }, order: [['datahora', 'desc']] });
                        if (!item) {
                            return application.error(obj.res, { msg: 'Preço não encontrado' });
                        }
                        return application.success(obj.res, { data: application.formatters.fe.decimal(item.precovenda, 2) });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , vendapagamento: {
                onsave: async function (obj, next) {
                    try {
                        let formareceb = await db.getModel('fin_formapgto').find({ where: { id: obj.register.idformapgto } })
                        if (formareceb.formarecebimento == 'a Prazo' && formareceb.prazo == null && obj.register.vencimento == null) {
                            return application.error(obj.res, { msg: `Venda a prazo. Informe o vencimento` })
                        }
                        next(obj)
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
        }
        , financeiro: {
            categoria: {
                onsave: async function (obj, next) {
                    try {
                        if (obj.register.id == 0) {
                            if (obj.register.idcategoriapai) {
                                let categoriapai = await db.getModel('fin_categoria').find({ where: { id: obj.register.idcategoriapai } });
                                obj.register.dc = categoriapai.dc;
                            } else {
                                obj.register.dc = parseInt(obj.req.body.dc);
                            }
                        }
                        await next(obj);
                        main.erp.financeiro.categoria.f_treeAll();
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , f_treeAll: function () {
                    let getChildren = function (current, childs) {
                        for (var i = 0; i < childs.length; i++) {
                            if (current.idcategoriapai == childs[i].id) {
                                if (childs[i].idcategoriapai) {
                                    return getChildren(childs[i], childs) + childs[i].descricao + ' - ';
                                } else {
                                    return childs[i].descricao + ' - ';
                                }
                            }
                        }
                    }
                    db.getModel('fin_categoria').findAll().then(categorias => {
                        categorias.map(categoria => {
                            if (categoria.idcategoriapai) {
                                categoria.descricaocompleta = getChildren(categoria, categorias) + categoria.descricao;
                            } else {
                                categoria.descricaocompleta = categoria.descricao;
                            }
                            categoria.save();
                        });
                    });
                }
            }
            , conta: {
                onsave: async function (obj, next) {
                    try {
                        if (obj.register.id == 0) {
                            obj.register.saldoatual = 0;
                        }
                        next(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , f_recalculaSaldos: function () {
                    db.sequelize.query(`
                        update fin_conta c set saldoatual = (
                            with saldoanterior as (
                            select c.*
                            , coalesce((select cs.valor from fin_contasaldo cs where cs.idconta = c.id order by datahora desc limit 1), 0) as saldoanterior
                            , coalesce((select max(cs.datahora) from fin_contasaldo cs where cs.idconta = c.id), '1900-01-01':: timestamp ) as datahora
                        from fin_conta c)
                        select (
                            coalesce(sum(mp.valor * case when cat.dc = 1 then - 1 else 1 end), 0)
                            + coalesce(sum(mp.juro * case when cat.dc = 1 then - 1 else 1 end), 0)
                            + coalesce(sum(mp.desconto * case when cat.dc = 1 then 1 else -1 end), 0)
                            ):: decimal(14, 2)
                        from
                        fin_movparc mp
                        left join fin_mov m on(mp.idmov = m.id)
                        left join fin_categoria cat on(m.idcategoria = cat.id)
                        where
                        mp.idconta = c.id
                        and mp.datahora > (select sa.datahora from saldoanterior sa where sa.id = mp.idconta)`
                        , { type: db.sequelize.QueryTypes.UPDATE });
                }
                , js_saldoData: async function (obj) {
                    try {
                        let conta = await db.getModel('fin_conta').find({ where: { id: obj.data.idconta } });
                        let saldoanterior = await db.getModel('fin_contasaldo').find({ where: { idconta: obj.data.idconta }, order: [['datahora', 'desc']] });
                        let sql = await db.sequelize.query(`
                            select
                            sum(case when c.dc = 1 then(mp.valor - coalesce(mp.desconto, 0) + coalesce(mp.juro, 0)) * -1 else mp.valor - coalesce(mp.desconto, 0) + coalesce(mp.juro, 0) end) as soma
                            from
                            fin_mov m
                            left join fin_movparc mp on(m.id = mp.idmov)
                            left join fin_categoria c on(m.idcategoria = c.id)
                            where
                            mp.idconta = : conta
                            and mp.data > : dataini
                            and mp.data <= : datafim `
                            , {
                                type: db.sequelize.QueryTypes.SELECT
                                , replacements: {
                                    conta: obj.data.idconta
                                    , dataini: saldoanterior ? saldoanterior.data : '1900-01-01'
                                    , datafim: application.formatters.be.date(obj.data.data)
                                }
                            });
                        if (sql.length > 0 && sql[0].soma) {
                            return application.success(obj.res, { data: application.formatters.fe.decimal(parseFloat(sql[0].soma) + (saldoanterior ? parseFloat(saldoanterior.valor) : 0), 2) });
                        } else {
                            return application.success(obj.res, { data: application.formatters.fe.decimal(saldoanterior ? parseFloat(saldoanterior.valor) : 0, 2) });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , contasaldo: {
                onsave: async function (obj, next) {
                    try {
                        let count = await db.getModel('fin_contasaldo').count({ where: { id: { $ne: obj.register.id }, datahora: { $gt: obj.register.datahora } } });
                        if (count > 0) {
                            return application.error(obj.res, { msg: 'Existe um fechamento de caixa maior que desta data' });
                        }
                        next(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , formapgto: {
                onsave: async function (obj, next) {
                    try {
                        if (obj.register.formarecebimento = 'Vale' && obj.register.iditem == null) {
                            return application.error(obj.res, { msg: 'É obrigatório informar o item de troca.' });
                        }
                        next(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , mov: {
                e_baixarTitulos: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {
                            if (obj.ids.length <= 0) {
                                return application.error(obj.res, { msg: application.message.selectOneEvent });
                            }
                            let count = 0
                            let formapgto = null
                            let aux = null
                            if (obj.ids.length > 1) {
                                for (let i = 0; i < obj.ids.length; i++) {
                                    aux = await db.getModel('fin_mov').find({ where: { id: obj.ids[i] } });
                                    if (aux.preformapgto != null) {
                                        count++;
                                    }
                                }
                                if (count > 1) {
                                    return application.error(obj.res, { msg: 'Existem títulos com forma de pagamento pré definidas. Esses devem ser baixados individualmente.' });
                                }
                            } else {
                                aux = await db.getModel('fin_mov').find({ where: { id: obj.ids[0] } });
                                if (aux.preformapgto) {
                                    formapgto = await db.getModel('fin_formapgto').find({ where: { id: aux.preformapgto } });
                                }
                            }
                            let body = '';
                            body += '<div class="row no-margin">';
                            body += application.components.html.hidden({ name: 'ids', value: obj.ids.join(',') });
                            body += application.components.html.datetime({
                                width: '4'
                                , label: 'Data/Hora*'
                                , name: 'datahora'
                                , value: moment().format(application.formatters.fe.datetime_format)
                            });
                            body += application.components.html.autocomplete({
                                width: '4'
                                , label: 'Conta*'
                                , name: 'idconta'
                                , model: 'fin_conta'
                                , attribute: 'descricao'
                            });
                            body += application.components.html.autocomplete({
                                width: '4'
                                , label: 'Forma de Pagamento*'
                                , name: 'idformapgto'
                                , model: 'fin_formapgto'
                                , attribute: 'descricao'
                                , option: formapgto ? '<option value="' + formapgto + '" selected>' + formapgto.descricao + '</option>' : ''
                            });
                            body += '</div><hr>';

                            let valortotalselecionado = 0;
                            for (let i = 0; i < obj.ids.length; i++) {

                                let mov = await db.getModel('fin_mov').find({ where: { id: obj.ids[i] }, include: [{ all: true }] });
                                let valoraberto = application.formatters.fe.decimal((await db.sequelize.query(`
                                    select
                                    m.valor - coalesce(
                                        (select
                                                                                sum(mp.valor)
                                                                                from fin_movparc mp where m.id = mp.idmov)
                                        , 0) as valoraberto
                                    from
                                    fin_mov m
                                    where m.id = :v1
                                    `
                                    , {
                                        type: db.sequelize.QueryTypes.SELECT
                                        , replacements: {
                                            v1: mov.id
                                        }
                                    }))[0].valoraberto, 2);
                                valortotalselecionado += parseFloat(application.formatters.be.decimal(valoraberto, 2))

                                body += '<div class="row no-margin">';

                                body += application.components.html.integer({
                                    width: '2'
                                    , label: 'ID'
                                    , name: 'id' + obj.ids[i]
                                    , value: mov.id
                                    , disabled: 'disabled="disabled"'
                                });

                                body += application.components.html.text({
                                    width: '4'
                                    , label: 'Pessoa'
                                    , name: 'cliente' + obj.ids[i]
                                    , value: mov.cad_pessoa ? mov.cad_pessoa.nome : ''
                                    , disabled: 'disabled="disabled"'
                                });

                                body += application.components.html.decimal({
                                    width: '2'
                                    , label: 'Valor*'
                                    , name: 'valor' + obj.ids[i]
                                    , precision: 2
                                    , value: valoraberto
                                });

                                body += application.components.html.decimal({
                                    width: '2'
                                    , label: 'Juro'
                                    , name: 'juro' + obj.ids[i]
                                    , precision: 2
                                });

                                body += application.components.html.decimal({
                                    width: '2'
                                    , label: 'Desconto'
                                    , name: 'desconto' + obj.ids[i]
                                    , precision: 2
                                });

                                body += '</div><hr>';

                            }

                            body += '<div class="row no-margin">';
                            body += application.components.html.decimal({
                                width: '2 col-sm-offset-6'
                                , label: 'Total Valor'
                                , name: 'valortotal'
                                , precision: 2
                                , disabled: 'disabled="disabled"'
                                , value: application.formatters.fe.decimal(valortotalselecionado, 2)
                            });
                            body += '</div>';

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , fullscreen: true
                                    , id: 'modalevt'
                                    , action: '/event/' + obj.event.id
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Baixar</button>'
                                }
                            });

                        } else {

                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['ids', 'idconta', 'idformapgto', 'datahora']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }

                            let ids = obj.req.body.ids.split(',');
                            let requiredFields = [];
                            for (let i = 0; i < ids.length; i++) {
                                requiredFields = requiredFields.concat(application.functions.getEmptyFields(obj.req.body, [
                                    'valor' + ids[i]
                                ]));
                            }
                            if (requiredFields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: requiredFields });
                            }

                            let fechamento = await db.getModel('fin_contasaldo').find({ where: { idconta: obj.req.body.idconta, datahora: { $gte: application.formatters.be.datetime(obj.req.body.datahora) } } });
                            if (fechamento) {
                                return application.error(obj.res, { msg: 'Conta fechada para lançamento nesta data/hora' });
                            }

                            for (let i = 0; i < ids.length; i++) {
                                let mov = await db.getModel('fin_mov').find({ where: { id: ids[i] }, include: [{ all: true }] });
                                let movparc = await db.getModel('fin_movparc').create({
                                    valor: application.formatters.be.decimal(obj.req.body['valor' + ids[i]], 2)
                                    , idmov: mov.id
                                    , idformapgto: obj.req.body.idformapgto
                                    , idconta: obj.req.body.idconta
                                    , desconto: obj.req.body['desconto' + ids[i]] ? application.formatters.be.decimal(obj.req.body['desconto' + ids[i]], 2) : null
                                    , juro: obj.req.body['juro' + ids[i]] ? application.formatters.be.decimal(obj.req.body['juro' + ids[i]], 2) : null
                                    , datahora: application.formatters.be.datetime(obj.req.body.datahora)
                                });
                            }

                            for (let i = 0; i < ids.length; i++) {
                                let valoraberto = parseFloat((await db.sequelize.query(`
select
m.valor - coalesce(
    (select
                                        sum(mp.valor)
                                        from fin_movparc mp where m.id = mp.idmov)
    , 0) as valoraberto
from
fin_mov m
where m.id = :v1
    `
                                    , {
                                        type: db.sequelize.QueryTypes.SELECT
                                        , replacements: {
                                            v1: ids[i]
                                        }
                                    }))[0].valoraberto);
                                if (valoraberto <= 0) {
                                    let mov = await db.getModel('fin_mov').find({ where: { id: ids[i] } });
                                    mov.quitado = true;
                                    await mov.save();
                                }
                            }
                            main.erp.financeiro.conta.f_recalculaSaldos();
                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , movparc: {
                ondelete: async function (obj, next) {
                    try {
                        let movparcs = await db.getModel('fin_movparc').findAll({ where: { id: { $in: obj.ids } } });
                        let ids = [];
                        for (let i = 0; i < movparcs.length; i++) {
                            let fechamento = await db.getModel('fin_contasaldo').find({ where: { idconta: movparcs[i].idconta, datahora: { $gte: movparcs[i].datahora } } });
                            if (fechamento) {
                                return application.error(obj.res, { msg: 'Conta fechada para estorno nesta data/hora' });
                            }
                            ids.push(movparcs[i].idmov);
                        }
                        let movs = await db.getModel('fin_mov').findAll({ where: { id: { $in: ids } } });
                        await next(obj);
                        for (let i = 0; i < movs.length; i++) {
                            movs[i].quitado = false;
                            movs[i].save();
                        }
                        main.erp.financeiro.conta.f_recalculaSaldos();
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_transferencia: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {

                            let categoriad = await db.getModel('fin_categoria').find({ where: { descricaocompleta: 'Transferência - Débito' } });
                            let categoriac = await db.getModel('fin_categoria').find({ where: { descricaocompleta: 'Transferência - Crédito' } });

                            let body = '';
                            body += application.components.html.autocomplete({
                                width: '5'
                                , label: 'Categoria de Débito'
                                , name: 'idcategoriad'
                                , model: 'fin_categoria'
                                , attribute: 'descricaocompleta'
                                , where: 'dc = 1'
                                , option: categoriad ? '<option value="' + categoriad.id + '" selected>' + categoriad.descricaocompleta + '</option>' : ''
                            });
                            body += application.components.html.autocomplete({
                                width: '4'
                                , label: 'Conta de Débito'
                                , name: 'idcontad'
                                , model: 'fin_conta'
                                , attribute: 'descricao'
                            });
                            body += application.components.html.autocomplete({
                                width: '3'
                                , label: 'Forma Pgto'
                                , name: 'idformapgtod'
                                , model: 'fin_formapgto'
                                , attribute: 'descricao'
                            });
                            body += application.components.html.autocomplete({
                                width: '5'
                                , label: 'Categoria de Crédito'
                                , name: 'idcategoriac'
                                , model: 'fin_categoria'
                                , attribute: 'descricaocompleta'
                                , where: 'dc = 2'
                                , option: categoriac ? '<option value="' + categoriac.id + '" selected>' + categoriac.descricaocompleta + '</option>' : ''
                            });
                            body += application.components.html.autocomplete({
                                width: '4'
                                , label: 'Conta de Crédito'
                                , name: 'idcontac'
                                , model: 'fin_conta'
                                , attribute: 'descricao'
                            });
                            body += application.components.html.autocomplete({
                                width: '3'
                                , label: 'Forma de Pgto'
                                , name: 'idformapgtoc'
                                , model: 'fin_formapgto'
                                , attribute: 'descricao'
                            });
                            body += application.components.html.datetime({
                                width: '5'
                                , label: 'Data/Hora'
                                , name: 'datahora'
                                , value: moment().format(application.formatters.fe.datetime_format)
                            });
                            body += application.components.html.decimal({
                                width: '7'
                                , label: 'Valor'
                                , name: 'valor'
                                , precision: '2'
                            });
                            body += application.components.html.text({
                                width: '12'
                                , label: 'Detalhe'
                                , name: 'detalhe'
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , id: 'modalevt'
                                    , action: '/event/' + obj.event.id
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Transferir</button>'
                                }
                            });

                        } else {

                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['idcategoriad', 'idcontad', 'idformapgtod', 'idcategoriac', 'idcontac', 'idformapgtoc', 'datahora', 'valor']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }
                            let valor = application.formatters.be.decimal(obj.req.body.valor, 2);
                            let datahora = application.formatters.be.datetime(obj.req.body.datahora);

                            if (parseFloat(valor) <= 0) {
                                return application.error(obj.res, { msg: 'O valor deve ser maior que 0', invalidfields: ['valor'] });
                            }
                            let fechamento = await db.getModel('fin_contasaldo').find({ include: [{ all: true }], where: { idconta: obj.req.body.idcontad, datahora: { $gte: application.formatters.be.datetime(obj.req.body.datahora) } } });
                            if (fechamento) {
                                return application.error(obj.res, { msg: `Conta ${fechamento.fin_conta.descricao} fechada para lançamento nesta data/hora` });
                            }
                            fechamento = await db.getModel('fin_contasaldo').find({ include: [{ all: true }], where: { idconta: obj.req.body.idcontac, datahora: { $gte: application.formatters.be.datetime(obj.req.body.datahora) } } });
                            if (fechamento) {
                                return application.error(obj.res, { msg: `Conta ${fechamento.fin_conta.descricao} fechada para lançamento nesta data/hora` });
                            }

                            let movd = await db.getModel('fin_mov').create({
                                datavcto: datahora
                                , idcategoria: obj.req.body.idcategoriad
                                , valor: valor
                                , quitado: true
                                , detalhe: obj.req.body.detalhe || null
                            });
                            let movparcd = await db.getModel('fin_movparc').create({
                                valor: valor
                                , idmov: movd.id
                                , idformapgto: obj.req.body.idformapgtod
                                , idconta: obj.req.body.idcontad
                                , datahora: datahora
                            });

                            let movc = await db.getModel('fin_mov').create({
                                datavcto: datahora
                                , idcategoria: obj.req.body.idcategoriac
                                , valor: valor
                                , quitado: true
                                , detalhe: obj.req.body.detalhe || null
                            });
                            let movparcc = await db.getModel('fin_movparc').create({
                                valor: valor
                                , idmov: movc.id
                                , idformapgto: obj.req.body.idformapgtoc
                                , idconta: obj.req.body.idcontac
                                , datahora: datahora
                            });

                            main.erp.financeiro.conta.f_recalculaSaldos();

                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
        }
        , suprimentos: {
            estoque: {
                f_atualizarSaldoItemTroca: async function (obj, next) {
                    try {
                        let item = await db.getModel('cad_item').find({ where: { id: obj.iditem } });
                        db.getModel('cad_item').update({ estoqueatual: item.estoqueatual + 1, estoqueproprio: item.estoqueproprio + 1 }, { where: { id: obj.iditem } });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
        }
    }
}

module.exports = main;