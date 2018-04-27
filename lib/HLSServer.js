const http = require('http');
const url = require('url');
const path = require('path');
const zlib = require('zlib');
const httpAttach = require('http-attach');
const fsProvider = require('./fsProvider');
const UUID = require('pure-uuid');
const serviceHelper = require('./helper.js');

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
  data: {
    service: process.env.ServiceName,
    reply: 'pong',
  },
};

function HLSServer(server, opts) {
  const self = this;

  if (!(self instanceof HLSServer)) return new HLSServer(server, opts);
  if (server) self.attach(server, opts);
}

HLSServer.prototype.attach = function attach(server, opts) {
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

HLSServer.prototype._middleware = function x(req, res, next) {
  const self = this;

  const uri = url.parse(req.url).pathname;
  const relativePath = path.relative(self.path, uri);
  const filePath = path.join(self.dir, relativePath);
  const extension = path.extname(filePath);

  req.filePath = filePath;

  // Gzip support
  const ae = req.headers['accept-encoding'] || '';
  req.acceptsCompression = ae.match(/\bgzip\b/);

  if (typeof req.headers['trace-id'] === 'undefined') { global.traceID = new UUID(4); }

  const parsedUrl = url.parse(req.url, true);
  if (parsedUrl.pathname === '/ping') {
    res.writeHead(200, { 'Content-Type': 'text/json' }); // Send response back to client
    res.write(JSON.stringify(pong));
    res.end();
    return;
  }

  const { ClientAccessKey } = parsedUrl.query;
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
          // Check for valid auth key
          if (ClientAccessKey !== process.env.ClientAccessKey) {
            serviceHelper.log('warn', null, `Invaid client access key: ${ClientAccessKey}`);
            res.writeHead(401, { 'Content-Type': 'text/json' }); // Send response back to client
            res.write(JSON.stringify(authErrorJSON));
            res.end();
            return;
          }
          self.writeManifest(req, res, next);
          break;
        case '.ts':
          self.writeSegment(req, res, next);
          break;
        default:
          next();
          break;
      }
    }
  });
};

HLSServer.prototype.writeManifest = function writeManifest(req, res, next) {
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
    return true;
  });
};

HLSServer.prototype.writeSegment = function writeSegment(req, res, next) {
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
    return true;
  });
};

module.exports = HLSServer;
