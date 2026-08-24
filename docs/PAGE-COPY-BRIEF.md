# avintph page changes — batch 1

Three unrelated changes to public pages. None of them touch `/systems` or the
studio library. Commit as one change.

---

## 1. Remove PicklePal from public page copy

PicklePal is shelved and should not appear on the site. Two places:

**`components/sections/products.tsx`** — remove the PicklePal entry (line ~223,
including `href: "https://picklepalph.com"`) and its `PicklePalIcon` component
(line ~56). Leave Hooper alone unless told otherwise; only PicklePal was asked
for.

**`app/studio/page.tsx`** (line ~53) — the workflow-automation description uses
PicklePal as its worked example:

> "…Like the PicklePal partner-onboarding review: Submissions checked by AI,
> decided, recorded, and emailed automatically."

Keep the capability, drop the name. Rewrite the example generically, e.g.:

> "Multi-step pipelines that validate, score, route, and act on your incoming
> data — then write results back and notify the right people. A partner
> application, for instance: submissions checked automatically, decided,
> recorded, and answered by email."

Check for any other occurrence before finishing — `grep -rn PicklePal app
components lib`.

---

## 2. Remove the "Open preview" button inside the Chroma Fairy live sample

**`components/chroma-fairy-showcase.tsx`, line ~90.** The device frame carries
a floating `Open preview ↗` link in its bottom-right corner. Delete it — the
page already has a **Visit the live site** CTA in the hero, and two links to
the same destination in one viewport is noise.

Remove the whole `preview.type === "live" ? <a …>Open preview…</a> : null`
expression. If `ArrowUpRight` or the `href` field on the preview object become
unused afterwards, remove those too rather than leaving dead code.

---

## 3. Decouple the sphere background from carousel dragging

**Symptom:** swiping through the Chroma Fairy sample carousel makes the
particle-sphere background react, as though the user were dragging the sphere.

**Cause:** `components/home-default-sphere.tsx` lines ~852-854 attach its drag
handlers to `window` **in the capture phase**:

```js
window.addEventListener("mousedown", onMouseDown, true)
window.addEventListener("mousemove", onMouseMove, true)
window.addEventListener("mouseup",   onMouseUp,   true)
```

The sphere is `pointer-events-none fixed inset-0`, so it never receives events
itself — listening on window in capture is how it gets them at all. But capture
on window means it sees **every** pointer interaction on the page before the
element under the cursor does, including an Embla carousel drag.

**Do not try to fix this from the carousel side.** `stopPropagation()` in the
carousel cannot help: the sphere's capture listener on `window` has already run
by the time any handler on the carousel fires.

**Fix it in the sphere, generically.** Add an opt-out check at the top of each
of the three handlers:

```js
if ((event.target as Element)?.closest?.("[data-sphere-ignore]")) return
```

Then mark the carousel in `components/chroma-fairy-showcase.tsx` with
`data-sphere-ignore` on the element that wraps the slides.

Make it generic rather than Chroma-Fairy-specific. The sphere is mounted on
seven pages — `app/studio`, `app/products/smart-storage`,
`app/products/chroma-fairy`, `app/products/smart-dashboard`,
`app/admin/partners`, `app/partner/dashboard`, `app/partner/[slug]` (and
`[slug]/dashboard`) — so any draggable or swipeable UI on any of them has this
same bug today. A `data-sphere-ignore` attribute fixes all of them and is the
thing to reach for next time.

Also apply the same guard to the matching touch path if one exists; if the
sphere currently only listens for mouse events, leave touch alone and say so
in your report rather than adding new listeners.

---

## Verification

- `pnpm build` and `pnpm lint` pass
- On `/products/chroma-fairy`: the floating "Open preview" control is gone, the
  hero "Visit the live site" CTA still works, and dragging the carousel leaves
  the background completely still
- Dragging anywhere **outside** a `data-sphere-ignore` region still moves the
  sphere as before — do not disable the interaction, only exclude the carousel
- `grep -rn "PicklePal" app components lib` returns nothing
