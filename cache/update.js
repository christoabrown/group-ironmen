const child_process = require('child_process');
const fs = require('fs');
const xml2js = require('xml2js');
const glob = require('glob');
const nAsync = require('async');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');

const xmlParser = new xml2js.Parser();
const xmlBuilder = new xml2js.Builder();

const runelitePath = './runelite';
const cacheProjectPath = `${runelitePath}/cache`;
const cachePomPath = `${cacheProjectPath}/pom.xml`;
const cacheJarOutputDir = `${cacheProjectPath}/target`;
const osrsCacheDirectory = './cache/cache';
const siteItemDataPath = '../site/public/data/item_data.json';
const siteItemImagesPath = '../site/public/icons/items';
const siteMapImagesPath = '../site/public/map';

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
  const jars = glob.sync(`${cacheJarOutputDir}/cache-*-jar-with-dependencies.jar`);
  let cacheJar = jars[0];
  let cacheJarmtime = fs.statSync(cacheJar).mtime;
  for (const jar of jars) {
    const mtime = fs.statSync(jar).mtime;
    if (mtime > cacheJarmtime) {
      cacheJarmtime = mtime;
      cacheJar = jar;
    }
  }

  const cmd = `java -Xmx8g -jar ${cacheJar} ${params}`;
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

async function setupRunelite() {
  console.log('Step: Setting up runelite');
  if (!fs.existsSync(runelitePath)) {
    exec(`git clone "git@github.com:runelite/runelite.git"`);
  }
  exec(`git fetch origin master`, { cwd: runelitePath });
  exec(`git reset --hard origin/master`, { cwd: runelitePath });
}

async function dumpItemData() {
  console.log('\nStep: Unpacking item data from cache');
  await setMainClassInCachePom('net.runelite.cache.Cache');
  buildCacheProject();
  execRuneliteCache(`-c ${osrsCacheDirectory} -items ./item-data`);
}

async function getNonAlchableItemNames() {
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

  return nonAlchableItemNames;
}

async function buildItemDataJson() {
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

  const nonAlchableItemNames = await getNonAlchableItemNames();

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

  return allIncludedItemIds;
}

async function dumpItemImages(allIncludedItemIds) {
  // TODO: Zoom on holy symbol is incorrect
  console.log('\nStep: Extract item model images');

  console.log(`Generating images for ${allIncludedItemIds.size} items`);
  fs.writeFileSync('items_need_images.csv', Array.from(allIncludedItemIds.values()).join(','));
  const imageDumperDriver = fs.readFileSync('./Cache.java', 'utf8');
  fs.writeFileSync(`${cacheProjectPath}/src/main/java/net/runelite/cache/Cache.java`, imageDumperDriver);
  const itemSpriteFactory = fs.readFileSync('./ItemSpriteFactory.java', 'utf8');
  fs.writeFileSync(`${cacheProjectPath}/src/main/java/net/runelite/cache/item/ItemSpriteFactory.java`, itemSpriteFactory);
  buildCacheProject();
  execRuneliteCache(`-c ${osrsCacheDirectory} -ids ./items_need_images.csv -output ./item-images`);

  const itemImages = glob.sync(`./item-images/*.png`);
  let p = [];
  for (const itemImage of itemImages) {
    p.push(new Promise(async (resolve) => {
      const itemImageData = await sharp(itemImage).webp({ lossless: true }).toBuffer();
      fs.unlinkSync(itemImage);
      await sharp(itemImageData).webp({ lossless: true, effort: 6 }).toFile(itemImage.replace(".png", ".webp")).then(resolve);
    }));
  }
  await Promise.all(p);
}

async function convertXteasToRuneliteFormat() {
  const xteas = JSON.parse(fs.readFileSync(`${osrsCacheDirectory}/../xteas.json`, 'utf8'));
  let result = xteas.map((region) => ({
    region: region.mapsquare,
    keys: region.key
  }));

  const location = `${osrsCacheDirectory}/../xteas-runelite.json`;
  fs.writeFileSync(location, JSON.stringify(result));

  return location;
}

async function dumpMapData(xteasLocation) {
  console.log('\nStep: Dumping map data');
  const mapImageDumper = fs.readFileSync('./MapImageDumper.java', 'utf8');
  fs.writeFileSync(`${cacheProjectPath}/src/main/java/net/runelite/cache/MapImageDumper.java`, mapImageDumper);
  await setMainClassInCachePom('net.runelite.cache.MapImageDumper');
  buildCacheProject();
  execRuneliteCache(`--cachedir ${osrsCacheDirectory} --xteapath ${xteasLocation} --outputdir ./map-data`);
}

