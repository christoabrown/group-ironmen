const child_process = require('child_process');
const fs = require('fs');
const xml2js = require('xml2js');
const glob = require('glob');
const nAsync = require('async');
const path = require('path');
const axios = require('axios');

const xmlParser = new xml2js.Parser();
const xmlBuilder = new xml2js.Builder();

const runelitePath = './runelite';
const cacheProjectPath = `${runelitePath}/cache`;
const cachePomPath = `${cacheProjectPath}/pom.xml`;
const cacheJarOutputDir = `${cacheProjectPath}/target`;
const osrsCacheDirectory = './cache/cache';
const siteItemDataPath = '../site/public/data/item_data.json';
const siteItemImagesPath = '../site/public/icons/items';

function exec(command, options) {
  console.log(command);
  options = options || {};
  options.stdio = 'inherit';
  try {
    child_process.execSync(command, options);
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
}

async function setMainClassInCachePom(mainClass) {
  console.log(`Setting mainClass of ${cachePomPath} to ${mainClass}`);
  xmlParser.reset();
  const cachePomData = fs.readFileSync(cachePomPath, 'utf8');
  const cachePom = await xmlParser.parseStringPromise(cachePomData);

  const plugins = cachePom.project.build[0].plugins[0].plugin;

  const mavenAssemblyPlugin = plugins.find((plugin) => plugin.artifactId[0] === 'maven-assembly-plugin');
  const configuration = mavenAssemblyPlugin.configuration[0];
  configuration.archive = [{ manifest: [{ mainClass: [mainClass] }] }];

  const cachePomResult = xmlBuilder.buildObject(cachePom);
  fs.writeFileSync(cachePomPath, cachePomResult);
}

function execRuneliteCache(params) {
  const cacheJar = glob.sync(`${cacheJarOutputDir}/cache-*-jar-with-dependencies.jar`)[0];
  const cmd = `java -jar ${cacheJar} -c ${osrsCacheDirectory} ${params}`;

  exec(cmd);
}

async function readAllItemFiles() {
  const itemFiles = glob.sync(`./item-data/*.json`);
  const result = {};

  const q = nAsync.queue((itemFile, callback) => {
    fs.promises.readFile(itemFile, 'utf8').then((itemFileData) => {
      const item = JSON.parse(itemFileData);
      if (isNaN(item.id)) console.log(item);
      result[item.id] = item;

      callback();
    });
  }, 50);
  for (const itemFile of itemFiles) {
    q.push(itemFile);
  }

  await q.drain();
  return result;
}

function buildCacheProject() {
  exec(`mvn install -Dmaven.test.skip=true -f pom.xml`, { cwd: cacheProjectPath });
}

(async () => {
  console.log('Step: Setting up runelite');
  if (!fs.existsSync(runelitePath)) {
    exec(`git clone "git@github.com:runelite/runelite.git"`);
  }
  exec(`git fetch origin master`, { cwd: runelitePath });
  exec(`git reset --hard origin/master`, { cwd: runelitePath });

  console.log('\nStep: Unpacking item data from cache');
  await setMainClassInCachePom('net.runelite.cache.Cache');
  buildCacheProject();
  execRuneliteCache('-items ./item-data');

  console.log('\nStep: Build item_data.json');
  const items = await readAllItemFiles();
  const includedItems = {};
  const allIncludedItemIds = new Set();
  for (const [itemId, item] of Object.entries(items)) {
    if (item.name && item.name.trim().toLowerCase() !== 'null') {
      includedItem = {
        name: item.name,
        highalch: Math.floor(item.cost * 0.6)
      };
      const stackedList = [];
      if (item.countCo && item.countObj && item.countCo.length > 0 && item.countObj.length > 0) {
        for (let i = 0; i < item.countCo.length; ++i) {
          const stackBreakPoint = item.countCo[i];
          const stackedItemId = item.countObj[i];

          if (stackBreakPoint > 0 && stackedItemId === 0) {
            console.log(`${itemId}: Item has a stack breakpoint without an associated item id for that stack.`);
          } else if (stackBreakPoint > 0 && stackedItemId > 0) {
            allIncludedItemIds.add(stackedItemId);
            stackedList.push([stackBreakPoint, stackedItemId]);
          }
        }

        if (stackedList.length > 0) {
          includedItem.stacks = stackedList;
        }
      }
      allIncludedItemIds.add(item.id);
      includedItems[itemId] = includedItem;
    }
  }

  console.log('\nStep: Fetching unalchable items from wiki');
  const nonAlchableItemNames = new Set();
  let cmcontinue = '';
  do {
    const url = `https://oldschool.runescape.wiki/api.php?cmtitle=Category:Items_that_cannot_be_alchemised&action=query&list=categorymembers&format=json&cmlimit=500&cmcontinue=${cmcontinue}`;
    const response = await axios.get(url);
    const itemNames = response.data.query.categorymembers.map((member) => member.title).filter((title) => !title.startsWith('File:') && !title.startsWith('Category:'));
    itemNames.forEach((name) => nonAlchableItemNames.add(name));
    cmcontinue = response.data?.continue?.cmcontinue || null;
  } while(cmcontinue);

  let itemsMadeNonAlchable = 0;
  for (const item of Object.values(includedItems)) {
    const itemName = item.name;
    if (nonAlchableItemNames.has(itemName)) {
      // NOTE: High alch value = 0 just means unalchable in the context of this program
      item.highalch = 0;
      itemsMadeNonAlchable++;
    }

    // NOTE: The wiki data does not list every variant of an item such as 'Abyssal lantern (yew logs)'
    // which is also not alchable. So this step is to handle that case by searching for the non variant item.
    if (itemName.trim().endsWith(')') && itemName.indexOf('(') !== -1) {
      const nonVariantItemName = itemName.substring(0, itemName.indexOf('(')).trim();
      if (nonAlchableItemNames.has(nonVariantItemName)) {
        item.highalch = 0;
        itemsMadeNonAlchable++;
      }
    }
  }
  console.log(`${itemsMadeNonAlchable} items were updated to be unalchable`);
  fs.writeFileSync('./item_data.json', JSON.stringify(includedItems));

  // TODO: Model 529 seems to be broken? It may be for deleted items. Ex: itemId=478 is the broken pickaxe
  // TODO: Zoom on holy symbol is incorrect
  console.log('\nStep: Extract item model images');
  const existingItemImageFiles = [...glob.sync(`${siteItemImagesPath}/*.webp`), ...glob.sync(`${siteItemImagesPath}/*.png`)];
  const itemsThatAlreadyHaveAnImage = new Set();
  for (const imageFile of existingItemImageFiles) {
    const itemId = parseInt(path.parse(imageFile).name);
    if (isNaN(itemId)) {
      console.log(`Existing image has no item id: ${imageFile}`);
    }
    itemsThatAlreadyHaveAnImage.add(itemId);
  }

  const itemIdsThatDoNotHaveAnImage = new Set();
  for (const itemId of allIncludedItemIds.values()) {
    if (!itemsThatAlreadyHaveAnImage.has(itemId)) {
      itemIdsThatDoNotHaveAnImage.add(itemId);
    }
  }

  if (itemIdsThatDoNotHaveAnImage.size === 0) {
    console.log("Don't need to generate any new item images");
  } else {
    console.log(`Generating images for ${itemIdsThatDoNotHaveAnImage.size} items`);
    fs.writeFileSync('items_need_images.csv', Array.from(itemIdsThatDoNotHaveAnImage.values()).join(','));
    const imageDumperDriver = fs.readFileSync('./Cache.java', 'utf8');
    fs.writeFileSync(`${cacheProjectPath}/src/main/java/net/runelite/cache/Cache.java`, imageDumperDriver);
    const itemSpriteFactory = fs.readFileSync('./ItemSpriteFactory.java', 'utf8');
    fs.writeFileSync(`${cacheProjectPath}/src/main/java/net/runelite/cache/item/ItemSpriteFactory.java`, itemSpriteFactory);
    buildCacheProject();
    execRuneliteCache('-ids ./items_need_images.csv -output ./item-images');
  }

  console.log('\nStep: Moving results to site');
  fs.renameSync('./item_data.json', siteItemDataPath);
  const newImageFiles = glob.sync('./item-images/*.png');
  for (const imageFile of newImageFiles) {
    const base = path.parse(imageFile).base;
    if (base) {
      fs.renameSync(imageFile, `${siteItemImagesPath}/${base}`);
    }
  }
})();
