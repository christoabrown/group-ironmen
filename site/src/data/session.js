import { api } from "./api";
import { pubsub } from "./pubsub";

// Who is signed in. The session itself is a cookie the page can't read; what
// the page knows is what the server says of it: `{name, is_admin}`, which
// comes from the hub. Published as the topic "session" (null: nobody).

class SessionStore {
  constructor() {
    this.current = null;
  }

  get isAdmin() {
    return Boolean(this.current?.is_admin);
  }

  /** Asks the server who is signed in. Returns them, or null when nobody is. */
  async load() {
    let who = null;
    try {
      const response = await api.getMe();
      if (response.ok) who = await response.json();
    } catch {
      // A server that can't be reached has nobody signed in.
    }
    return this.set(who);
  }

  /** Notes who signed in (as the server answered), or null for nobody. */
  set(who) {
    this.current = who || null;
    pubsub.publish("session", this.current);
    return this.current;
  }

  clear() {
    this.set(null);
  }
}

export const session = new SessionStore();
