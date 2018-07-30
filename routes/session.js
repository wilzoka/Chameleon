const passport = require('passport')
    , LocalStrategy = require('passport-local').Strategy
    , db = require('../models')
    , application = require('./application')
    ;

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
    db.getModel('users').find({
        where: {
            active: true
            , $or: [{ username: username }, { email: username }]
            , password: password
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
            return res.redirect('/home');
        } else {
            return application.render(res, __dirname + '/../views/login.html', {});
        }
    });

    app.post('/login', passport.authenticate('local', {}), async (req, res) => {
        try {
            let menu = await db.getModel('menu').findAll({
                include: { all: true }
                , where: { idmenuparent: { $eq: null } }
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
            for (let i = 0; i < permissions.length; i++) {
                permissionarr.push(permissions[i].idmenu);
            }

            for (let i = 0; i < menu.length; i++) {
                menu[i].children = application.menu.getChilds(menu[i].id, childs, permissionarr);
                if (menu[i].children.length == 0 && (menu[i].idview == null && menu[i].url == null)) {
                    menu.splice(i, 1);
                    i--;
                }
            }

            let menuhtml = '';
            for (let i = 0; i < menu.length; i++) {
                menuhtml += application.menu.renderMenu(menu[i]);
            }

            let redirect = '/home';
            if (req.user.idmenu) {
                let defaultmenu = await db.getModel('menu').find({ include: [{ all: true }], where: { id: req.user.idmenu } });
                if (defaultmenu.url) {
                    redirect = defaultmenu.url;
                } else if (defaultmenu.idview) {
                    redirect = '/v/' + defaultmenu.view.url;
                }
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
    }, function (err, req, res, next) {
        if (req.xhr) {
            return res.json(err);
        }
    });

    app.get('/logout', function (req, res, next) {
        req.logOut();
        req.session.destroy();
        return res.redirect("/login");
    });

}