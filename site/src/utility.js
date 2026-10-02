class Utility {
  callOnInterval(fn, interval, callImmediate = true) {
    if (callImmediate) {
      fn();
    }

    // This will space the calls by at least the interval time from the
    // end of the last call. This allows async methods to do their thing
    // without being called again while the previous one is still working.
    let nextCall = Date.now() + interval;
    return setInterval(
      async () => {
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
      },
      Math.max(interval / 10, 10),
    );
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

  setsEqual(a, b) {
    if (!a || !b) return false;
    return a.size === b.size && [...a].every((x) => b.has(x));
  }

  average(arr) {
    let sum = 0;
    for (let i = 0; i < arr.length; ++i) {
      sum += arr[i];
    }
    return sum / arr.length;
  }
}
const utility = new Utility();

export { utility };
