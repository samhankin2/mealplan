#!/usr/bin/env node
/**
 * Suggestion engine on synthetic meals with known answers. Plain Node (24+
 * strips the TypeScript types).   node qa/suggest-test.mjs
 */
import { forNight, opinionOf, regularOf, suggestAll, tray, weekBalance } from '../src/lib/suggest.ts'

let pass = 0
let fail = 0
const ok = (name, cond, detail = '') => (cond ? (pass++, console.log(`PASS  ${name}`)) : (fail++, console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)))
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)

const TODAY = '2027-03-10' // a Wednesday
const SAM = { id: 'sam', name: 'Sam', me: true }
const CHLOE = { id: 'chloe', name: 'Chloe', me: false }
const r = (stars, thumbs = stars >= 3 ? 1 : -1, extra = {}) => ({ optionId: null, ratedAs: 'both', thumbs, stars, ...extra })

let n = 0
const meal = (name, over = {}) => ({
  id: `m${++n}`, name, family: null, tags: [], suggestedTags: [], effort: 2, tips: null, link: null, neverSuggest: false,
  aliases: [], options: [], cooked: 0, lastCooked: null, ratings: [], hidden: [], notes: [],
  regularEveryDays: null, coverPhotoId: null, snoozedUntil: null, photos: [], tipSuggestions: [], ...over,
})

const meals = [
  meal('Old favourite', { cooked: 4, lastCooked: '2027-01-06', ratings: [r(5)], suggestedTags: ['curry'] }), // 9 weeks ago
  meal('Recent favourite', { cooked: 5, lastCooked: '2027-02-24', ratings: [r(5)] }), // 2 weeks ago: not forgotten
  meal('Notes-only favourite', { cooked: 3, ratings: [r(4)], suggestedTags: ['curry'] }), // undated
  meal('Disliked', { cooked: 5, lastCooked: '2026-12-01', ratings: [r(1)] }),
  meal('Fried rice', { cooked: 20, ratings: [r(4)] }), // auto regular from Notes cadence
  meal('Thai curry', { cooked: 3, lastCooked: '2027-02-20', regularEveryDays: 14, ratings: [r(4)], suggestedTags: ['curry'] }), // due (18 days)
  meal('Spag bol', { cooked: 3, lastCooked: '2027-03-05', regularEveryDays: 14, ratings: [r(4)] }), // not due (5 days)
  meal('Never suggested', { cooked: 4, lastCooked: '2026-12-01', ratings: [r(5)], neverSuggest: true }),
  meal('Snoozed', { cooked: 4, lastCooked: '2026-12-01', ratings: [r(5)], snoozedUntil: '2027-03-20' }),
  meal('Unrated old staple', { cooked: 7, suggestedTags: ['pasta'] }),
  meal('Want one', { ratings: [r(null, null, { want: true })] }),
  meal('Big roast', { cooked: 2, lastCooked: '2026-12-20', effort: 3, ratings: [r(5)] }),
  meal('Chloe special', { cooked: 3, lastCooked: '2027-01-01', ratings: [{ optionId: null, ratedAs: 'chloe', thumbs: 1, stars: 5 }, { optionId: null, ratedAs: 'sam', thumbs: 1, stars: 3 }] }),
  meal('Last March', { cooked: 2, lastCooked: '2026-03-12', ratings: [r(3)] }),
  meal('Planned already', { cooked: 4, lastCooked: '2026-12-01', ratings: [r(5)] }),
  meal('Dirty cabbage', {
    cooked: 3, lastCooked: '2026-12-15',
    options: [{ id: 'kor', axis: 'Style', name: 'Korean' }, { id: 'beef', axis: 'Protein', name: 'Beef' }],
    ratings: [{ optionId: 'beef+kor', ratedAs: 'both', thumbs: 1, stars: 5 }, { optionId: null, ratedAs: 'both', thumbs: 1, stars: 3 }],
  }),
]
const id = (name) => meals.find((m) => m.name === name).id
const history = {
  importedWeeks: 48,
  entries: [
    { dishId: id('Last March'), date: '2026-03-12' },
    { dishId: id('Old favourite'), date: '2026-12-01' },
    { dishId: id('Old favourite'), date: '2027-01-06' },
  ],
}
const freezer = [
  { id: 'f1', dishId: id('Recent favourite'), optionIds: [], portions: 2, frozenOn: '2027-02-01', fromEntryId: null },
  { id: 'f2', dishId: id('Fried rice'), optionIds: [], portions: 1, frozenOn: '2027-03-01', fromEntryId: null },
]
const planned = [{ id: 'p', date: '2027-03-11', slot: 'dinner', kind: 'dish', status: 'planned', dishId: id('Planned already'), optionIds: [], note: null, raw: null, freezerItemId: null, cookNote: null, leftovers: false, frozenPortions: 0, tweakRetry: false, reviewedAt: null, updatedAt: '' }]

