var application = require('./application')
    , db = require('../models')
    , schedule = require('node-schedule')
    , reload = require('require-reload')(require)
    ;

var schedules = [];

var addSchedule = async function (sch) {
    try {
        let config = await db.getModel('config').find();
        let custom = reload('../custom/' + config.customfile);
        var realfunction = application.functions.getRealReference(custom, sch.function);
        schedules[sch.id] = schedule.scheduleJob(sch.settings, realfunction.bind(null, sch));
    } catch (err) {
        console.error(err);
    }
}

var removeSchedule = function (sch) {
    if (schedules[sch.id]) {
        schedules[sch.id].cancel();
        delete schedules[sch.id];
    }
}

var executeSchedule = async function (sch) {
    try {
        let config = await db.getModel('config').find();
        let custom = reload('../custom/' + config.customfile);
        var realfunction = application.functions.getRealReference(custom, sch.function);
        realfunction();
    } catch (err) {
        console.error(err);
    }
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