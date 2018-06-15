/**
 * Import external libraries
 */
const Skills = require('restify-router').Router;
const serviceHelper = require('../../lib/helper.js');
const streamController = require('../../converter/controller.js');

const skill = new Skills();

/**
 * @api {get} /ping
 * @apiName ping
 * @apiGroup Root
 *
 * @apiSuccessExample {json} Success-Response:
 *   HTTPS/1.1 200 OK
 *   {
 *     sucess: 'true'
 *     data: 'pong'
 *   }
 *
 * @apiErrorExample {json} Error-Response:
 *   HTTPS/1.1 400 Bad Request
 *   {
 *     data: Error message
 *   }
 *
 */
function ping(req, res, next) {
  serviceHelper.log('trace', 'ping', 'Ping API called');

  const ackJSON = {
    service: process.env.ServiceName,
    reply: 'pong',
    cpu: serviceHelper.getCpuInfo(),
    mem: serviceHelper.getMemoryInfo(),
    os: serviceHelper.getOsInfo(),
    process: serviceHelper.getProcessInfo(),
  };

  serviceHelper.sendResponse(res, true, ackJSON);
  next();
}
skill.get('/ping', ping);

/**
 * @api {get} /reregister
 * @apiName reregister
 * @apiGroup Root
 *
 * @apiSuccessExample {json} Success-Response:
 *   HTTPS/1.1 200 OK
 *   {
 *     sucess: 'true'
 *     data: {
 *       sucess or filure return message
 *     }
 *   }
 *
 * @apiErrorExample {json} Error-Response:
 *   HTTPS/1.1 400 Bad Request
 *   {
 *     data: Error message
 *   }
 *
 */
async function reRegister(req, res, next) {
  serviceHelper.log('trace', 'reRegister', 'reRegister API called');

  let returnMessage = 'Re-registered service';

  if (!serviceHelper.registerService()) returnMessage = 'Unable to re-register service';

  serviceHelper.log('trace', 'reRegister', returnMessage);
  serviceHelper.sendResponse(res, false, returnMessage);
  next();
}
skill.get('/reregister', reRegister);

/**
 * @api {get} /restart
 * @apiName restart
 * @apiGroup Root
 *
 * @apiSuccessExample {json} Success-Response:
 *   HTTPS/1.1 200 OK
 *   {
 *     sucess: 'true'
 *   }
 *
 * @apiErrorExample {json} Error-Response:
 *   HTTPS/1.1 400 Bad Request
 *   {
 *     data: Error message
 *   }
 *
 */
function reStart(req, res, next) {
  serviceHelper.log('trace', 'reStart', 'reStart API called');
  streamController.reStart();
  serviceHelper.sendResponse(res, true, 'Restarting all streams');
  next();
}
skill.get('/restart', reStart);

module.exports = skill;
