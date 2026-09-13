/**
 * Browser-side media URL builder — mirrors the base64url scheme used by the
 * main process protocol handler (media://local/<base64url-of-abs-path>).
 */
export function mediaUrlFor(filePath: string): string {
  const bytes = new TextEncoder().encode(filePath)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return 'media://local/' + b64
}
