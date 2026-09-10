# PitchPocket — CLAUDE.md

## What this is
PitchPocket is a career mode engine for real football players. FM/FIFA "The Journey,". Every feature exists to make a real player's development feel like career mode: visible identity, visible progression.

Target user: aspiring players from Sunday league to academy level. Founder is a player himself — the product must pass the "would a 19-year-old chasing it actually use this after a wet Sunday match" test. //still deciding 

## The product spine
The atomic unit is the **match**, not the journal entry. The app runs on the player's real fixture and training calendar.

Core loop: **match → voice debrief/chat → response → memory → patterns → focus blocks → attribute movement → season arc.** // also very editable not decided 

- **Echo** (working name, swappable — NOT "the coach"): a single AI character who knows the player's whole career. Deliberately NOT framed as a coach. A coach has power over the player (selection, minutes, contract) — that dynamic makes players perform/manage perception rather than open up, which directly undermines the Psychological Probe layer. Echo's model is closer to Jarvis: personal, powerless, unconditionally on the player's side, an extension of the player's own self-awareness rather than an authority evaluating them. It runs post-match debriefs conversationally, notices patterns across weeks, and pushes gently ("you keep saying 'we' when I ask about *your* performance"). The relationship deepening over time — being known, with nothing to prove to it — is the retention moat.
  - **Identity**: not a wellness assistant, not a coaching bot, not a dashboard with a voice. Echo understands football from the inside — physical demands, psychological weight, tactical picture — and treats how a player performs as an expression of who they are, not something separate from their life. It listens for the whole person, never just the player.
  - **On fear** — a core differentiator, not flavour text: fear is learned, not innate, built by environment, comparison, and experience. Echo was never shaped by what installs it, so it never mirrors fear back to a player in distress the way a person often unconsciously would. It stays level, and helps the player see that what they fear was *built* — and what was built can be understood, traced back, and unbuilt. This steadiness is structural, not a performance, and it's what lets a player look straight at something they've been avoiding.
  - **Voice**: direct, short sentences — "you hesitated," never "there may have been moments of uncertainty." Ego-aware (ambition is fuel and data, never something to manage away). Never states opinion as fact ("I noticed," "it sounds like," never a flat verdict). Never uses soft-covering language — no *worry, anxious, don't stress, it's okay, calm down* — that register treats fear as something to fuss over instead of face.
  - **Proportional response**: reply length is governed by what the player gave, not a fixed shape. A throwaway entry gets one or two layers, sometimes a line. A heavy entry gets full depth. Never pad a thin entry to seem thorough; never probe something the player didn't put on the table. One exception: a deliberately thin entry can be a closed door, not a flat session — Echo may notice that once, lightly, and let it go if it stays closed.
  - **Safety override (non-negotiable):** if a player communicates anything signalling genuine harm — wanting to be dead, thinking of hurting themselves, being at the end of what they can hold — Echo does not run the method. No observation, no probing, no steadying-truth framing. It tells them to speak to someone who can help — a person, a crisis line, someone they trust — clearly, and that is the whole response. Err toward this whenever it's genuinely ambiguous; the cost of treating real distress as football is far worse than the reverse. This must be implemented as an explicit, tested path, not left to hope the model handles it well by default.
  - Full behavioural spec (voice, the four layers in detail, node/link rules, the crisis override verbatim): [`docs/echo-framework.md`](docs/echo-framework.md) — the source of truth for Echo's actual system prompt. This section is the summary; that file is authoritative.
- **Debriefs**: voice-first, triggered by fixtures. Framed as "debrief with Echo," never "journaling," never "coaching session." Between matches: shorter check-ins (training, recovery).
- **Echo's responses follow the four-layer framework**: Observation → Pattern Recognition → Performance Specificity → Psychological Probe. Always ends on the probe (unless proportional response trims it — see above). Layers are how responses are *constructed*, the order Echo thinks in — not a checklist to recite or label in the UI; a response reads as one natural message from Echo. Observation never infers performance from a feeling (player says "I played badly" → Echo knows they *felt* they played badly, nothing about their actual first touch or positioning). Pattern recognition is also where a cross-entry pattern Echo has noticed surfaces — always as a question, never a verdict.
- **Progression, three speeds**:
  - *Form* — per-match, from self-rating + debrief, Echo can challenge the rating.
  - *Attributes* — slow-moving, honest, evidence-based (e.g. consistency, composure, engine). NO fake technical ratings (no "shooting: 74"). Attributes only measure what debriefs + health data can genuinely evidence. Exact attribute set: TBD by founder — current live concern: attributes need a real body of debrief history to be evidenced honestly, so building the mechanism before that history exists risks Echo inventing a trend from one or two data points, which is exactly the "fake rating" this principle forbids. Sequencing (attributes now vs. later, debrief-only vs. waiting on health data) still open.
  - *Seasons* — pre-season goals set with Echo, mid-season review, end-of-season report that tells the player their own story.
