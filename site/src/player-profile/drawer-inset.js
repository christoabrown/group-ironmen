// The profile drawer and its margins (see player-profile.css): it covers this
// much of one side of the page, on screens wide enough for it to be a drawer.
// On narrower ones it takes the whole screen.
const DRAWER_PX = 404;
const DRAWER_MIN_SCREEN_PX = 701;
// What the page's <body> says while the drawer is open; the stylesheets go by these.
const OPEN_RIGHT = "profile-open";
const OPEN_LEFT = "profile-open-left";

/** Says on the page which side the drawer is open on: "left", "right", or null for closed. */
export function setDrawerSide(side) {
  document.body.classList.toggle(OPEN_RIGHT, side === "right");
  document.body.classList.toggle(OPEN_LEFT, side === "left");
}

/**
 * How much the open drawer covers of something as wide as the page, in
 * pixels from each side: `{left, right}`, both zero while it is closed or
 * the screen is too narrow for a drawer.
 */
export function drawerInset(width) {
  const open = document.body.classList;
  const wide = width >= DRAWER_MIN_SCREEN_PX;
  return {
    left: wide && open.contains(OPEN_LEFT) ? DRAWER_PX : 0,
    right: wide && open.contains(OPEN_RIGHT) ? DRAWER_PX : 0,
  };
}
