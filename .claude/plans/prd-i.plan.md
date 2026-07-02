# Plan: PRD-I — 코드베이스 통합 & 디자인 통일 (Integration & Design Unity)

**Source PRD**: `docs/진행중/PRD-I.md`
**Selected scope**: Design-unity spine (§3) + Guided-as-repeatable-mode (F4) + lifecycle framing (F1) — with F2/F3/F6/F7/F8 **re-hosted/re-skinned** (already built) and F5/F9 **scoped down**.
**Complexity**: Large (but ~60% is re-hosting existing components, not net-new)

---

## Summary

PRD-I is a UX *integration* PRD, not a feature PRD. The exploration confirms its core premise and then some: **most of the "new" cards already exist and are wired — but into the wrong host.** The rich guided flow (domain → pattern → term/drift/bridge) lives inside `EmptyState.tsx` as a first-run overlay that vanishes once the canvas has any nodes, while the everyday `NewNodePopover` crams dedup + governance + enrichment + critic into a 260px scroll column. The same conceptual decisions live in two places with two visual languages, and the guided path is a dead end after first use. This plan makes one card grammar, makes Guided a repeatable mode reachable any time, and adds a draft→confirm→publish lifecycle indicator — while **pushing back on the PRD's most disruptive/expensive asks**.

---

## Critical review — how PRD-I changes current UX, and where I disagree

### What the PRD gets right (build it)
- **§3 unified card grammar** — highest leverage. Today there are 5+ badge systems (dedup / gap-kind / source-type / severity / governance-kind) and every card (`EnrichmentCard`, `GovernanceProposalCard`, `TermConfirmCard`, `DriftDecisionCard`, `BridgeSuggestCard`, `ActionCard`, `CandidatePairCard`) has its own anatomy. They are already **standalone and prop-driven**, so extracting a shared `<ConfirmCard>` shell (verdict → evidence → preview → action) + one badge taxonomy is realistic and makes everything downstream cheaper. This is the spine.
- **F4 Guided-as-repeatable-mode** — the real "과적재 해소." The pattern flow (`PatternDiscoveryPanel` → `PatternReviewSequence`) is a genuine step-runner but only mounts from `EmptyState` when the canvas is empty. Promoting it to a first-class mode reachable at any time, and re-hosting the popover's overloaded cards into the same dock, is the headline win.
- **F1 lifecycle framing** — users currently can't tell "am I in draft / committed / published." `CommitBar` shows ADD/MOD/DEL counts but no lifecycle; publish lives in a separate `NeoConfirmSheet`. A tri-state indicator is a cheap, real orientation win.

### Where I push back (scope down, do NOT follow the PRD literally)
1. **F5 "live canvas assembly" — do NOT retrofit streaming into Quick, and the hard part is already done.** The PRD says GraphCanvas is "React Flow + ELKjs" and asks for "ELKjs incremental relayout." **Factually wrong:** the canvas is **Cytoscape + Cola**, which already does continuous incremental physics, and `usePatternGeneration` already does progressive batched insertion (`scheduleInsertion`/`applyBatchesSequentially`). So F5's expensive parts (streaming LLM + incremental relayout) are either unnecessary or solved. **Selection:** F5 = route the unified Guided generation through the existing progressive insertion; **no** streaming-LLM, **no** Quick-mode retrofit (Quick's preview-then-confirm is clearer for 1–2 nodes).
2. **F1 "promote CommitBar to a top strip" — relocation is disruptive; do framing, not relocation.** Moving a working bottom bar to the top risks layout regression for zero functional gain. **Selection:** add a compact **lifecycle indicator** (draft/confirmed/published + validation chips) that reuses CommitBar's existing actions and wires "publish" to the existing `NeoConfirmSheet`. Keep the bar where it is.
3. **F9 "reorg RightPanel into 4 tabs" — additive, not destructive; respect the confidence-hidden decision.** RightPanel already surfaces `sourceType`/`evidence`. The real user value is **transparency (an 근거/evidence tab)**, not renaming the working AI + Cypher tabs (heavily used per node-expansion work). Also the PRD says "show confidence" but the codebase **deliberately hides confidence** ("재현 불가능한 신호" — system-audit M6). **Selection:** add a **근거(Evidence) tab** surfacing existing `sourceType`/`evidence`/`Attribution`; keep AI/Cypher tabs; do **not** force-collapse to exactly 4 tabs; keep confidence hidden (or qualitative bands only).
4. **F8 partition lanes on canvas — defer the visual lane grouping.** Bridge data (`isBridge`, bridge edge class, partition switch) already exists; the `BridgeSuggestCard` already surfaces candidates in the sequence. Full "partition레인 + hairball 방지" canvas layout is a larger graph-viz task with its own risk. **Selection:** ship bridge *confirmation* re-skinned to the grammar now; defer canvas lane visualization to a follow-up.

