# Assassin Ascendancy Four Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Assassin `AS:2` Ascendancy tree with the four attached paths—Execution, Crescendo, Pursuit, and Shadow—and make every T1/T2/capstone behavior playable.

**Architecture:** Keep the existing Style/loadout hook model. Generalize tree metadata and validation from the current two-branch/four-node assumption to support the Assassin four-branch, three-node tree, then implement the new nodes as per-player hooks and tuning changes. Extend only the engine hook data needed for partial Pierce, enemy-action awareness, and Parry/counter bookkeeping.

**Tech Stack:** TypeScript, Vitest, React/Vite, existing `StyleDef` and loadout registry.

**Spec:** User attachment `C:/Users/Mezealot/.codex/attachments/369b2cc6-f718-4be2-8817-11b21c5ac37d/pasted-text.txt`.

## Global Constraints

- Preserve unrelated dirty changes in `src/engine/styles.ts`, `src/engine/tuning.ts`, and `src/engine/__tests__/styles.test.ts`.
- `AS:2` has four branches, each with T1, T2, and a capstone; the capstone remains the last node in its branch.
- Keep Ascendancy numbers tunable through the existing `champion_styles.params`/`TUNING_FIELDS` path.
- Keep existing card Pierce and existing non-Assassin trees working.

## Review Focus

- Old saved/invalid node ids must not apply after the tree changes; test style-aware validation and legal C/D branches.
- A blocked Critical must still receive the correct Feint/Hunt/Build-up interactions; test both normal and blocked outcomes.
- Critical counters must be correct across Charge, Block, Critical reset, and blocked-Critical skip cases.
- Shadow Mark must consume the mark on the next Strike, break Parry/Shield before hit resolution, and reduce the owner's Block effectiveness.
- Mirror players must retain independent Assassin tuning and loadout behavior.

---

### Task 1: Lock the four-path contract with failing tests

**Files:**
- Create: `src/engine/__tests__/assassin-ascendancy.test.ts`
- Modify: existing test helpers only if needed for reusable game setup.

**Interfaces:**
- Consumes: `TREES`, `validAsc`, `createGame`, `resolveTurn`, and `tuningOf`.
- Produces: regression coverage for tree shape plus Execution, Crescendo, Pursuit, and Shadow behavior.

- [ ] **Step 1: Write tests** for the four branches, three nodes per branch, capstone cost lines, style-aware C/D validation, and the attached default numbers/effects.
- [ ] **Step 2: Run `pnpm.cmd test -- src/engine/__tests__/assassin-ascendancy.test.ts`** and verify it fails because the current tree and hooks do not implement the new contract.

### Task 2: Implement data shape, loadout selection, and engine hooks

**Files:**
- Modify: `src/engine/loadoutData.ts`
- Modify: `src/engine/loadout.ts`
- Modify: `src/engine/styles.ts`
- Modify: `src/engine/engine.ts`
- Modify: `src/pages/loadout/LoadoutBuilder.tsx`
- Modify: `src/pages/loadout/loadout.ts` if style-aware point handling requires it.

**Interfaces:**
- Consumes: failing tests from Task 1 and existing `StyleDef`/loadout APIs.
- Produces: four-branch `AS:2` tree, valid C/D node selection, and playable node effects with per-player state.

- [ ] **Step 1: Generalize tree metadata and UI labels** to use branch letters and configured depth, while preserving current A/B 4-node trees.
- [ ] **Step 2: Implement the attached node text/defaults and register every `AS:2` node.** Use named tuning fields for multi-value nodes and capstone costs.
- [ ] **Step 3: Add the minimal hook plumbing** for enemy action/field snapshots, partial Pierce, Parry counts, and percentage Block reduction.
- [ ] **Step 4: Implement Execution, Crescendo, Pursuit, and Shadow behavior** in `NODE_FX`, keeping all state per player.
- [ ] **Step 5: Run the focused test file** and verify it passes.

### Task 3: Verify the repository change

**Files:**
- No new production files; update only tests or docs if verification exposes a real regression.

- [ ] **Step 1: Run `pnpm.cmd test`** and record the complete result.
- [ ] **Step 2: Run `pnpm.cmd exec tsc -b` and `pnpm.cmd lint`** and record the complete result.
- [ ] **Step 3: Inspect `git diff` and `git status --short`** to confirm only owned Assassin/tree/plumbing/docs/test paths changed and the pre-existing dirty files remain intact.
