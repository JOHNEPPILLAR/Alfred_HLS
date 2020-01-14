/**
 * Import external libraries
 */
const serviceHelper = require('alfred-helper');

/**
 * Import helper libraries
 */
const Arlo = require('../server/arlo.js');

const arlo = new Arlo();
const timerInterval = 15 * 60 * 1000; // 15 minutes

async function getCamData() {
  await arlo.getBatteryStatus();
}

exports.processArloDevices = async function fnprocessArloDevices() {
  try {
    await getCamData();
  } catch (err) {
    serviceHelper.log('error', err.message);
  }
  setTimeout(() => {
    fnprocessArloDevices();
  }, timerInterval);
};
