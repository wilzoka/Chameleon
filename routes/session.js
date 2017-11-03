var passport = require('passport')
    , LocalStrategy = require('passport-local').Strategy
    , db = require('../models')
    , application = require('./application')
    ;

var users = {};

// Serialize Sessions
passport.serializeUser(function (user, done) {
    done(null, user);
});

// Deserialize Sessions
passport.deserializeUser(function (user, done) {
    done(null, user);
    // db.getModel('users').find({ where: { id: user.id } }).then(register => {
    //     done(null, register);
    // }).error(function (err) {
    //     done(err, null);
    // });
});

// For Authentication Purposes
passport.use(new LocalStrategy(
    function (email, password, done) {
        db.getModel('users').find({ where: { email: email, password: password } }).then(register => {
            if (register) {
                return done(null, register);
            } else {
                return done(null, false);
            }
        });
    }
));

module.exports = function (app) {

    app.get('/login', function (req, res) {
        return application.render(res, 'login');
    });

    app.post('/login', passport.authenticate('local', { failWithError: true })
        , async (req, res) => {
            try {

                let menu = await db.getModel('menu').findAll({
                    where: { idmenuparent: { $eq: null } }
                    , order: [['description', 'asc']]
                    , raw: true
                });

                let childs = await db.getModel('menu').findAll({
                    include: { all: true }
                    , where: { idmenuparent: { $ne: null } }
                    , order: [['description', 'asc']]
                    , raw: true
                });

                let permissions = await db.getModel('permission').findAll({
                    where: { iduser: req.user.id, visible: true }
                    , raw: true
                });

                let config = await db.getModel('config').find();

                permissionarr = [];
                for (var i = 0; i < permissions.length; i++) {
                    permissionarr.push(permissions[i].idmenu);
                }

                for (var i = 0; i < menu.length; i++) {
                    menu[i].children = application.menu.getChilds(menu[i].id, childs, permissionarr);
                }

                for (var i = 0; i < menu.length; i++) {
                    if (menu[i].children.length == 0) {
                        menu.splice(i, 1);
                    }
                }

                var menuhtml = '';
                for (var i = 0; i < menu.length; i++) {
                    menuhtml += application.menu.renderMenu(menu[i]);
                }

                return application.success(res, {
                    redirect: '/home'
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
        }, function (err, req, res, next) {
            if (req.xhr) {
                return res.json(err);
            }
        }
    );

    app.get('/logout', function (req, res, next) {
        req.logOut();
        req.session.destroy();
        return res.redirect("/login");
    });

}