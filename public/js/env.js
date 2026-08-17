// Which deployment the browser is currently running against.
//
// Both Workers serve byte-identical files out of public/ — there is no build
// step to bake a flag into, and asking the server would break the rule that
// the game plays fine offline. So this is decided from the hostname, and
// deliberately as a whitelist: production is exactly one host, and everything
// else (the staging Worker, `npm run dev` on localhost, a version preview
// URL, index.html opened straight off disk) counts as non-production and gets
// the TEST badge. The failure mode of a mistyped hostname is then a badge on
// production, which is loud and harmless, rather than no badge on staging,
// which is silent and the whole thing this is meant to prevent.

export const PRODUCTION_HOSTNAME = 'word-corners.muenks-kevin.workers.dev';

export function isProduction() {
  return location.hostname === PRODUCTION_HOSTNAME;
}
