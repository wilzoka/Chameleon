let application = require('../../routes/application')
    , db = require('../../models')
    , reload = require('require-reload')(require)
    , moment = require('moment')
    ;

let main = {
    platform: reload('../platform.js')
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
                            sum(case when c.dc = 1 then (mp.valor + coalesce(mp.desconto, 0) - coalesce(mp.juro, 0)) * -1 else mp.valor - coalesce(mp.desconto, 0) + coalesce(mp.juro, 0) end) as soma
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

                        let count = await db.getModel('fin_contasaldo').count({ where: { id: { $ne: obj.register.id }, data: { $gt: obj.register.data } } });
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
                                    if (comissao > 0) {
                                        let movcom = await db.getModel('fin_mov').create({
                                            parcela: '1/1'
                                            , datavcto: application.formatters.be.date('01/' + moment().add(1, 'M').format('MM/YYYY'))
                                            , idcategoria: mov.fin_categoria.descricaocompleta.substring(0, 2) == 'MS' ? 8 : 9
                                            , valor: ((parseFloat(movparc.valor) * comissao) / total).toFixed(2)
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
                                parcela: i + '/' + obj.data.qtd
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