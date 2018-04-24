const application = require('../../routes/application')
    , db = require('../../models')
    , moment = require('moment')
    , fs = require('fs')
    ;

let main = {
    platform: require('../platform.js')
    , sipfinancas: {
        cadastro: {
            correntista: {
                onsave: async function (obj, next) {
                    try {
                        obj.register.nomecompleto = obj.register.codigo + ' - ' + obj.register.nome;
                        next(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , item: {
                onsave: async function (obj, next) {
                    try {
                        obj.register.descricaocompleta = obj.register.codigo + ' - ' + obj.register.descricao;
                        next(obj);
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
                        main.sipfinancas.financeiro.categoria.treeAll();
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , treeAll: function () {

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
            , cheque: {
                onsave: async function (obj, next) {
                    try {

                        let saved = await next(obj);
                        if (saved.success) {
                            db.sequelize.query("update fin_cheque set descricaocompleta = id::text || ' - ' || coalesce((select cc.nome from cad_corr cc where cc.id = idcliente), ' SEM CLIENTE ') || ' - R$ ' || valor;", { type: db.sequelize.QueryTypes.UPDATE });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , conta: {
                js_saldoData: async function (obj) {
                    try {
                        let conta = await db.getModel('fin_conta').find({ where: { id: obj.data.idconta } });
                        let saldoanterior = await db.getModel('fin_contasaldo').find({ where: { idconta: obj.data.idconta }, order: [['data', 'desc']] });
                        let sql = await db.sequelize.query(`
                        select
                            sum(case when c.dc = 1 then (mp.valor - coalesce(mp.desconto, 0) + coalesce(mp.juro, 0)) * -1 else mp.valor - coalesce(mp.desconto, 0) + coalesce(mp.juro, 0) end) as soma
                        from
                            fin_mov m
                        left join fin_movparc mp on (m.id = mp.idmov)
                        left join fin_categoria c on (m.idcategoria = c.id)
                        where
                            mp.idconta = :conta
                            and mp.data > :dataini
                            and mp.data <= :datafim
                            `, {
                                type: db.sequelize.QueryTypes.SELECT
                                , replacements: {
                                    conta: obj.data.idconta
                                    , dataini: saldoanterior ? saldoanterior.data : '1900-01-01'
                                    , datafim: application.formatters.be.date(obj.data.data)
                                }
                            });
                        if (sql.length > 0 && sql[0].soma) {
                            return application.success(obj.res, { data: application.formatters.fe.decimal(parseFloat(sql[0].soma) + (saldoanterior ? parseFloat(saldoanterior.valor) : parseFloat(conta.saldoinicial || 0)), 2) });
                        } else {
                            return application.success(obj.res, { data: application.formatters.fe.decimal(saldoanterior ? parseFloat(saldoanterior.valor) : parseFloat(conta.saldoinicial || 0), 2) });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , js_saldoAtual: async function (obj) {
                    try {
                        let conta = await db.getModel('fin_conta').find({ where: { id: obj.data.idconta } });
                        let saldoanterior = await db.getModel('fin_contasaldo').find({ where: { idconta: obj.data.idconta }, order: [['data', 'desc']] });
                        let sql = await db.sequelize.query(`
                        select
                            sum(case when c.dc = 1 then (mp.valor - coalesce(mp.desconto, 0) + coalesce(mp.juro, 0)) * -1 else mp.valor - coalesce(mp.desconto, 0) + coalesce(mp.juro, 0) end) as soma
                        from
                            fin_mov m
                        left join fin_movparc mp on (m.id = mp.idmov)
                        left join fin_categoria c on (m.idcategoria = c.id)
                        where
                            mp.idconta = :conta
                            and mp.data > :dataini
                            `, {
                                type: db.sequelize.QueryTypes.SELECT
                                , replacements: {
                                    conta: obj.data.idconta
                                    , dataini: saldoanterior ? saldoanterior.data : '1900-01-01'
                                }
                            });
                        if (sql.length > 0 && sql[0].soma) {
                            return application.success(obj.res, { data: application.formatters.fe.decimal(parseFloat(sql[0].soma) + (saldoanterior ? parseFloat(saldoanterior.valor) : parseFloat(conta.saldoinicial || 0)), 2) });
                        } else {
                            return application.success(obj.res, { data: application.formatters.fe.decimal(saldoanterior ? parseFloat(saldoanterior.valor) : parseFloat(conta.saldoinicial || 0), 2) });
                        }
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , contasaldo: {
                onsave: async function (obj, next) {
                    try {

                        let count = await db.getModel('fin_contasaldo').count({ where: { id: { $ne: obj.register.id }, idconta: obj.register.idconta, data: { $gt: obj.register.data } } });
                        if (count > 0) {
                            return application.error(obj.res, { msg: 'Existe um fechamento de caixa maior que desta data' });
                        }

                        next(obj);

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , mov: {
                onsave: async function (obj, next) {
                    try {

                        if (!obj.register.data) {
                            obj.register.data = moment();
                        }

                        next(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_baixarTitulos: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {
                            if (obj.ids.length <= 0) {
                                return application.error(obj.res, { msg: application.message.selectOneEvent });
                            }

                            let movs = await db.getModel('fin_mov').findAll({ where: { id: { $in: obj.ids } } });
                            for (let i = 0; i < movs.length; i++) {
                                if (movs[i].quitado) {
                                    return application.error(obj.res, { msg: 'Na seleção contém o título ID ' + movs[i].id + ' já recebido' });
                                }
                            }

                            let body = '';
                            body += '<div class="row no-margin">';
                            body += application.components.html.hidden({ name: 'ids', value: obj.ids.join(',') });
                            body += application.components.html.date({
                                width: '2'
                                , label: 'Data*'
                                , name: 'data'
                                , value: moment().format(application.formatters.fe.date_format)
                            });
                            body += application.components.html.autocomplete({
                                width: '2'
                                , label: 'Conta*'
                                , name: 'idconta'
                                , model: 'fin_conta'
                                , attribute: 'descricao'
                            });
                            body += application.components.html.autocomplete({
                                width: '2'
                                , label: 'Forma de Pagamento*'
                                , name: 'idformapgto'
                                , model: 'fin_formapgto'
                                , attribute: 'descricao'
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
                                    , label: 'Correntista'
                                    , name: 'cliente' + obj.ids[i]
                                    , value: mov.cad_corr.nome
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
                            body += application.components.html.autocomplete({
                                width: '6'
                                , label: 'Cheques <a target="_blank" href="/view/90/0"><button style="padding: 0px 5px;" type="button" class="btn btn-success"><i class="fa fa-plus"></i></button></a>'
                                , name: 'idcheques'
                                , model: 'fin_cheque'
                                , attribute: 'descricaocompleta'
                                , multiple: 'multiple="multiple"'
                                , where: 'utilizado is false'
                            });
                            body += application.components.html.decimal({
                                width: '2'
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

                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['ids', 'idconta', 'idformapgto', 'data']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }

                            if (obj.req.body.idcheques == undefined) {
                                obj.req.body.idcheques = [];
                            } else if (typeof obj.req.body.idcheques == 'string') {
                                obj.req.body.idcheques = [obj.req.body.idcheques];
                            }
                            if (obj.req.body.idformapgto == 2 && obj.req.body.idcheques.length <= 0) {
                                return application.error(obj.res, { msg: 'Selecione um cheque', invalidfields: ['idcheques'] });
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

                            let fechamento = await db.getModel('fin_contasaldo').find({ where: { idconta: obj.req.body.idconta, data: { $gte: application.formatters.be.date(obj.req.body.data) } } });
                            if (fechamento) {
                                return application.error(obj.res, { msg: 'Conta fechada para lançamento nesta competência' });
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
                                    , data: application.formatters.be.date(obj.req.body.data)
                                });

                                if (movparc.idformapgto == 2) {// Cheque
                                    for (let z = 0; z < obj.req.body.idcheques.length; z++) {
                                        db.getModel('fin_movparccheque').create({
                                            idmovparc: movparc.id
                                            , idcheque: obj.req.body.idcheques[z]
                                        });
                                        if (mov.fin_categoria.dc == 1) {
                                            db.getModel('fin_cheque').update({ utilizado: true }, { where: { id: obj.req.body.idcheques[z] } });
                                        }
                                    }
                                }

                                if (mov.fin_categoria.dc == 2 && mov.ven_pedido && mov.ven_pedido.idvendedor) {
                                    let pedidoitens = await db.getModel('ven_pedidoitem').findAll({ where: { idpedido: mov.ven_pedido.id } });
                                    let total = 0;
                                    let comissao = 0;
                                    for (let z = 0; z < pedidoitens.length; z++) {
                                        total += parseFloat(pedidoitens[z].unitario) * parseInt(pedidoitens[z].qtd);
                                        comissao += (parseFloat(pedidoitens[z].unitario) * parseInt(pedidoitens[z].qtd)) * (parseInt(pedidoitens[z].comissao) / 100)
                                    }
                                    if ((parseFloat(movparc.valor) - parseFloat(movparc.desconto || 0)) > 0 && comissao > 0) {
                                        let movcom = await db.getModel('fin_mov').create({
                                            data: moment()
                                            , parcela: '1/1'
                                            , datavcto: application.formatters.be.date('01/' + moment(movparc.data).add(1, 'M').format('MM/YYYY'))
                                            , idcategoria: mov.fin_categoria.descricaocompleta.substring(0, 2) == 'MS' ? 8 : 9
                                            , valor: (((parseFloat(movparc.valor) - parseFloat(movparc.desconto || 0)) * comissao) / total).toFixed(2)
                                            , idcorr: mov.ven_pedido.idvendedor
                                            , detalhes: 'Comissão gerada sobre a movimentação ID ' + movparc.id
                                            , quitado: false
                                        });

                                        await db.getModel('fin_movparccomissao').create({
                                            idmov: movcom.id
                                            , idmovparc: movparc.id
                                        });
                                    }
                                }
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

                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_recalcularComissao: async function (obj) {
                    try {

                        let movparcs = await db.getModel('fin_movparc').findAll();

                        for (let i = 0; i < movparcs.length; i++) {
                            let movparc = movparcs[i];
                            let mov = await db.getModel('fin_mov').find({ where: { id: movparc.idmov }, include: [{ all: true }] });

                            if (mov.fin_categoria.dc == 2 && mov.ven_pedido && mov.ven_pedido.idvendedor) {
                                let pedidoitens = await db.getModel('ven_pedidoitem').findAll({ where: { idpedido: mov.ven_pedido.id } });
                                let total = 0;
                                let comissao = 0;
                                for (let z = 0; z < pedidoitens.length; z++) {
                                    total += parseFloat(pedidoitens[z].unitario) * parseInt(pedidoitens[z].qtd);
                                    comissao += (parseFloat(pedidoitens[z].unitario) * parseInt(pedidoitens[z].qtd)) * (parseInt(pedidoitens[z].comissao) / 100)
                                }
                                if ((parseFloat(movparc.valor) - parseFloat(movparc.desconto || 0)) > 0 && comissao > 0) {
                                    let movcom = await db.getModel('fin_mov').create({
                                        data: moment()
                                        , parcela: '1/1'
                                        , datavcto: application.formatters.be.date('01/' + moment().add(1, 'M').format('MM/YYYY'))
                                        , idcategoria: mov.fin_categoria.descricaocompleta.substring(0, 2) == 'MS' ? 8 : 9
                                        , valor: (((parseFloat(movparc.valor) - parseFloat(movparc.desconto || 0)) * comissao) / total).toFixed(2)
                                        , idcorr: mov.ven_pedido.idvendedor
                                        , detalhes: 'Comissão gerada sobre a movimentação ID ' + movparc.id
                                        , quitado: false
                                    });

                                    await db.getModel('fin_movparccomissao').create({
                                        idmov: movcom.id
                                        , idmovparc: movparc.id
                                    });
                                }
                            }
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
                        let mpc = [];
                        for (let i = 0; i < movparcs.length; i++) {
                            let fechamento = await db.getModel('fin_contasaldo').find({ where: { idconta: movparcs[i].idconta, data: { $gte: movparcs[i].data } } });
                            if (fechamento) {
                                return application.error(obj.res, { msg: 'Conta fechada para estorno nesta competência' });
                            }
                            ids.push(movparcs[i].idmov);

                            let movparccomissao = await db.getModel('fin_movparccomissao').find({ where: { idmovparc: movparcs[i].id } });
                            if (movparccomissao) {
                                let mpcmov = await db.getModel('fin_movparc').find({ where: { idmov: movparccomissao.idmov } });
                                if (mpcmov) {
                                    return application.error(obj.res, { msg: 'Não é possível estornar uma movimentação com comissão já quitada (ID ' + movparccomissao.idmov + ')' })
                                }
                                mpc.push(movparccomissao);
                            }
                        }
                        let movs = await db.getModel('fin_mov').findAll({ where: { id: { $in: ids } } });
                        let listcheques = [];
                        for (let i = 0; i < movparcs.length; i++) {
                            let cheques = await db.getModel('fin_movparccheque').findAll({ where: { idmovparc: movparcs[i].id } });
                            if (cheques) {
                                listcheques = listcheques.concat(cheques);
                            }
                        }
                        for (let i = 0; i < mpc.length; i++) {
                            let movaux = await db.getModel('fin_mov').find({ where: { id: mpc[i].idmov } });
                            await movaux.destroy();
                        }

                        next(obj);

                        for (let i = 0; i < movs.length; i++) {
                            movs[i].quitado = false;
                            movs[i].save();
                        }
                        ids = []
                        for (let i = 0; i < listcheques.length; i++) {
                            ids.push(listcheques[i].idcheque);
                        }
                        await db.getModel('fin_cheque').update({ utilizado: false }, { where: { id: { $in: ids } } });


                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , __venda_adicionarModal: async function (obj) {
                    try {

                        let body = '';
                        body += application.components.html.hidden({ name: 'idpedido', value: obj.data.id });
                        body += application.components.html.autocomplete({
                            width: '12'
                            , label: 'Categoria'
                            , name: 'idcategoria'
                            , model: 'fin_categoria'
                            , attribute: 'descricaocompleta'
                            , where: 'dc = 2'
                        });
                        body += application.components.html.integer({
                            width: '4'
                            , label: 'Quantidade de Parcelas'
                            , name: 'qtd'
                        });
                        body += application.components.html.date({
                            width: '4'
                            , label: 'Data da Primeira Parcela'
                            , name: 'data'
                            , value: moment().format('DD/MM/YYYY')
                        });
                        body += application.components.html.integer({
                            width: '4'
                            , label: 'Dias entre Parcelas'
                            , name: 'dias'
                            , value: '30'
                        });

                        return application.success(obj.res, {
                            modal: {
                                form: true
                                , id: 'venda_adicionarModal_modal'
                                , title: 'Adicionar Parcelas'
                                , body: body
                                , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button id="venda_adicionarModal_submit" type="button" class="btn btn-primary">Adicionar</button>'
                            }
                        });

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , __venda_adicionar: async function (obj) {
                    try {

                        let invalidfields = application.functions.getEmptyFields(obj.data, ['idpedido', 'idcategoria', 'qtd', 'data', 'dias']);
                        if (invalidfields.length > 0) {
                            return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                        }

                        let pedido = await db.getModel('ven_pedido').find({ where: { id: obj.data.idpedido } });
                        let sum = await db.sequelize.query(
                            `select round(sum(qtd * unitario), 3) as sum from ven_pedidoitem where idpedido = :v1`
                            , {
                                type: db.sequelize.QueryTypes.SELECT
                                , replacements: {
                                    v1: pedido.id
                                }
                            });
                        sum = parseFloat(sum[0].sum);
                        if (sum <= 0) {
                            return application.error(obj.res, { msg: 'A soma valor dos itens é menor ou igual a 0' });
                        }

                        let bulkmov = [];

                        for (let i = 1; i <= obj.data.qtd; i++) {
                            bulkmov.push({
                                data: moment()
                                , parcela: i + '/' + obj.data.qtd
                                , datavcto: i == 1 ? application.formatters.be.date(obj.data.data) : obj.data.dias == 30 ? moment(obj.data.data, 'DD/MM/YYYY').add(i - 1, 'M').format('YYYY-MM-DD') : moment(obj.data.data, 'DD/MM/YYYY').add((i - 1) * obj.data.dias, 'day').format('YYYY-MM-DD')
                                , idpedido: obj.data.idpedido
                                , idcategoria: obj.data.idcategoria
                                , valor: (sum / parseInt(obj.data.qtd)).toFixed(2)
                                , idcorr: pedido.idcliente
                                , detalhes: 'Venda ' + pedido.id + ' NF ' + pedido.nfe
                                , quitado: false
                            });
                        }

                        await db.getModel('fin_mov').bulkCreate(bulkmov);

                        return application.success(obj.res, { msg: application.message.success, reloadtables: true });

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_apuracaoResultado: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {

                            let body = '';
                            body += application.components.html.integer({
                                width: '6'
                                , label: 'Mês*'
                                , name: 'mes'
                            });
                            body += application.components.html.integer({
                                width: '6'
                                , label: 'Ano*'
                                , name: 'ano'
                            });

                            return application.success(obj.res, {
                                modal: {
                                    form: true
                                    , id: 'modalevt'
                                    , action: '/event/' + obj.event.id
                                    , title: obj.event.description
                                    , body: body
                                    , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="submit" class="btn btn-primary">Imprimir</button>'
                                }
                            });

                        } else {

                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['mes', 'ano']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }

                            let dataini = moment('01/' + obj.req.body.mes + '/' + obj.req.body.ano, application.formatters.fe.date_format);
                            let datafim = moment('01/' + obj.req.body.mes + '/' + obj.req.body.ano, application.formatters.fe.date_format).endOf('month');
                            let contas = await db.getModel('fin_conta').findAll({ raw: true, order: [['descricao', 'asc']] });
                            for (let i = 0; i < contas.length; i++) {
                                contas[i]._cs = await db.getModel('fin_contasaldo').find({ raw: true, where: { idconta: contas[i].id, data: { $lt: dataini } }, order: [['data', 'desc']] });
                                contas[i]._saldo = contas[i]._cs ? parseFloat(contas[i]._cs.valor) : parseFloat(contas[i].saldoinicial);
                            }
                            let categorias = await db.getModel('fin_categoria').findAll({ raw: true, order: [['descricaocompleta', 'asc']] });

                            let report = {};
                            report.__title = 'Apuração de Resultado<br>Competência ' + obj.req.body.mes + '/' + obj.req.body.ano;
                            report.tableresultado = `
                            <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                                <tr>
                                    <td></td>
                            `;
                            let totalsaldoinicial = 0.0;
                            for (let i = 0; i < contas.length; i++) {
                                report.tableresultado += `<td style="text-align:center;"><strong>${contas[i].descricao}</strong></td>`;
                            }
                            report.tableresultado += `
                                    <td style="text-align:center;"><strong>Total</strong></td>
                                </tr>
                                <tr>
                                    <td><strong>Saldo Inicial</strong></td>
                            `;
                            for (let i = 0; i < contas.length; i++) {
                                report.tableresultado += `<td style="text-align:right;">${application.formatters.fe.decimal(contas[i]._saldo, 2)}</td>`;
                                totalsaldoinicial += contas[i]._saldo;
                            }
                            report.tableresultado += `
                                    <td style="text-align:right;">${application.formatters.fe.decimal(totalsaldoinicial, 2)}</td>
                                </tr>
                            `;
                            for (let i = 0; i < categorias.length; i++) {
                                if (categorias[i].descricaocompleta.indexOf('-') < 0 && (categorias[i].descricaocompleta.indexOf('RS ') >= 0 || categorias[i].descricaocompleta.indexOf('MS ') >= 0)) {
                                    report.tableresultado += `
                                    <tr>
                                        <td style="text-align:center;" colspan="${contas.length + 2}"><strong>${categorias[i].descricaocompleta}</strong></td>
                                    </tr>`;
                                } else {
                                    report.tableresultado += `<tr><td><strong>${categorias[i].descricao}</strong></td>`;
                                    let totalcategoria = 0.0;
                                    for (let z = 0; z < contas.length; z++) {
                                        let sql = await db.sequelize.query(`
                                        select
                                            sum(case when dc = 1 then valortotal * -1 else valortotal end) as vt
                                        from
                                            (select
                                                *
                                                , mp.valor + coalesce(mp.juro, 0) - coalesce(mp.desconto, 0) as valortotal
                                            from
                                                fin_movparc mp
                                            left join fin_mov m on (mp.idmov = m.id)
                                            left join fin_categoria c on (m.idcategoria = c.id)
                                            where
                                                mp.data >= :dataini and mp.data <= :datafim
                                                and mp.idconta = :idconta
                                                and c.id = :idcategoria) as x
                                        `
                                            , {
                                                type: db.sequelize.QueryTypes.SELECT
                                                , replacements: {
                                                    dataini: dataini.format(application.formatters.be.date_format)
                                                    , datafim: datafim.format(application.formatters.be.date_format)
                                                    , idconta: contas[z].id
                                                    , idcategoria: categorias[i].id
                                                }
                                            }
                                        );
                                        if (sql[0].vt) {
                                            totalcategoria += parseFloat(sql[0].vt);
                                            contas[z]._saldo += parseFloat(sql[0].vt);
                                        }
                                        report.tableresultado += `<td style="text-align:right;">${sql[0].vt ? application.formatters.fe.decimal(sql[0].vt, 2) : '0,00'}</td>`;
                                    }
                                    report.tableresultado += `<td style="text-align:right;">${application.formatters.fe.decimal(totalcategoria, 2)}</td></tr>`;
                                }
                            }
                            report.tableresultado += `
                                <tr>
                                    <td colspan="${contas.length + 2}">
                                     
                                    </td>
                                </tr>
                                <tr>
                                    <td><strong>Saldo Final</strong></td>
                            `;
                            let totalsaldofinal = 0.0;
                            for (let i = 0; i < contas.length; i++) {
                                report.tableresultado += `<td style="text-align:right;">${application.formatters.fe.decimal(contas[i]._saldo, 2)}</td>`;
                                totalsaldofinal += contas[i]._saldo;
                            }
                            report.tableresultado += `
                                    <td style="text-align:right;">${application.formatters.fe.decimal(totalsaldofinal, 2)}</td>
                                </tr>
                            `;
                            report.tableresultado += `
                            </table>
                            `;
                            report.juros = application.formatters.fe.decimal((await db.getModel('fin_movparc').sum('juro', { where: { $and: [{ data: { $gte: dataini } }, { data: { $lte: datafim } }] } })) || 0, 2);
                            report.descontos = application.formatters.fe.decimal((await db.getModel('fin_movparc').sum('desconto', { where: { $and: [{ data: { $gte: dataini } }, { data: { $lte: datafim } }] } })) || 0, 2);

                            let sql = await db.sequelize.query(`
                                select sum(m.valor - coalesce((select sum(mp.valor) from fin_movparc mp where m.id = mp.idmov), 0)) as vt from fin_mov m left join fin_categoria c on (m.idcategoria = c.id) where c.dc = 2 and m.quitado = false and m.datavcto < :data
                            `
                                , {
                                    type: db.sequelize.QueryTypes.SELECT
                                    , replacements: {
                                        data: dataini.format(application.formatters.be.date_format)
                                    }
                                }
                            );
                            report.saldoanteriorctarec = sql.length > 0 && sql[0].vt ? application.formatters.fe.decimal(sql[0].vt, 2) : '0,00';

                            sql = await db.sequelize.query(`
                            select sum(m.valor - coalesce((select sum(mp.valor) from fin_movparc mp where m.id = mp.idmov), 0)) as vt from fin_mov m left join fin_categoria c on (m.idcategoria = c.id) where c.dc = 2 and m.quitado = false
                        `
                                , {
                                    type: db.sequelize.QueryTypes.SELECT
                                }
                            );
                            report.saldoctarec = sql.length > 0 && sql[0].vt ? application.formatters.fe.decimal(sql[0].vt, 2) : '0,00';

                            sql = await db.sequelize.query(`
                            select total as vt from
                                (select
                                    substring(c.descricaocompleta,0,3) as unidade
                                    , sum(x.valortotal) as total
                                from
                                    (select
                                        *
                                        , (select sum(pi.qtd * pi.unitario) from ven_pedidoitem pi where pi.idpedido = p.id) as valortotal
                                        , (select m.idcategoria from fin_mov m where m.idpedido = p.id limit 1)
                                    from
                                        ven_pedido p
                                    where
                                        p.data >= :dataini and p.data <= :datafim
                                    ) as x
                                left join fin_categoria c on (x.idcategoria = c.id)
                                group by 1) as x
                            where unidade = 'RS'	
                            `
                                , {
                                    type: db.sequelize.QueryTypes.SELECT
                                    , replacements: {
                                        dataini: dataini.format(application.formatters.be.date_format)
                                        , datafim: datafim.format(application.formatters.be.date_format)
                                    }
                                }
                            );
                            report.faturamentors = sql[0].vt ? application.formatters.fe.decimal(sql[0].vt, 2) : '0,00';

                            sql = await db.sequelize.query(`
                            select total as vt from
                                (select
                                    substring(c.descricaocompleta,0,3) as unidade
                                    , sum(x.valortotal) as total
                                from
                                    (select
                                        *
                                        , (select sum(pi.qtd * pi.unitario) from ven_pedidoitem pi where pi.idpedido = p.id) as valortotal
                                        , (select m.idcategoria from fin_mov m where m.idpedido = p.id limit 1)
                                    from
                                        ven_pedido p
                                    where
                                        p.data >= :dataini and p.data <= :datafim
                                    ) as x
                                left join fin_categoria c on (x.idcategoria = c.id)
                                group by 1) as x
                            where unidade = 'MS'	
                            `
                                , {
                                    type: db.sequelize.QueryTypes.SELECT
                                    , replacements: {
                                        dataini: dataini.format(application.formatters.be.date_format)
                                        , datafim: datafim.format(application.formatters.be.date_format)
                                    }
                                }
                            );
                            report.faturamentoms = sql[0].vt ? application.formatters.fe.decimal(sql[0].vt, 2) : '0,00';

                            let file = await main.platform.report.f_generate('Financeiro - Resultado', report);
                            return application.success(obj.res, {
                                modal: {
                                    id: 'modalevt2'
                                    , fullscreen: true
                                    , title: '<div class="col-sm-12" style="text-align: center;">Visualização</div>'
                                    , body: '<iframe src="/download/' + file + '" style="width: 100%; height: 400px;"></iframe>'
                                    , footer: '<button type="button" class="btn btn-default" style="margin-right: 5px;" data-dismiss="modal">Voltar</button><a href="/download/' + file + '" target="_blank"><button type="button" class="btn btn-primary">Download do Arquivo</button></a>'
                                }
                            });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_transferencia: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {

                            let categoriad = await db.getModel('fin_categoria').find({ where: { descricaocompleta: 'Transferencia - Debito' } });
                            let categoriac = await db.getModel('fin_categoria').find({ where: { descricaocompleta: 'Transferencia - Credito' } });

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
                            body += application.components.html.date({
                                width: '5'
                                , label: 'Data'
                                , name: 'data'
                                , value: moment().format(application.formatters.fe.date_format)
                            });
                            body += application.components.html.decimal({
                                width: '7'
                                , label: 'Valor'
                                , name: 'valor'
                                , precision: '2'
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

                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['idcategoriad', 'idcontad', 'idformapgtod', 'idcategoriac', 'idcontac', 'idformapgtoc', 'data', 'valor']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }
                            let valor = application.formatters.be.decimal(obj.req.body.valor, 2);
                            let data = application.formatters.be.date(obj.req.body.data);
                            if (await db.getModel('fin_contasaldo').find({ where: { idconta: obj.req.body.idcontad, data: { $gte: application.formatters.be.date(obj.req.body.data) } } })) {
                                return application.error(obj.res, { msg: 'Conta fechada para lançamento nesta competência', invalidfields: ['idcontad', 'data'] });
                            }
                            if (await db.getModel('fin_contasaldo').find({ where: { idconta: obj.req.body.idcontac, data: { $gte: application.formatters.be.date(obj.req.body.data) } } })) {
                                return application.error(obj.res, { msg: 'Conta fechada para lançamento nesta competência', invalidfields: ['idcontac', 'data'] });
                            }
                            if (parseFloat(valor) <= 0) {
                                return application.error(obj.res, { msg: 'O valor deve ser maior que 0', invalidfields: ['valor'] });
                            }

                            let movd = await db.getModel('fin_mov').create({
                                datavcto: data
                                , idcategoria: obj.req.body.idcategoriad
                                , valor: valor
                                , quitado: true
                                , data: data
                            });
                            let movparcd = await db.getModel('fin_movparc').create({
                                valor: valor
                                , idmov: movd.id
                                , idformapgto: obj.req.body.idformapgtod
                                , idconta: obj.req.body.idcontad
                                , data: data
                            });

                            let movc = await db.getModel('fin_mov').create({
                                datavcto: data
                                , idcategoria: obj.req.body.idcategoriac
                                , valor: valor
                                , quitado: true
                                , data: data
                            });
                            let movparcc = await db.getModel('fin_movparc').create({
                                valor: valor
                                , idmov: movc.id
                                , idformapgto: obj.req.body.idformapgtoc
                                , idconta: obj.req.body.idcontac
                                , data: data
                            });

                            return application.success(obj.res, { msg: application.message.success, reloadtables: true });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , e_report_correntista: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {
                            let body = '';
                            body += application.components.html.date({
                                width: '6'
                                , label: 'Data Inicial'
                                , name: 'dataini'
                            });
                            body += application.components.html.date({
                                width: '6'
                                , label: 'Data Final'
                                , name: 'datafim'
                            });
                            body += application.components.html.autocomplete({
                                width: '12'
                                , label: 'Categoria'
                                , name: 'idcategoria'
                                , model: 'fin_categoria'
                                , attribute: 'descricaocompleta'
                                , where: 'dc = 1'
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

                            let invalidfields = application.functions.getEmptyFields(obj.req.body, ['dataini', 'datafim', 'idcategoria']);
                            if (invalidfields.length > 0) {
                                return application.error(obj.res, { msg: application.message.invalidFields, invalidfields: invalidfields });
                            }

                            let sql = await db.sequelize.query(`
                                select * from (select
                                    c.codigo::text
                                    , c.nome
                                    , sum(m.valor) as valortotal
                                from
                                    fin_mov m
                                left join cad_corr c on (m.idcorr = c.id)
                                left join fin_categoria cat on (m.idcategoria = cat.id)
                                where
                                    m.quitado = false
                                    and cat.dc = 1
                                    and m.datavcto >= :dataini
                                    and m.datavcto <= :datafim
                                    and m.idcategoria = :idcategoria
                                group by 1,2
                                order by 2) as x
                                
                                union all
                                
                                select
                                    '<strong>Total</strong>' as codigo
                                    , ''
                                    , sum(m.valor)
                                from
                                    fin_mov m
                                left join cad_corr c on (m.idcorr = c.id)
                                left join fin_categoria cat on (m.idcategoria = cat.id)
                                where
                                    m.quitado = false
                                    and cat.dc = 1
                                    and m.datavcto >= :dataini
                                    and m.datavcto <= :datafim
                                    and m.idcategoria = :idcategoria
                            `, {
                                    type: db.sequelize.QueryTypes.SELECT
                                    , replacements: {
                                        dataini: application.formatters.be.date(obj.req.body.dataini)
                                        , datafim: application.formatters.be.date(obj.req.body.datafim)
                                        , idcategoria: obj.req.body.idcategoria
                                    }
                                });

                            let report = {};
                            let categoria = await db.getModel('fin_categoria').find({ where: { id: obj.req.body.idcategoria } });
                            report.__title = `Contas a Pagar Abertas</br>${obj.req.body.dataini} até ${obj.req.body.datafim}</br>Categoria: ${categoria.descricaocompleta} `;

                            report.__table = `
                            <table border="1" cellpadding="1" cellspacing="0" style="border-collapse:collapse;width:100%">
                                <tr>
                                    <td style="text-align:center;"><strong>Código</strong></td>
                                    <td style="text-align:center;"><strong>Correntista</strong></td>
                                    <td style="text-align:center;"><strong>Valor</strong></td>
                                </tr>
                            `;
                            for (let i = 0; i < sql.length; i++) {
                                report.__table += `
                                <tr>
                                    <td style="text-align:left;"> ${sql[i]['codigo']}          </td>
                                    <td style="text-align:left;">  ${sql[i]['nome']}           </td>
                                    <td style="text-align:right;">   ${application.formatters.fe.decimal(sql[i]['valortotal'], 2)}   </td>
                                </tr>
                                `;
                            }
                            report.__table += `
                            </table>
                            `;

                            let file = await main.platform.report.f_generate('Geral - Listagem', report);
                            return application.success(obj.res, {
                                modal: {
                                    id: 'modalevt'
                                    , fullscreen: true
                                    , title: '<div class="col-sm-12" style="text-align: center;">Visualização</div>'
                                    , body: '<iframe src="/download/' + file + '" style="width: 100%; height: 400px;"></iframe>'
                                    , footer: '<button type="button" class="btn btn-default" style="margin-right: 5px;" data-dismiss="modal">Voltar</button><a href="/download/' + file + '" target="_blank"><button type="button" class="btn btn-primary">Download do Arquivo</button></a>'
                                }
                            });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
            , movparccheque: {
                ondelete: async function (obj, next) {
                    try {

                        let movparccheques = await db.getModel('fin_movparccheque').findAll({ where: { id: { $in: obj.ids } } });
                        let ids = [];
                        for (let i = 0; i < movparccheques.length; i++) {
                            ids.push(movparccheques[i].idcheque);
                        }

                        if ((await next(obj)).success) {
                            db.getModel('fin_cheque').update({ utilizado: false }, { where: { id: { $in: ids } } });
                        }

                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
        }
        , venda: {
            pedido: {
                onsave: async function (obj, next) {
                    try {

                        let register = await db.getModel('ven_pedido').find({ where: { id: { $ne: obj.id }, nfe: obj.register.nfe } })
                        if (register) {
                            return application.error(obj.res, { msg: 'Já existe uma venda com este número de NFE' });
                        }

                        next(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
        }
    }
}

module.exports = main;