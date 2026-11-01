/**
 * Google profile photos come with a size in the URL (`=s96-c`): ask for one
 * big enough to stay sharp on a desktop retina screen. Other URLs pass through.
 */
export function hiResGoogle(url: string, px = 1200): string {
  return /googleusercontent\.com/.test(url) ? url.replace(/=s\d+(-c)?$/, `=s${px}-c`) : url
}
