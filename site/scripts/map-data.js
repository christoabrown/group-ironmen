const fs = require('fs');
const buffer = require('buffer');
const axios = require('axios');
const path = require('path');

(async () => {
  const regions = fs.readdirSync('./public/map').filter((filename) => {
    return filename.endsWith('.webp');
  }).map((filename) => {
    const parts = filename.split('.webp')[0].split('_');
    const plane = parseInt(parts[0]);
    const x = parseInt(parts[1]);
    const y = parseInt(parts[2]);
    return ([plane, x, y]);
  });

  const iconsUrl = "https://maps.runescape.wiki/osrs/data/iconLists/MainIcons.json";

  const response = await axios.get(iconsUrl);
  const icons = response.data;
  const iconsResult = {};
  for (const [iconName, iconDef] of Object.entries(icons.icons)) {
    iconsResult[iconName] = iconDef.filename;
  }

  const iconLocationsUrl = "https://maps.runescape.wiki/osrs/data/overlayMaps/MainMapIconLoc.json";
  const iconLocationsResponse = await axios.get(iconLocationsUrl);

  const iconLocationsResult = {};
  for (const iconLocationsFeature of iconLocationsResponse.data.features) {
    const coordinates = iconLocationsFeature.geometry.coordinates;
    if (coordinates[2] !== 0) continue;
    const icon = iconLocationsFeature.properties.icon;
    if (!iconLocationsResult[icon]) {
      iconLocationsResult[icon] = [];
    }
    iconLocationsResult[icon].push([coordinates[0], coordinates[1]]);
  }

  const result = {
    regions,
    icons: iconsResult,
    locations: iconLocationsResult
  };
  fs.writeFileSync('./public/data/map_data.json', JSON.stringify(result));
})();
