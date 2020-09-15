const application = require('../routes/application')
    , moment = require('moment')
    , Cyjs = require('crypto-js')
    , Sequelize = require('sequelize')
    , sequelize = new Sequelize(Cyjs.AES.decrypt(process.env.NODE_DBC, application.sk).toString(Cyjs.enc.Utf8), {
        pool: {
            max: 5
            , min: 0
            , idle: 10000
        }
        , timezone: 'America/Sao_Paulo'
        , logging: function (query) {
            // console.log(query); console.log('');
        }
        , define: {
            hooks: {
                beforeBulkUpdate: (options) => {
                    options.individualHooks = true;
                }
                , beforeSave: (register, options) => {
                    register._isInsert = register.isNewRecord;
                }
                , afterSave: (register, options) => {
                    const changed = register.changed();
                    if (['audit', 'report', 'session'].indexOf(register.constructor.name) < 0 && changed) {
                        getModel('model').findOne({ where: { name: register.constructor.name } }).then(model => {
                            const audit = getModel('audit').build();
                            audit.datetime = moment();
                            audit.idmodel = model.id;
                            audit.iduser = options.iduser || register._iduser || null;
                            audit.type = register._isInsert ? 1 : 2;
                            const changes = {};
                            for (let i = 0; i < changed.length; i++) {
                                const k = changed[i];
                                changes[k] = register[k];
                            }
                            audit.changes = JSON.stringify(changes);
                            audit.modelid = register.id;
                            audit.save();
                        });
                    }
                }
                , beforeBulkDestroy: (options) => {
                    options.individualHooks = true;
                }
                , afterDestroy: (register, options) => {
                    if (['audit', 'report', 'session'].indexOf(register.constructor.name) < 0) {
                        getModel('model').findOne({ where: { name: register.constructor.name } }).then(model => {
                            const audit = getModel('audit').build();
                            const iduser = options.iduser;
                            audit.datetime = moment();
                            audit.idmodel = model.id;
                            audit.iduser = iduser || null;
                            audit.type = 3;
                            audit.changes = JSON.stringify(register.dataValues);
                            audit.modelid = register.id;
                            audit.save();
                        });
                    }
                }
            }
        }
    })
    , defineModel = function (name, attr) {
        models[name] = sequelize.define(name, attr, {
            freezeTableName: true
            , timestamps: false
        });
    }
    , getModel = function (modelname) {
        if (models[modelname]) {
            return models[modelname];
        } else {
            throw new Error('Model "' + modelname + '" not found');
        }
    }
    , setModels = function (fmodels) {
        models = fmodels;
    }
    , sanitizeString = function (value) {
        value = value.replace(/'/g, '\'\'');
        return value;
    };
// Models
let models = {};
defineModel('session', {
    sid: {
        type: Sequelize.TEXT,
        primaryKey: true
    },
    expires: Sequelize.DATE,
    data: Sequelize.TEXT
});
sequelize.query(`
  SELECT
    m.name as model
    , ma.*
  FROM
    model m
  INNER JOIN modelattribute ma ON (m.id = ma.idmodel)
  WHERE
    ma.type NOT IN ('virtual')
  ORDER by m.name
  `, { type: sequelize.QueryTypes.SELECT }).then(results => {
    let modelname
        , modelattributeobj = {};
    // Create Attributes
    for (let i = 0; i < results.length; i++) {
        // Start
        if (i == 0) {
            modelname = results[i].model;
            modelattributeobj = {};
        }
        if (modelname == results[i].model) {
            if (results[i].type == 'decimal') {
                modelattributeobj[results[i].name] = {
                    type: application.sequelize.decodeType(Sequelize, results[i].type)
                    , get(name) {
                        const value = this.getDataValue(name);
                        return value === null ? null : parseFloat(value);
                    }
                };
            } else {
                modelattributeobj[results[i].name] = application.sequelize.decodeType(Sequelize, results[i].type);
            }
        } else {
            defineModel(modelname, modelattributeobj);
            modelname = results[i].model;
            modelattributeobj = {};
            if (results[i].type == 'decimal') {
                modelattributeobj[results[i].name] = {
                    type: application.sequelize.decodeType(Sequelize, results[i].type)
                    , get(name) {
                        const value = this.getDataValue(name);
                        return value === null ? null : parseFloat(value);
                    }
                };
            } else {
                modelattributeobj[results[i].name] = application.sequelize.decodeType(Sequelize, results[i].type);
            }
        }
        if (i == results.length - 1) {
            defineModel(modelname, modelattributeobj);
        }
    }
    // Create References
    for (let i = 0; i < results.length; i++) {
        const j = application.modelattribute.parseTypeadd(results[i].typeadd);
        const vas = j.as || j.model;
        try {
            switch (results[i].type) {
                case 'parent':
                    models[results[i].model].belongsTo(models[j.model], {
                        as: vas
                        , foreignKey: results[i].name
                        , onDelete: 'cascade' in j && j['cascade'] ? 'CASCADE' : 'NO ACTION'
                    });
                    break;
                case 'autocomplete':
                    models[results[i].model].belongsTo(models[j.model], {
                        as: vas
                        , foreignKey: results[i].name
                        , onDelete: 'cascade' in j && j['cascade'] ? 'CASCADE' : 'NO ACTION'
                    });
                    break;
            }
        } catch (err) {
            console.error(err, results[i].model, j);
        }
    }
});

sequelize.query('select * from config', { type: Sequelize.QueryTypes.SELECT }).then(config => {
    if (config) {
        require('../custom/' + config[0].customfile);
        application.config.setPartials(config[0]);
    }
});

module.exports = {
    sequelize: sequelize
    , Sequelize: Sequelize
    , getModel: getModel
    , setModels: setModels
    , Op: Sequelize.Op
    , sanitizeString: sanitizeString
};