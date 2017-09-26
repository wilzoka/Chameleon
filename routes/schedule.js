var application = require('./application')
    , db = require('../models')
    , schedule = require('node-schedule')
    , reload = require('require-reload')(require)
    ;

var schedules = [];

var addSchedule = function (sch) {
    var custom = reload('../custom/functions');
    var realfunction = application.functions.getRealFunction(custom, sch.function);
    schedules[sch.id] = schedule.scheduleJob(sch.settings, realfunction.bind(null, sch));
}

var removeSchedule = function (sch) {
    if (schedules[sch.id]) {
        schedules[sch.id].cancel();
        delete schedules[sch.id];
    }
}

var executeSchedule = function (sch) {
    var custom = reload('../custom/functions');
    var realfunction = application.functions.getRealFunction(custom, sch.function);
    realfunction();
}

db.sequelize.query("SELECT * FROM schedule where active", { type: db.sequelize.QueryTypes.SELECT }).then(scheds => {
    scheds.map(sched => {
        addSchedule(sched);
    });
});

module.exports = {
    addSchedule: addSchedule
    , removeSchedule: removeSchedule
    , executeSchedule: executeSchedule
}