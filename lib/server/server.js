/**
 * Import external libraries
 */
const serviceHelper = require('alfred-helper');
// const path = require('path');

/**
 * Import helper libraries
 */
const { version } = require('../../package.json');
const serviceName = require('../../package.json').description;
const virtualHost = require('../../package.json').name;
const devices = require('../collectors/controller.js');
const schedules = require('../schedules/controller.js');
const RTSPRecorder = require('../helpers/RTSPRecorder.js');
const APIroot = require('../api/root/root.js');
const APIstream = require('../api/stream/stream.js');

global.APITraceID = '';
global.streamsStore = [];
global.schedules = [];
let recordingCams = [];

async function recordCam() {
  serviceHelper.log(
    'trace',
    'Get webcam(s) settings',
  );
  let HLSCams = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'HLSCam');
  if (HLSCams instanceof Error) {
    serviceHelper.log(
      'error',
      'Not able to get secret (Cam info) from vault',
    );
    return;
  }
  HLSCams = JSON.parse(HLSCams);

  // Check for in progress recordings that need stopping
  recordingCams
    // eslint-disable-next-line max-len
    .filter((recordingCam) => HLSCams.filter((cam) => cam.Record === 'false' && cam.Room === recordingCam.name).length === 1)
    .map(async (recordingCam, index) => {
      serviceHelper.log(
        'info',
        `Settings changed, stop recording cam: ${recordingCam.name}`,
      );
      await recordingCam.stopRecording(); // Stop Recording
      recordingCams.splice(index, 1);
      return true;
    });

  // Check for recordings that need start
  const tempRecordingCams = HLSCams
    // eslint-disable-next-line max-len
    .filter((cam) => cam.Record === 'true' && recordingCams.filter((recordingCam) => recordingCam.name === cam.Room).length === 0)
    .map((cam) => {
      serviceHelper.log(
        'info',
        `Settings changed, start recording cam: ${cam.Room}`,
      );

      const recRef = new RTSPRecorder({
        name: `${cam.Room}`,
        url: cam.CamURL,
        type: 'record',
        disableStreaming: false,
        timeLimit: 600, // 10 minutes for each segmented video file
      });
      recRef.startRecording(); // Start Recording
      return recRef;
    });

  // New recordong so add it to the recordings array
  if (tempRecordingCams.length > 0) recordingCams = tempRecordingCams;

  // Check again in 5 minutes if settings are the same
  const timerInterval = 5 * 60 * 1000;
  setTimeout(() => { recordCam(); }, timerInterval);
}

async function setupAndRun() {
  // Create restify server
  const server = await serviceHelper.setupRestifyServer(virtualHost, version);

  // Setup API middleware
  await serviceHelper.setupRestifyMiddleware(server, virtualHost);

  /*
  server.use(async (req, res, next) => {
    const fileExt = path.extname(req.url).toLowerCase();
    if (req.query.clientaccesskey !== ClientAccessKey && fileExt !== '.ts') {
      serviceHelper.log(
        'warn',
        `Invaid client access key: ${req.query.clientaccesskey}`,
      );
      serviceHelper.sendResponse(
        res,
        401,
        'There was a problem authenticating you.',
      );
      return;
    }
    next();
  });
  */

  // Configure API end points
  APIroot.applyRoutes(server);
  APIstream.applyRoutes(server, '/stream');

  // Capture and process API errors
  await serviceHelper.captureRestifyServerErrors(server);

  // Start service and listen to requests
  server.listen(process.env.PORT, async () => {
    serviceHelper.log(
      'info',
      `${serviceName} has started`,
    );
    recordCam();
    devices.processArloDevices(); // Collect cam data
    schedules.setSchedule(); // Setup schedules
  });
}

setupAndRun();
