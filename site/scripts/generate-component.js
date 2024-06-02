const fs = require('fs');
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

readline.question('What do you want to name the component? ', (componentName) => {
  const isValidComponentName = (
    componentName && componentName.includes('-') &&
      componentName.toLowerCase() === componentName && !(/\s/g.test(componentName))
  );
  if (!isValidComponentName) {
    console.log('Component name must be in the format "app-component". All lowercase and minimum 2 words separated by hyphens');
    readline.close();
    return;
  }
  componentName = componentName.trim();

  const path = `./src/${componentName}`;
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path);
  }

  function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

  const pascalCase = componentName.split('-').map((s) => {
    return capitalizeFirstLetter(s);
  }).join('');

  const tsPath = `${path}/${componentName}.js`;
  if (!fs.existsSync(tsPath)) {
    fs.writeFileSync(tsPath, `
import { BaseElement } from '../base-element/base-element';

export class ${pascalCase} extends BaseElement {
  constructor() {
    super();
  }

  /* eslint-disable no-unused-vars */
  html() {
    return \`{{${componentName}.html}}\`;
  }
  /* eslint-enable no-unused-vars */

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }
}

customElements.define('${componentName}', ${pascalCase});
`.trim());
  }
  const cssPath = `${path}/${componentName}.css`;
  if (!fs.existsSync(cssPath)) {
    fs.writeFileSync(cssPath, '');
  }
  const htmlPath = `${path}/${componentName}.html`;
  if (!fs.existsSync(htmlPath)) {
    fs.writeFileSync(htmlPath, '');
  }

  const components = JSON.parse(fs.readFileSync('components.json', 'utf8'));
  if (components.indexOf(componentName) === -1) {
    components.push(componentName);
    fs.writeFileSync('components.json', JSON.stringify(components));
  }

  let index = fs.readFileSync('src/index.js', 'utf8').split('\n');
  const importString = `import "./${componentName}/${componentName}.js";`;
  if (index.indexOf(importString) === -1) {
    if (index[index.length - 1] === '') {
      index.pop();
    }
    index.push(importString);
    fs.writeFileSync('src/index.js', index.join('\n'));
  }

  readline.close();
});