### Already built (work = re-host + re-skin, not build)
F2 (`DomainSummaryCard`), F3 (`PatternDiscoveryCard`/`CachePromotionCard`, `discoverPatternApi`), F6 (`TermConfirmCard`, `termsApi`), F7 (`DriftDecisionCard`, `driftApi`), F8-card (`BridgeSuggestCard`, `bridgesApi`), and the `PatternReviewSequence` orchestration + `buildHitlPlan` all exist and are tested. The PRD-I work for these is: (a) re-skin to the §3 grammar, (b) make them reachable from the repeatable Guided mode (not just EmptyState), (c) fold the popover's dedup/governance/enrichment/critic cards into the same dock.

---

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Standalone card props | `features/ontology/components/preview/GovernanceProposalCard.tsx`, `terms/TermConfirmCard.tsx` | Pure presentational card: structured data + callbacks, no internal fetch/state → the shape `<ConfirmCard>` must preserve |
| Step-runner | `components/patterns/PatternReviewSequence.tsx:79` | `steps[]` derived from data, `stepIndex` advances on confirm, summary at end → extend this, don't rebuild |
| HITL planning (pure) | `lib/patterns/hitl.ts:82` (`buildHitlPlan`) | Pure function decides which cards to surface → extend to include dedup/governance/enrichment/critic steps |
| Generation pipeline | `hooks/usePatternGeneration.ts:48` | parse → enforce roles → map → detect terms → collect drift → progressive insertion → returns review data |
| Sheet phase machine | `components/neo4j/NeoConfirmSheet.tsx:22` | `loading→confirm→pushing→result` + `motion/react` → mirror for any new sheet; reuse as F1 "publish" detail |
| Design tokens | `app/globals.css:37-40,170-174` | `--radius*` + `--chart-*` (HSL, **not** oklch); no `--role-*` yet → add role tokens here in HSL to match, not oklch |
| Store slices | `store/{entity,ui,history}-slice.ts` | add `mode`/`journey` UI state to `ui-slice.ts`, not a new store |
| Tests | `components/patterns/DriftDecisionCard.test.tsx`, `PatternReviewSequence.test.tsx` | Vitest + Testing Library, behavior-focused → mirror for `<ConfirmCard>` and journey host |

---

## Files to Change

