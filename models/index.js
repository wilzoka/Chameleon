var application = require('../routes/application')
  , Sequelize = require('sequelize')
  , sequelize = new Sequelize('chameleon', 'postgres', 'postgres', {
    host: '172.10.30.18'
    , dialect: 'postgres'
    , pool: {
      max: 5
      , min: 0
      , idle: 10000
    }
    , logging: function (query) {
      // console.log(query);
    }
  })
  ;

//Models
var models = {};
sequelize.query("SELECT m.name as model, ma.* FROM model m inner join modelattribute ma on (m.id = ma.idmodel) order by m.name", { type: sequelize.QueryTypes.SELECT }).then(results => {

  var modelname;
  var modelattributeobj = {};

  //Create Attributes
  for (var i = 0; i < results.length; i++) {
    // Startf
    if (i == 0) {
      modelname = results[i].model;
      modelattributeobj = {};
    }
    if (modelname == results[i].model) {

      modelattributeobj[results[i].name] = application.sequelize.decodeType(Sequelize, results[i].type);

    } else {
      models[modelname] = sequelize.define(modelname, modelattributeobj, {
        freezeTableName: true
        , timestamps: false
      });

      modelname = results[i].model;
      modelattributeobj = {};
      modelattributeobj[results[i].name] = application.sequelize.decodeType(Sequelize, results[i].type);
    }

    if (i == results.length - 1) {
      models[modelname] = sequelize.define(modelname, modelattributeobj, {
        freezeTableName: true
        , timestamps: false
      });
    }
  }

  //Create References
  for (var i = 0; i < results.length; i++) {
    var j = {};
    if (results[i].typeadd) {
      j = JSON.parse(results[i].typeadd);
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
        var vas = j.as || j.model;
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
  , getModel: getModel
  , setModels: setModels
  , dropForeignKeyConstraints: dropForeignKeyConstraints
};