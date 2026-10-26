// The boxes the game puts words in (the prompt in the middle of the screen, the job card, the
// flags-up panel and the rest), written only when the words have changed, so the page is left alone
// on the frames where nothing did.
//
// The element itself says whether it has changed, rather than the game noting down what it last
// wrote. That matters because these elements outlive a game: taking a train to another town builds a
// new Game on the same page (main.ts's travel), and a note kept by the game starts out empty — so the
// new game's first write looks like no change at all, and the last map's prompt or panel stays up for
// good. Asked of the element, the first write of a new game is always made (as daily.ts's panel does).
//
// This only holds while one place writes each of these elements: two writers would each see their
// own html already there and skip. That's true today — game.ts writes the prompt, the ride chip and
// the talkers; quests.ts the job card and the poster; invasion.ts the flags panel; mines/game.ts the
// objectives — so keep it that way, and write through here rather than keeping a note of your own.
//
// It also keeps the size of the canvases the HUD draws on every frame (the minimap, the compass), as
// asking an element its size straight after the words have changed makes the browser lay out the
// whole page again there and then, in the middle of the frame.

/** Show html in an element, unless it is what the element already holds. up says whether the element
 *  should be showing at all: left out, its visibility is somebody else's to decide. */
export function show(el: HTMLElement, html: string, up?: boolean) {
  if (el.innerHTML !== html) el.innerHTML = html;
  if (up !== undefined && el.hidden !== !up) el.hidden = !up;
}

/** The same for an element whose whole content is plain text (a caption, a street sign): text, not
 *  markup, so a name with an "&" or a "<" in it can't be taken for html. Any element will do: this
 *  only needs its text, so it takes whatever one of those a caller has to hand. */
export function say(el: Element, text: string) {
  if (el.textContent !== text) el.textContent = text;
}

const sizes = new WeakMap<Element, { w: number; h: number }>();
const watcher = typeof ResizeObserver !== "undefined"
  ? new ResizeObserver((all) => { for (const e of all) { const t = e.target as HTMLElement; sizes.set(t, { w: t.clientWidth, h: t.clientHeight }); } })
  : null;

/** An element's size on the page in CSS pixels (as clientWidth and clientHeight, 0 while hidden),
 *  as of the last time it changed rather than worked out afresh. */
export function sizeOf(el: HTMLElement): { w: number; h: number } {
  let s = sizes.get(el);
  if (!s) {
    s = { w: el.clientWidth, h: el.clientHeight };
    sizes.set(el, s);
    watcher?.observe(el);
  }
  return watcher ? s : { w: el.clientWidth, h: el.clientHeight };
}