| File | Action | Why |
|---|---|---|
| `app/globals.css` | UPDATE | Add `--role-*` tokens (증상/원인/점검/조치/부품/행정) in **HSL** w/ light+dark, mapped from existing category colors |
| `components/ui/confirm-card/ConfirmCard.tsx` | CREATE | §3 shared shell: verdict → evidence → preview → action slots |
| `components/ui/confirm-card/ConfirmBadge.tsx` | CREATE | §3 badge taxonomy (reuse/relate/possible_duplicate/new/extend/fork/pass/block) + confidence, role-token colored |
| `components/preview/GovernanceProposalCard.tsx` | UPDATE | Re-skin onto `<ConfirmCard>` |
| `components/preview/EnrichmentCard.tsx` | UPDATE | Re-skin; reframe as term/concept sourcing (F6 framing) |
| `components/patterns/{DomainSummary,PatternDiscovery,Drift*}Card.tsx` | UPDATE | Re-skin onto `<ConfirmCard>` |
| `components/terms/TermConfirmCard.tsx`, `bridge/BridgeSuggestCard.tsx`, `er/CandidatePairCard.tsx`, `ai/ActionCard.tsx` | UPDATE | Re-skin onto `<ConfirmCard>` |
| `lib/patterns/hitl.ts` | UPDATE | Extend `buildHitlPlan` to also plan dedup/governance/enrichment/critic steps |
| `components/patterns/PatternReviewSequence.tsx` | UPDATE | Extend step-runner to render the popover-origin cards as steps |
| `store/ui-slice.ts` | UPDATE | Add `entryMode: 'quick'\|'guided'`, journey/dock state |
| `components/journey/JourneyStepper.tsx` | CREATE | shadcn Sidebar-based stepper (left rail), collapsible + mobile Sheet |
| `components/journey/ConfirmDock.tsx` | CREATE | Right-side dock hosting the current step's `<ConfirmCard>` (reuses RightPanel tab host or Sheet) |
| `components/journey/GuidedJourney.tsx` | CREATE | Orchestrator: stepper + dock + progressive canvas insertion; reachable outside EmptyState |
| `app/page.tsx` | UPDATE | Mode toggle (Quick/Guided auto-suggest, user-final); mount GuidedJourney; wire lifecycle indicator |
| `components/CommitBar.tsx` | UPDATE | Add tri-state lifecycle indicator + validation chips; keep position/actions |
| `components/EmptyState.tsx` | UPDATE | Route "패턴으로 시작" into the shared GuidedJourney (dedupe overlay logic) |
| `components/NewNodePopover.tsx` | UPDATE | Extract stacked cards to shared cards; offer "Guided로 전환" when input is large |
| `components/RightPanel.tsx` | UPDATE | Add **근거(Evidence)** tab (additive) surfacing `sourceType`/`evidence`/`Attribution` |
| `ui/sidebar.tsx` | CREATE | `npx shadcn@latest add sidebar` (shadcn primitive, not a new library) |

---

## Milestones & Tasks

> Ordering is dependency-driven: the card grammar (M1) is the foundation everything else consumes. M2 (Guided host) delivers the headline value. M1 + F1-indicator can land first; M3–M5 re-host/re-skin the already-built pieces.

### M1 — §3 Card grammar + role tokens (foundation)
- **Task 1.1 Role tokens.** Add `--role-{symptom,cause,check,action,part,admin}` to `globals.css` (HSL, light+dark), derived from existing category/`--chart-*` colors. SVG/badge/edge all reference the same token.
  - **Validate**: light/dark visual check; `npm run build`.
- **Task 1.2 `<ConfirmCard>` shell + `<ConfirmBadge>`.** Verdict/evidence/preview/action slots; badge taxonomy incl. new verdicts (extend/fork/pass/block) + confidence rendering (respect confidence-hidden policy → qualitative or opt-in).
  - **Mirror**: standalone prop shape of `GovernanceProposalCard`.
  - **Validate**: new Vitest test mirroring `DriftDecisionCard.test.tsx`.
- **Task 1.3 Re-skin all existing cards** onto `<ConfirmCard>` (governance, enrichment, dedup, critic, domain, pattern, drift, term, bridge, action, candidate-pair). Behavior unchanged.
  - **Validate**: existing card tests stay green; snapshot the shared anatomy.

