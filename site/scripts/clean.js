const fs = require('fs');
const glob = require('glob');

const files = [
  ...glob.sync('public/*.js'),
  ...glob.sync('public/*.map'),
  ...glob.sync('public/*.html')
];

for (const file of files) {
  fs.rmSync(file);
}
