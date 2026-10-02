/** An element with a class and, when given, text (as text: nothing in it is read as HTML). */
export function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/**
 * Makes `elements` the children of `container`, in that order. Only what is
 * out of place is moved, so a list that is put in order again and again keeps
 * its focus, its scroll position and whatever is hovered.
 */
export function reorder(container, elements) {
  let cursor = container.firstChild;
  for (const element of elements) {
    if (element === cursor) {
      cursor = cursor.nextSibling;
    } else {
      container.insertBefore(element, cursor);
    }
  }
  while (cursor) {
    const next = cursor.nextSibling;
    cursor.remove();
    cursor = next;
  }
}