### M2 — Guided journey host + confirm dock (F4, the 과적재 해소)
- **Task 2.1** Install shadcn `sidebar`; build `JourneyStepper` (collapsible, mobile→Sheet).
- **Task 2.2** Build `ConfirmDock` hosting current step's card (reuse RightPanel tab host).
- **Task 2.3** Build `GuidedJourney` orchestrator; add `entryMode` + journey state to `ui-slice.ts`; make it launchable from anywhere (toolbar), not just empty canvas.
- **Task 2.4** Route `EmptyState` "패턴으로 시작" through `GuidedJourney` (single code path).
- **Validate**: manual — non-empty canvas can launch Guided; **no single screen requires >3 decision types at once** (PRD §6 gate); Vitest for stepper progression.

### M3 — Fold popover decisions into the journey (F2/F3/F6/F7/F8 re-host)
- **Task 3.1** Extend `buildHitlPlan` (`lib/patterns/hitl.ts`) to also plan dedup/governance/enrichment/critic steps.
- **Task 3.2** Extend `PatternReviewSequence` (or GuidedJourney) to render those steps via the same `<ConfirmCard>`.
- **Task 3.3** In `NewNodePopover`, when input is large/CSV, surface "Guided로 전환"; keep Quick preview intact for short input (regression-zero).
- **Validate**: Quick short-input path unchanged (PRD §6 "동작·성능 회귀 0"); Guided runs term→drift→bridge→dedup→governance as separate steps.

### M4 — Lifecycle framing (F1, scoped: indicator not relocation) + live assembly (F5, scoped)
- **Task 4.1** Add draft→confirmed→published tri-state indicator + validation chips (CQ/연결) to `CommitBar`; wire "publish" to existing `NeoConfirmSheet`. Keep bar position/actions.
- **Task 4.2** Route Guided generation through existing `usePatternGeneration` progressive insertion (Cola already incremental). No streaming-LLM, no Quick retrofit.
- **Validate**: state visible at all times (PRD §6); nodes appear progressively in Guided; `npm run build`.

### M5 — Evidence transparency (F9, scoped: additive tab)
- **Task 5.1** Add **근거(Evidence)** tab to `RightPanel` surfacing `sourceType`/`evidence`/`Attribution` (PRD-E data, exposure only). Keep AI/Cypher tabs; keep confidence hidden/qualitative.
- **Validate**: evidence visible per node; existing RightPanel tabs unregressed.

**Deferred (documented, not silently dropped):** F8 canvas partition-lane visualization; bridge suggestion outside the sequence; streaming-LLM live assembly; forced 4-tab RightPanel collapse; confidence numeric display.

---

## Validation

```bash
cd ontology
npm run lint
npm run build
npx vitest run          # card grammar + journey + re-skinned cards
```
- Design-unity checklist (PRD §5): hardcoded colors = 0 (grep for hex in new/changed components), lucide-only icons, all HITL cards on `<ConfirmCard>`, light+dark verified.
- Acceptance gates (PRD §6): Quick regression-zero; Guided reachable any time; ≤3 decision types per screen; lifecycle always visible.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Re-skinning many cards regresses tested behavior | High | Keep props identical; `<ConfirmCard>` is presentational only; run existing card tests after each |
| PRD's factual errors (React Flow/ELKjs/oklch) leak into impl | Med | Plan already corrects to Cytoscape+Cola / HSL tokens; verify against `useCytoscape.ts` + `globals.css` |
| Two Guided hosts (EmptyState overlay + new mode) drift | Med | M2.4 collapses to one code path before M3 |
| CommitBar / RightPanel changes disrupt working surfaces | Med | Framing/additive only; no relocation, no tab removal |
| Quick popover performance/behavior regression | Med | M3.3 leaves short-input path untouched; measure before/after |

## Acceptance
- [ ] `<ConfirmCard>` + role tokens shipped; every HITL card renders through it (light+dark)
- [ ] Guided mode launchable outside empty canvas; ≤3 decision types per screen
- [ ] Quick mode short-input path behaviorally + perf unchanged
- [ ] Lifecycle indicator always visible; publish → existing NeoConfirmSheet
- [ ] Evidence tab surfaces existing provenance; confidence remains hidden
- [ ] `npm run build` + `vitest run` green; patterns mirrored, not reinvented
