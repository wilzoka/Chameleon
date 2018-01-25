let application = require('./application')
    , db = require('../models')
    , schedule = require('node-schedule')
    , reload = require('require-reload')(require)
    ;

let schedules = [];

const addSchedule = async function (sch) {
    try {
        let config = (await db.sequelize.query("SELECT * FROM config", { type: db.sequelize.QueryTypes.SELECT }))[0];
        let custom = reload('../custom/' + config.customfile);
        let realfunction = application.functions.getRealReference(custom, sch.function);
        schedules[sch.id] = schedule.scheduleJob(sch.settings, realfunction.bind(null, sch));
    } catch (err) {
        console.error(err);
    }
}

const removeSchedule = function (sch) {
    if (schedules[sch.id]) {
        schedules[sch.id].cancel();
        delete schedules[sch.id];
    }
}

const executeSchedule = async function (sch) {
    try {
        let config = (await db.sequelize.query("SELECT * FROM config", { type: db.sequelize.QueryTypes.SELECT }))[0];
        let custom = reload('../custom/' + config.customfile);
        application.functions.getRealReference(custom, sch.function)();
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