const express = require('express');
const winston = require('winston');
const expressWinston = require('express-winston');
const path = require('path');
const compression = require('compression');
const axios = require('axios');
const app = express();
const port = 4000;

const args = process.argv.map((arg) => arg.trim());
function getArgValue(arg) {
  const i = args.indexOf(arg);
  if (i === -1) return;
  return args[i + 1];
}

const backend = getArgValue('--backend') === undefined ? process.env.HOST_URL : getArgValue('--backend');

app.use(expressWinston.logger({
  transports: [
    new winston.transports.Console()
  ],
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple()
  ),
  meta: false,
  msg: "HTTP {{req.method}} {{req.url}} {{res.statusCode}}",
  expressFormat: false,
  colorize: true,
  metaField: null
}));
app.use(compression());
app.use(express.static('public'));
app.use(express.static('.'));

if (backend) {
  console.log(`Backend for api calls: ${backend}`);
  app.use(express.json());
  app.use('/api*', (req, res, next) => {
    const forwardUrl = backend + req.originalUrl;
    console.log(`Calling backend ${forwardUrl}`);
    const headers = Object.assign({}, req.headers);
    delete headers.host;
    delete headers.referer;
    axios({
      method: req.method,
      url: forwardUrl,
      responseType: 'stream',
      headers,
      data: req.body
    }).then((response) => {
      res.status(response.status);
      res.set(response.headers);
      response.data.pipe(res);
    }).catch((error) => {
      if (error.response) {
        res.status(error.response.status);
        res.set(error.response.headers);
        error.response.data.pipe(res);
      } else if (error.request) {
        res.status(418).end();
      } else {
        console.error('Error', error.message);
        res.status(418).end();
      }
    });
  });
} else {
  console.log("No backend supplied for api calls, not going to handle api requests");
}

app.get('*', function (request, response) {
  if (request.path.includes('/map') && request.path.includes('.png')) {
    response.sendStatus(404);
  } else {
    response.sendFile(path.resolve('public', 'index.html'));
  }
});

const server = app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});
