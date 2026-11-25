// Pack a URL into a short base64url string using raw deflate. No server involved.
const b64 = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

// Leading char: h = https://, t = http://, o = anything else (kept whole)
export async function pack(url) {
  let flag = 'o', rest = url
  if (url.startsWith('https://')) { flag = 'h'; rest = url.slice(8) }
  else if (url.startsWith('http://')) { flag = 't'; rest = url.slice(7) }
  const raw = new TextEncoder().encode(rest)
  const zipped = await pipe(raw, new CompressionStream('deflate-raw'))
  const best = zipped.length < raw.length ? 'z' + b64(zipped) : 'r' + b64(raw)
  return flag + best
}

export async function unpack(code) {
  const flag = code[0], mode = code[1], body = unb64(code.slice(2))
  const bytes = mode === 'z' ? await pipe(body, new DecompressionStream('deflate-raw')) : body
  const rest = new TextDecoder().decode(bytes)
  return (flag === 'h' ? 'https://' : flag === 't' ? 'http://' : '') + rest
}

export function normalize(input) {
  let s = input.trim()
  if (!s) return { error: 'Paste a link first.' }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s
  try {
    const u = new URL(s)
    if (!/^https?:$/.test(u.protocol)) return { error: 'Only http and https links are supported.' }
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return { error: 'That does not look like a web address.' }
    return { url: u.toString() }
  } catch { return { error: 'That does not look like a valid link.' } }
}

// Safety checks shown on the preview screen before anyone is redirected.
export function inspect(url) {
  const u = new URL(url), flags = []
  const h = u.hostname
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) flags.push('Goes to a raw IP address, not a named site')
  if (h.startsWith('xn--') || h.includes('.xn--')) flags.push('Domain uses look-alike (punycode) characters')
  if (h.split('.').length > 4) flags.push('Unusually many subdomains')
  if (u.username || u.password) flags.push('Contains a username in the address, a common phishing trick')
  if (u.protocol === 'http:') flags.push('Not encrypted (http, not https)')
  if (/(login|verify|secure|account|update).*(login|verify|secure|account|update)/i.test(h)) flags.push('Domain stacks account-related words')
  return { host: h, flags, utm: [...u.searchParams.keys()].filter((k) => k.startsWith('utm_')) }
}
