const application = require('./application')
    , db = require('../models')
    , schedule = require('node-schedule')
    ;

const schedules = [];

const addSchedule = async function (sch) {
    try {
        const config = (await db.sequelize.query("SELECT * FROM config", { type: db.sequelize.QueryTypes.SELECT }))[0];
        const custom = require('../custom/' + config.customfile);
        const realfunction = application.functions.getRealReference(custom, sch.function);
        if (realfunction) {
            schedules[sch.id] = schedule.scheduleJob(sch.settings, realfunction.bind(null, sch));
        } else {
            console.error(`Agendamento ${sch.function} não encontrado`);
        }
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
        const config = (await db.sequelize.query("SELECT * FROM config", { type: db.sequelize.QueryTypes.SELECT }))[0];
        const custom = require('../custom/' + config.customfile);
        application.functions.getRealReference(custom, sch.function)(sch);
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