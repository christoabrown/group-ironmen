const express = require("express");
const winston = require("winston");
const expressWinston = require("express-winston");
const path = require("path");
const fs = require("fs");
const compression = require("compression");
const axios = require("axios");
const app = express();
const port = 4000;

const args = process.argv.map((arg) => arg.trim());
function getArgValue(arg) {
  const i = args.indexOf(arg);
  if (i === -1) return;
  return args[i + 1];
}

const backend = getArgValue("--backend") === undefined ? process.env.HOST_URL : getArgValue("--backend");

// Kubernetes probes. Answered by this process alone, ahead of the request log, the static files and
// the /api proxy, so a backend restart doesn't take the frontend out of rotation.
app.get("/healthz", (req, res) => {
  res.type("text/plain").send("ok");
});

app.use(
  expressWinston.logger({
    transports: [new winston.transports.Console()],
    format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    meta: false,
    msg: "HTTP {{req.method}} {{req.url}} {{res.statusCode}}",
    expressFormat: false,
    colorize: true,
    metaField: null,
    // The site polls the API every couple of seconds per viewer.
    ignoreRoute: (req) => req.path.startsWith("/api/group/get-group-data"),
  })
);
app.use(compression());

// Only public/ is served; the rest of the image (package.json, node_modules, this script) is not.
const publicDir = path.join(__dirname, "../public");

// Inject the site name and title into index.html
const indexHtmlPath = path.join(publicDir, "index.html");
const DEFAULT_NAME = "OSRS Guild Map";

const escapeHtml = (value) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Item, skill and slot icons are loaded from the osrs-icons CDN. Set ICONS_BASE_URL to a mirror, or to
// an empty value to turn icons off. Unset, it is left out of siteConfig and the page uses its default
// (DEFAULT_ICONS_BASE_URL in src/data/icons.js).
const iconsBaseUrl = process.env.ICONS_BASE_URL?.trim().replace(/\/+$/, "");
if (iconsBaseUrl === undefined) console.log("Icons from the default CDN");
else console.log(iconsBaseUrl ? `Icons from ${iconsBaseUrl}` : "Icons disabled (ICONS_BASE_URL is empty)");

const injectConfig = (html) => {
  const siteTitle = process.env.SITE_TITLE || DEFAULT_NAME;
  const siteName = process.env.SITE_NAME || DEFAULT_NAME;
  // JSON.stringify keeps quotes in the names from breaking out of the script; "<" is
  // escaped so a name can't close the script tag.
  const config = JSON.stringify({ title: siteName, pageTitle: siteTitle, iconsBaseUrl }).replace(/</g, "\\u003c");
  return html
    .replace("</head>", `<script>window.siteConfig = ${config};</script></head>`)
    .replace(`<title>${DEFAULT_NAME}</title>`, `<title>${escapeHtml(siteTitle)}</title>`);
};

const sendIndex = (res) => {
  fs.readFile(indexHtmlPath, "utf8", (err, data) => {
    if (err) {
      res.status(500).send("Error loading page");
      return;
    }
    res.set("Content-Type", "text/html");
    res.send(injectConfig(data));
  });
};

app.use((req, res, next) => {
  if (req.path === "/" || req.path === "/index.html") {
    sendIndex(res);
  } else {
    next();
  }
});

app.use(express.static(publicDir));

if (backend) {
  console.log(`Backend for api calls: ${backend}`);
  app.use(express.json());
  app.use("/api*", (req, res) => {
    const forwardUrl = backend + req.originalUrl;
    const headers = Object.assign({}, req.headers);
    delete headers.host;
    delete headers.referer;
    delete headers["content-length"];
    axios({
      method: req.method,
      url: forwardUrl,
      responseType: "stream",
      headers,
      data: req.body,
    })
      .then((response) => {
        res.status(response.status);
        res.set(response.headers);
        response.data.pipe(res);
      })
      .catch((error) => {
        if (error.response) {
          res.status(error.response.status);
          res.set(error.response.headers);
          error.response.data.pipe(res);
        } else if (error.request) {
          console.error("Proxy error (no response):", error.code, error.message);
          res.status(502).end();
        } else {
          console.error("Error", error.message);
          res.status(500).end();
        }
      });
  });
} else {
  console.log("No backend supplied for api calls, not going to handle api requests");
}

app.get("*", function (request, response) {
  // Icons moved to the icon CDN; old /icons/ and /ui/ sprite URLs get a 404, not the page.
  if (
    (request.path.includes("/map") && request.path.includes(".png")) ||
    request.path.startsWith("/icons/") ||
    request.path.startsWith("/ui/")
  ) {
    response.sendStatus(404);
  } else {
    sendIndex(response);
  }
});

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Listening on http://0.0.0.0:${port}`);
});

// In a container node is PID 1, which gets no default SIGTERM handling: without this a rollout
// waits out the whole termination grace period and then kills the process.
const shutdown = (signal) => {
  console.log(`${signal} received, closing the server`);
  server.close(() => process.exit(0));
  // A proxied API response can stay open; don't wait on it for long.
  setTimeout(() => process.exit(0), 10000).unref();
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
