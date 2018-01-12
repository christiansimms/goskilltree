// Low-level javascript helper functions.
import Dexie from "dexie";

export function firstArrayContainedInSecond(a, b) {
  return a.every(el => b.includes(el));
}

// Use deepClone from Dexie.js
// NOTE: this is really good, and kind of works on ASTs, BUT the copied ASTs are not recast-pretty-printable.
// Since parsing is so fast, just make ASTs by parsing the original string again.
export function deepCopy(obj): any {
  return Dexie.deepClone(obj);
}

const _hasOwn = {}.hasOwnProperty;

export function hasOwn(obj, prop) {
  return _hasOwn.call(obj, prop);
}
