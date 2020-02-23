/**
 * Import external libraries
 */
const serviceHelper = require('alfred-helper');

/**
 * Import helper libraries
 */
const Arlo = require('../server/arlo.js');

const arlo = new Arlo();
const batteryTimerInterval = 15 * 60 * 1000; // 15 minutes

exports.processArloDevices = async function fnprocessArloDevices() {
  try {
    await arlo.getBatteryStatus();
  } catch (err) {
    serviceHelper.log('error', err.message);
  }
  setTimeout(() => {
    fnprocessArloDevices();
  }, batteryTimerInterval);
};
