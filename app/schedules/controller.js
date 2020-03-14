/**
 * Import external libraries
 */
const scheduler = require('node-schedule');
const serviceHelper = require('alfred-helper');
const dateformat = require('dateformat');

/**
 * Import helper libraries
 */
const Arlo = require('../server/arlo.js');

async function setupSchedules() {
  // If weekend do not set schedules
  const bankHolidayOrWeekend = await serviceHelper.checkForBankHolidayWeekend();
  if (bankHolidayOrWeekend instanceof Error) return;
  if (bankHolidayOrWeekend) {
    serviceHelper.log('info', 'Not setting schedule as it\'s the weekend or a bank holiday');
    return;
  }

  // If working from home do not set schedules
  const workingFromHome = await serviceHelper.workingFromHomeToday();
  if (workingFromHome instanceof Error) return;
  if (workingFromHome) {
    serviceHelper.log('info', 'Not setting schedule as working from home');
    return;
  }

  const arlo = new Arlo();

  // Turn on cam each morning
  const date = new Date();
  date.setHours(8);
  date.setMinutes(45);
  let schedule = scheduler.scheduleJob(date, () => arlo.turnOffCam(false));
  global.schedules.push(schedule);
  serviceHelper.log(
    'info',
    `Livingroon cam on at ${dateformat(date, 'dd-mm-yyyy @ HH:MM')}`,
  );

  // Turn off cam each evening
  const kidsAtHomeToday = await serviceHelper.kidsAtHomeToday();
  if (kidsAtHomeToday) {
    date.setHours(15);
    date.setMinutes(0);
  } else {
    date.setHours(18);
    date.setMinutes(30);
  }
  schedule = scheduler.scheduleJob(date, () => arlo.turnOffCam(true));
  global.schedules.push(schedule);
  serviceHelper.log(
    'info',
    `Livingroon cam off at ${dateformat(date, 'dd-mm-yyyy @ HH:MM')}`,
  );
}

// Set up the schedules
async function setSchedule() {
  // Cancel any existing schedules
  serviceHelper.log('trace', 'Removing any existing schedules');
  await global.schedules.map((value) => {
    if (value) value.cancel();
    return true;
  });

  // Set schedules each day to keep in sync with sunrise & sunset changes
  const date = new Date();
  date.setHours(3);
  date.setMinutes(5);
  date.setTime(date.getTime() + 1 * 86400000);
  const schedule = scheduler.scheduleJob(date, () => setSchedule()); // Set the schedule
  global.schedules.push(schedule);
  serviceHelper.log(
    'info',
    `Reset schedules will run on ${dateformat(date, 'dd-mm-yyyy @ HH:MM')}`,
  );
  await setupSchedules();
}

exports.setSchedule = setSchedule;
