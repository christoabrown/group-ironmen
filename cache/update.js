const child_process = require('child_process');
const fs = require('fs');
const xml2js = require('xml2js');
const glob = require('glob');
const nAsync = require('async');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const unzipper = require('unzipper');
// NOTE: sharp will keep some files open and prevent them from being deleted
sharp.cache(false);

const xmlParser = new xml2js.Parser();
const xmlBuilder = new xml2js.Builder();

const runelitePath = './runelite';
const cacheProjectPath = `${runelitePath}/cache`;
const cachePomPath = `${cacheProjectPath}/pom.xml`;
const cacheJarOutputDir = `${cacheProjectPath}/target`;
const osrsCacheDirectory = './cache/cache';
const siteItemDataPath = '../site/public/data/item_data.json';
const siteMapIconMetaPath = "../site/public/data/map_icons.json";
const siteMapLabelMetaPath = "../site/public/data/map_labels.json";
const siteItemImagesPath = '../site/public/icons/items';
const siteMapImagesPath = '../site/public/map';
const siteMapLabelsPath = '../site/public/map/labels';
const siteMapIconPath = "../site/public/map/icons/map_icons.webp";
const tileSize = 256;

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

async function retry(fn, skipLast) {
  const attempts = 10;
  for (let i = 0; i < attempts; ++i) {
    try {
      await fn();
      return;
    } catch (ex) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (i === (attempts - 1) && skipLast) {
        console.error(ex);
      }
    }
  }

  if (!skipLast) {
    fn();
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
      const includedItem = {
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

async function dumpMapLabels() {
  console.log('\nStep: Dumping map labels');
  const mapLabelDumper = fs.readFileSync('./MapLabelDumper.java', 'utf8');
  fs.writeFileSync(`${cacheProjectPath}/src/main/java/net/runelite/cache/MapLabelDumper.java`, mapLabelDumper);
  await setMainClassInCachePom('net.runelite.cache.MapLabelDumper');
  buildCacheProject();
  execRuneliteCache(`--cachedir ${osrsCacheDirectory} --outputdir ./map-data/labels`);

  const mapLabels = glob.sync("./map-data/labels/*.png");
  let p = [];
  for (const mapLabel of mapLabels) {
    p.push(new Promise(async (resolve) => {
      const mapLabelImageData = await sharp(mapLabel).webp({ lossless: true }).toBuffer();
      fs.unlinkSync(mapLabel);
      await sharp(mapLabelImageData).webp({ lossless: true, effort: 6 }).toFile(mapLabel.replace(".png", ".webp")).then(resolve);
    }));
  }
  await Promise.all(p);
}

async function dumpCollectionLog() {
  console.log('\nStep: Dumping collection log');
  const collectionLogDumper = fs.readFileSync('./CollectionLogDumper.java', 'utf8');
  fs.writeFileSync(`${cacheProjectPath}/src/main/java/net/runelite/cache/CollectionLogDumper.java`, collectionLogDumper);
  await setMainClassInCachePom('net.runelite.cache.CollectionLogDumper');
  buildCacheProject();
  execRuneliteCache(`--cachedir ${osrsCacheDirectory} --outputdir ../server`);
}

async function tilePlane(plane) {
  await retry(() => fs.rmSync('./output_files', { recursive: true, force: true }));
  const planeImage = sharp(`./map-data/img-${plane}.png`, { limitInputPixels: false }).flip();
  await planeImage.webp({ lossless: true }).tile({
    size: tileSize,
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

  for (const tileImage of tileImages) {
    const filename = path.basename(tileImage, '.webp');
    const [x, y] = filename.split('_').map((coord) => parseInt(coord, 10));

    const finalX = x + (4608 / tileSize);
    const finalY = y + (4864 / tileSize);

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
    await outputTileImage(s, plane, finalX, finalY);
  }

  // NOTE: This is just so the plane will have a darker version of the tile below it
  // even if the plane does not have its own image for a tile.
  if (plane > 0) {
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
        await outputTileImage(s, plane, x, y);
      }
    }
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

async function moveFiles(globSource, destination) {
  const files = glob.sync(globSource);
  for (file of files) {
    const base = path.parse(file).base;
    if (base) {
      await retry(() => fs.renameSync(file, `${destination}/${base}`), true);
    }
  }
}

async function moveResults() {
  console.log('\nStep: Moving results to site');
  await retry(() => fs.renameSync('./item_data.json', siteItemDataPath), true);

  await moveFiles('./item-images/*.webp', siteItemImagesPath);
  await moveFiles("./map-data/tiles/*.webp", siteMapImagesPath);
  await moveFiles("./map-data/labels/*.webp", siteMapLabelsPath);

  // Create a tile sheet of the map icons
  const mapIcons = glob.sync("./map-data/icons/*.png");
  let mapIconsCompositeOpts = [];
  const iconIdToSpriteMapIndex = {};
  for (let i = 0; i < mapIcons.length; ++i) {
    mapIconsCompositeOpts.push({
      input: mapIcons[i],
      left: 15 * i,
      top: 0
    });

    iconIdToSpriteMapIndex[path.basename(mapIcons[i], '.png')] = i;
  }
  await sharp({
    create: {
      width: 15 * mapIcons.length,
      height: 15,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).composite(mapIconsCompositeOpts).webp({ lossless: true, effort: 6 }).toFile(siteMapIconPath);

  // Convert the output of the map-icons locations to be keyed by the X an Y of the regions
  // that they are in. This is done so that the canvas map component can quickly lookup
  // all of the icons in each of the regions that are being shown.
  const mapIconsMeta = JSON.parse(fs.readFileSync("./map-data/icons/map-icons.json", 'utf8'));
  const locationByRegion = {};

  for (const [iconId, coordinates] of Object.entries(mapIconsMeta)) {
    for (let i = 0; i < coordinates.length; i += 2) {
      const x = coordinates[i] + 128;
      const y = coordinates[i + 1] + 1;

      const regionX = Math.floor(x / 64);
      const regionY = Math.floor(y / 64);

      const spriteMapIndex = iconIdToSpriteMapIndex[iconId];
      if (spriteMapIndex === undefined) {
        throw new Error("Could not find sprite map index for map icon: " + iconId);
      }

      locationByRegion[regionX] = locationByRegion[regionX] || {};
      locationByRegion[regionX][regionY] = locationByRegion[regionX][regionY] || {};
      locationByRegion[regionX][regionY][spriteMapIndex] = locationByRegion[regionX][regionY][spriteMapIndex] || [];

      locationByRegion[regionX][regionY][spriteMapIndex].push(x, y);
    }
  }

  fs.writeFileSync(siteMapIconMetaPath, JSON.stringify(locationByRegion));

  // Do the same for map labels
  const mapLabelsMeta = JSON.parse(fs.readFileSync("./map-data/labels/map-labels.json", 'utf8'));
  const labelByRegion = {};

  for (let i = 0; i < mapLabelsMeta.length; ++i) {
    const coordinates = mapLabelsMeta[i];
    const x = coordinates[0] + 128;
    const y = coordinates[1] + 1;
    const z = coordinates[2];

    const regionX = Math.floor(x / 64);
    const regionY = Math.floor(y / 64);

    labelByRegion[regionX] = labelByRegion[regionX] || {};
    labelByRegion[regionX][regionY] = labelByRegion[regionX][regionY] || {};
    labelByRegion[regionX][regionY][z] = labelByRegion[regionX][regionY][z] || [];

    labelByRegion[regionX][regionY][z].push(x, y, i);
  }

  fs.writeFileSync(siteMapLabelMetaPath, JSON.stringify(labelByRegion));
}

async function getLatestGameCache() {
  if (!fs.existsSync('./cache')) {
    fs.mkdirSync('./cache');
  }

  const caches = (await axios.get('https://archive.openrs2.org/caches.json')).data;
  const latestOSRSCache = caches.filter((cache) => {
    return cache.scope === 'runescape' && cache.game === 'oldschool' && cache.environment === 'live' && !!cache.timestamp;
  }).sort((a, b) => (new Date(b.timestamp)) - (new Date(a.timestamp)))[0];
  console.log(latestOSRSCache);

  const pctValidArchives = latestOSRSCache.valid_indexes / latestOSRSCache.indexes;
  if (pctValidArchives < 1) {
    throw new Error(`valid_indexes was less than indexes valid_indexes=${latestOSRSCache.valid_indexes} indexes=${latestOSRSCache.indexes} pctValidArchives=${pctValidArchives}`);
  }

  const pctValidGroups = latestOSRSCache.valid_groups / latestOSRSCache.groups;
  if (pctValidGroups < 1) {
    throw new Error(`valid_groups was less than groups valid_groups=${latestOSRSCache.valid_groups} groups=${latestOSRSCache.groups} pctValidGroups=${pctValidGroups}`);
  }

  const pctValidKeys = latestOSRSCache.valid_keys / latestOSRSCache.keys;
  if (pctValidKeys < 0.97) {
    throw new Error(`pctValidKeys was less that 97% valid_keys=${latestOSRSCache.valid_keys} keys=${latestOSRSCache.keys} pctValidKeys=${pctValidKeys}`);
  }

  const cacheFilesResponse = await axios.get(`https://archive.openrs2.org/caches/${latestOSRSCache.scope}/${latestOSRSCache.id}/disk.zip`, {
    responseType: 'arraybuffer'
  });
  const cacheFiles = await unzipper.Open.buffer(cacheFilesResponse.data);
  await cacheFiles.extract({ path: './cache' });

  const xteas = (await axios.get(`https://archive.openrs2.org/caches/${latestOSRSCache.scope}/${latestOSRSCache.id}/keys.json`)).data;
  fs.writeFileSync('./cache/xteas.json', JSON.stringify(xteas));
}

(async () => {
  await getLatestGameCache();
  await setupRunelite();
  await dumpItemData();
  const allIncludedItemIds = await buildItemDataJson();
  await dumpItemImages(allIncludedItemIds);

  const xteasLocation = await convertXteasToRuneliteFormat();
  await dumpMapData(xteasLocation);
  await generateMapTiles();
  await dumpMapLabels();
  await dumpCollectionLog();

  await moveResults();
})();
