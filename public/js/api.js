// The only module that talks to the server. No game logic, no DOM.
// Backed by Cloudflare Pages Functions in /functions/api (see wrangler.toml).
//
// Every call here is best-effort: the game must stay fully playable with no
// network, an unreachable API, or a cold database. Failures resolve to null
// rather than throwing, and callers render whatever they got.

import { GAME_VERSION } from './version.js';

const PLAYER_ID_KEY = 'wordcorners:playerId';
const REQUEST_TIMEOUT_MS = 6000;

// Anonymous, per-browser id. Not an account — it exists so "your best score"
// can mean something without a login. Clearing site data starts a new player.
export function getPlayerId() {
  let id = null;
  try {
    id = localStorage.getItem(PLAYER_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(PLAYER_ID_KEY, id);
    }
  } catch {
    // Private mode / storage disabled: fall back to a per-session id so the
    // request still validates. Personal best just won't persist.
    id = id || crypto.randomUUID();
  }
  return id;
}

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Posts one completed game. `stats` is state.stats from gameState.js.
// Returns the refreshed { globalBest, personalBest } the server computed
// after storing this game, or null if the post didn't land.
export function submitGame({ score, stats }) {
  return request('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playerId: getPlayerId(),
      gameVersion: GAME_VERSION,
      score,
      durationMs: Date.now() - stats.startedAt,
      wordsTotal: stats.wordsTotal,
      words3: stats.words3,
      words4: stats.words4,
      words5: stats.words5,
      words6Plus: stats.words6Plus,
      blanksEarned: stats.blanksEarned,
    }),
  });
}

// Returns { globalBest, personalBest } — either may be null if no game has
// been recorded yet — or null if the request failed.
export function fetchHighScores() {
  const params = new URLSearchParams({ playerId: getPlayerId() });
  return request(`/api/scores?${params}`);
}
