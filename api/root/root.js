/**
 * Import external libraries
 */
const Skills = require('restify-router').Router;
const serviceHelper = require('../../lib/helper.js');

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
    memory: Math.round(process.memoryUsage().rss / 1024 / 1024),
    heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  };

  serviceHelper.sendResponse(res, true, ackJSON); // Send response back to caller
  next();
}
skill.get('/ping', ping);

module.exports = skill;
