/**
 * Import external libraries
 */
const Arlo = require('node-arlo');

const poolingInterval = 5 * 60 * 1000; // 5 minutes

async function saveToDB(sql, sqlValues) {
  try {
    this.logger.trace(
      `${this._traceStack()} - Connect to data store connection pool`,
    );
    const dbConnection = await this._connectToDB.call(this, 'arlo');
    this.logger.trace(
      `${this._traceStack()} - Save values for device: ${sqlValues[2]}`,
    );
    const results = await dbConnection.query(sql, sqlValues);
    this.logger.trace(
      `${this._traceStack()} - Release the data store connection back to the pool`,
    );
    await dbConnection.end(); // Close data store connection

    if (results.rowCount !== 1) {
      this.logger.error(
        `${this._traceStack()} - Failed to insert data for device: ${
          sqlValues[2]
        }`,
      );
    } else {
      this.logger.info(`Saved battery data for device: ${sqlValues[2]}`);
    }
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  }
}

async function login() {
  const email = await this._getVaultSecret.call(this, 'ArloUsername');
  const password = await this._getVaultSecret.call(this, 'ArloPassword');
  await this.arlo.login(email, password);
}

async function setupArlo() {
  this.arlo = new Arlo();

  // Set up devices
  this.arlo.on(Arlo.FOUND, (device) => {
    if (device.getType() === Arlo.BASESTATION) {
      this.baseStation = device;
      this.logger.trace(
        `${this._traceStack()} - Found base station: ${device.getName()} - ${
          device.id
        }`,
      );

      setInterval(() => {
        device.subscribe();
      }, poolingInterval);
    }

    if (device.getType() === Arlo.CAMERA) {
      const deviceName = device.getName();
      if (deviceName === 'Living Room') this.livingRoomCam = device;
      if (deviceName === 'Garden') this.gardenCam = device;

      this.logger.trace(
        `${this._traceStack()} - Found camera: ${deviceName} - ${device.id}`,
      );
      device.on(Arlo.UPDATE, (info) => {
        this.logger.trace(
          `${this._traceStack()} - ${deviceName} update event: ${JSON.stringify(
            info,
          )}`,
        );

        const { batteryLevel } = info;
        const { signalStrength } = info;

        if (batteryLevel === undefined || signalStrength === undefined) {
          return;
        }

        const sql =
          'INSERT INTO camera("time", deviceID, deviceName, signalStrength, batteryLevel) VALUES ($1, $2, $3, $4, $5)';
        const sqlValues = [
          new Date(),
          info.serialNumber,
          deviceName,
          info.signalStrength,
          info.batteryLevel,
        ];

        saveToDB.call(this, sql, sqlValues);
      });

      setInterval(() => {
        device.get();
      }, poolingInterval);
    }
  });

  this.arlo.on('got_devices', () => {
    this.setupSchedules();
  });

  // Login & get devices
  await login.call(this);
  await this.arlo.getDevices();
}

module.exports = {
  setupArlo,
};
