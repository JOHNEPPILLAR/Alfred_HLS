const logger = require('winston');
const http = require('http');
const url = require('url');
const path = require('path');
const zlib = require('zlib');
const httpAttach = require('http-attach');
const fsProvider = require('./fsProvider');

const CONTENT_TYPE = {
  MANIFEST: 'application/vnd.apple.mpegurl',
  SEGMENT: 'video/MP2T',
  HTML: 'text/html',
};

const authErrorJSON = {
  error: 401,
  data: 'There was a problem authenticating you.',
};

const pong = {
  sucess: 'true',
  data: 'pong',
};

function HLSServer(server, opts) {
  const self = this;

  if (!(self instanceof HLSServer)) return new HLSServer(server, opts);
  if (server) self.attach(server, opts);
}

HLSServer.prototype.attach = function (server, opts) {
  const self = this;

  opts = opts || {};
  self.path = opts.path || self.path || '/';
  self.dir = opts.dir || self.dir || '';

  self.provider = opts.provider || fsProvider;

  if (isNaN(server)) {
    httpAttach(server, self._middleware.bind(self));
  } else { // Port numbers
    const port = server;
    server = http.createServer();
    httpAttach(server, self._middleware.bind(self));
    server.listen(port);
  }
};

HLSServer.prototype._middleware = function (req, res, next) {
  const self = this;

  const uri = url.parse(req.url).pathname;
  const relativePath = path.relative(self.path, uri);
  const filePath = path.join(self.dir, relativePath);
  const extension = path.extname(filePath);

  req.filePath = filePath;

  // Gzip support
  const ae = req.headers['accept-encoding'] || '';
  req.acceptsCompression = ae.match(/\bgzip\b/);

  // Check if app_key is valid
  const parsedUrl = url.parse(req.url, true);
  const { app_key } = parsedUrl.query;

  if (parsedUrl.pathname === '/ping') {
    if (app_key != process.env.app_key) {
      logger.error(`Invaid app_key: ${app_key}`); // Log error

      res.writeHead(401, { 'Content-Type': 'text/json' }); // Send response back to client
      res.write(JSON.stringify(authErrorJSON));
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/json' }); // Send response back to client
    res.write(JSON.stringify(pong));
    res.end();
    return;
  }

  self.provider.exists(req, (err, exists) => {
    if (err) {
      res.statusCode = 500;
      res.end();
    } else if (!exists) {
      res.statusCode = 404;
      res.end();
    } else {
      switch (extension) {
        case '.m3u8':
          if (app_key != process.env.app_key) {
            logger.error(`Invaid app_key: ${app_key}`); // Log error

            res.writeHead(401, { 'Content-Type': 'text/json' }); // Send response back to client
            res.write(JSON.stringify(authErrorJSON));
            res.end();
            return;
          }
          self._writeManifest(req, res, next);
          break;
        case '.ts':
          self._writeSegment(req, res, next);
          break;
        default:
          next();
          break;
      }
    }
  });
};

HLSServer.prototype._writeManifest = function (req, res, next) {
  const self = this;

  self.provider.getManifestStream(req, (err, stream) => {
    if (err) {
      res.statusCode = 500;
      res.end();
      return next();
    }

    res.setHeader('Content-Type', CONTENT_TYPE.MANIFEST);
    res.statusCode = 200;

    if (req.acceptsCompression) {
      res.setHeader('content-encoding', 'gzip');
      res.statusCode = 200;
      const gzip = zlib.createGzip();
      stream.pipe(gzip).pipe(res);
    } else {
      stream.pipe(res, 'utf-8');
    }
  });
};

HLSServer.prototype._writeSegment = function (req, res, next) {
  const self = this;

  self.provider.getSegmentStream(req, (err, stream) => {
    if (err) {
      res.statusCode = 500;
      res.end();
      return next();
    }
    res.setHeader('Content-Type', CONTENT_TYPE.SEGMENT);
    res.statusCode = 200;
    stream.pipe(res);
  });
};

module.exports = HLSServer;
