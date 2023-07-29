class PubSub {
  constructor() {
    this.subscribers = new Map();
    this.mostRecentPublish = new Map();
  }

  subscribe(dataName, subscriber, receiveMostRecent = true) {
    if (!this.subscribers.has(dataName)) {
      this.subscribers.set(dataName, new Set());
    }
    this.subscribers.get(dataName).add(subscriber);
    if (receiveMostRecent && this.mostRecentPublish.has(dataName)) {
      subscriber(...this.mostRecentPublish.get(dataName));
    }
  }

  unsubscribe(dataName, subscriber) {
    if (!this.subscribers.has(dataName)) {
      return;
    }
    this.subscribers.get(dataName).delete(subscriber);
  }

  publish(dataName, ...args) {
    this.mostRecentPublish.set(dataName, args);
    if (!this.subscribers.has(dataName)) {
      return;
    }

    for (const subscriber of this.subscribers.get(dataName)) {
      subscriber(...args);
    }
  }

  unpublishAll() {
    this.mostRecentPublish.clear();
  }

  unpublish(dataName) {
    this.mostRecentPublish.delete(dataName);
  }

  getMostRecent(dataName) {
    return this.mostRecentPublish.get(dataName);
  }

  anyoneListening(dataName) {
    return this.subscribers.has(dataName) && this.subscribers.get(dataName).size > 0;
  }

  waitUntilNextEvent(event, receiveMostRecent = true) {
    return new Promise((resolve) => {
      const subscriber = () => {
        this.unsubscribe(event, subscriber);
        resolve();
      };
      this.subscribe(event, subscriber, receiveMostRecent);
    });
  }

  waitForAllEvents(...events) {
    const waits = [];
    for (const event of events) {
      waits.push(this.waitUntilNextEvent(event));
    }

    return Promise.all(waits);
  }
}
const pubsub = new PubSub();

export { pubsub };
