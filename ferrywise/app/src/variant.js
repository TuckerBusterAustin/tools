'use strict';
// Headline variant assignment, stable per visitor via storage.

(function () {
const KEY = 'ferrywise:variant';

// Returns 'A' or 'B'; persists the first assignment. rng returns [0,1).
function assignVariant(storage, rng) {
  const existing = storage.getItem(KEY);
  if (existing === 'A' || existing === 'B') return existing;
  const r = typeof rng === 'function' ? rng() : Math.random();
  const v = r < 0.5 ? 'A' : 'B';
  storage.setItem(KEY, v);
  return v;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { assignVariant, KEY };
else window.FerrywiseVariant = { assignVariant, KEY }; // plain <script> use in the browser
})();
