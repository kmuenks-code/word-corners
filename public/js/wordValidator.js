// Loads the word list (data/wordlist.txt, ENABLE1 — see data/WORDLIST_LICENSE.txt)
// and checks words against it. Only this module touches the raw list.
//
// The list is held as one sorted array rather than a Set, because the hot
// question isn't "is this a word" (once per submission) but "could this
// prefix still become one" (after every single letter placed). Scanning a
// Set for a prefix walks the whole 172k-word list when the answer is no —
// milliseconds, on the most frequent interaction in the game. Sorted, both
// questions are a binary search.
//
// The file already happens to be sorted, but we sort at load anyway: it's
// one pass inside a load that's already awaited, and it removes a silent
// dependency on how wordlist.txt is written.

const WORDLIST_URL = 'data/wordlist.txt';

let words = null;

export async function loadWordList() {
  if (words) return;
  const res = await fetch(WORDLIST_URL);
  const text = await res.text();
  // Plain sort() is UTF-16 code-unit order, which is the same order the
  // `<` comparisons in lowerBound use — the two have to agree for the
  // search to be correct.
  words = text.split('\n').filter(Boolean).sort();
}

function assertLoaded() {
  if (!words) {
    throw new Error('Word list not loaded yet — call loadWordList() first.');
  }
}

// Index of the first word that is not less than `key` (words.length if
// there is none).
function lowerBound(key) {
  let lo = 0;
  let hi = words.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid] < key) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function isValidWord(word) {
  assertLoaded();
  if (typeof word !== 'string') return false;
  const upper = word.toUpperCase();
  return words[lowerBound(upper)] === upper;
}

// True if any dictionary word starts with `prefix`, i.e. the prefix could
// still grow into a legal word. The first word at or after `prefix` in
// sorted order is the only candidate: anything later shares less of it.
export function hasWordWithPrefix(prefix) {
  assertLoaded();
  const upper = prefix.toUpperCase();
  const i = lowerBound(upper);
  return i < words.length && words[i].startsWith(upper);
}