const all = suggestAll({ meals, history, freezer, members: [SAM, CHLOE], today: TODAY, planned })
const lane = (l) => all.filter((s) => s.lane === l).sort((a, b) => b.score - a.score).map((s) => s.title)
const has = (name) => all.some((s) => s.title.startsWith(name))

// Opinions
eq('opinion: best variation wins', opinionOf(meals.find((m) => m.name === 'Dirty cabbage')).stars, 5)
ok('opinion: all thumbs down is disliked', opinionOf(meals.find((m) => m.name === 'Disliked')).disliked)

// Forgotten favourites
ok('forgotten: 9 weeks and loved', lane('forgotten').includes('Old favourite'))
ok('forgotten: undated Notes favourite counts', lane('forgotten').includes('Notes-only favourite'))
ok('forgotten: 2 weeks ago is not forgotten', !lane('forgotten').includes('Recent favourite'))
ok('forgotten: best variation named', lane('forgotten').includes('Dirty cabbage · Korean · Beef'), lane('forgotten').join('|'))
ok('never: disliked never suggested', !has('Disliked'))
ok('never: never-suggest respected', !has('Never suggested'))
ok('never: snoozed respected', !has('Snoozed'))
ok('never: already planned this week skipped', !has('Planned already'))

// Regulars
ok('regular: set and due', lane('regular').includes('Thai curry'))
ok('regular: set but not due', !has('Spag bol'))
ok('regular: never shows as forgotten', !lane('forgotten').includes('Thai curry'))
const fr = all.find((s) => s.title === 'Fried rice' && s.lane === 'regular')
ok('regular: proposed from Notes cadence (20 in 48 weeks)', fr && /Looks like a regular/.test(fr.reason), fr?.reason)
eq('regular: cadence rounds to weeks', regularOf(meals.find((m) => m.name === 'Fried rice'), { cadence: 16.8, daysSince: 60, undated: true }), { every: 14, auto: true })

// Other lanes
eq('freezer: oldest first', lane('freezer'), ['Recent favourite', 'Fried rice'])
ok('last year: around this date', lane('lastYear').includes('Last March'))
ok('rediscover: made a lot, never rated', lane('rediscover').includes('Unrated old staple'))
ok('want: wanted meal', lane('want').includes('Want one'))
ok('weekend: high effort favourite', lane('weekend').includes('Big roast'))
const pick = all.find((s) => s.lane === 'pick')
ok("pick: Chloe's pick", pick?.title === 'Chloe special' && /Chloe's pick/.test(pick.reason), pick?.reason)

// Tray: one per dish type, meal once
const t = tray(all, meals)
const shown = t.flatMap((l) => l.items.map((s) => s.mealId))
eq('tray: each meal once', shown.length, new Set(shown).size)
const curries = t.flatMap((l) => l.items).filter((s) => ['Old favourite', 'Notes-only favourite', 'Thai curry'].includes(s.title))
eq('tray: at most one curry', curries.length, 1)
eq('tray: regulars lane comes first', t[0]?.lane, 'regular')

// A night's top three fit the night
const wed = forNight(all, meals, '2027-03-10')
ok('night: weeknight has no high-effort meal', !wed.some((s) => s.title === 'Big roast'))
eq('night: three picks', wed.length, 3)
ok('night: Saturday allows the weekend project', forNight(all, meals, '2027-03-13', 20).some((s) => s.title === 'Big roast'))

// Week balance
const veg = meal('Dahl', { tags: ['vegetarian'], cooked: 5 })
const chilli = meal('Chilli', { options: [{ id: 'v', axis: 'Protein', name: 'Veg' }, { id: 'k', axis: 'Protein', name: 'Kangaroo' }], cooked: 5 })
const brandNew = meal('Brand new', { cooked: 0 })
const e = (dishId, optionIds = []) => ({ ...planned[0], dishId, optionIds })
eq('balance: veggie, new, repeats', weekBalance([e(veg.id), e(chilli.id, ['v']), e(chilli.id, ['k']), e(brandNew.id)], [veg, chilli, brandNew]), { veggie: 2, fresh: 1, repeats: ['Chilli'] })

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
