const express = require('express');
const winston = require('winston');
const expressWinston = require('express-winston');
const path = require('path');
const compression = require('compression')
const app = express();
const port = 4000;

const quiet = process.argv.some((arg) => arg === '--quiet');

if (!quiet) {
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
}
app.use(compression());
app.use(express.static('public'));
app.use(express.static('.'));
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