async function tilePlane(plane) {
  fs.rmSync('./output_files', { recursive: true, force: true });
  const planeImage = sharp(`./map-data/img-${plane}.png`, { limitInputPixels: false }).flip();
  await planeImage.webp({ lossless: true }).tile({
    size: 256,
    depth: "one",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    skipBlanks: 0
  }).toFile('output.dz');
}

async function outputTileImage(s, plane, x, y) {
  return s.flatten({ background: '#000000' })
    .webp({ lossless: true, alphaQuality: 0, effort: 6 })
    .toFile(`./map-data/tiles/${plane}_${x}_${y}.webp`);
}

async function finalizePlaneTiles(plane, previousTiles) {
  const tileImages = glob.sync('./output_files/0/*.webp');

  let p = [];
  for (const tileImage of tileImages) {
    const filename = path.basename(tileImage, '.webp');
    const [x, y] = filename.split('_').map((coord) => parseInt(coord, 10));

    const finalX = x + 18;
    const finalY = y + 19;

    p.push(new Promise(async (resolve) => {
      let s;
      if (plane > 0) {
        const backgroundPath = `./map-data/tiles/${plane-1}_${finalX}_${finalY}.webp`;
        const backgroundExists = fs.existsSync(backgroundPath);

        if (backgroundExists) {
          const tile = await sharp(tileImage).flip().webp({ lossless: true }).toBuffer();
          const background = await sharp(backgroundPath).linear(0.5).webp({ lossless: true }).toBuffer();
          s = sharp(background)
            .composite([
              { input: tile }
            ]);
        }
      }

      if (!s) {
        s = sharp(tileImage).flip();
      }

      previousTiles.add(`${plane}_${finalX}_${finalY}`);
      outputTileImage(s, plane, finalX, finalY).then(resolve);
    }));
  }
  await Promise.all(p);

  // NOTE: This is just so the plane will have a darker version of the tile below it
  // even if the plane does not have its own image for a tile.
  if (plane > 0) {
    p = [];
    const belowTiles = [...previousTiles].filter(x => x.startsWith(plane - 1));
    for (const belowTile of belowTiles) {
      const [belowPlane, x, y] = belowTile.split('_');
      const  lookup = `${plane}_${x}_${y}`;
      if (!previousTiles.has(lookup)) {
        const outputPath = `./map-data/tiles/${plane}_${x}_${y}.webp`;
        if (fs.existsSync(outputPath) === true) {
          throw new Error(`Filling tile ${outputPath} but it already exists!`);
        }

        const s = sharp(`./map-data/tiles/${belowTile}.webp`).linear(0.5);
        previousTiles.add(lookup);
        p.push(outputTileImage(s, plane, x, y));
      }
    }
    await Promise.all(p);
  }
}

async function generateMapTiles() {
  console.log('\nStep: Generate map tiles');
  fs.rmSync('./map-data/tiles', { recursive: true, force: true });
  fs.mkdirSync('./map-data/tiles');

  const previousTiles = new Set();
  const planes = 4;
  for (let i = 0; i < planes; ++i) {
    console.log(`Tiling map plane ${i + 1}/${planes}`);
    await tilePlane(i);
    console.log(`Finalizing map plane ${i + 1}/${planes}`);
    await finalizePlaneTiles(i, previousTiles);
  }
}

function moveResults() {
  console.log('\nStep: Moving results to site');
  fs.renameSync('./item_data.json', siteItemDataPath);

  const newImageFiles = glob.sync('./item-images/*.webp');
  for (const imageFile of newImageFiles) {
    const base = path.parse(imageFile).base;
    if (base) {
      fs.renameSync(imageFile, `${siteItemImagesPath}/${base}`);
    }
  }

  const tileImageFiles = glob.sync("./map-data/tiles/*.webp");
  for (const tileImage of tileImageFiles) {
    const base = path.parse(tileImage).base;
    if (base) {
      fs.renameSync(tileImage, `${siteMapImagesPath}/${base}`);
    }
  }
}

(async () => {
  await setupRunelite();
  await dumpItemData();
  const allIncludedItemIds = await buildItemDataJson();
  await dumpItemImages(allIncludedItemIds);

  // const xteasLocation = await convertXteasToRuneliteFormat();
  // await dumpMapData(xteasLocation);
  // await generateMapTiles();

  await moveResults();
})();
