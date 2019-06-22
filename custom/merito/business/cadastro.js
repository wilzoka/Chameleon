const application = require('../../../routes/application')
    , platform = require('../../platform')
    , db = require('../../../models')
    , Cyjs = require("crypto-js")
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
        , e_gerarAcessoSistema: async function (obj) {
            try {
                if (obj.req.method == 'GET') {
                    if (obj.ids.length != 1) {
                        return application.error(obj.res, { msg: application.message.selectOnlyOneEvent });
                    }
                    let pessoa = await db.getModel('cad_pessoa').findByPk(obj.ids[0]);
                    if (!pessoa) {
                        return application.error(obj.res, { msg: 'Pessoa não encontrada' });
                    }
                    let view = await db.getModel('view').findOne({ where: { name: 'Meus Eventos' } });
                    if (!view) {
                        return application.error(obj.res, { msg: 'View "Meus Eventos" não encontrada' });
                    }
                    let menu = await db.getModel('menu').findOne({ where: { idview: view.id } });
                    if (!menu) {
                        return application.error(obj.res, { msg: 'Menu com a View "Meus Eventos" não encontrada' });
                    }
                    let password = Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 6);
                    let user = await db.getModel('users').findOne({ where: { email: pessoa.email } });
                    if (!user) {
                        user = await db.getModel('users').create({
                            active: true
                            , username: pessoa.email
                            , email: pessoa.email
                            , fullname: pessoa.nome
                            , idmenu: menu.id
                        });
                    }
                    user.password = Cyjs.SHA3(`${application.sk}${password}${application.sk}`).toString();
                    await user.save();
                    let permission = await db.getModel('permission').findOne({ where: { iduser: user.id, idmenu: menu.id } });
                    if (!permission) {
                        await db.getModel('permission').create({
                            iduser: user.id
                            , idmenu: menu.id
                            , visible: true
                        });
                    }
                    let body = '';
                    body += application.components.html.hidden({ name: 'id', value: obj.ids[0] });
                    body += application.components.html.text({
                        width: 12
                        , label: 'Usuário'
                        , name: 'username'
                        , value: user.username
                        , disabled: 'disabled="disabled"'
                    });
                    body += application.components.html.text({
                        width: 12
                        , label: 'Senha'
                        , name: 'password'
                        , value: password
                        , disabled: 'disabled="disabled"'
                    });
                    return application.success(obj.res, {
                        modal: {
                            form: true
                            , action: '/event/' + obj.event.id
                            , id: 'modalevt'
                            , title: obj.event.description
                            , body: body
                            , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Voltar</button> <button type="submit" class="btn btn-primary">Enviar por E-mail</button>'
                        }
                    });
                } else {
                    return application.success(obj.res, {});
                }
            } catch (err) {
                return application.fatal(obj.res, err);
            }
        }
    }
}

module.exports = main;