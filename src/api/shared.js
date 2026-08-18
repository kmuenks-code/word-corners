// Shared helpers for the /api routes.

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

// Only Endless games are ranked. An Objective game ends the moment its
// goals are met, so its score measures when it stopped rather than how well
// it went — putting those on the same leaderboard would mean a player is
// rewarded for picking a tier they can't finish. Objective games are still
// recorded in full; they're just not scored against these.
const RANKED_MODE = 'endless';

// The all-time high score and this player's own best. Either is null when
// no game has been recorded yet. Both /api/scores and the response to
// POST /api/games return exactly this shape.
export async function readBests(env, playerId) {
  const [globalRow, personalRow] = await env.DB.batch([
    env.DB.prepare('SELECT MAX(score) AS best FROM games WHERE mode_id = ?').bind(RANKED_MODE),
    env.DB.prepare('SELECT MAX(score) AS best FROM games WHERE mode_id = ? AND player_id = ?').bind(
      RANKED_MODE,
      playerId
    ),
  ]);

  return {
    globalBest: globalRow.results[0]?.best ?? null,
    personalBest: personalRow.results[0]?.best ?? null,
  };
}
