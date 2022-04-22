const fs = require('fs');
const crypto = require('crypto');

const appjs = fs.readFileSync('public/app.js', 'utf8');
const hash = crypto.createHash('sha256');
hash.update(appjs);
const hex = hash.digest('hex').slice(0, 6);

const newName = `app.${hex}.js`;
fs.renameSync('public/app.js', 'public/' + newName);
let html = fs.readFileSync('public/index.html', 'utf8');
html = html.replace('app.js', newName);
fs.writeFileSync('public/index.html', html);
