/**
 * Adds the conventional "click outside to close" behavior to a floating UI.
 * Listening on pointerdown avoids closing a surface on the click that opens it.
 */
export function isOutsideEvent(event, elements) {
  const targets = (typeof elements === 'function' ? elements() : elements).filter(Boolean);
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];

  return targets.every((element) => (
    !path.includes(element) && !element.contains?.(event.target)
  ));
}

export function installOutsideDismiss({ root = document, isOpen, inside, close }) {
  const onPointerDown = (event) => {
    if (isOpen() && isOutsideEvent(event, inside)) close();
  };

  root.addEventListener('pointerdown', onPointerDown);
  return () => root.removeEventListener('pointerdown', onPointerDown);
}
