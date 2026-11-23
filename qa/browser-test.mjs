#!/usr/bin/env node
/**
 * mealplan browser test: headless Edge against a local HealthLog API serving
 * this app's dist/ (same origin, like Pages). Run `npm run build` first.
 *
 *   node qa/browser-test.mjs            # HEALTHLOG_DIR defaults to ../healthlog
 *   SHOT_DIR=qa/shots node qa/browser-test.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HEALTHLOG = path.resolve(process.env.HEALTHLOG_DIR || path.join(ROOT, '..', 'healthlog'))
const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

let passCount = 0
let failCount = 0
function ok(name, condition, detail = '') {
  if (condition) {
    passCount++
    console.log(`PASS  ${name}`)
  } else {
    failCount++
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const port = 22000 + Math.floor(Math.random() * 2000)
const cdpPort = port + 1
const BASE = `http://127.0.0.1:${port}`
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mealplan-qa-'))
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mealplan-edge-'))
const env = {
  ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir, DIST_DIR: path.join(ROOT, 'dist'),
  RATE_LIMIT: 'off', AI_MOCK: '1', OPENCODE_API_KEY: '', GARMIN: 'off', ACCESS_LOG: 'off', BACKUPS: 'off', CRONOMETER_SYNC_HOUR: '99',
}
const server = spawn(process.execPath, [path.join(HEALTHLOG, 'server', 'index.js')], { env, stdio: 'ignore' })
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profileDir}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' })

async function http(method, route, token, body) {
  const res = await fetch(`${BASE}${route}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return res.json()
}

/* ---------- CDP ---------- */
let ws
let seq = 0
const waiting = new Map()
const errors = []
function send(method, params = {}) {
  const id = ++seq
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }))
}
async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}
async function until(expr, ms = 8000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    if (await evaluate(`return Boolean(${expr})`).catch(() => false)) return true
    await sleep(150)
  }
  return false
}
const type = (selector, value) => evaluate(`
  const el = document.querySelector(${JSON.stringify(selector)})
  if (!el) throw new Error('no input ' + ${JSON.stringify(selector)})
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('input', { bubbles: true })); return true`)
const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click(); return true`)
const text = (selector) => evaluate(`return document.querySelector(${JSON.stringify(selector)})?.innerText ?? ''`)
const overflow = () => evaluate('return document.documentElement.scrollWidth - window.innerWidth')
const signInAs = (token, hash) =>
  evaluate(`localStorage.setItem('healthlog:token', ${JSON.stringify(token)}); location.hash = ${JSON.stringify(hash)}; location.reload(); return true`)
async function shot(name) {
  if (!process.env.SHOT_DIR) return
  fs.mkdirSync(process.env.SHOT_DIR, { recursive: true })
  const s = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(path.join(process.env.SHOT_DIR, name), Buffer.from(s.data, 'base64'))
}

try {
  if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) throw new Error('run npm run build first')
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break } catch { /* booting */ } await sleep(150) }
  const invite = () => spawnSync(process.execPath, [path.join(HEALTHLOG, 'server', 'cli.js'), 'invite', 'create', '--note', 'qa'], { env, encoding: 'utf8' }).stdout.trim()
  const sam = await http('POST', '/api/auth/register', undefined, { email: 'sam@example.com', password: 'cook-dinner-1', inviteCode: invite(), displayName: 'Sam' })
  const chloe = await http('POST', '/api/auth/register', undefined, { email: 'chloe@example.com', password: 'eat-dinner-1', inviteCode: invite(), displayName: 'Chloe' })
  ok('setup: two HealthLog accounts', Boolean(sam.token && chloe.token))

  let target
  for (let i = 0; i < 60 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json()).find((t) => t.type === 'page') } catch { /* starting */ }
    if (!target) await sleep(200)
  }
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && waiting.has(msg.id)) { const w = waiting.get(msg.id); waiting.delete(msg.id); msg.error ? w.reject(new Error(msg.error.message)) : w.resolve(msg.result) }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text)
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '))
  })
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await send('Page.navigate', { url: `${BASE}/` })

  /* ---------- Sign in through the form ---------- */
  ok('login: the sign-in form shows', await until(`document.querySelector('#email')`))
  await shot('1-login.png')
  await type('#email', 'sam@example.com')
  await type('#password', 'cook-dinner-1')
  await click('form button[type="submit"]')
  ok('week: signed in lands on This week', await until(`/This week/.test(document.querySelector('#week-title')?.innerText ?? '')`))
  ok('week: seven days, Monday first', await evaluate(`
    const days = [...document.querySelectorAll('.day .weekday')].map((e) => e.innerText)
    return days.length === 7 && days[0] === 'Mon' && days[6] === 'Sun'`))
  ok('week: solo note offers to link a partner', /Link your partner/.test(await text('.note')))
  ok('phone: no horizontal overflow on Week', (await overflow()) <= 0, String(await overflow()))
  await shot('2-week-solo.png')

  await click('a[aria-label="Next week"]')
  ok('week: next week drops "This week"', await until(`!/This week/.test(document.querySelector('#week-title')?.innerText ?? 'This week')`))
  ok('week: the URL carries the Monday', await evaluate(`return /^#\\/week\\/\\d{4}-\\d{2}-\\d{2}$/.test(location.hash)`))

  /* ---------- Link Chloe in Settings ---------- */
  await evaluate(`location.hash = '#/settings'; return true`)
  ok('settings: partner email field', await until(`document.querySelector('#partner-email')`))
  await type('#partner-email', 'chloe@example.com')
  await click('[aria-labelledby="household-title"] button[type="submit"]')
  ok('settings: one-sided link shows Waiting', await until(`/Waiting for/.test(document.querySelector('[aria-labelledby="household-title"]')?.innerText ?? '')`))
  await http('PUT', '/api/partner', chloe.token, { email: 'sam@example.com' })
  await evaluate(`location.reload(); return true`)
  ok('settings: linked once Chloe adds Sam back', await until(`/share one meal plan/.test(document.querySelector('[aria-labelledby="household-title"]')?.innerText ?? '')`), await text('[aria-labelledby="household-title"]'))
  ok('settings: both members listed', /Sam \(you\)/.test(await text('.members')) && /Chloe/.test(await text('.members')), await text('.members'))
  await shot('3-settings-linked.png')

  /* ---------- Chloe sees the same household ---------- */
  const samHousehold = (await http('GET', '/api/planner/household', sam.token)).household
  const chloeHousehold = (await http('GET', '/api/planner/household', chloe.token)).household
  ok('household: one shared household', samHousehold?.id && samHousehold.id === chloeHousehold?.id)
  await signInAs(chloe.token, '#/week')
  ok('week: Chloe signed in via the shared token', await until(`/This week/.test(document.querySelector('#week-title')?.innerText ?? '')`))
  ok('week: no solo note once linked', !(await evaluate(`return Boolean(document.querySelector('.note'))`)))
  await shot('4-week-chloe.png')

  /* ---------- Sign out ---------- */
  await evaluate(`location.hash = '#/settings'; return true`)
  await until(`[...document.querySelectorAll('button')].some((b) => b.innerText === 'Sign out')`)
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.innerText === 'Sign out').click(); return true`)
  ok('sign out: back to the sign-in form', await until(`document.querySelector('#email')`))
  ok('sign out: token cleared', !(await evaluate(`return localStorage.getItem('healthlog:token')`)))

  ok('no console errors or exceptions', errors.length === 0, errors.join(' | '))
} catch (err) {
  failCount++
  console.log(`FAIL  run crashed — ${err.stack || err}`)
} finally {
  try { ws?.close() } catch { /* ignore */ }
  edge.kill()
  server.kill()
  await sleep(500)
  fs.rmSync(dataDir, { recursive: true, force: true })
  try { fs.rmSync(profileDir, { recursive: true, force: true }) } catch { /* Edge may still hold it */ }
}
console.log(`\n${passCount} passed, ${failCount} failed`)
process.exit(failCount ? 1 : 0)
