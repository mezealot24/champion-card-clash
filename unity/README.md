# Champion Card Clash · Unity port (spike)

The web game (repo root, `src/engine`) stays the source of truth and keeps shipping. This folder ports the same rules
to Unity 6 / C# as an engine-learning path. Nothing here is used by the web build.

| Folder | What |
| --- | --- |
| `CardClash.Core/` | The game rules in plain C# (no `UnityEngine`), a local Unity package. Port of `src/engine`. |
| `CardClash.Core.Tests/` | `dotnet test` project: replays matches recorded from the TS engine and checks every turn matches. |
| `ChampionCardClash/` | The Unity project (Unity 6.6, `6000.6.7f1`). Uses the core package via `Packages/manifest.json`. |
| `tools/export-golden.ts` | Records the golden replays from the TS engine and generates `TuningDefaults.g.cs`. |

## Open it (Windows, PowerShell)

```powershell
cd D:\projects\champion-card-clash\champion-card-clash
git pull
git checkout claude/project-thread-ssl1ma   # until the PR is merged
unity open .\unity\ChampionCardClash
```

Then press **Play**. A battle demo appears in any scene (no scene setup needed): pick two champions and play
Strike / Block / Charge against a random AI. Cards load from Supabase using the web project's `.env`
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`); without it the demo uses a built-in sample deck.

First open: Unity creates `Library/` (ignored) and `.meta` files next to the package scripts. Commit the `.meta` files.

## Tests

```powershell
dotnet test .\unity\CardClash.Core.Tests          # needs the .NET 8 SDK
npx vite-node unity/tools/export-golden.ts        # re-record after the TS engine changes
```

## Milestones

1. **Core rules** (done): clash, Strike chain, Field, Block / Parry / Shield order, Charge break, Block streak,
   class resources + S costs, Energy Surge, signature combos, Mark of Assassin, Guard Crush, seeded RNG
   (same seed = same match as the web).
2. **Card effects**: compile `cards.effect_json` (`src/engine/effects/spec.ts`, `primitives.ts`).
3. **Styles** (`src/engine/styles.ts`) and **Loadout** (Sigils, Ascendancy: `loadout.ts`).
4. **AI** (`ai.ts`), then real UI: Arena with the pose sprites.

Each milestone adds its own golden replays, so the C# port can't drift from the web rules.
Unity uses C# 9: keep `LangVersion` 9 features only (no file-scoped namespaces, no `required`).
