// Worker entry point. Serves the game from public/ via the static-assets
// binding and handles the /api routes itself.
//
// Assets are matched *before* this Worker runs (see [assets] in
// wrangler.toml), so a request only reaches here when no file in public/
// matches the path — which is exactly the /api/* routes, plus genuine 404s.

import { handleGamesPost } from './api/games.js';
import { handleScoresGet } from './api/scores.js';
import { json } from './api/shared.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      // Not an API route and not a file that exists — let the assets
      // binding produce its own 404 rather than inventing one here.
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === '/api/games' && request.method === 'POST') {
      return handleGamesPost(request, env);
    }
    if (url.pathname === '/api/scores' && request.method === 'GET') {
      return handleScoresGet(request, env);
    }

    return json({ error: 'Not found' }, 404);
  },
};
