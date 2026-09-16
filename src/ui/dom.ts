/**
 * Tiny DOM helpers. Kept small on purpose -- the session panel is the
 * only component in Phase 3, and pulling in a framework for ~150 lines
 * of UI is exactly the over-engineering the prompt warns against.
 */

type ElAttrs = Record<
  string,
  string | number | boolean | null | undefined | Record<string, string>
>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: ElAttrs = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') {
      node.className = String(value);
    } else if (key === 'dataset' && value && typeof value === 'object') {
      Object.assign(node.dataset, value as Record<string, string>);
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function confirm(message: string): boolean {
  return window.confirm(message);
}
