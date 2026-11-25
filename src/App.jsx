import { useEffect, useMemo, useState } from 'preact/hooks'
import qrcode from 'qrcode-generator'
import { pack, unpack, normalize, inspect } from './codec.js'

const KEY = 'linkly:v1'
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] } }
const baseUrl = () => location.origin + location.pathname
const DAY = 86400000
const SAMPLE = 'https://www.example-store.com/collections/summer-sale/products/linen-shirt-sand?utm_source=instagram&utm_medium=social&utm_campaign=summer-sale-2026&utm_content=story-swipe-up&utm_term=linen-shirt&ref=instagram-story&variant=48213377001&discount=SUMMER2026&currency=EGP&lang=en&filters=color:sand,color:beige,color:white,size:m,size:l,size:xl,material:linen,material:cotton&sort=best-selling&collection=summer-sale&return_to=/collections/summer-sale/products/linen-shirt-sand?variant=48213377001'

function useHashCode() {
  const [code, setCode] = useState(() => location.hash.replace(/^#\/?/, ''))
  useEffect(() => {
    const f = () => setCode(location.hash.replace(/^#\/?/, ''))
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return code
}

function Qr({ text }) {
  const svg = useMemo(() => {
    try { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) }
    catch { return '' }
  }, [text])
  if (!svg) return <p className="text-sm">Too long for a QR code.</p>
  return <div className="w-40 h-40 bg-white brut-sm p-1" aria-label="QR code" dangerouslySetInnerHTML={{ __html: svg }} />
}

function Bars({ clicks }) {
  const today = Math.floor(Date.now() / DAY)
  const days = Array.from({ length: 14 }, (_, i) => clicks.filter((t) => Math.floor(t / DAY) === today - 13 + i).length)
  const max = Math.max(1, ...days)
  return (
    <div className="flex items-end gap-[3px] h-10" title="Clicks per day, last 14 days">
      {days.map((n, i) => <div key={i} className="w-2.5 border-2 border-ink" style={{ height: `${Math.max(8, (n / max) * 100)}%`, background: n ? '#c8ff2e' : '#fff' }} />)}
    </div>
  )
}

function Preview({ code }) {
  const [state, setState] = useState({ status: 'loading' })
  useEffect(() => {
    unpack(code).then((url) => {
      const u = new URL(url)
      if (!/^https?:$/.test(u.protocol)) throw new Error('bad')
      setState({ status: 'ok', url, info: inspect(url) })
    }).catch(() => setState({ status: 'bad' }))
  }, [code])
  const go = () => {
    const links = load(), l = links.find((x) => x.code === code)
    if (l) { l.clicks.push(Date.now()); localStorage.setItem(KEY, JSON.stringify(links)) }
    location.href = state.url
  }
  return (
    <main className="min-h-screen grid place-items-center p-5 bg-lime">
      <div className="brut max-w-xl w-full p-6 md:p-8">
        <p className="mono text-xs font-bold tracking-widest">LINKLY PREVIEW</p>
        {state.status === 'loading' && <p className="mt-4 text-xl font-bold">Unpacking link...</p>}
        {state.status === 'bad' && (<><h1 className="mt-3 text-3xl font-bold">This link is broken.</h1><p className="mt-2">The code could not be unpacked. It may have been cut off when copied.</p></>)}
        {state.status === 'ok' && (<>
          <h1 className="mt-3 text-3xl md:text-4xl font-bold leading-tight">You are about to visit <span className="bg-pink px-1 break-all">{state.info.host}</span></h1>
          <p className="mono text-xs mt-4 break-all p-3 bg-paper border-2 border-ink">{state.url}</p>
          {state.info.flags.length > 0 ? (
            <ul className="mt-4 space-y-2" aria-label="Safety warnings">{state.info.flags.map((f) => <li key={f} className="brut-sm bg-pink/30 p-2 text-sm font-bold">! {f}</li>)}</ul>
          ) : <p className="mt-4 brut-sm bg-lime p-2 text-sm font-bold">No warning signs found in this address.</p>}
          {state.info.utm.length > 0 && <p className="mt-3 text-sm">Carries tracking tags: <span className="mono">{state.info.utm.join(', ')}</span></p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={go} className="brut-sm press bg-ink text-white px-5 py-3 font-bold">Continue</button>
            <a href={baseUrl()} className="brut-sm press bg-white px-5 py-3 font-bold">Make my own link</a>
          </div>
        </>)}
      </div>
    </main>
  )
}

export default function App() {
  const code = useHashCode()
  const [links, setLinks] = useState(load)
  const [input, setInput] = useState('')
  const [utm, setUtm] = useState(false)
  const [tags, setTags] = useState({ source: '', medium: '', campaign: '' })
  const [err, setErr] = useState('')
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState('')
  useEffect(() => localStorage.setItem(KEY, JSON.stringify(links)), [links])
  useEffect(() => { const f = () => setLinks(load()); window.addEventListener('focus', f); return () => window.removeEventListener('focus', f) }, [])

  if (code && code.length > 2) return <Preview code={code} />

  const shorten = async (e) => {
    e?.preventDefault()
    const n = normalize(input)
    if (n.error) { setErr(n.error); setResult(null); return }
    let url = n.url
    if (utm) {
      const u = new URL(url)
      for (const [k, v] of Object.entries(tags)) if (v.trim()) u.searchParams.set('utm_' + k, v.trim())
      url = u.toString()
    }
    setErr('')
    const c = await pack(url)
    const short = baseUrl() + '#/' + c
    const entry = { id: Date.now(), code: c, url, created: Date.now(), clicks: [] }
    setResult({ short, url, saved: url.length - short.length })
    setLinks((l) => [entry, ...l.filter((x) => x.code !== c)])
  }
  const copy = (text, id) => { navigator.clipboard?.writeText(text).catch(() => {}); setCopied(id); setTimeout(() => setCopied(''), 1400) }

  return (
    <div className="min-h-screen">
      <header className="border-b-[3px] border-ink bg-white">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="grid place-items-center h-9 w-9 bg-lime brut-sm font-bold text-xl">L</span><span className="text-2xl font-bold tracking-tight">Linkly</span></div>
          <p className="mono text-xs hidden sm:block">no server. no database. no signup.</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-10">
        <section className="grid lg:grid-cols-[1.1fr_1fr] gap-8 items-start">
          <div>
            <h1 className="text-5xl md:text-7xl font-bold leading-[0.92] tracking-tight">The link <span className="bg-lime px-2">is</span> the database.</h1>
            <p className="mt-5 text-lg max-w-md">Linkly packs your destination, compressed, into the link itself. Nothing is stored on a server, so links work for anyone, on any device, forever.</p>
          </div>
          <form onSubmit={shorten} className="brut p-5 bg-white">
            <label htmlFor="url" className="mono text-xs font-bold tracking-widest">PASTE A LONG LINK</label>
            <input id="url" value={input} onInput={(e) => setInput(e.target.value)} placeholder="https://example.com/very/long/path?with=params" className="mono mt-2 w-full border-[3px] border-ink px-3 py-3 text-sm bg-paper outline-none focus:bg-lime/40" />
            <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-sm font-bold cursor-pointer"><input type="checkbox" checked={utm} onChange={(e) => setUtm(e.target.checked)} className="h-4 w-4 accent-black" /> Add campaign tags (UTM)</label>
              <button type="button" onClick={() => { setInput(SAMPLE); setErr('') }} className="text-sm font-bold underline decoration-2">Try a sample</button>
            </div>
            {utm && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {['source', 'medium', 'campaign'].map((k) => <input key={k} aria-label={'utm ' + k} placeholder={k} value={tags[k]} onInput={(e) => setTags({ ...tags, [k]: e.target.value })} className="mono min-w-0 border-2 border-ink px-2 py-2 text-xs bg-paper" />)}
              </div>
            )}
            {err && <p role="alert" className="mt-3 brut-sm bg-pink/40 p-2 text-sm font-bold">{err}</p>}
            <button className="brut-sm press mt-4 w-full bg-ink text-white py-3 text-lg font-bold">Pack it</button>
          </form>
        </section>

        {result && (
          <section className="brut mt-8 p-5 md:p-6 bg-sky/30 grid md:grid-cols-[1fr_auto] gap-6" aria-live="polite">
            <div className="min-w-0">
              <p className="mono text-xs font-bold tracking-widest">YOUR LINK</p>
              <p className="mono mt-2 break-all text-sm md:text-base font-bold bg-white border-[3px] border-ink p-3" data-testid="short">{result.short}</p>
              <div className="mt-3 flex flex-wrap gap-3 items-center">
                <button onClick={() => copy(result.short, 'result')} className="brut-sm press bg-lime px-4 py-2 font-bold">{copied === 'result' ? 'Copied!' : 'Copy'}</button>
                <a href={result.short} target="_blank" rel="noopener" className="brut-sm press bg-white px-4 py-2 font-bold">Open preview</a>
                <span className="mono text-xs">{result.saved > 0 ? `${result.saved} characters shorter than the original address` : `Short originals pack to something longer, so this one is ${-result.saved} characters longer`}</span>
              </div>
              <p className="mt-3 text-sm max-w-md">Tip: long addresses with many tracking tags compress best. The preview page checks the destination for warning signs before redirecting.</p>
            </div>
            <Qr text={result.short} />
          </section>
        )}

        <section className="mt-12">
          <h2 className="text-3xl font-bold">Your links <span className="mono text-sm font-normal">({links.length}, saved in this browser)</span></h2>
          {links.length === 0 ? <p className="mt-4 brut-sm bg-white p-4">Nothing here yet. Pack a link above.</p> : (
            <ul className="mt-4 space-y-4">
              {links.map((l) => {
                const short = baseUrl() + '#/' + l.code
                return (
                  <li key={l.id} className="brut-sm bg-white p-4 grid sm:grid-cols-[1fr_auto] gap-4 items-center">
                    <div className="min-w-0">
                      <p className="mono text-xs font-bold break-all">{short.replace(/^https?:\/\//, '')}</p>
                      <p className="mono text-xs text-black/60 break-all mt-1">{l.url}</p>
                      <div className="mt-2 flex gap-2 flex-wrap">
                        <button onClick={() => copy(short, l.id)} className="brut-sm press bg-lime px-3 py-1 text-sm font-bold">{copied === l.id ? 'Copied!' : 'Copy'}</button>
                        <a href={short} target="_blank" rel="noopener" className="brut-sm press bg-white px-3 py-1 text-sm font-bold">Open</a>
                        <button onClick={() => setLinks((x) => x.filter((y) => y.id !== l.id))} className="brut-sm press bg-white px-3 py-1 text-sm font-bold" aria-label="Delete link">Delete</button>
                      </div>
                    </div>
                    <div className="flex items-end gap-4">
                      <Bars clicks={l.clicks} />
                      <div className="text-right"><p className="text-4xl font-bold leading-none" data-testid="clicks">{l.clicks.length}</p><p className="mono text-[10px]">CLICKS</p></div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="mono text-xs mt-4 max-w-2xl">Click counts are local: they only count visits made in this browser, because there is no server to collect them. That is the trade-off for a link that can never break.</p>
        </section>
      </main>
      <footer className="border-t-[3px] border-ink bg-ink text-paper"><p className="max-w-5xl mx-auto px-5 py-4 mono text-xs">Linkly - a demo by Malak Mohamed. Built with React, Tailwind and the browser's CompressionStream.</p></footer>
    </div>
  )
}
