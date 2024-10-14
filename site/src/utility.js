class Utility {
  constructor() {
    this.tagRegexp = /<[^>]*>/gi;
    this.loadImages();
  }

  async loadImages() {
    this.images = {};

    const localData = localStorage.getItem("images");
    if (localData) {
      this.images = JSON.parse(localData);
    }

    const response = await fetch("/data/images.json");
    const data = await response.json();

    this.images = data;

    localStorage.setItem("images", JSON.stringify(data));
  }

  callOnInterval(fn, interval, callImmediate = true) {
    if (callImmediate) {
      fn();
    }

    // This will space the calls by at least the interval time from the
    // end of the last call. This allows async methods to do their thing
    // without being called again while the previous one is still working.
    let nextCall = Date.now() + interval;
    return setInterval(async () => {
      const now = Date.now();
      if (now >= nextCall && document.visibilityState === "visible") {
        nextCall = Infinity;

        try {
          await fn();
        } catch (error) {
          console.error(error);
        }

        nextCall = Date.now() + interval;
      }
    }, Math.max(interval / 10, 10));
  }

  formatShortQuantity(quantity) {
    if (quantity >= 1000000000) {
      return Math.floor(quantity / 1000000000) + "B";
    } else if (quantity >= 10000000) {
      return Math.floor(quantity / 1000000) + "M";
    } else if (quantity >= 100000) {
      return Math.floor(quantity / 1000) + "K";
    }
    return quantity;
  }

  formatVeryShortQuantity(quantity) {
    if (quantity >= 1000 && quantity < 100000) {
      return Math.floor(quantity / 1000) + "K";
    }

    return this.formatShortQuantity(quantity);
  }

  removeArticles(str) {
    const articles = ["a", "the", "an"];
    const words = str.split(" ");
    if (words.length <= 1) return str;
    if (articles.includes(words[0].toLowerCase())) {
      return words.splice(1).join(" ");
    }
    return str;
  }

  timeSinceLastUpdate(lastUpdated) {
    lastUpdated = new Date(lastUpdated);
    const now = new Date();
    return now.getTime() - lastUpdated.getTime();
  }

  throttle(fn, interval) {
    let pause = false;

    return () => {
      if (pause) return;
      pause = true;

      setTimeout(() => {
        fn();
        pause = false;
      }, interval);
    };
  }

  setsEqual(a, b) {
    if (!a || !b) return false;
    return a.size === b.size && [...a].every((x) => b.has(x));
  }

  isBitSet(n, offset) {
    const mask = 1 << offset;
    return (n & mask) !== 0;
  }

  average(arr) {
    let sum = 0;
    for (let i = 0; i < arr.length; ++i) {
      sum += arr[i];
    }
    return sum / arr.length;
  }

  removeTags(s) {
    return s?.replace(this.tagRegexp, "");
  }

  image(src) {
    return `${src}?id=${this.images[src]}`;
  }
}

const utility = new Utility();

export { utility };
