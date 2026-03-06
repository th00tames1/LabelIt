/**
 * Convert a Windows file path to a localfile:// URL for use in the renderer.
 *
 * Why not file://?
 *   On school/enterprise computers (e.g. Oregon State University), Documents
 *   is a mapped network drive (\\server\share\...). Electron's Chromium blocks
 *   file:// URLs with a hostname, so thumbnails/images on network drives fail.
 *
 * URL format: localfile://host?path=C%3A%5CUsers%5Cfoo%5Cimg.jpg
 *
 * Why "host" dummy hostname?
 *   Custom schemes registered with standard:true require a non-empty host in
 *   Chromium's URL parser (like http://). An empty host (localfile://?path=...)
 *   is treated as an invalid URL and the request never reaches protocol.handle().
 *   Using a static dummy host "host" keeps the URL valid without ambiguity.
 *
 * Why query-param for the path?
 *   Drive letters like C: confuse Chromium into treating them as hostname:port.
 *   e.g. localfile:///C:/Users → Chromium parses host="c", path="/Users".
 *   A query param is always safe: ?path=C%3A%5CUsers%5C...
 *
 * The localfile:// scheme is registered in electron/main/index.ts using
 * protocol.handle() with corsEnabled:true so the canvas can call toDataURL().
 */
export function toLocalFileUrl(filePath: string): string {
  if (!filePath) return ''
  // Use dummy host "host" so standard-scheme URL parser accepts the URL
  return `localfile://host?path=${encodeURIComponent(filePath)}`
}
