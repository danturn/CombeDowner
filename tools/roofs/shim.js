// Enough of a browser for the game's map code to load under node (tools/roofs/drawn.ts).
const g = globalThis;
g.location = { search: "", href: "http://x/", hostname: "x", pathname: "/" };
g.window = g;
g.localStorage = { getItem() { return null; }, setItem() {} };
Object.defineProperty(g, "navigator", { value: { userAgent: "node", maxTouchPoints: 0 }, configurable: true });
g.document = { createElement() { return { getContext() { return null; }, style: {} }; }, addEventListener() {}, querySelector() { return null; }, getElementById() { return null; }, body: { appendChild() {} } };
g.addEventListener = () => {};
g.matchMedia = () => ({ matches: false, addEventListener() {} });
