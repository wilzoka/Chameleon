var application = require('../routes/application')
  , Sequelize = require('sequelize')
  , sequelize = new Sequelize('chameleon', 'postgres', 'postgres', {
    host: 'localhost'
    , dialect: 'postgres'
    , pool: {
      max: 5
      , min: 0
      , idle: 10000
    }
    , logging: function (query) {
      // console.log(query);
      // console.log('');
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
var models = {};
sequelize.query("SELECT m.name as model, ma.* FROM model m INNER JOIN modelattribute ma ON (m.id = ma.idmodel) WHERE ma.type NOT IN ('virtual') ORDER by m.name", { type: sequelize.QueryTypes.SELECT }).then(results => {
  var modelname;
  var modelattributeobj = {};
  var defineModel = function (name, attr) {
    models[name] = sequelize.define(name, attr, {
      freezeTableName: true
      , timestamps: false
    });
  }

  //Create Attributes
  for (var i = 0; i < results.length; i++) {
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
  for (var i = 0; i < results.length; i++) {
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

var getModel = function (modelname) {

  if (models[modelname]) {
    return models[modelname];
  } else {
    throw new Error('Model not found');
  }

}

var dropForeignKeyConstraints = function () {
  //this is a hack for dev only!
  //todo: check status of posted github issue, https://github.com/sequelize/sequelize/issues/7606
  const queryInterface = sequelize.getQueryInterface();
  return queryInterface.showAllTables().then(tableNames => {
    return Promise.all(tableNames.map(tableName => {
      return queryInterface.showConstraint(tableName).then(constraints => {
        return Promise.all(constraints.map(constraint => {
          if (constraint.constraintType == 'FOREIGN KEY') {
            return queryInterface.removeConstraint(tableName, constraint.constraintName);
          }
        }));
      });
    }));
  });
}

var setModels = function (fmodels) {
  models = fmodels;
}

module.exports = {
  sequelize: sequelize
  , Sequelize: Sequelize
  , Op: Sequelize.Op
  , getModel: getModel
  , setModels: setModels
  , dropForeignKeyConstraints: dropForeignKeyConstraints
};