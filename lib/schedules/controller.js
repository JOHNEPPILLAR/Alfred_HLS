async function activateBaseStation(activate) {
  await this._loginArlo.call(this);
  if (activate) {
    this.baseStation.arm();
  } else {
    this.baseStation.disarm();
  }
  this.logger.info(
    `Base Station is ${!activate ? 'dis' : ''}armed - Cams are ${
      !activate ? 'not' : ''
    }active`,
  );

  // Adjust privacy setting on cams to reflect arm status
  this.livingRoomCam.setPrivacyActive(!activate);
  this.gardenCam.setPrivacyActive(!activate);
}

/**
 * Set up schedules
 */
async function setupSchedules() {
  try {
    // Clear current schedules array
    this.logger.debug(`${this._traceStack()} - Clear current schedules`);
    this.schedules = [];

    // Night: on
    this.schedules.push({
      hour: 22,
      minute: 0,
      description: 'Night: Activate base station',
      functionToCall: activateBaseStation,
      args: true,
    });

    // Morning: off
    this.schedules.push({
      hour: 7,
      minute: 0,
      description: 'Morning: De-activate base station',
      functionToCall: activateBaseStation,
      args: false,
    });

    // If weekend do not set schedules
    const bankHolidayOrWeekend = await this._isBankHolidayWeekend();
    if (bankHolidayOrWeekend instanceof Error) return;
    if (bankHolidayOrWeekend) {
      this.logger.info(
        "Not setting schedule as it's the weekend or a bank holiday",
      );
      return;
    }

    // If working from home do not set schedules
    const workingFromHome = await this._workingFromHomeToday();
    if (workingFromHome instanceof Error) return;
    if (workingFromHome) {
      this.logger.info('Not setting schedule as working from home');
      return;
    }

    this.logger.debug(
      `${this._traceStack()} - Register morning webcam on schedule`,
    );

    // School drop off: on
    this.schedules.push({
      hour: 8,
      minute: 30,
      description: 'School drop off: Activate base station',
      functionToCall: activateBaseStation,
      args: true,
    });

    // School pick up: off
    this.schedules.push({
      hour: 15,
      minute: 0,
      description: 'School pick up: De-activate base station',
      functionToCall: activateBaseStation,
      args: false,
    });

    // Activate schedules
    await this.activateSchedules();
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  }
}

module.exports = {
  setupSchedules,
};
