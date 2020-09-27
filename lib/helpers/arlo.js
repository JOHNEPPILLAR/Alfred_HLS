/**
 * Import external libraries
 */
const Arlo = require('node-arlo');

const poolingInterval = 5 * 60 * 1000; // 5 minutes

async function _loginArlo() {
  const email = await this._getVaultSecret.call(this, 'ArloUsername');
  const password = await this._getVaultSecret.call(this, 'ArloPassword');
  this.logger.trace(`${this._traceStack()} - Logging into Arlo`);
  await this.arlo.login(email, password);
}

async function _setupArlo() {
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
      device.on(Arlo.UPDATE, async (info) => {
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

        const dataVaules = {
          time: new Date(),
          device: info.serialNumber,
          location: deviceName,
          signal: info.signalStrength,
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
              `${this._traceStack()} - Failed to save data: ${
                dataVaules.location
              } (${dataVaules.device})`,
            );
        } catch (err) {
          this.logger.error(`${this._traceStack()} - ${err.message}`);
        } finally {
          this.logger.trace(`${this._traceStack()} - Close DB connection`);
          await dbConnection.close();
        }
      });

      setInterval(async () => {
        device.get();
      }, poolingInterval);
    }
  });

  this.arlo.on('got_devices', () => {
    this.setupSchedules();
  });

  // Login & get devices
  await this._loginArlo.call(this);
  await this.arlo.getDevices();
}

module.exports = {
  _setupArlo,
  _loginArlo,
};
