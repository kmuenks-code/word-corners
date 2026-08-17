// Loads the word list (data/wordlist.txt, ENABLE1 — see data/WORDLIST_LICENSE.txt)
// and checks words against it. Only this module touches the raw list.

const WORDLIST_URL = 'data/wordlist.txt';

let wordSet = null;

export async function loadWordList() {
  if (wordSet) return;
  const res = await fetch(WORDLIST_URL);
  const text = await res.text();
  wordSet = new Set(text.split('\n').filter(Boolean));
}

export function isValidWord(word) {
  if (!wordSet) {
    throw new Error('Word list not loaded yet — call loadWordList() first.');
  }
  return typeof word === 'string' && wordSet.has(word.toUpperCase());
}

// True if any dictionary word starts with `prefix`, i.e. the prefix could
// still grow into a legal word.
export function hasWordWithPrefix(prefix) {
  if (!wordSet) {
    throw new Error('Word list not loaded yet — call loadWordList() first.');
  }
  const upper = prefix.toUpperCase();
  for (const word of wordSet) {
    if (word.startsWith(upper)) return true;
  }
  return false;
}
