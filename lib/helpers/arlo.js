/**
 * Import external libraries
 */
const Arlo = require('node-arlo');

async function loginArlo() {
  const arloUser = await this._getVaultSecret.call(this, 'ArloUsername');
  const arloPassword = await this._getVaultSecret.call(this, 'ArloPassword');
  const emailUser = await this._getVaultSecret.call(this, 'emailUser');
  const emailPassword = await this._getVaultSecret.call(this, 'emailPassword');
  const emailServer = await this._getVaultSecret.call(this, 'emailServer');
  const config = {
    keepLoggedIn: true,
    arloUser,
    arloPassword,
    emailUser,
    emailPassword,
    emailServer,
  };

  this.logger.trace(`${this._traceStack()} - Logging into Arlo`);
  await this.arlo.login(config);
}

async function processUpdate(deviceName, info) {
  this.logger.trace(
    `${this._traceStack()} - ${deviceName} update event: ${JSON.stringify(
      info,
    )}`,
  );

  const { batteryLevel } = info;
  const { signalStrength } = info;

  if (batteryLevel === undefined) return;

  const dataVaules = {
    time: new Date(),
    device: info.serialNumber,
    location: deviceName,
    signal: info.signalStrength || 0,
    battery: info.batteryLevel,
  };

  let dbConnection;

  this.logger.trace(
    `${this._traceStack()} - Saving data: ${dataVaules.location} (${
      dataVaules.device
    })`,
  );

  try {
    dbConnection = await this._connectToDB();
    this.logger.trace(`${this._traceStack()} - Insert data`);
    const results = await dbConnection
      .db(this.namespace)
      .collection(this.namespace)
      .insertOne(dataVaules);

    if (results.insertedCount === 1)
      this.logger.info(
        `Saved data: ${dataVaules.location} (${dataVaules.device})`,
      );
    else
      this.logger.error(
        `${this._traceStack()} - Failed to save data: ${dataVaules.location} (${
          dataVaules.device
        })`,
      );
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  } finally {
    this.logger.trace(`${this._traceStack()} - Close DB connection`);
    await dbConnection.close();
  }
}

function _setupArlo() {
  this.logger.trace(`${this._traceStack()} - Setting up Arlo devices`);
  this.arlo = new Arlo();

  // Set up devices
  this.arlo.on(Arlo.FOUND, (device) => {
    if (device.type === Arlo.BASESTATION) {
      this.logger.trace(
        `${this._traceStack()} - Found base station: ${device.name} - ${
          device.id
        }`,
      );
    }

    if (device.type === Arlo.CAMERA) {
      this.logger.trace(
        `${this._traceStack()} - Found camera: ${device.name} - ${device.id}`,
      );

      if (this.arlo.getDeviceName(device.id) === 'Living Room') {
        this.camLivingRoom = device;
      }
      if (this.arlo.getDeviceName(device.id) === 'Garden') {
        this.camGarden = device;
      }
    }
  });

  this.arlo.on(Arlo.EVENT_GOT_DEVICES, async () => {
    this.logger.trace(
      `${this._traceStack()} - Got all devices, ready to interact`,
    );

    // Listen for api requests
    this.listen();

    this.arlo.on(Arlo.EVENT_BATTERY, (info) => {
      this.logger.info(`Battery update event: ${JSON.stringify(info)}`);
      //
      // TO DO
      //
      // this.processUpdate(info);
      //
    });
  });

  // Setup schedules
  this.setupSchedules();

  // Login & get devices
  const sucess = loginArlo.call(this);
  if (!sucess) this._fatal(true);
}

module.exports = {
  _setupArlo,
};
