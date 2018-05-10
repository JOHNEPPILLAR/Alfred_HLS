/**
 * Import external libraries
 */
const childProcess = require('child_process');

const poolingInterval = 5000; // 5 seconds

function convertStreams(camToProcess) {
  const child = childProcess.fork('./converter/convertRTSP.js', [camToProcess]);
  child.on('exit', () => { setTimeout(() => { convertStreams(camToProcess); }, poolingInterval); });
}

convertStreams(1);
convertStreams(2);
