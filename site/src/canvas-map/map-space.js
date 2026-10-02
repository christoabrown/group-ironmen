// The map's own space: map pixels, the space the canvas draws in under the
// camera transform. The map is made of image tiles of 256 pixels, each 64 by
// 64 game tiles, so a game tile is four map pixels. x goes right as in the
// game; y goes down where the game's goes up.
//
// Positions of game tiles are in the site's coordinates, whose y is one more
// than the game's (see GuildData.transformCoordinatesFromStorage). That makes
// `-y * 4 + 256` the top of a tile, not its bottom.

export const PIXELS_PER_GAME_TILE = 4;

export const MAP_TILE_SIZE = 256;

export const GAME_TILES_PER_MAP_TILE = MAP_TILE_SIZE / PIXELS_PER_GAME_TILE;

/** The top left corner of a game tile, in map pixels. */
export function tileOrigin(x, y) {
  return [x * PIXELS_PER_GAME_TILE, -y * PIXELS_PER_GAME_TILE + MAP_TILE_SIZE];
}

/** The middle of a game tile, in map pixels. */
export function tileCenter(x, y) {
  const [left, top] = tileOrigin(x, y);
  return [left + PIXELS_PER_GAME_TILE / 2, top + PIXELS_PER_GAME_TILE / 2];
}
