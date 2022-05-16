import { pubsub } from "./data/pubsub";

class Router {
  constructor() {
    this.registeredRoutes = new Map();
    this.routeAliases = new Map();
    this.activeRoute = null;
    window.addEventListener("locationchange", this.handleLocationChange.bind(this));
  }

  register(path, route) {
    this.registeredRoutes.set(path, route);
    const matches = this.didMatch(this.location, path);

    if (matches) {
      this.activateRoute(route);
    }
  }

  aliasRoute(base, alias) {
    if (!this.routeAliases.has(base)) {
      this.routeAliases.set(base, new Set());
    }

    this.routeAliases.get(base).add(alias);

    if (this.registeredRoutes.has(base)) {
      const matches = this.didMatch(this.location, base);
      if (matches) {
        this.activateRoute(this.registeredRoutes.get(base));
      }
    }
  }

  unregister(path) {
    this.registeredRoute.delete(path);
  }

  get location() {
    const pathname = window.location.pathname;
    if (pathname.endsWith("/")) {
      return pathname.slice(0, -1);
    }
    return pathname;
  }

  didMatch(location, path) {
    return (path === "*" && !this.activeRoute) || path === location || this.routeAliases.get(path)?.has(location);
  }

  activateRoute(route) {
    if (this.activeRoute !== route) {
      this.activeRoute = route;
      // NOTE: This publish needs to happen before the route is enabled. Otherwise the enabled route
      // could activate other routes and the published events go out of order.
      pubsub.publish("route-activated", route);
      route.enable();
    }
  }

  handleLocationChange() {
    const location = this.location;
    let matchedRoute = null;

    // Find the matched route and disable any that don't match
    for (const path of this.registeredRoutes.keys()) {
      const matches = this.didMatch(location, path);
      if (matches) {
        matchedRoute = this.registeredRoutes.get(path);
      } else {
        this.registeredRoutes.get(path).disable();
      }
    }

    // Disable any unmatched wrappers
    for (const route of this.registeredRoutes.values()) {
      if ((matchedRoute === null || route.wrapper !== matchedRoute.wrapper) && route.wrapper) {
        route.wrapper.disable();
      }
    }

    // Enable the matched route
    if (matchedRoute) {
      this.activateRoute(matchedRoute);
    } else {
      this.activeRoute = null;
      window.history.pushState("", "", "/");
    }
  }
}

const router = new Router();

export { router };
// NOTE: This will send out extra events when we change
// the history state since it does not do that already
history.pushState = ((f) =>
  function pushState(...args) {
    const ret = f.apply(this, args);
    window.dispatchEvent(new Event("pushstate"));
    window.dispatchEvent(new Event("locationchange"));
    return ret;
  })(history.pushState);
history.replaceState = ((f) =>
  function replaceState(...args) {
    const ret = f.apply(this, args);
    window.dispatchEvent(new Event("replacestate"));
    window.dispatchEvent(new Event("locationchange"));
    return ret;
  })(history.replaceState);
window.addEventListener("popstate", () => {
  window.dispatchEvent(new Event("locationchange"));
});
