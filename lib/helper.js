const dateFormat = require('dateformat');
const dotenv = require('dotenv');

dotenv.load(); // Load env vars

/**
 * Setup logging
 */
exports.setLogger = function FnSetLogger(logger) {
  try {
    logger.remove(logger.transports.Console);
    logger.add(logger.transports.File, {
      JSON: true, filename: 'Alfred_hls.log', timestamp() { return dateFormat(new Date(), 'dd mmm yyyy HH:MM'); },
    });
    if (process.env.environment === 'dev') {
      logger.add(logger.transports.Console, { timestamp() { return dateFormat(new Date(), 'dd mmm yyyy HH:MM'); }, colorize: true });
    }
  } catch (err) {
    logger.error(`setLogger: ${err}`);
  }
};
