// GET /api/scores?playerId=... — the all-time best and this player's best.
// Read at startup so the game-over overlay has something to show even on a
// first game, and refreshed from the POST /api/games response after that.

import { readBests, json } from './_bests.js';

export async function onRequestGet({ request, env }) {
  const playerId = new URL(request.url).searchParams.get('playerId')?.slice(0, 64) ?? '';
  if (!playerId) return json({ error: 'playerId is required' }, 400);

  return json(await readBests(env, playerId));
}
