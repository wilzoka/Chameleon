let application = require('../../routes/application')
    , reload = require('require-reload')(require)
    ;

let main = {
    platform: reload('../platform.js')
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
                        next(obj);
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
            }
        }
        , financeiro: {
            categoria: {
                __getDC: async function (obj) {
                    try {
                        let categoria = await db.getModel('fin_categoria').find({ where: { id: obj.data.id } });
                        return application.success(obj.res, { data: categoria.dc });
                    } catch (err) {
                        return application.fatal(obj.res, err);
                    }
                }
                , onsave: async function (obj, next) {
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
                e_baixarTitulos: async function (obj) {
                    try {

                        if (obj.req.method == 'GET') {
                            if (obj.ids.length <= 0) {
                                return application.error(obj.res, { msg: application.message.selectOneEvent });
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
                                    , value: mov.cad_pessoa.nome
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
                            let fechamento = await db.getModel('fin_contasaldo').find({ where: { idconta: movparcs[i].idconta, data: { $gte: movparcs[i].data } } });
                            if (fechamento) {
                                return application.error(obj.res, { msg: 'Conta fechada para estorno nesta competência' });
                            }
                            ids.push(movparcs[i].idmov);
                        }
                        let movs = await db.getModel('fin_mov').findAll({ where: { id: { $in: ids } } });
                        let listcheques = [];
                        for (let i = 0; i < movparcs.length; i++) {
                            let cheques = await db.getModel('fin_movparccheque').findAll({ where: { idmovparc: movparcs[i].id } });
                            if (cheques) {
                                listcheques = listcheques.concat(cheques);
                            }
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

        }
    }
}

module.exports = main;