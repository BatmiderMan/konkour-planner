/**
 * One shared lock for «the page behind does not scroll» (modals, the full-screen test room ...).
 * Every lock counts; the page scrolls again only when the LAST one is released, and it always goes back to
 * what it was before the first lock. (Locks that each remembered "the previous value" used to restore each other's
 * «hidden» and leave the whole page unscrollable.)
 */
let count = 0;
let saved = '';

export function lockScroll(): () => void {
  if (count === 0) {
    const cur = document.body.style.overflow;
    saved = cur === 'hidden' ? '' : cur; // a leftover «hidden» is never a state worth restoring
    document.body.style.overflow = 'hidden';
  }
  count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    count = Math.max(0, count - 1);
    if (count === 0) document.body.style.overflow = saved;
  };
}
