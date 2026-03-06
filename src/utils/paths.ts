/**
 * Convert a Windows file path to a localfile:// URL for use in the renderer.
 *
 * Why not file://?
 *   On school/enterprise computers (e.g. Oregon State University), Documents
 *   is a mapped network drive (\\server\share\...). Electron's Chromium blocks
 *   file:// URLs with a hostname, so thumbnails/images on network drives fail.
 *
 * Why query-param style (localfile://?path=...)?
 *   Drive letters like C: cause Chromium to misparse the host portion of the URL.
 *   e.g. localfile:///C:/Users/... → Chromium reads "c" as the host, not C: as a path.
 *   Passing the path as a URL-encoded query parameter avoids all host/path ambiguity:
 *   localfile://?path=C%3A%5CUsers%5Cfoo%5Cimg.jpg
 *
 * The localfile:// scheme is registered in electron/main/index.ts using
 * protocol.handle(), which reads the file and returns it as a Response.
 */
export function toLocalFileUrl(filePath: string): string {
  if (!filePath) return ''
  // encodeURIComponent handles both local paths (C:\...) and UNC paths (\\server\...)
  return `localfile://?path=${encodeURIComponent(filePath)}`
}
