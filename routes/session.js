const passport = require('passport')
    , LocalStrategy = require('passport-local').Strategy
    , jwt = require('jsonwebtoken')
    , db = require('../models')
    , application = require('./application')
    , Cyjs = require("crypto-js")
    , platform = require("../custom/platform")
    ;

let config, authfunction = null;

// Serialize Sessions
passport.serializeUser(function(user, done) {
    done(null, user);
});

// Deserialize Sessions
passport.deserializeUser(function(user, done) {
    done(null, user);
});

// For Authentication Purposes
passport.use(new LocalStrategy(function(username, password, done) {
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

module.exports = function(app) {

    app.get('/login', function(req, res) {
        if (req.isAuthenticated()) {
            res.redirect('/home');
        } else {
            application.render(res, __dirname + '/../views/login.html', {});
        }
    });

    app.post('/login', passport.authenticate('local'), async (req, res) => {
        try {
            if (!config) {
                config = await db.getModel('config').findOne();
                let custom = require('../custom/' + config.customfile);
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
            let menu = await platform.menu.f_getMenu(req.user);
            let redirect = '/home';
            if (req.user.idview) {
                let defaultpage = await db.getModel('view').findOne({ raw: true, where: { id: req.user.idview } });
                if (defaultpage) {
                    redirect = '/v/' + defaultpage.url;
                }
            }
            let menuhtml = '';
            for (let i = 0; i < menu.length; i++) {
                menuhtml += application.menu.renderMenu(menu[i]);
            }
            return application.success(res, {
                redirect: redirect
                , localstorage: [
                    { key: 'username', value: req.user.fullname }
                    , { key: 'menu', value: menuhtml }
                    , { key: 'descriptionmenu', value: config.descriptionmenu }
                    , { key: 'descriptionmenumini', value: config.descriptionmenumini }
                ]
            });
        } catch (err) {
            return application.fatal(res, err);
        }
    }, function(err, req, res) {
        if (req.xhr) {
            res.json(err);
        }
    });

    app.get('/logout', function(req, res) {
        req.logout();
        req.session.destroy();
        res.redirect("/login");
    });

}