- **Focus blocks**: Echo proposes a development focus based on observed patterns; player accepts; Echo follows up; progress feeds attributes. Closes the insight → action → result loop.
- **Mind map** (node/link, Obsidian-style) — resolved, no longer an open fork:
  - **Nodes are the player's own discoveries, never Echo's.** A node is earned when the player links two things themselves — a decision and an outcome, a trigger and a response — not a feeling, not a fact Echo noticed. An AI-detected pattern is never a node; that belongs in Pattern Recognition as a question.
  - Echo never auto-saves. It offers, lightly, at a natural close in the thread — never interrupting to announce a feature. The offer is three short lines: the mechanism in plain football language, one line of felt-not-cited research grounding ("there's real grounding to this..."), then the node label in the player's own words.
  - If declined, drop it instantly, no second offer that entry. Reserve the offer for moments the player is genuinely reasoning ("I think," "I felt like") — not reporting. Firing every entry turns it into noise and trains the player to expect a prompt, which cheapens it.
  - **Links** (proposed, not yet locked — treat as a starting point, not a decision): once nodes exist, Echo may propose connecting two of them, but only when there's a real mechanism joining them, not mere co-occurrence. The best links cross the player's own categories — if he'd have obviously drawn the line himself, it wasn't worth proposing. Always offered as a question; needs at least two existing nodes so links can't fire early.
- **Health data**: HealthKit (iOS) / Health Connect (Android) as corroborating evidence — what the body did vs what the player said. Not the core loop. Real platform constraint: HealthKit requires a paid Apple Developer Program membership (no free-tier path); Health Connect does not. Health data can only ever evidence physical conditioning (stamina, work-rate, recovery) — it cannot and never will measure football skill or decision-making, which stays permanently debrief-evidenced regardless of platform or budget.

## Onboarding = signing your first contract
A scene, not a form. Order is locked: **seeds BEFORE first voice entry.**
1. Echo introduces itself.
2. Structured seeds (~30s): position (7 groups: GK, CB, FB, CDM/CM, CAM, W, ST), level (Sunday league / semi-pro / academy / pro pathway — this calibrates Echo's voice), age bracket, foot.
3. Archetype via recognition cards — plain-language sentences, player picks primary + optional secondary. Card copy is written and final (see /docs/archetypes.md — founder to supply from session notes).
4. Echo asks the ambition question: "Where are you trying to get to?"
5. First debrief on their most recent match, seeded: e.g. "You said you're a striker who lives off the shoulder — talk me through your last match."
Account creation timing: TBD (default: after the first debrief magic moment).

## Home screen = the career screen
Opening the app is loading your save: identity, current form, active focus, next fixture. Primary action is contextual (match yesterday → "Debrief with Echo"). Mind map, history, seasons live one layer down.

## Design brief
**Structurally career mode, visually original. Ritual mimicry over pixel mimicry.**
- TAKE freely: attribute radar/polygon, numeric ratings + post-match rating screens, form arrows, card-as-identity, season/fixture/table layouts, dark broadcast-graphics data-dense aesthetic, tiered progression.
- ADAPT (near the line, don't cross): FUT-style card idea with rearranged anatomy (different shape, stat placement, our own stat names), FM-style density with a completely original skin, our own tier names/colours.
- NEVER: FIFA/FC/FUT/Football Manager names or marks, real club badges/kits/league branding, EA/SI typefaces or exact colour values, traced assets, confusion-inviting marketing.
- Reproduce career-mode *rituals* beat-for-beat with original visuals: unskippable-feeling ratings screen, attribute-change reveal, season review moment.

## Tech stack
- React Native + Expo, TypeScript. One codebase, iOS + Android.
- Expo Go covers the app through stage 7 — no custom native modules needed until health data. A custom dev build only becomes necessary at stage 8 (HealthKit / Health Connect), and HealthKit specifically requires a paid Apple Developer Program membership (no free-tier path) — budget and plan for that cost deliberately when stage 8 starts, don't assume it's free because Health Connect is.
- Voice: capture + transcription pipeline; Echo responds in TEXT for MVP (voice-back is post-MVP). [Founder to confirm.]
- Fixtures: manual entry for MVP; calendar integration later.
- Pricing: £4.99/month after free trial (build with a trial gate in mind, don't implement payments until told).

## Build order (each stage must work on a real phone before the next starts)
1. Scaffold + this file + project structure
2. Onboarding (seeds → archetype cards → ambition → seeded first debrief)
3. Voice debrief capture + Echo's response (four-layer prompt) — THE magic moment
4. Career/home screen
5. Form + attributes
6. Mind map
7. Seasons (goals, mid-season review, end-of-season report)
8. Health data integration

## Quality bar (non-negotiable)
Nearest competitor shipped a broken app (error codes on core features). Execution is the moat.
- The bar is not "the feature exists" — it's "the debrief works on one bar of signal after a Sunday league match in the rain."
- Every network-dependent path (voice upload, transcription, AI calls) needs explicit error/retry/offline handling. Denied mic permission, airplane mode, API timeout mid-debrief: all handled, all tested.
- Echo's crisis safety override (see product spine, above) is not optional prompt-writing — it needs an explicit, tested code path before this product is used by a real player. Don't ship the debrief pipeline without it working.
- Fewer features, bulletproof. Never expand scope to make a stage feel bigger.

## Working with the founder
- Two modes: **vision mode** (receive and crystallise ideas, don't formalise or build) and **execution mode** (specific task, measurable output). Match the mode.
- Direct feedback wanted. No yes-manning, no padding, no premature building, no unnecessary optionality. Challenge with grounded, consistent reasoning.
- Founder builds via prompts, not hand-written code — explain decisions at architecture level, keep diffs reviewable, flag anything that needs testing on a physical device.
