/**
 * The images drawn on the map, by URL. `get` gives an image once it has
 * loaded and null until then (or for good, when it can't be loaded); `onLoad`
 * is called when one arrives, so the map can be drawn again with it.
 */
export class IconCache {
  constructor({ createImage = () => new Image(), onLoad = () => {} } = {}) {
    this.createImage = createImage;
    this.onLoad = onLoad;
    this.entries = new Map();
  }

  get(url) {
    if (!url) return null;
    let entry = this.entries.get(url);
    if (!entry) {
      entry = { image: this.createImage(), ready: false };
      this.entries.set(url, entry);
      entry.image.onload = () => {
        entry.ready = true;
        this.onLoad(url);
      };
      // Not tried again: a missing icon stays missing, and the marker does without.
      entry.image.onerror = () => {
        entry.ready = false;
      };
      // No crossOrigin: nothing reads the canvas back, and an icon host
      // without CORS headers would refuse the image if it were asked for.
      entry.image.src = url;
    }
    return entry.ready ? entry.image : null;
  }
}
