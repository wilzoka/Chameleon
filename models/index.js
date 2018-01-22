let application = require('../routes/application')
  , Sequelize = require('sequelize')
  , sequelize = new Sequelize('siprs', 'postgres', 'postgres', {
    host: '172.10.30.18'
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
  })
  ;

//Models
let models = {};
sequelize.query("SELECT m.name as model, ma.* FROM model m INNER JOIN modelattribute ma ON (m.id = ma.idmodel) WHERE ma.type NOT IN ('virtual') ORDER by m.name", { type: sequelize.QueryTypes.SELECT }).then(results => {
  let modelname;
  let modelattributeobj = {};
  let defineModel = function (name, attr) {
    models[name] = sequelize.define(name, attr, {
      freezeTableName: true
      , timestamps: false
    });
  }
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
    let j = {};
    if (results[i].typeadd) {
      j = application.modelattribute.parseTypeadd(results[i].typeadd);
    }
    switch (results[i].type) {
      case 'parent':
        models[results[i].model].belongsTo(models[j.model], {
          as: j.model
          , foreignKey: results[i].name
          , onDelete: 'cascade' in j && j['cascade'] ? 'CASCADE' : 'NO ACTION'
        });
        break;
      case 'autocomplete':
        let vas = j.as || j.model;
        models[results[i].model].belongsTo(models[j.model], {
          as: vas
          , foreignKey: results[i].name
          , onDelete: 'cascade' in j && j['cascade'] ? 'CASCADE' : 'NO ACTION'
        });
        break;
    }
  }
});

let getModel = function (modelname) {
  if (models[modelname]) {
    return models[modelname];
  } else {
    throw new Error('Model "' + modelname + '" not found');
  }
}

let setModels = function (fmodels) {
  models = fmodels;
}

module.exports = {
  sequelize: sequelize
  , Sequelize: Sequelize
  , getModel: getModel
  , setModels: setModels
};