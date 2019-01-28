const application = require('../routes/application')
  , moment = require('moment')
  , Sequelize = require('sequelize')
  , sequelize = new Sequelize('db', 'postgres', 'postgres', {
    host: '127.0.0.1'
    , port: 5432
    , dialect: 'postgres'
    , pool: {
      max: 5
      , min: 0
      , idle: 10000
    }
    , timezone: 'America/Sao_Paulo'
    , logging: function (query) {
      // console.log(query); console.log('');
    }
    , operatorsAliases: {
      $eq: Sequelize.Op.eq,
      $ne: Sequelize.Op.ne,
      $gte: Sequelize.Op.gte,
      $gt: Sequelize.Op.gt,
      $lte: Sequelize.Op.lte,
      $lt: Sequelize.Op.lt,
      $not: Sequelize.Op.not,
      $in: Sequelize.Op.in,
      $notIn: Sequelize.Op.notIn,
      $is: Sequelize.Op.is,
      $like: Sequelize.Op.like,
      $notLike: Sequelize.Op.notLike,
      $iLike: Sequelize.Op.iLike,
      $notILike: Sequelize.Op.notILike,
      $regexp: Sequelize.Op.regexp,
      $notRegexp: Sequelize.Op.notRegexp,
      $iRegexp: Sequelize.Op.iRegexp,
      $notIRegexp: Sequelize.Op.notIRegexp,
      $between: Sequelize.Op.between,
      $notBetween: Sequelize.Op.notBetween,
      $overlap: Sequelize.Op.overlap,
      $contains: Sequelize.Op.contains,
      $contained: Sequelize.Op.contained,
      $adjacent: Sequelize.Op.adjacent,
      $strictLeft: Sequelize.Op.strictLeft,
      $strictRight: Sequelize.Op.strictRight,
      $noExtendRight: Sequelize.Op.noExtendRight,
      $noExtendLeft: Sequelize.Op.noExtendLeft,
      $and: Sequelize.Op.and,
      $or: Sequelize.Op.or,
      $any: Sequelize.Op.any,
      $all: Sequelize.Op.all,
      $values: Sequelize.Op.values,
      $col: Sequelize.Op.col
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
          if (['audit', 'report', 'session'].indexOf(register.constructor.name) < 0 && Object.keys(register._changed).length > 0) {
            getModel('model').findOne({ where: { name: register.constructor.name } }).then(model => {
              let audit = getModel('audit').build();
              let iduser = options.iduser || register._iduser;
              audit.datetime = moment();
              audit.idmodel = model.id;
              audit.iduser = iduser || null;
              audit.type = register._isInsert ? 1 : 2;
              let changes = {};
              for (let k in register._changed) {
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
              let audit = getModel('audit').build();
              let iduser = options.iduser || register._iduser;
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
  ;

//Models
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
    //Create Attributes
    for (let i = 0; i < results.length; i++) {
      // Start
      if (i == 0) {
        modelname = results[i].model;
        modelattributeobj = {};
      }
      if (modelname == results[i].model) {
        modelattributeobj[results[i].name] = application.sequelize.decodeType(Sequelize, results[i].type);
      } else {
        defineModel(modelname, modelattributeobj);
        modelname = results[i].model;
        modelattributeobj = {};
        modelattributeobj[results[i].name] = application.sequelize.decodeType(Sequelize, results[i].type);
      }
      if (i == results.length - 1) {
        defineModel(modelname, modelattributeobj);
      }
    }
    //Create References
    for (let i = 0; i < results.length; i++) {
      let j = application.modelattribute.parseTypeadd(results[i].typeadd);
      let vas = j.as || j.model;
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
    }
  });

sequelize.query('select * from config', { type: Sequelize.QueryTypes.SELECT }).then(config => {
  if (config) {
    if (config[0].favicon) {
      const favicon = JSON.parse(config[0].favicon)[0];
      application.Handlebars.registerPartial('parts/favicon', '/files/' + favicon.id + '.' + favicon.type);
    } else {
      application.Handlebars.registerPartial('parts/favicon', '/public/images/favicon.ico');
    }

    if (config[0].loginimage) {
      const loginimage = JSON.parse(config[0].loginimage)[0];
      application.Handlebars.registerPartial('parts/loginimage', `<img src="/files/${loginimage.id}.${loginimage.type}" alt="" style="max-width: 100%; margin-bottom: 10px;">`);
    } else {
      application.Handlebars.registerPartial('parts/loginimage', '');
    }
  }
});

module.exports = {
  sequelize: sequelize
  , Sequelize: Sequelize
  , getModel: getModel
  , setModels: setModels
};