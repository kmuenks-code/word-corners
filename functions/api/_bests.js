// Shared helpers for the /api routes. The leading underscore keeps Pages
// from routing this file as an endpoint of its own.

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Bests change on every game; never let a CDN or browser serve a stale one.
      'Cache-Control': 'no-store',
    },
  });
}

// The all-time high score and this player's own best. Either is null when
// no game has been recorded yet. Both /api/scores and the response to
// POST /api/games return exactly this shape.
export async function readBests(env, playerId) {
  const [globalRow, personalRow] = await env.DB.batch([
    env.DB.prepare('SELECT MAX(score) AS best FROM games'),
    env.DB.prepare('SELECT MAX(score) AS best FROM games WHERE player_id = ?').bind(playerId),
  ]);

  return {
    globalBest: globalRow.results[0]?.best ?? null,
    personalBest: personalRow.results[0]?.best ?? null,
  };
}
