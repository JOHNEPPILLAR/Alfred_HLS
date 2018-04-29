/**
 * Import external libraries
 */
const logger = require('winston');
const dateFormat = require('dateformat');
const rp = require('request-promise');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Ignore ssl for service to service mode

/**
 * Setup logger transports
 */
logger.remove(logger.transports.Console);
if (process.env.Environment === 'dev') {
  // Remove default concole transport and add in winston customized console transport
  logger.add(logger.transports.Console, { timestamp() { return dateFormat(new Date(), 'dd mmm yyyy HH:MM'); }, colorize: true });
}

/**
 * Call another Alfred service with PUT
 */
async function callAlfredServicePut(apiURL, body, retry) {
  const retryableCodes = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
  ];

  const options = {
    method: 'PUT',
    uri: apiURL,
    resolveWithFullResponse: true,
    json: true,
    headers: {
      'Client-Access-Key': process.env.ClientAccessKey,
      'Instance-Trace-ID': global.instanceTraceID,
      'Call-Trace-ID': global.callTraceID,
    },
    body,
  };

  try {
    return await rp(options);
  } catch (err) {
    if (!apiURL.match(process.env.LogService)) { // Do not get in endless loop
      log('error', 'callAlfredServicePut', err);
    } else {
      console.log(err);
    }

    let retryCount = retry || 0;
    if (retryableCodes.indexOf(err.cause.code) >= 0 &&
       (retryCount <= process.env.APICallRetryLimit)) {
      retryCount += 1;
      setTimeout(() => {
        callAlfredServicePut(apiURL, body, retryCount);
      }, 5000); // 5 second delay before re-tyring
    }
  }
  return true;
}
exports.callAlfredServicePut = function FnCallAlfredServicePut(apiURL, body) {
  callAlfredServicePut(apiURL, body);
};

/**
 * Display to local console or if in production call logging service
 */
function log(type, functionName, message) {
  if (process.env.Environment === 'dev') {
    switch (type) {
      case 'info':
        if (functionName === null) {
          logger.info(`${message}`);
        } else {
          logger.info(`${functionName}: ${message}`);
        }
        break;
      case 'trace':
        if (process.env.Debug) {
          if (functionName === null) {
            logger.info(`${message}`);
          } else {
            logger.info(`${functionName}: ${message}`);
          }
        }
        break;
      case 'warn':
        if (functionName === null) {
          logger.info(`${message}`);
        } else {
          logger.info(`${functionName}: ${message}`);
        }
        break;
      case 'error':
        if (functionName === null) {
          logger.error(`${message}`);
        } else {
          logger.error(`${functionName}: ${message}`);
        }
        break;
      case 'leak':
        logger.error('A memory leak occured');
        logger.error(`${message}`);
        break;
      default:
        logger.info(`${message}`);
        break;
    }
  } else {
    const apiURL = `${process.env.LogService}/save`;
    const body = {
      type, service: process.env.ServiceName, functionName, message,
    };
    callAlfredServicePut(apiURL, body); // Send to logging service
  }
}
exports.log = (type, functionName, message) => {
  log(type, functionName, message);
};

/**
 * Construct and send JSON response back to caller
 */
exports.sendResponse = function FnSendResponse(res, status, dataObj) {
  let rtnStatus = 'true';
  let httpHeaderCode;
  let rtnData = dataObj;

  if (!status) { rtnStatus = 'false'; }

  switch (status) {
    case null: // Internal server error
      httpHeaderCode = 500;
      rtnStatus = 'false';
      rtnData = {
        name: dataObj.name,
        message: dataObj.message,
      };
      break;
    case false: // Invalid params
      httpHeaderCode = 400;
      rtnStatus = 'false';
      break;
    case 401: // Not authorised, invalid app_key
      httpHeaderCode = 401;
      rtnStatus = 'false';
      break;
    case 404: // Resource not found
      httpHeaderCode = 404;
      rtnStatus = 'false';
      break;
    default:
      httpHeaderCode = 200;
  }

  const returnJSON = {
    sucess: rtnStatus,
    data: rtnData,
  };

  res.send(httpHeaderCode, returnJSON); // Send response back to caller
};

/**
 * Misc
 */
exports.isEmptyObject = function FnIsEmptyObject(obj) {
  if (obj == null) return true;
  if (obj.length > 0) return false;
  if (obj.length === 0) return true;
  if (typeof obj !== 'object') return true;
  return !Object.keys(obj).length;
};

exports.GetSortOrder = function FnGetSortOrder(prop) {
  return function AB(a, b) {
    if (a[prop] > b[prop]) {
      return 1;
    } else if (a[prop] < b[prop]) {
      return -1;
    }
    return 0;
  };
};

exports.zeroFill = function FnZeroFill(number, width) {
  const pad = width - number.toString().length;
  if (pad > 0) {
    return new Array(pad + (/\./.test(number) ? 2 : 1)).join('0') + number;
  }
  return `${number}`; // always return a string
};

exports.cleanString = function FnCleanString(input) {
  let output = '';
  for (let i = 0; i < input.length; i += 1) {
    if (input.charCodeAt(i) <= 127) {
      output += input.charAt(i);
    }
  }
  output = output.replace(/\0/g, '');
  return output;
};

