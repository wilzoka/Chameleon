const passport = require('passport')
    , LocalStrategy = require('passport-local').Strategy
    , jwt = require('jsonwebtoken')
    , db = require('../models')
    , application = require('./application')
    , Cyjs = require('crypto-js')
    , platform = require('../custom/platform')
    ;

let config, authfunction = null;

// Serialize Sessions
passport.serializeUser(function (user, done) {
    done(null, user);
});

// Deserialize Sessions
passport.deserializeUser(function (user, done) {
    done(null, user);
});

// For Authentication Purposes
passport.use(new LocalStrategy(function (username, password, done) {
    db.getModel('users').findOne({
        where: {
            active: true
            , [db.Op.or]: [{ username: username }, { email: username }]
            , password: Cyjs.SHA3(`${application.sk}${password}${application.sk}`).toString()
        }
    }).then(register => {
        if (register) {
            return done(null, register);
        } else {
            return done(null, false);
        }
    });
}));

module.exports = function (app) {

    app.get('/login', function (req, res) {
        if (req.isAuthenticated()) {
            res.redirect('/home');
        } else {
            application.render(res, application.functions.rootDir() + 'views/login.html', {});
        }
    });

    app.post('/login', passport.authenticate('local'), async (req, res) => {
        try {
            if (!config) {
                config = await db.getModel('config').findOne();
                const custom = require('../custom/' + config.customfile);
                if (config.authfunction) {
                    authfunction = application.functions.getRealReference(custom, config.authfunction);
                }
            }
            if (authfunction) {
                if (!(await authfunction(req))) {
                    req.logout();
                    return res.status(401).send();
                }
            }
            if (req.body._mobile) {
                return application.success(res, {
                    token: jwt.sign({ id: req.user.id }, application.sk)
                });
            }
            const menu = await platform.menu.f_getMenu(req.user);
            let redirect = '/home';
            if (req.query.continue) {
                redirect = req.query.continue;
            } else {
                if (req.user.idview) {
                    const defaultpage = await db.getModel('view').findOne({ raw: true, where: { id: req.user.idview } });
                    if (defaultpage) {
                        redirect = '/v/' + defaultpage.url;
                    }
                }
            }
            let menuhtml = '';
            for (let i = 0; i < menu.length; i++) {
                menuhtml += application.menu.renderMenu(menu[i]);
            }
            application.success(res, {
                redirect: redirect
                , localstorage: [
                    { key: 'username', value: req.user.fullname }
                    , { key: 'menu', value: menuhtml }
                    , { key: 'descriptionmenu', value: config.descriptionmenu }
                    , { key: 'descriptionmenumini', value: config.descriptionmenumini }
                ]
            });
        } catch (err) {
            application.fatal(res, err);
        }
    }, function (err, req, res) {
        if (req.xhr) {
            res.json(err);
        }
    });

    app.get('/logout', function (req, res) {
        req.logout();
        req.session.destroy();
        res.redirect("/login");
    });

    app.get('/resetpassword', function (req, res) {
        if (req.query.token) {
            application.render(res, application.functions.rootDir() + 'views/resetpasswordtoken.html', {});
        } else {
            application.render(res, application.functions.rootDir() + 'views/resetpassword.html', {});
        }
    });

    app.post('/resetpassword', async (req, res) => {
        const token = req.body.token;
        if (token) {
            if (req.body.password != req.body.repeatpassword)
                return application.error(res, { msg: 'As senhas informadas são diferentes' });
            const password = req.body.password;
            const user = await db.getModel('users').findOne({
                where: { resettoken: token }
            });
            if (!user)
                return application.error(res, { msg: 'Token inválido ou expirado' });
            user.password = Cyjs.SHA3(`${application.sk}${password}${application.sk}`).toString();
            user.resettoken = null;
            await user.save();
            application.success(res, {
                msg: 'Senha resetada com sucesso!'
                , redirect: '/login'
            });
        } else {
            const username = req.body.username;
            const user = await db.getModel('users').findOne({
                where: {
                    active: true
                    , [db.Op.or]: [{ username: username }, { email: username }]
                }
            });
            if (!user)
                return application.error(res, { msg: 'Usuário não encontrado' });
            if (!user.email)
                return application.error(res, { msg: 'Usuário não possui e-mail vinculado, contate o administrador' });
            user.resettoken = Cyjs.SHA3(`${application.sk}${process.hrtime()[1]}${user.id}`).toString();
            await user.save();
            platform.mail.f_send(
                null
                , user.email
                , `Recuperação de Senha`
                , `Olá ${user.fullname},
                <br>Você solicitou a recuperação de sua senha de acesso ao sistema, para continuar clique <a href="${req.headers.origin}/resetpassword?token=${user.resettoken}">aqui</a>.
                <br>
                <br>Se não foi você, desconsidere este e-mail.`
            );
            application.success(res, {
                msg: 'Enviamos um e-mail com as instruções de recuperação da senha'
                , redirect: '/login'
            });
        }
    });

}