/**
 * Import external libraries
 */
const { Service } = require('alfred-base');
const debug = require('debug')('HLS:Server');

// Setup service options
const { version } = require('../../package.json');
const serviceName = require('../../package.json').description;
const namespace = require('../../package.json').name;

const options = {
  serviceName,
  namespace,
  serviceVersion: version,
};

// Bind api functions to base class
Object.assign(Service.prototype, require('../api/camera/camera'));
Object.assign(Service.prototype, require('../api/stream/stream'));

// Bind Arlo helper functions to base class
Object.assign(Service.prototype, require('../helpers/arlo'));

// Bind schedule functions to base class
Object.assign(Service.prototype, require('../schedules/controller'));

// Bind media library functions to base class
Object.assign(Service.prototype, require('../collectors/arlo/arlo'));

// Create base service
const service = new Service(options);

async function setupServer() {
  // Setup service
  await service.createRestifyServer();

  // Apply api routes
  service.restifyServer.get('/camera/:camera/privacystatus', (req, res, next) =>
    service.getPrivacyStatus(req, res, next),
  );
  debug(`Added get '/camera/:camera/privacystatus' api`);

  service.restifyServer.get('/camera/:camera/image', (req, res, next) =>
    service.getImage(req, res, next),
  );
  debug(`Added get '/camera/:camera/image' api`);

  service.restifyServer.get('/camera/:camera/stream', (req, res, next) =>
    service.startStream(req, res, next),
  );
  debug(`Added get '/camera/:camera/stream' api`);

  service.restifyServer.get('/stream/*', (req, res, next) =>
    service.playStream(req, res, next),
  );
  debug(`Added get '/stream/*' api`);

  // Setup Arlo before service can start to accept api calls
  await service._setupArlo();
}
setupServer();
