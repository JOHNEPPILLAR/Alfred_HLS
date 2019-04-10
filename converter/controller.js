/**
 * Import external libraries
 */
const childProcess = require('child_process');

/**
 * Import helper libraries
 */
const serviceHelper = require('../lib/helper.js');

const poolingInterval = 5000; // 5 seconds
const restartInterval = 15 * 60 * 1000; // 15 minutes
const childProcesses = [];

function convertStreams(camToProcess) {
  const child = childProcess.fork('./converter/convertRTSP.js', [camToProcess]);
  child.on('exit', () => { setTimeout(() => { convertStreams(camToProcess); }, poolingInterval); });
  childProcesses.push(child);
}

exports.start = function start() {
  if (process.env.Mock === 'true') {
    serviceHelper.log('trace', 'Mock mode enabled - streaming static content');
  } else {
    convertStreams(1);
    // convertStreams(2);
    setInterval(() => {
      Array.prototype.forEach.call(childProcesses, (process) => {
        process.kill();
      });
    }, restartInterval);
  }
};

exports.reStart = function reStart() {
  Array.prototype.forEach.call(childProcesses, (process) => {
    serviceHelper.log('info', 'Restarting streams');
    process.kill();
  });
};
