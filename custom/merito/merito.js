let main = {
    platform: require('../platform')
    , merito: {
        cadastro: require('./business/cadastro')
        , comercial: require('./business/comercial')
    }
    , api: require('./business/api')
}

module.exports = main;