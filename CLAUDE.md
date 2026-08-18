# PitchPocket — CLAUDE.md

## What this is
PitchPocket is a career mode engine for real football players. FM/FIFA "The Journey," but the player is the save file and the career is their actual life. Every feature exists to make a real player's development feel like career mode: visible identity, visible progression, a story arc they're the protagonist of.

Target user: aspiring players from Sunday league to academy level. Founder is a player himself — the product must pass the "would a 19-year-old chasing it actually use this after a wet Sunday match" test.

## The product spine
The atomic unit is the **match**, not the journal entry. The app runs on the player's real fixture and training calendar.

Core loop: **match → voice debrief with the coach → coach response → memory → patterns → focus blocks → attribute movement → season arc.**

- **Echo** (working name, swappable — NOT "the coach"): a single AI character who knows the player's whole career. Deliberately NOT framed as a coach. A coach has power over the player (selection, minutes, contract) — that dynamic makes players perform/manage perception rather than open up, which directly undermines the Psychological Probe layer. Echo's model is closer to Jarvis: personal, powerless, unconditionally on the player's side, an extension of the player's own self-awareness rather than an authority evaluating them. It runs post-match debriefs conversationally, notices patterns across weeks, and pushes gently ("you keep saying 'we' when I ask about *your* performance"). The relationship deepening over time — being known, with nothing to prove to it — is the retention moat.
- **Debriefs**: voice-first, triggered by fixtures. Framed as "debrief with Echo," never "journaling," never "coaching session." Between matches: shorter check-ins (training, recovery).
- **Echo's responses follow the four-layer framework**: Observation → Pattern Recognition → Performance Specificity → Psychological Probe. Always ends on the probe. Layers are how responses are *constructed*; whether they're visibly labelled in UI is undecided (default: hidden, response reads as one natural message from Echo).
- **Progression, three speeds**:
  - *Form* — per-match, from self-rating + debrief, Echo can challenge the rating.
  - *Attributes* — slow-moving, honest, evidence-based (e.g. consistency, composure, engine). NO fake technical ratings (no "shooting: 74"). Attributes only measure what debriefs + health data can genuinely evidence. Exact attribute set: TBD by founder.
  - *Seasons* — pre-season goals set with Echo, mid-season review, end-of-season report that tells the player their own story.
- **Focus blocks**: Echo proposes a development focus based on observed patterns; player accepts; Echo follows up; progress feeds attributes. Closes the insight → action → result loop.
- **Mind map** (node/link, Obsidian-style): the destination the data engine feeds. Open fork: Echo-surfaces-patterns vs player-discovers-them (leaning: Echo hints, player explores/confirms, confirmed insights become nodes). Resolve when this stage is reached, not before.
- **Health data**: HealthKit (iOS) / Health Connect (Android) as corroborating evidence — what the body did vs what the player said. Not the core loop.

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
- Expo development build required early (HealthKit / Health Connect native modules) — set up for dev builds from the start, don't retrofit.
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
- Fewer features, bulletproof. Never expand scope to make a stage feel bigger.

## Working with the founder
- Two modes: **vision mode** (receive and crystallise ideas, don't formalise or build) and **execution mode** (specific task, measurable output). Match the mode.
- Direct feedback wanted. No yes-manning, no padding, no premature building, no unnecessary optionality. Challenge with grounded, consistent reasoning.
- Founder builds via prompts, not hand-written code — explain decisions at architecture level, keep diffs reviewable, flag anything that needs testing on a physical device.
