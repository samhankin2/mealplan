# mealplan design

Made with the `frontend-design` skill (Anthropic). Notes for future passes.

## Brief

A shared dinner plan for two people in Melbourne. Used on the sofa on Sunday
to plan the week, the next Sunday to say how it went, and on a phone in the
market and supermarket aisles. The content is their own meals: fried rice,
risotto, dirty cabbage. Primary job: decide this week's dinners fast.
Secondary: remember the good ones, and shop.

## What it replaced (and why)

v1 was cream (#f7f2ea) + serif display + terracotta (#b4472b): the most
common generated look. It also had all-caps labels, "A · B · C" strings,
one rounded card with one shadow on everything, and "›" on buttons.

## Plan

**Colour.** Cool enamel and plum ink, with the colour spent on the days.

| Name | Hex | Role |
| --- | --- | --- |
| Enamel | #EEF1EA | page: a pale sage like a splashback tile, not cream |
| Plate | #FFFFFF | sheets, rows, inputs |
| Plum | #2B2233 | ink and primary buttons (aubergine skin, not tinted black) |
| Pepper | #625B68 | secondary text (5:1 on Enamel) |
| Rule | #D6DAD0 | hairlines |
| Leek | #3D7A36 | done: cooked, rated, ticked |

Each weekday owns a produce colour, from Monday: beetroot #B22F5B, carrot
#D3651F, turmeric #B8860B, leek #55882A, kale #17806F, blueberry #3A57A6,
aubergine #66448F. It appears wherever that night appears: its row in the
week, its review card, the night markers on shopping items, the night
buttons when placing an idea. Colour answers "which night?".

**Type.** One family: Bricolage Grotesque (variable: weight, width, optical
size). Weekday names are set large and condensed (width 75, weight 750):
the week is a stack of day names, and that stack is the hero. Scale 1.25:
13 / 16 / 20 / 25 / 31 / 39. Body 16/1.45. Sentence case everywhere.

**Layout.** Phone first, 16px gutters, everything left aligned. A bottom
tab bar (Week, Meals, Shop, Settings) where thumbs are. Pages open with
their title in the big type, no app bar.

```
This week                ‹  ›
23 – 29 Nov
[ Type the week ] [ Copy last week ]
| Review last week: 5 dinners      |   plum band, only when due
▌Mon   Fried rice                       planned: day tint + stripe
▌23    prawn
▌Tue   Out
┆Wed   Plan dinner                      empty: dashed rule, no colour
2 veggie, 1 new, no repeats
Ideas for free nights
  Risotto (blue cheese)   5 stars, last made 6 weeks ago   Not now
[ Shopping list ]   Freezer: 2 portions
═════ Week · Meals · Shop · Settings ═════
```

**Principles**

1. The days are the colour. Everything else is plum on enamel.
2. No decorative shadows. Surfaces separate by space and hairlines.
   Radius encodes kind: sheets 20, rows and buttons 12, toggles are pills.
3. Copy: sentence case, plain verbs; commas and parentheses instead of
   middle dots; no arrows on buttons; no labels above things that are
   already clear.
4. One motion: a night tints in when it gets planned. The rating game's
   +1 stays (it answers a tap). Reduced motion turns both off.

## Review against the defaults

- Day colours: calendars colour things, but these hues are produce and
  they mark nights on the shopping list and review, so they carry
  information specific to a meal plan. Kept.
- Bricolage Grotesque turns up in generated work. Kept for one reason
  that is specific here: its width axis lets the seven day names stack
  condensed and large on a phone. Noted as the part most at risk of
  reading generic.
- Plum instead of black, enamel instead of cream or white: tied to the
  subject (aubergine, kitchen tile). Kept.
- Bottom tabs: standard for a phone app used one-handed in a shop. Kept,
  not a decoration.
