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
const edge = spawn(EDGE, [...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), '--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profileDir}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' })

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
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)})
  el.dispatchEvent(new Event('input', { bubbles: true })); return true`)
const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click(); return true`)
const press = async (key) => { await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code: key, windowsVirtualKeyCode: 13 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: 13 }) }
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

  /* ---------- Meals: import, quick-fire rating, detail ---------- */
  const draft = {
    dishes: [
      { name: 'Fried rice', options: { Protein: ['Prawn', 'Tofu'] }, aliases: [], suggestedTags: ['rice', 'quick'] },
      { name: 'Dirty cabbage', options: { Style: ['Cajun', 'Korean', 'Chinese'], Protein: ['Kangaroo', 'Beef'] }, aliases: [], suggestedTags: [] },
      { name: 'Risotto', options: { Style: ['Blue cheese', 'Chorizo', 'Pumpkin', 'Mushroom', 'Lemon herb', 'Miso', 'Tomato zucchini', 'Fennel', 'Caramelised onion and fennel', 'Tomato', 'Asparagus pea'] }, aliases: [], suggestedTags: ['Italian'] },
      { name: 'Dahl', options: {}, aliases: ['Dhal'], suggestedTags: ['curry', 'vegetarian'] },
      { name: 'Pulled pork sandwiches', family: 'Pulled pork', options: {}, aliases: [], suggestedTags: [] },
      { name: 'Pulled pork soup', family: 'Pulled pork', options: {}, aliases: [], suggestedTags: [] },
    ],
    weeks: [{ source: 'qa', week: 1, entries: [
      { day: 'Mon', raw: 'Fried rice', dish: 'Fried rice' }, { day: 'Tue', raw: 'Fried rice prawn', dish: 'Fried rice', options: { Protein: 'Prawn' } },
      { day: 'Wed', raw: 'Fried rice', dish: 'Fried rice' }, { day: 'Thu', raw: 'Dirty cabbage', dish: 'Dirty cabbage' },
      { day: 'Fri', raw: 'Cajun cabbage', dish: 'Dirty cabbage', options: { Style: 'Cajun' } }, { day: 'Sat', raw: 'Risotto', dish: 'Risotto' },
    ] }],
  }
  const imp = spawnSync(process.execPath, [path.join(HEALTHLOG, 'server', 'cli.js'), 'planner', 'import', '--email', 'sam@example.com', '-'], { env, encoding: 'utf8', input: JSON.stringify(draft) })
  ok('meals: draft imported', imp.status === 0, imp.stdout + imp.stderr)

  // A short phone screen (browser bars showing): every rating screen must still fit.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 700, deviceScaleFactor: 2, mobile: true })
  const fits = () => evaluate('return document.documentElement.scrollHeight - window.innerHeight')
  const rateRow = async (label) => {
    await click(`button[aria-label="${label}: make again"]`)
    await click(`button[aria-label="${label}: 4 stars"]`)
  }

  await signInAs(sam.token, '#/meals')
  ok('meals: list shows imported meals, most made first', await until(`document.querySelectorAll('.list .name').length === 6`) && (await evaluate(`return document.querySelector('.list .name').innerText`)) === 'Fried rice')
  ok('meals: progress starts at 0/6', /0\/6/.test(await text('.progress-row')))
  ok('meals: a section heading groups its meals', (await evaluate(`return [...document.querySelectorAll('.list .section h2')].map((e) => e.innerText).join('|')`)) === 'Pulled pork' && (await evaluate(`return document.querySelectorAll('.list .in-family').length`)) === 2)
  ok('meals: variation count in the list', /0 of 6 variations/.test(await text('.list')), await text('.list'))
  await shot('5-meals.png')
  await evaluate(`document.querySelector('a.start').click(); return true`)
  ok('rate: first card is the most made meal', await until(`(document.querySelector('#meal-name')?.innerText ?? '').startsWith('Fried rice')`))
  ok('rate: one row per variation', (await evaluate(`return [...document.querySelectorAll('.rows .label')].map((e) => e.title).join('|')`)) === 'Prawn|Tofu')
  await rateRow('Fried rice, Prawn')
  ok('rate: half done stays put', /^Fried rice/.test(await text('#meal-name')) && /1\/2/.test(await text('#meal-name .count')))
  await rateRow('Fried rice, Tofu')
  await sleep(800)
  ok('rate: ratings alone wait for effort', /^Fried rice/.test(await text('#meal-name')))
  await evaluate(`[...document.querySelectorAll('.effort button')].find((b) => b.innerText === 'Low').click(); return true`)
  ok('rate: effort + every variation advances', await until(`(document.querySelector('#meal-name')?.innerText ?? '').startsWith('Dirty cabbage')`, 4000))
  ok('rate: progress 1/6', /1\/6/.test(await text('.progress-row')))
  ok('rate: shows who we rate as', /as Both/.test(await text('.progress-row')))
  ok('rate: no persona row on the game screen', !(await evaluate(`return Boolean(document.querySelector('[aria-label="Rating as"]'))`)))
  const combos = await evaluate(`return [...document.querySelectorAll('.rows .label')].map((e) => e.title)`)
  ok('rate: two axes give every combination, style first', combos.length === 6 && combos[0] === 'Cajun · Kangaroo' && combos.includes('Chinese · Beef'), combos.join('|'))
  ok('rate: six combinations fit without scrolling', (await fits()) <= 0, String(await fits()))
  await shot('6-rate-combos.png')
  await evaluate(`[...document.querySelectorAll('.effort button')].find((b) => b.innerText === 'Medium').click(); return true`)
  for (const c of combos) await rateRow(`Dirty cabbage, ${c}`)
  ok('rate: streak after two meals in a row', await until(`/🔥2/.test(document.querySelector('.progress-row')?.innerText ?? '')`))
  ok('rate: then the 11-style risotto', await until(`(document.querySelector('#meal-name')?.innerText ?? '').startsWith('Risotto')`, 4000))
  ok('rate: 11 rows fit without scrolling', (await fits()) <= 0, String(await fits()))
  ok('phone: no horizontal overflow on Rate', (await overflow()) <= 0, String(await overflow()))
  await shot('6b-rate-risotto.png')
  const footer = () => text('.meal footer .btn-primary')
  ok('rate: nothing answered offers Skip', /Skip/.test(await footer()))
  await rateRow('Risotto, Blue cheese')
  ok('rate: part rated says Next, not Skip', await until(`/Next/.test(document.querySelector('.meal footer .btn-primary')?.innerText ?? '')`))
  const rowOption = (label, row, opt) => evaluate(`
    document.querySelector('button[aria-label="More for ${row}: want to make, never had"]').click()
    await new Promise((r) => setTimeout(r, 50))
    ;[...document.querySelectorAll('.rows .opt')].find((b) => b.innerText.includes(${JSON.stringify(opt)})).click(); return true`)
  await rowOption('Risotto', 'Chorizo', 'Want to make')
  ok('want: the row says Want to make', await until(`[...document.querySelectorAll('.want-pill')].some((b) => /Chorizo/.test(b.getAttribute('aria-label')))`))
  ok('want: counts as answered', /2\/11/.test(await text('#meal-name .count')), await text('#meal-name .count'))
  await rowOption('Risotto', 'Pumpkin', 'Never had')
  ok('never had: the row leaves the list', await until(`document.querySelectorAll('.rows .label').length === 10`))
  ok('never had: count drops to 2/10', /2\/10/.test(await text('#meal-name .count')), await text('#meal-name .count'))
  ok('never had: offered back', /1 never had/.test(await text('.hidden-list')))
  ok('rate: still fits with the extra row', (await fits()) <= 0, String(await fits()))
  ok('phone: no horizontal overflow with the row menu', (await overflow()) <= 0, String(await overflow()))
  await shot('6c-rate-want-never.png')
  await evaluate(`[...document.querySelectorAll('button')].find((b) => b.innerText.startsWith('Next')).click(); return true`)
  ok('rate: a single meal gets the big control', await until(`(document.querySelector('#meal-name')?.innerText ?? '').startsWith('Dahl') && document.querySelector('.single')`, 4000))
  // One tap: 3+ stars fills in thumbs up.
  await click('button[aria-label="Dahl: 3 stars"]')
  ok('rate: 3 stars pre-fills thumbs up', await until(`document.querySelector('button[aria-label="Dahl: make again"]')?.getAttribute('aria-pressed') === 'true'`))
  await click('button[aria-label="Dahl: 2 stars"]')
  ok('rate: dropping to 2 stars flips it to thumbs down', await until(`document.querySelector('button[aria-label="Dahl: don\\'t make again"]')?.getAttribute('aria-pressed') === 'true'`))
  await click('button[aria-label="Dahl: make again"]')
  await click('button[aria-label="Dahl: 1 star"]')
  ok('rate: a chosen thumbs that disagrees is kept', await until(`document.querySelector('button[aria-label="Dahl: make again"]')?.getAttribute('aria-pressed') === 'true'`))
  await click('button[aria-label="Dahl: 3 stars"]')
  await evaluate(`[...document.querySelectorAll('.effort button')].find((b) => b.innerText === 'Low').click(); return true`)
  ok('rate: the section comes next, together', await until(`(document.querySelector('#meal-name')?.innerText ?? '').startsWith('Pulled pork sandwiches')`, 4000))
  ok('rate: moving on part rated keeps the streak', /🔥3/.test(await text('.progress-row')), await text('.progress-row'))
  await shot('6d-rate-single.png')
  await evaluate(`[...document.querySelectorAll('.single-actions button')].find((b) => /Never had/.test(b.innerText)).click(); return true`)
  ok('remove meal: gone, on to the next', await until(`(document.querySelector('#meal-name')?.innerText ?? '').startsWith('Pulled pork soup')`, 4000))
  // The next meal shows as soon as the list drops it; the undo bar follows once the save returns.
  ok('remove meal: undo offered', await until(`/Removed Pulled pork sandwiches/.test(document.querySelector('.toast')?.innerText ?? '')`), await text('.toast'))
  await click('.toast button')
  ok('remove meal: undo brings it back', await until(`(document.querySelector('#meal-name')?.innerText ?? '').startsWith('Pulled pork sandwiches')`, 4000))
  await evaluate(`[...document.querySelectorAll('.single-actions button')].find((b) => /want to make/.test(b.innerText)).click(); return true`)
  ok('want: a whole meal we have not had moves on with no effort', await until(`(document.querySelector('#meal-name')?.innerText ?? '').startsWith('Pulled pork soup')`, 4000))
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })

  const saved = (await http('GET', '/api/planner/meals', sam.token)).meals
  const fried = saved.find((m) => m.name === 'Fried rice')
  const cab = saved.find((m) => m.name === 'Dirty cabbage')
  ok('rate: each variation saved as Both', fried.ratings.filter((r) => r.ratedAs === 'both' && r.optionId && !r.optionId.includes('+')).length === 2)
  ok('rate: every combination saved', cab.ratings.filter((r) => r.ratedAs === 'both' && r.optionId?.includes('+')).length === 6)
  const ris = saved.find((m) => m.name === 'Risotto')
  ok('saved: want to make', ris.ratings.some((r) => r.want && ris.options.find((o) => o.id === r.optionId)?.name === 'Chorizo'))
  ok('saved: never had hidden for the household', ris.hidden.length === 1 && ris.options.find((o) => o.id === ris.hidden[0])?.name === 'Pumpkin')
  ok('saved: the removed meal is back', saved.some((m) => m.name === 'Pulled pork sandwiches' && m.ratings.some((r) => r.want)))

  // Detail: rate an option as Chloe, accept a tag, send a note
  await evaluate(`location.hash = '#/meals/${fried.id}'; return true`)
  ok('detail: shows the meal', await until(`document.querySelector('.head h1')?.innerText === 'Fried rice'`))
  await evaluate(`[...document.querySelectorAll('[role=radio]')].find((b) => b.innerText === 'Chloe').click(); return true`)
  await click('button[aria-label="Fried rice, Prawn: make again"]')
  await click('button[aria-label="Add tag quick"]')
  ok('detail: accepted tag turns solid', await until(`[...document.querySelectorAll('.chip.on')].some((c) => c.innerText.includes('quick'))`))
  await type('#note', 'Tofu and prawn should be separate meals')
  await click('.note-form button[type="submit"]')
  ok('detail: note shows as waiting for Claude', await until(`/Waiting for Claude/.test(document.querySelector('.note')?.innerText ?? '')`))
  ok('phone: no horizontal overflow on detail', (await overflow()) <= 0, String(await overflow()))
  await shot('7-detail.png')
  const after = (await http('GET', '/api/planner/meals', sam.token)).meals.find((m) => m.name === 'Fried rice')
  const chloeId = samHousehold.members.find((m) => m.name === 'Chloe').id
  ok('detail: option rated as Chloe', after.ratings.some((r) => r.ratedAs === chloeId && r.optionId && r.thumbs === 1))
  ok('detail: tag saved', after.tags.includes('quick'))
  ok('detail: note saved', after.notes.length === 1)
  await evaluate(`[...document.querySelectorAll('[role=radio]')].find((b) => b.innerText === 'Both').click(); return true`)

  /* ---------- Plan a week ---------- */
  const clickText = (selector, label) => evaluate(`
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.innerText.trim().startsWith(${JSON.stringify(label)}))
    if (!el) throw new Error('no ' + ${JSON.stringify(`${selector} ${label}`)})
    el.click(); return true`)
  const dayText = (i) => evaluate(`return ((r) => r ? r.innerText + ' ' + (r.querySelector('input')?.value || r.querySelector('input')?.placeholder || '') : '')(document.querySelectorAll('.days .day')[${i}]) ?? ''`)
  // Next week, so it's never in the past and starts empty.
  await evaluate(`location.hash = '#/week'; return true`)
  await until(`document.querySelectorAll('.days .day').length === 7`)
  await click('a[aria-label="Next week"]')
  ok('week: empty nights invite planning', await until(`/Plan dinner/.test(((r) => r ? r.innerText + ' ' + (r.querySelector('input')?.value || r.querySelector('input')?.placeholder || '') : '')(document.querySelectorAll('.days .day')[0]) ?? '')`))
  await evaluate(`document.querySelectorAll('.days .line')[0].focus(); return true`)
  ok('line: the night itself is the input', await until(`document.activeElement === document.querySelectorAll('.days .line')[0]`))
  await type('.days .line', 'fried rice prawn')
  await shot('8-night-sheet.png')
  await press('Enter')
  ok('line: Return moves to the next line', await until(`document.activeElement === document.querySelectorAll('.days .line')[1]`))
  ok('line: the words stay as typed', await until(`document.querySelectorAll('.days .line')[0].value === 'fried rice prawn' && document.querySelectorAll('.days li')[0].classList.contains('filled')`), await evaluate(`return document.querySelectorAll('.days .line')[0].value`))
  ok('line: and are matched to the meal and option behind them', await (async () => { for (let i = 0; i < 40; i++) { const w = (await http('GET', `/api/planner/week?start=${await evaluate(`return document.querySelectorAll('.days li')[0].dataset.date`)}`, sam.token)).week; const e = w.entries.find((x) => x.raw === 'fried rice prawn'); if (e?.dishId && e.optionIds.length === 1) return true; await sleep(150) } return false })())
  await evaluate(`const el = document.querySelectorAll('.days .line')[1]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'out'); el.dispatchEvent(new Event('input', { bubbles: true })); return true`)
  await press('Enter')
  ok('line: out is a night out', await until(`document.querySelectorAll('.days .line')[1].value === 'out' && document.querySelectorAll('.days li')[1].classList.contains('quiet')`), await evaluate(`return document.querySelectorAll('.days .line')[1].value`))
  ok('line: on to Wednesday', await until(`document.activeElement === document.querySelectorAll('.days .line')[2]`))
  await press('Enter')
  ok('line: an empty Return just moves on', await until(`document.activeElement === document.querySelectorAll('.days .line')[3]`))
  ok('line: and leaves the night empty', await evaluate(`return document.querySelectorAll('.days .line')[2].value === ''`))
  await evaluate(`document.querySelectorAll('.days .line')[3].blur(); return true`)
  // Something it doesn't know: it asks, rather than inventing a meal
  const mealCount = async () => (await http('GET', '/api/planner/meals', sam.token)).meals.length
  const before = await mealCount()
  await evaluate(`const el = document.querySelectorAll('.days .line')[2]; el.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, "zzz mystery bake"); el.dispatchEvent(new Event('input', { bubbles: true })); el.blur(); return true`)
  ok('line: unknown text is kept as a note at once', await until(`document.querySelectorAll('.days .line')[2].value === 'zzz mystery bake' && document.querySelectorAll('.days li')[2].classList.contains('filled')`))
  ok('line: unknown text asks which meal', await until(`/Add as new meal/.test(document.querySelectorAll('.days li')[2]?.querySelector('.ask')?.innerText ?? '')`), await evaluate(`return document.querySelectorAll('.days li')[2]?.innerText`))
  ok('line: no meal created without asking', (await mealCount()) === before)
  ok('line: the typed text stays on the line', await evaluate(`return document.querySelectorAll('.days .line')[2].value === 'zzz mystery bake'`))
  await shot('8c-line-ask.png')
  await evaluate(`[...document.querySelectorAll('.days li')[2].querySelectorAll('.ask .link')].pop().click(); return true`)
  ok('line: Add makes the meal and plans it', await until(`!document.querySelectorAll('.days li')[2].querySelector('.ask') && document.querySelectorAll('.days li')[2].classList.contains('filled')`), await evaluate(`return document.querySelectorAll('.days .line')[2].value`))
  ok('line: one new meal', (await mealCount()) === before + 1)
  await evaluate(`const el = document.querySelectorAll('.days .line')[2]; el.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ""); el.dispatchEvent(new Event('input', { bubbles: true })); el.blur(); return true`)
  ok('line: emptying a line clears the night', await until(`!document.querySelectorAll('.days li')[2].classList.contains('filled')`))
  ok('line: no suggestion box or docked bar', await evaluate(`return !document.querySelector('.composer') && !document.querySelector('.review-banner')`))
  await shot('8a-line-ideas.png')
  ok('phone: no horizontal overflow while typing', (await overflow()) <= 0, String(await overflow()))
  ok('night: Monday shows the meal and option', await until(`/Fried rice/i.test(((r) => r ? r.innerText + ' ' + (r.querySelector('input')?.value || r.querySelector('input')?.placeholder || '') : '')(document.querySelectorAll('.days .day')[0]) ?? '') && /Prawn/i.test(((r) => r ? r.innerText + ' ' + (r.querySelector('input')?.value || r.querySelector('input')?.placeholder || '') : '')(document.querySelectorAll('.days .day')[0]) ?? '')`), await dayText(0))
  ok('night: Tuesday out', await until(`/Out/i.test(((r) => r ? r.innerText + ' ' + (r.querySelector('input')?.value || r.querySelector('input')?.placeholder || '') : '')(document.querySelectorAll('.days .day')[1]) ?? '')`))

  // Type the rest of the week
  await clickText('.balance .link', 'Paste a week')
  await until(`document.querySelector('#week-text')`)
  await type('#week-text', 'wed dhal\nthu lemony thing\nfri spicy surprise bake')
  await clickText('.btn', 'Match meals')
  ok('type: proposals listed', await until(`document.querySelectorAll('.rows li').length === 3`))
  ok('type: alias matched (dhal → Dahl)', /Dahl/i.test(await evaluate(`return document.querySelectorAll('.rows li')[0].innerText`)))
  ok('type: unknown text offered as a new meal', /New: Spicy surprise bake/.test(await evaluate(`return document.querySelectorAll('.rows li')[2].innerText`)))
  // Correct Thursday to Risotto: that also teaches "lemony thing" = Risotto.
  await evaluate(`[...document.querySelectorAll('.rows li')[1].querySelectorAll('button')].find((b) => b.innerText === 'Change').click(); return true`)
  await type('#fix-1', 'risot')
  await until(`[...document.querySelectorAll('.pick')].some((b) => b.innerText === 'Risotto')`)
  await clickText('.pick', 'Risotto')
  await shot('9-type-week.png')
  await clickText('.bottom .btn', 'Add 3')
  ok('type: nights added', await until(`/Dahl/i.test(((r) => r ? r.innerText + ' ' + (r.querySelector('input')?.value || r.querySelector('input')?.placeholder || '') : '')(document.querySelectorAll('.days .day')[2]) ?? '') && /Risotto/i.test(((r) => r ? r.innerText + ' ' + (r.querySelector('input')?.value || r.querySelector('input')?.placeholder || '') : '')(document.querySelectorAll('.days .day')[3]) ?? '') && /Spicy surprise bake/i.test(((r) => r ? r.innerText + ' ' + (r.querySelector('input')?.value || r.querySelector('input')?.placeholder || '') : '')(document.querySelectorAll('.days .day')[4]) ?? '')`), [await dayText(2), await dayText(3), await dayText(4)].join(' | '))
  ok('phone: no horizontal overflow on Week', (await overflow()) <= 0, String(await overflow()))
  await shot('10-week-planned.png')
  const mealsNow = (await http('GET', '/api/planner/meals', sam.token)).meals
  ok('type: correction saved as an alias', mealsNow.find((m) => m.name === 'Risotto')?.aliases.includes('lemony thing'))
  ok('type: new meal created', mealsNow.some((m) => m.name === 'Spicy surprise bake'))

  /* ---------- Drag and drop ---------- */
  const rowCentre = (i, part = '') => evaluate(`const li = document.querySelectorAll('.days li')[${i}]; const r = (${JSON.stringify(part)} ? li.querySelector(${JSON.stringify(part)}) : li).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }`)
  const mouse = (type, p) => send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, pointerType: 'mouse' })
  const glide = async (kind, a, b, steps = 8) => {
    for (let i = 1; i <= steps; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }
      if (kind === 'mouse') await mouse('mouseMoved', p)
      else await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y }] })
      await sleep(25)
    }
  }
  // Mouse: grip on Monday (Fried rice) onto Saturday (empty) moves it.
  let a = await rowCentre(0, '.grip')
  let b = await rowCentre(5)
  await mouse('mousePressed', a)
  ok('drag: picked up shows a floating copy', await until(`/Fried rice/i.test(document.querySelector('.ghost')?.innerText ?? '')`))
  await glide('mouse', a, b)
  ok('drag: the target says what will happen', /Move here/.test(await dayText(5)), await dayText(5))
  await shot('9b-drag.png')
  await mouse('mouseReleased', b)
  ok('drag: moved to an empty night', await until(`/Fried rice/i.test(((r) => r ? r.innerText + ' ' + (r.querySelector('input')?.value || r.querySelector('input')?.placeholder || '') : '')(document.querySelectorAll('.days .day')[5]) ?? '') && /Plan dinner/.test(((r) => r ? r.innerText + ' ' + (r.querySelector('input')?.value || r.querySelector('input')?.placeholder || '') : '')(document.querySelectorAll('.days .day')[0]) ?? '')`), `${await dayText(0)} | ${await dayText(5)}`)
  ok('drag: no night sheet opened by the drop', !(await evaluate(`return Boolean(document.querySelector('.sheet'))`)))
  ok('drag: says what happened', await until(`/Moved Fried rice to Sat/.test(document.querySelector('.notice')?.innerText ?? '')`), await text('.notice'))
  // And back
  a = await rowCentre(5, '.grip')
  b = await rowCentre(0)
  await mouse('mousePressed', a)
  await glide('mouse', a, b)
  await mouse('mouseReleased', b)
  await until(`/Fried rice/i.test(((r) => r ? r.innerText + ' ' + (r.querySelector('input')?.value || r.querySelector('input')?.placeholder || '') : '')(document.querySelectorAll('.days .day')[0]) ?? '')`)
  // Touch: press and hold Wednesday (Dahl), drag onto Thursday (Risotto): they swap.
  a = await rowCentre(2, '.date')
  b = await rowCentre(3)
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] })
  await sleep(500)
  ok('hold: a press and hold picks it up', await until(`document.querySelector('.ghost')`, 1500))
  await glide('touch', a, b)
  ok('hold: dropping on a dinner offers a swap', /Swap with Wed/.test(await dayText(3)), await dayText(3))
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(700) // let the browser's after-touch tap pass
  ok('hold: swapped', await until(`/Risotto/i.test(((r) => r ? r.innerText + ' ' + (r.querySelector('input')?.value || r.querySelector('input')?.placeholder || '') : '')(document.querySelectorAll('.days .day')[2]) ?? '') && /Dahl/i.test(((r) => r ? r.innerText + ' ' + (r.querySelector('input')?.value || r.querySelector('input')?.placeholder || '') : '')(document.querySelectorAll('.days .day')[3]) ?? '')`), `${await dayText(2)} | ${await dayText(3)}`)
  ok('hold: saved on the server', await (async () => { for (let i = 0; i < 20; i++) { const w = (await http('GET', `/api/planner/week?start=${await evaluate(`return location.hash.split('/')[2]`)}`, sam.token)).week; const dates = w.entries.map((e) => e.date).sort(); if (w.entries.find((e) => e.date === dates[2])?.raw?.match(/lemony|risotto/i)) return true; await sleep(150) } return false })())
  // Without dragging: "Move to" in the night sheet swaps them back.
  await evaluate(`document.querySelectorAll('.days .date')[2].click(); return true`)
  ok('move to: the day name opens the night', await until(`document.querySelector('.move')`), JSON.stringify({ errors }))
  await click('button[aria-label="Swap with Thu"]')
  ok('move to: swapped back', await until(`/Dahl/i.test(((r) => r ? r.innerText + ' ' + (r.querySelector('input')?.value || r.querySelector('input')?.placeholder || '') : '')(document.querySelectorAll('.days .day')[2]) ?? '') && /Risotto/i.test(((r) => r ? r.innerText + ' ' + (r.querySelector('input')?.value || r.querySelector('input')?.placeholder || '') : '')(document.querySelectorAll('.days .day')[3]) ?? '')`), `${await dayText(2)} | ${await dayText(3)}`)
  ok('phone: no horizontal overflow after dragging', (await overflow()) <= 0, String(await overflow()))

  // Copy into the following week
  await click('a[aria-label="Next week"]')
  await until(`/Plan dinner/.test(((r) => r ? r.innerText + ' ' + (r.querySelector('input')?.value || r.querySelector('input')?.placeholder || '') : '')(document.querySelectorAll('.days .day')[0]) ?? '')`)
  await clickText('.balance .link', 'Copy last week')
  ok('copy: five nights copied', await until(`/Copied 5 nights/.test(document.querySelector('.notice')?.innerText ?? '')`), await text('.notice'))
  ok('copy: same meals land on the same days', /Fried rice/i.test(await dayText(0)) && /Out/i.test(await dayText(1)))

  // Week start setting
  await evaluate(`location.hash = '#/settings'; return true`)
  await until(`document.querySelector('#week-start')`)
  await evaluate(`const s = document.querySelector('#week-start'); s.value = '5'; s.dispatchEvent(new Event('change', { bubbles: true })); return true`)
  await until(`document.querySelector('#week-start')?.value === '5'`)
  await sleep(400)
  await evaluate(`location.hash = '#/week'; return true`)
  ok('week start: Saturday first', await until(`/^Sat/.test(document.querySelectorAll('.days .weekday')[0]?.innerText ?? '')`), await evaluate(`return document.querySelectorAll('.days .weekday')[0]?.innerText`))
  await http('PUT', '/api/planner/household', sam.token, { weekStartDay: 0 })

  /* ---------- Review last week ---------- */
  const localDay = (offset) => {
    const t = new Date()
    t.setDate(t.getDate() + offset)
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
  }
  const all = (await http('GET', '/api/planner/meals', sam.token)).meals
  const friedRice = all.find((m) => m.name === 'Fried rice')
  const prawn = friedRice.options.find((o) => o.name === 'Prawn')
  await http('PUT', `/api/planner/slots/${localDay(-3)}`, sam.token, { dishId: friedRice.id, optionIds: [prawn.id] })
  await http('PUT', `/api/planner/slots/${localDay(-2)}`, sam.token, { dishId: all.find((m) => m.name === 'Dahl').id })
  await http('PUT', `/api/planner/slots/${localDay(-1)}`, sam.token, { dishId: all.find((m) => m.name === 'Risotto').id })
  await signInAs(sam.token, '#/week')
  ok('review: the week offers a review', await until(`/Review last week \\(3\\)/.test(document.querySelector('.review-link')?.innerText ?? '')`), await text('.review-link'))
  await click('.review-link')
  ok('review: one card per past dinner', await until(`document.querySelectorAll('.review').length === 3`))
  const card = (i) => `document.querySelectorAll('.review')[${i}]`
  const inCard = (i, label) => evaluate(`
    const b = [...${card(i)}.querySelectorAll('button')].find((x) => x.innerText.trim().startsWith(${JSON.stringify(label)}))
    if (!b) throw new Error('no button ' + ${JSON.stringify(label)}); b.click(); return true`)

  // Cooked + rated + froze two portions
  await inCard(0, 'Cooked it')
  ok('review: cooked shows the rating', await until(`${card(0)}.querySelector('.rating')`))
  await click('button[aria-label="Fried rice: 4 stars"]')
  await until(`${card(0)}.querySelector('button[aria-label="Fried rice: make again"]')?.getAttribute('aria-pressed') === 'true'`)
  await inCard(0, 'Note, lunch')
  await click('button[aria-label="One more portion"]')
  await until(`/1/.test(${card(0)}.querySelector('.frozen strong')?.innerText ?? '')`)
  await click('button[aria-label="One more portion"]')
  ok('review: froze two', await until(`${card(0)}.querySelector('.frozen strong')?.innerText === '2'`))
  await shot('11-review.png')

  // Skipped, then put on a free night
  await inCard(1, 'Skipped')
  ok('review: skipped offers free nights', await until(`/free night/.test(${card(1)}.innerText)`))
  await evaluate(`${card(1)}.querySelector('.pick').click(); return true`)
  ok('review: moved', await until(`/Moved to/.test(${card(1)}.innerText)`))

  // Made something else instead
  await inCard(2, 'Made something else')
  await type(`#swap-${(await http('GET', `/api/planner/review?today=${localDay(0)}`, sam.token)).entries.find((e) => e.date === localDay(-1)).id}`, 'dahl')
  await until(`[...${card(2)}.querySelectorAll('.pick')].some((b) => b.innerText === 'Dahl')`)
  await evaluate(`[...${card(2)}.querySelectorAll('.pick')].find((b) => b.innerText === 'Dahl').click(); return true`)
  ok('review: swap shows what we made', await until(`/Dahl/i.test(${card(2)}.querySelector('h2')?.innerText ?? '') && ${card(2)}.querySelector('.rating')`))
  ok('review: all reviewed', await until(`/3 of 3 reviewed/.test(document.querySelector('.progress')?.innerText ?? '') && document.querySelector('.all-done')`))
  ok('phone: no horizontal overflow on Review', (await overflow()) <= 0, String(await overflow()))

  const fr = (await http('GET', '/api/planner/meals', sam.token)).meals.find((m) => m.name === 'Fried rice')
  ok('review: rating is now from a real cook', fr.ratings.some((r) => r.optionId === prawn.id && r.ratedAs === 'both' && r.stars === 4 && r.source === 'review'))
  const stock = (await http('GET', '/api/planner/freezer', sam.token)).items
  ok('review: freezer has two portions', stock.some((f) => f.dishId === fr.id && f.portions === 2 && f.optionIds.includes(prawn.id)))
  ok('review: nothing left to review', (await http('GET', `/api/planner/review?today=${localDay(0)}`, sam.token)).entries.length === 0)

  // Freezer page and a freezer night
  await evaluate(`location.hash = '#/freezer'; return true`)
  ok('freezer: lists the stock', await until(`document.querySelector('.items')?.innerText.includes('Fried rice (Prawn)')`))
  await click('button[aria-label="One fewer Fried rice (Prawn)"]')
  ok('freezer: minus one', await until(`document.querySelector('.items strong')?.innerText === '1'`))
  await shot('12-freezer.png')
  await evaluate(`location.hash = '#/week/${localDay(14)}'; return true`)
  await until(`document.querySelectorAll('.days .day').length === 7`)
  await evaluate(`document.querySelectorAll('.days .date')[6].click(); return true`)
  ok('night: freezer stock offered', await until(`[...document.querySelectorAll('.sheet .freezer button')].some((b) => b.innerText.includes('Fried rice (Prawn)'))`))
  await evaluate(`[...document.querySelectorAll('.sheet .freezer button')].find((b) => b.innerText.includes('Fried rice (Prawn)')).click(); return true`)
  ok('night: shows from the freezer', await until(`/From the freezer/.test(document.querySelectorAll('.days .day')[6]?.innerText ?? '')`), await evaluate(`return document.querySelectorAll('.days .day')[6]?.innerText`))

  /* ---------- Suggestions ---------- */
  // Make Risotto a clear forgotten favourite: loved, last cooked 6 weeks ago.
  const risotto = (await http('GET', '/api/planner/meals', sam.token)).meals.find((m) => m.name === 'Risotto')
  const old = (await http('PUT', `/api/planner/slots/${localDay(-42)}`, sam.token, { dishId: risotto.id })).entry
  await http('PUT', `/api/planner/entries/${old.id}`, sam.token, { status: 'cooked' })
  await http('PUT', '/api/planner/ratings', sam.token, { dishId: risotto.id, optionId: risotto.options[0].id, ratedAs: 'both', thumbs: 1, stars: 5 })
  await evaluate(`location.hash = '#/week/${localDay(7)}'; return true`)
  await signInAs(sam.token, `#/week/${localDay(28)}`) // a week with nothing planned yet
  ok('ideas: the week only links to them', await until(`/7 free nights: see ideas/.test(document.querySelector('.ideas-link')?.innerText ?? '')`) && !(await evaluate(`return Boolean(document.querySelector('.ideas'))`)))
  await click('.ideas-link')
  ok('ideas tab: opens for that week', await until(`document.querySelector('#ideas-title') && /Free nights/.test(document.querySelector('.free')?.innerText ?? '')`))
  ok('ideas tab: Risotto suggested', await until(`Boolean([...document.querySelectorAll('.idea')].find((c) => new RegExp("^Risotto", 'i').test(c.querySelector('h2').innerText)))`), await evaluate(`return [...document.querySelectorAll('.idea h2')].map((h) => h.innerText).join(' | ')`))
  const risottoCard = await evaluate(`return [...document.querySelectorAll('.idea')].find((c) => new RegExp("^Risotto", 'i').test(c.querySelector('h2').innerText)).innerText`)
  ok('ideas tab: says why, with the rating and history', /5★/.test(risottoCard) && /Made \d+ times?, last/.test(risottoCard), risottoCard)
  await shot('13-ideas.png')
  await evaluate(`[...document.querySelectorAll('.idea')].find((c) => new RegExp("^Risotto", 'i').test(c.querySelector('h2').innerText)).querySelector('.add .night').click(); return true`)
  ok('ideas tab: added to a free night', await until(`/added to/.test(document.querySelector('.notice')?.innerText ?? '')`), await text('.notice'))
  ok('ideas tab: and leaves the list', await until(`![...document.querySelectorAll('.idea')].find((c) => new RegExp("^Risotto", 'i').test(c.querySelector('h2').innerText))`))
  // Filters
  await clickText('.filter', 'You both love')
  ok('ideas tab: filters', await until(`document.querySelector('.filter[aria-pressed="true"]')?.innerText === 'You both love'`))
  await clickText('.filter', 'Best')
  // Not now
  const snoozable = await evaluate(`return document.querySelector('.idea h2')?.innerText ?? ''`)
  ok('not now: offered', Boolean(snoozable))
  await evaluate(`[...document.querySelector('.idea').querySelectorAll('.acts .link')].find((x) => x.innerText === 'Not now').click(); return true`)
  const snoozedName = snoozable.split(' (')[0]
  ok('not now: snoozed for both phones', await (async () => { for (let i = 0; i < 30; i++) { const m = (await http('GET', '/api/planner/meals', sam.token)).meals.find((x) => x.name === snoozedName); if (m?.snoozedUntil) return true; await sleep(150) } return false })(), snoozedName)
  ok('not now: drops out of the list', await until(`![...document.querySelectorAll('.idea h2')].some((t) => t.innerText.split(' (')[0] === ${JSON.stringify(snoozedName)})`))
  ok('phone: no horizontal overflow on ideas', (await overflow()) <= 0, String(await overflow()))
  // Back on the week
  await evaluate(`location.hash = '#/week/${localDay(28)}'; return true`)
  ok('ideas: placed on a night, best variation picked', await until(`[...document.querySelectorAll('.days .day')].some((d) => /Risotto/i.test(d.querySelector('input').value) && new RegExp(${JSON.stringify(risotto.options[0].name)}).test(d.querySelector('input').value))`))
  ok('balance: strip shows once a night is planned', await until(`/veggie/.test(document.querySelector('.balance')?.innerText ?? '')`), await text('.balance'))
  // A night's top three
  const free = await evaluate(`return [...document.querySelectorAll('.days .day')].findIndex((d) => !d.querySelector('input').value)`)
  await evaluate(`document.querySelectorAll('.days .date')[${free}].click(); return true`)
  ok('night ideas: offered for the night', await until(`/Ideas for/i.test(document.querySelector('.sheet')?.innerText ?? '')`), JSON.stringify((await text('.sheet')).slice(0, 300)) + ' errors: ' + errors.join(' / '))
  await shot('8b-plan-ideas.png')
  await evaluate(`document.querySelector('.backdrop')?.click(); return true`)
  await until(`!document.querySelector('.sheet')`)

  /* ---------- One-line review, photo, meal page extras ---------- */
  const dahl = (await http('GET', '/api/planner/meals', sam.token)).meals.find((m) => m.name === 'Dahl')
  await http('PUT', `/api/planner/slots/${localDay(-5)}`, sam.token, { dishId: dahl.id })
  await http('PUT', `/api/planner/slots/${localDay(-4)}`, sam.token, { dishId: risotto.id })
  await evaluate(`location.hash = '#/review'; return true`)
  ok('one line: box offered', await until(`document.querySelector('#review-line')`))
  await type('#review-line', 'all good except the dahl, too much faff')
  await evaluate(`document.querySelector('.line button[type=submit]').click(); return true`)
  ok('one line: filled in', await until(`/Filled in 2 dinners/.test(document.querySelector('.line')?.innerText ?? '')`), JSON.stringify(await text('.line')) + ' cards: ' + JSON.stringify(await text('.list')).slice(0, 300))
  const queue = (await http('GET', `/api/planner/review?today=${localDay(0)}`, sam.token)).entries
  ok('one line: nothing left waiting', queue.length === 0, String(queue.length))
  const dahlNight = (await http('GET', `/api/planner/week?start=${localDay(-5)}`, sam.token)).week.entries.find((e) => e.date === localDay(-5))
  ok('one line: the faff note on the dahl', dahlNight.cookNote === 'too much faff', dahlNight.cookNote)

  // Photo from a review card: make a real JPEG in the page, then pick it as a file
  const dataUrl = await evaluate(`const c = document.createElement('canvas'); c.width = 64; c.height = 48; const g = c.getContext('2d'); g.fillStyle = '#b4472b'; g.fillRect(0, 0, 64, 48); return c.toDataURL('image/jpeg', 0.9)`)
  const jpgPath = path.join(dataDir, 'dinner.jpg')
  fs.writeFileSync(jpgPath, Buffer.from(dataUrl.split(',')[1], 'base64'))
  await evaluate(`[...document.querySelectorAll('.review')].find((c) => /Dahl/i.test(c.innerText)).querySelector('.more').click(); return true`)
  await until(`document.querySelector('.review input[type=file]')`)
  await send('DOM.enable')
  const { root } = await send('DOM.getDocument', { depth: -1 })
  const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: '.review input[type=file]' })
  await send('DOM.setFileInputFiles', { nodeId, files: [jpgPath] })
  ok('photo: thumbnail appears on the card', await until(`document.querySelector('.review .pics img')`, 8000))
  const withPhoto = (await http('GET', '/api/planner/meals', sam.token)).meals.find((m) => m.id === dahl.id)
  ok('photo: saved, linked to the cook, becomes the cover', withPhoto.photos.length === 1 && withPhoto.photos[0].entryId === dahlNight.id && withPhoto.coverPhotoId === withPhoto.photos[0].id)

  // Meal page: cover, regular, never suggest
  await evaluate(`location.hash = '#/meals/${dahl.id}'; return true`)
  ok('meal page: cover photo', await until(`document.querySelector('.cover img')`, 8000))
  await evaluate(`const s = document.querySelector('#regular'); s.value = '14'; s.dispatchEvent(new Event('change', { bubbles: true })); return true`)
  ok('meal page: set as a regular', await (async () => { for (let i = 0; i < 20; i++) { if ((await http('GET', '/api/planner/meals', sam.token)).meals.find((m) => m.id === dahl.id).regularEveryDays === 14) return true; await sleep(150) } return false })())
  ok('phone: no horizontal overflow on the meal page', (await overflow()) <= 0, String(await overflow()))
  await shot('14-meal-page.png')

  /* ---------- Shopping list ---------- */
  // The week planned earlier (next week): Fried rice \(Prawn\), out, Dahl, Risotto, Spicy surprise bake.
  const planWeek = (await http('GET', '/api/planner/household', sam.token)).household && (() => { const t = new Date(); t.setDate(t.getDate() + 7); const dow = (t.getDay() + 6) % 7; t.setDate(t.getDate() - dow); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}` })()
  await evaluate(`location.hash = '#/week/${planWeek}'; return true`)
  ok('shop: linked from the week', await until(`document.querySelector('.shop-link')`))
  await click('.shop-link')
  ok('shop: builder starts at the first meal night', await until(`/Fried rice/i.test(document.querySelector('#step-title')?.innerText ?? '')`), await text('#step-title'))
  ok('shop: out night skipped (4 meal nights + extras)', /1 of 5/.test(await text('.progress')), await text('.progress'))
  const addTyped = async (value) => {
    await type('#add-item', value)
    await evaluate(`document.querySelector('.add button[type=submit]').click(); return true`)
    await until(`document.querySelector('#add-item')?.value === ''`)
  }
  await addTyped('2 onions')
  await addTyped('coriander')
  ok('shop: items added for the meal with a section', await until(`/onions \\(2\\)\\s*Cold/i.test(document.querySelector('.added')?.innerText ?? '')`), await text('.added'))
  await evaluate(`[...document.querySelectorAll('.nav .btn')].find((b) => /Next/.test(b.innerText)).click(); return true`)
  ok('shop: next meal night', await until(`/Dahl/i.test(document.querySelector('#step-title')?.innerText ?? '')`))
  await addTyped('onions x1')
  for (let i = 0; i < 3; i++) await evaluate(`[...document.querySelectorAll('.nav .btn')].find((b) => /Next/.test(b.innerText)).click(); return true`)
  ok('shop: extras step last', await until(`document.querySelector('#step-title')?.innerText === 'Extras'`))
  await addTyped('milk')
  await addTyped('tinned tomatoes')
  await shot('15-shop-build.png')
  await evaluate(`[...document.querySelectorAll('.nav .btn')].find((b) => /See the list/.test(b.innerText)).click(); return true`)
  ok('shop: list in shop order', await until(`[...document.querySelectorAll('.group h2')].map((h) => h.innerText).join('|') === 'Cold|Ambient'`), await evaluate(`return [...document.querySelectorAll('.group h2')].map((h) => h.innerText).join('|')`))
  const onionRow = `[...document.querySelectorAll('.items li')].find((l) => /onions/i.test(l.innerText))`
  ok('shop: one line for two meals, with night tags', await until(`/onions \\(2 \\+ x1\\)/i.test(${onionRow}?.innerText ?? '') && ${onionRow}?.querySelectorAll('.tag').length === 2`), await evaluate(`return ${onionRow}?.innerText ?? ''`))
  // Coriander comes from the market: two taps (Cold → Ambient → Market), remembered
  const coriBtn = `[...document.querySelectorAll('.items li')].find((l) => /coriander/i.test(l.innerText)).querySelector('.sec-btn')`
  await evaluate(`${coriBtn}.click(); return true`)
  await until(`/Ambient/.test(${coriBtn}.getAttribute('aria-label'))`)
  await evaluate(`${coriBtn}.click(); return true`)
  ok('shop: moved to Market, which comes first', await until(`document.querySelector('.group h2')?.innerText === 'Market'`))
  // Tick with and without signal
  await evaluate(`[...document.querySelectorAll('.items li')].find((l) => /milk/i.test(l.innerText)).querySelector('input').click(); return true`)
  ok('shop: ticked', await (async () => { for (let i = 0; i < 20; i++) { const s = await http('GET', `/api/planner/shopping?week=${planWeek}`, sam.token); if (s.items.find((x) => /^milk$/i.test(x.name))?.checked) return true; await sleep(150) } return false })())
  await send('Network.enable')
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await evaluate(`${onionRow}.querySelector('input').click(); return true`)
  ok('shop: ticking with no signal waits', await until(`/⏳/.test(${onionRow}?.innerText ?? '')`))
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await evaluate(`window.dispatchEvent(new Event('online')); return true`)
  ok('shop: sent once back online', await (async () => { for (let i = 0; i < 30; i++) { const s = await http('GET', `/api/planner/shopping?week=${planWeek}`, sam.token); if (s.items.find((x) => /onions/i.test(x.name))?.checked) return true; await sleep(200) } return false })())
  ok('phone: no horizontal overflow on the list', (await overflow()) <= 0, String(await overflow()))
  await shot('16-shop-list.png')
  await evaluate(`[...document.querySelectorAll('.nav .btn')].find((b) => /Clear ticked/.test(b.innerText)).click(); return true`)
  ok('shop: clear ticked', await until(`/Cleared 2 ticked/.test(document.body.innerText)`))

  // The following week has the same meals (copied): the usual is offered
  const nextWeek = (() => { const [y, m, dd] = planWeek.split('-').map(Number); const t = new Date(y, m - 1, dd + 7); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}` })()
  await evaluate(`location.hash = '#/shop/${nextWeek}'; return true`)
  ok('usual: offered for a meal made before', await until(`/The usual/.test(document.querySelector('.usual')?.innerText ?? '') && /onions/i.test(document.querySelector('.usual')?.innerText ?? '')`), await text('.step'))
  await evaluate(`[...document.querySelectorAll('.usual .chip')].find((c) => /coriander/i.test(c.innerText)).click(); return true`)
  await evaluate(`document.querySelector('.usual .btn').click(); return true`)
  ok('usual: unticked ones stay off', await until(`/onions/i.test(document.querySelector('.added')?.innerText ?? '')`) && !/coriander/i.test(await text('.added')))
  ok('usual: section remembered (coriander still Market next time)', (await http('POST', '/api/planner/shopping/items', sam.token, { week: nextWeek, name: 'Coriander' })).item.section === 'market')

  /* ---------- A week that starts on another day ---------- */
  await evaluate(`location.hash = '#/week/${localDay(21)}'; return true`)
  await until(`document.querySelectorAll('.days .day').length === 7`)
  const firstDay = await evaluate(`return document.querySelector('.days li').dataset.date`)
  await clickText('.range .link', 'change')
  ok('week start: day choices offered', await until(`document.querySelectorAll('.start-day').length === 6`))
  await evaluate(`document.querySelectorAll('.start-day')[4].click(); return true`) // two days later
  const later = (() => { const [y, m, d] = firstDay.split('-').map(Number); const t = new Date(y, m - 1, d + 2, 12); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}` })()
  ok('week start: the week now starts two days later', await until(`document.querySelector('.days li')?.dataset.date === ${JSON.stringify(later)} && document.querySelectorAll('.days .day').length === 7`), await evaluate(`return document.querySelector('.days li')?.dataset.date`))
  ok('week start: saved for both phones', ((await http('GET', '/api/planner/household', sam.token)).household.weekStarts ?? []).includes(later))
  await click('a[aria-label="Previous week"]')
  ok('week start: the week before is short (2 nights)', await until(`document.querySelectorAll('.days .day').length === 2 && document.querySelector('.days li')?.dataset.date === ${JSON.stringify(firstDay)}`), String(await evaluate(`return document.querySelectorAll('.days .day').length`)))
  await click('a[aria-label="Next week"]')
  await click('a[aria-label="Next week"]')
  ok('week start: following weeks carry on from the new day', await until(`document.querySelector('.days li')?.dataset.date === ${JSON.stringify(later)} ? false : new Date(document.querySelector('.days li').dataset.date + 'T12:00').getDay() === new Date(${JSON.stringify(later)} + 'T12:00').getDay()`))
  await shot('15-week-start.png')

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
