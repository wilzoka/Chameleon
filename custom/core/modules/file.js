const application = require('../../../routes/application')
    , db = require(application.functions.rootDir() + 'models')
    , fs = require('fs-extra')
    ;

const main = {
    f_getPath: (file) => {
        return file.idfileref
            ? `${application.functions.filesDir()}${file.idfileref}.${file.type}`
            : `${application.functions.filesDir()}${file.id}.${file.type}`;
    }
}

module.exports = main;