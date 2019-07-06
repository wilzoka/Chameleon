let main = {
    platform: require('../platform')
    , merito: {
        cadastro: require('./business/cadastro')
        , evento: require('./business/evento')
    }
    , api: require('./business/api')
}

module.exports = main;