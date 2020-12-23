/**
 * Import external libraries
 */
const debug = require('debug')('HLS:Arlo');
const Arlo = require('arlo');

const screenShotPollingIntival = 15 * 60000; // 15 minutes

async function processUpdate(device) {
  const { batteryLevel } = device.properties;
  const { signalStrength } = device.properties;

  if (typeof batteryLevel === undefined && typeof signalStrength === undefined) {
    debug('No battery level or signal strength to record');
    return;
  }

  debug(`Saving data for ${device.deviceName}`);
  const dataVaules = {
    time: new Date(),
    device: device.deviceId,
    location: device.deviceName,
    signal: signalStrength || 100,
    battery: batteryLevel || 100,
  };
  debug(dataVaules);

  let dbConnection;
  try {
    debug('Connect to DB');
    dbConnection = await this._connectToDB();
  
    debug('Insert data');
    const results = await dbConnection
      .db(this.namespace)
      .collection(this.namespace)
      .insertOne(dataVaules);

    if (results.insertedCount === 1)
      this.logger.info(
        `[${device.deviceId}] Saved data (${device.deviceName})`,
      );
    else
      this.logger.error(
        `${this._traceStack()} - [${device.deviceId}] Failed to save data: ${device.deviceName})`,
      );
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  } finally {
    debug(`Close DB connection`);
    try {
      await dbConnection.close();
    } catch {
      return;
    }
  }
}

async function _setupArlo() {
  debug(`Setting up Arlo devices`);

  debug(`Getting arlo init option from vault`);
  const arloUser = await this._getVaultSecret.call(this, 'ArloUsername');
  const arloPassword = await this._getVaultSecret.call(this, 'ArloPassword');
  const emailUser = await this._getVaultSecret.call(this, 'emailUser');
  const emailPassword = await this._getVaultSecret.call(this, 'emailPassword');
  const emailServer = await this._getVaultSecret.call(this, 'emailServer');
  const updateStateEvery = 10;
  const config = {
    arloUser,
    arloPassword,
    emailUser,
    emailPassword,
    emailServer,
    updateStateEvery,
  };

  debug(`Create arlo instance`);
  this.arlo = new Arlo(config);

  this.arlo.on(Arlo.EVENT_DEVICES, async (info) => {
    console.log('Devices updated');
    for (const device of info) {
      await processUpdate.call(this, device);
    };
  });

  // Set up devices
  this.arlo.once(Arlo.EVENT_GOT_DEVICES, (devices) => {
    this.listen();

    for (const device of devices) {
      if (device.type === Arlo.CAMERA) {
        debug(
          `Found camera: ${device.deviceName} - ${device.deviceId}`,
        );

        if (device.deviceName === 'Living Room') {
          this.camLivingRoomID = device.deviceId;
        }
        if (device.deviceName === 'Garden') {
          this.camGardenID = device.deviceId;
        }
      }
    };

    setInterval(async () => {
      debug(`Getting screen shots by starting stream with no listner`);
      await this.arlo.startStream(this.camLivingRoomID);
      await this.arlo.startStream(this.camGardenID);

      debug(`Request device status`);
      await this.arlo.getCamStatus();
    }, screenShotPollingIntival);
  });

  // Login & get devices
  debug(`Login to Arlo`);
  const sucess = await this.arlo.login();
  if (!sucess) this._fatal(true);

  // Setup schedules
  debug(`Set up schedules`);
  this.setupSchedules();
}

module.exports = {
  _setupArlo,
};
