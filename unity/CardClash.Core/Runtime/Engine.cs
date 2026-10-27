// Turn resolver (port of src/engine/engine.ts). ResolveTurn never changes its input: it clones, resolves, returns the new state.
using System;
using System.Collections.Generic;
using System.Linq;
using static CardClash.Core.Game;

namespace CardClash.Core
{
    public static class Engine
    {
        static readonly Side[] SIDES = Keys.Sides;

        /// <summary>Per-turn bookkeeping shared by every effect this turn.</summary>
        class TurnEnv
        {
            public PerSide<List<CardInst>> HandAtStart;
            public PerSide<int> HitsBlocked = new PerSide<int>(), HitsParried = new PerSide<int>(), HitDmgTaken = new PerSide<int>(), BlockNow = new PerSide<int>();
            /// <summary>Hits each side took that Block didn't stop.</summary>
            public PerSide<int> HitsTaken = new PerSide<int>();
            /// <summary>Extra % dmg each side takes from hits this turn (Vulnerable), and its Chill cut.</summary>
            public PerSide<double> VulnPct = new PerSide<double>(), ChillPct = new PerSide<double>();
            /// <summary>Energy Surge this turn: Wraith Step (Block), Shroud (Charge), Elusive (Strike).</summary>
            public PerSide<bool> Wraith, Shroud, Elusive;
            public PerSide<List<HitIn>> HitsIn = new PerSide<List<HitIn>>(new List<HitIn>(), new List<HitIn>());
            public PerSide<int> ShieldHits = new PerSide<int>(), CleanPK = new PerSide<int>();
        }

        public static List<PlayerAction> LegalActions(GameState state, Side side)
        {
            var p = state[side];
            var o = new List<PlayerAction>();
            if (p.Hand.Count > 0 && !p.Has(StatusKind.NoStrike)) o.Add(PlayerAction.Strike);
            if (!p.Has(StatusKind.NoBlock)) o.Add(PlayerAction.Block);
            if (!p.Has(StatusKind.NoCharge)) o.Add(PlayerAction.Charge);
            return o.Count > 0 ? o : new List<PlayerAction> { PlayerAction.Block };
        }

        public static GameState ResolveTurn(GameState prev, PlayerAction p1, PlayerAction p2) => ResolveTurn(prev, new PerSide<PlayerAction>(p1, p2));

        public static GameState ResolveTurn(GameState prev, PerSide<PlayerAction> actions)
        {
            if (prev.Winner != null) return prev;
            foreach (var side in SIDES)
                if (!LegalActions(prev, side).Contains(actions[side])) throw new InvalidOperationException($"{side.Key()} cannot {actions[side].Key()} this turn");
            var state = prev.Clone();
            foreach (var side in SIDES)
            {
                state[side].DiscardedCards = new List<Discarded>();
                state[side].CutTaken = 0;
            }
            state.Events = new List<TurnEvent>();
            Log(state, $"p1 {actions[Side.P1].Key()} / p2 {actions[Side.P2].Key()}");

            var env = new TurnEnv { HandAtStart = new PerSide<List<CardInst>>(s => new List<CardInst>(state[s].Hand)) };
            // Energy Surge (Assassin): a full bar at the start of the turn is spent by the action picked
            var surge = new PerSide<int>();
            foreach (var side in SIDES)
            {
                var p = state[side];
                var def = ClassResources.Of(p.ChampionId, Tuning.Of(state, side));
                if (!state.Rules.Resources || p.ChampionId != ClassResources.SurgeChampion || def == null || p.Res < def.Cap) continue;
                char mode = actions[side] == PlayerAction.Block ? 'A' : actions[side] == PlayerAction.Charge ? 'B' : 'C';
                if (!ClassResources.SurgeModes.Contains(mode)) continue;
                surge[side] = p.Res;
                p.Res = 0;
                string what = mode == 'A' ? "Wraith Step (hits through Block deal only 1)" : mode == 'B' ? "Shroud (no charge break, half dmg)" : "Elusive (enemy Block stops 1 less)";
                Log(state, $"{side.Key()} Energy Surge: spends all {surge[side]} Energy → {what}");
            }
            bool SurgeOn(Side s, PlayerAction a) => surge[s] > 0 && actions[s] == a;
            env.Wraith = new PerSide<bool>(s => SurgeOn(s, PlayerAction.Block));
            env.Shroud = new PerSide<bool>(s => SurgeOn(s, PlayerAction.Charge));
            env.Elusive = new PerSide<bool>(s => SurgeOn(s, PlayerAction.Strike));

            // Styles that act on the action picked (Molten Shield), before statuses are read
            foreach (var side in SIDES) foreach (var h in Styles.HooksOf(state[side])) h.ActionStart(state, side, actions[side], actions[side.Other()]);

            // Silence: a side Silenced at the start of the turn has no card effects all turn
            foreach (var side in SIDES) state[side].Silenced = state[side].Has(StatusKind.Silence);
            foreach (var side in SIDES) state[side].SkillSilenced = state[side].Has(StatusKind.SkillSilence);

            // Every turn (before attack): right after actions are revealed, so its statuses count this turn
            ResolveHeld(state, actions, env, false);

            // Block size and True Damage come from statuses active this turn, read before they tick
            var blockStops = new PerSide<int>(s => BlockStopsFor(state, s));
            var trueDmg = new PerSide<bool>(s => state[s].Has(StatusKind.TrueDmg));
            var guardBreak = new PerSide<bool>(s => state[s].Has(StatusKind.GuardBreak));
            foreach (var side in SIDES) env.VulnPct[side] = state[side].Statuses.Where(s => s.Kind == StatusKind.Vulnerable).Sum(s => s.N ?? 0);
            // Chill (Cryomancer): the chilled side's hits deal N% less this turn
            foreach (var side in SIDES) env.ChillPct[side] = Elements.ChillCut(state[side], Tuning.Of(state, side.Other()));

            // statuses were checked above; they tick down now (new ones from this turn last into the next).
            // Shields tick at the end of the turn instead, so a Shield still guards this turn's hits.
            var oldShields = SIDES.SelectMany(side => state[side].Statuses.Where(s => s.Kind == StatusKind.Shield)).ToList();
            foreach (var side in SIDES)
            {
                var p = state[side];
                foreach (var s in p.Statuses) if (s.Kind != StatusKind.Shield) s.Turns--;
                p.Statuses.RemoveAll(s => s.Turns <= 0);
            }

            var cleanHits = ResolveStrikes(state, actions, env, blockStops, trueDmg, guardBreak);

            // Styles that react to this turn's hits
            foreach (var side in SIDES)
            {
                var enemy = side.Other();
                bool attacked = actions[enemy] == PlayerAction.Strike;
                var report = new HitReport
                {
                    Attacked = attacked, HitsTaken = env.HitsTaken[side], HitsBlocked = env.HitsBlocked[side], HitsParried = env.HitsParried[side],
                    ShieldHits = env.ShieldHits[side], Facing = attacked ? Math.Min(env.HandAtStart[enemy].Count, env.HandAtStart[side].Count) : 0,
                };
                foreach (var h in Styles.HooksOf(state[side])) h.AfterHits(state, side, report);
            }
            ResolveHeld(state, actions, env, true);

            foreach (var side in SIDES)
            {
                if (actions[side] != PlayerAction.Charge) continue;
                var p = state[side];
                if (actions[side.Other()] == PlayerAction.Strike && !env.Shroud[side])
                {
                    // Strike > Charge: Charge break. The oldest card goes under the deck, the rest move up a slot and
                    // 1 new card is drawn onto the end. A Style like Tenacity keeps the first slots safe.
                    int safe = Math.Max(0, Styles.HooksOf(p).Select(h => h.ChargeBreakSafe(state, side) ?? 0).DefaultIfEmpty(0).Max());
                    if (p.Hand.Count > safe)
                    {
                        var lost = p.Hand[safe];
                        p.Hand.RemoveAt(safe);
                        MarkDiscarded(state, side, new[] { new Discarded(lost, safe + 1, "Charge break") });
                        ToDeckBottom(state, side, new[] { lost });
                        Log(state, $"{side.Key()} loses {lost.Def.Id} (hit while Charging) → deck bottom, draws a new card");
                        DrawCards(state, side, 1);
                    }
                    else if (p.Hand.Count == 0)
                    {
                        // empty Field: nothing to lose, the Charge still draws 1
                        DrawCards(state, side, 1);
                    }
                    foreach (var h in Styles.HooksOf(p)) h.OnChargeBreak(state, side);
                }
                else
                {
                    int extra = Styles.HooksOf(p).Sum(h => h.ChargeDraw + h.ExtraChargeDraw(state, side));
                    DrawCards(state, side, state.Rules.ChargeDraw + extra);
                }
            }

            if (actions[Side.P1] == PlayerAction.Block && actions[Side.P2] == PlayerAction.Block)
            {
                state.BlockStreak++;
                if (state.BlockStreak >= state.Rules.BlockStreakDiscard)
                {
                    foreach (var side in SIDES)
                    {
                        var p = state[side];
                        MarkDiscarded(state, side, p.Hand.Select((card, i) => new Discarded(card, i + 1, "Block streak")));
                        ToDeckBottom(state, side, p.Hand);
                        p.Hand = new List<CardInst>();
                    }
                    state.BlockStreak = 0;
                    Log(state, $"Block vs Block {state.Rules.BlockStreakDiscard} times: both Fields discarded");
                }
            }
            else state.BlockStreak = 0;

            // class resources fill at the end of the turn, so what you earn now is spent next turn
            foreach (var side in SIDES)
            {
                var p = state[side];
                ClassResources.GainRes(state, side, new TurnSummary
                {
                    Action = actions[side], EnemyAction = actions[side.Other()], HitsTaken = env.HitsTaken[side], CleanHits = cleanHits[side],
                    CleanPK = env.CleanPK[side], FoeDmg = p.OtherDmg?[0] ?? 0, SelfDmg = p.OtherDmg?[1] ?? 0, HpPct = 100.0 * p.Hp / Math.Max(1, p.MaxHp),
                });
                p.OtherDmg = null;
            }
            // Dual Strike Styles (Sonic Bliz Acceleration): after resources fill, so a full bar stays full
            foreach (var side in SIDES)
            {
                if (actions[side] != PlayerAction.Strike) continue;
                var hooks = Styles.HooksOf(state[side]);
                var enemy = actions[side.Other()];
                // Mach Speed (Ascendancy): Strike into a Charge draws a little, no Energy
                if (enemy == PlayerAction.Charge)
                {
                    int draw = hooks.Sum(h => h.DualOnCharge(state, side));
                    if (draw > 0) Log(state, $"{side.Key()} Mach Speed: draws {DrawCards(state, side, draw)}");
                    continue;
                }
                if (enemy != PlayerAction.Strike) continue;
                var ds = Styles.Get(state[side].Style)?.DualStrike;
                if (ds == null) continue;
                int cap = ClassResources.Of(state[side].ChampionId, Tuning.Of(state, side))?.Cap ?? 0;
                if (ds.FillRes && state.Rules.Resources) ClassResources.AddRes(state, side, cap);
                int want = ds.Draw?.Invoke(Tuning.Of(state, side)) ?? 0;
                int n = want != 0 ? DrawCards(state, side, want) : 0;
                Log(state, $"{side.Key()} Acceleration (Dual Strike): {(ds.FillRes ? "Energy full, " : "")}draws {n}");
            }
            // end-of-turn draws from Styles/pieces (Cryomancer Flash Freeze)
            foreach (var side in SIDES)
            {
                if (state[side].Hp <= 0) continue;
                int want = Styles.HooksOf(state[side]).Sum(h => h.EndDraw(state, side));
                if (want > 0) Log(state, $"{side.Key()} ❄ Flash Freeze: draws {DrawCards(state, side, want)}");
            }
            foreach (var side in SIDES) foreach (var h in Styles.HooksOf(state[side])) h.EndTurn(state, side, actions[side], actions[side.Other()]);
            // Ignite burns at the end of every turn it's on (Pyromancer)
            foreach (var side in SIDES)
            {
                double cut = Math.Min(100, Styles.HooksOf(state[side]).Sum(h => h.BurnCutPct(state, side)));
                int burn = (int)Math.Floor(Elements.IgniteBurn(state[side], Tuning.Of(state, side.Other())) * (100 - cut) / 100);
                if (burn == 0) continue;
                LoseHp(state, side, burn);
                Log(state, $"{side.Key()} 🔥 Ignite {Elements.IgniteStacks(state[side])} stacks burn {burn}");
            }
            foreach (var side in SIDES)
            {
                var p = state[side];
                p.Silenced = false;
                p.SkillSilenced = false;
                p.Unpaid = null;
                // Shields from before this turn lose a turn; used-up or expired ones go
                foreach (var s in p.Statuses) if (oldShields.Contains(s)) s.Turns--;
                p.Statuses.RemoveAll(s => s.Kind == StatusKind.Shield && !(s.Turns > 0 && (s.N ?? 0) > 0));
                // for the lostHp condition ("you lost HP this turn or last turn")
                if (state.Events.Any(e => e.K == EventKind.Hp && e.Side == side && e.Delta < 0)) p.LostHpTurn = state.Turn;
            }

            var dead = SIDES.Where(s => state[s].Hp <= 0).ToList();
            if (dead.Count == 2) state.Winner = "draw";
            else if (dead.Count == 1) state.Winner = dead[0].Other().Key();
            state.Turn++;
            return state;
        }

        /// <summary>How many hits this side's Block stops: base rule + "Block ±N hit" statuses + loadout pieces (never below 0).</summary>
        static int BlockStopsFor(GameState state, Side side)
        {
            var p = state[side];
            int extra = p.Statuses.Where(s => s.Kind == StatusKind.BlockPlus).Sum(s => s.N ?? 1);
            int perks = Styles.HooksOf(p).Sum(h => h.BlockBonus(state, side));
            return Math.Max(0, state.Rules.BlockStopsHits + extra + perks);
        }

        class Outcome { public int Dealt; public bool Parried; public int Absorbed; }
        struct HitResult { public bool Blocked, Clean; }

        static PerSide<int> ResolveStrikes(GameState state, PerSide<PlayerAction> actions, TurnEnv env, PerSide<int> blockStops, PerSide<bool> trueDmg, PerSide<bool> guardBreak)
        {
            var handAtStart = env.HandAtStart;
            var deathMarked = new PerSide<bool>(s => state[s].Has(StatusKind.DeathMark));
            var strikers = SIDES.Where(s => actions[s] == PlayerAction.Strike).ToList();
            var pending = new PerSide<int>();
            var chains = new PerSide<List<CardInst>>();
            var bonus = new PerSide<double[]>();
            var mult = new PerSide<double[]>();
            var pierce = new PerSide<int[]>();
            var piercePct = new PerSide<double[]>();
            foreach (var side in strikers)
            {
                chains[side] = state[side].Hand;
                state[side].Hand = new List<CardInst>(); // Strike uses the whole Field
                // resource costs, in chain order: an unpaid card still hits but only its drawbacks fire this turn
                ClassResources.PayChain(state, side, chains[side]);
                int n = chains[side].Count;
                bonus[side] = new double[n];
                mult[side] = Enumerable.Repeat(1.0, n).ToArray();
                pierce[side] = new int[n];
                piercePct[side] = new double[n];
            }

            // held = a card on the Field of a side that didn't Strike (it has no chain of its own)
            // upTo = On hit only: "you've been hit by" counts enemy hits up to this card's slot
            EffectCtx CtxFor(Side side, int slot, bool blocked, bool clean = false, bool held = false, int? upTo = null)
            {
                var enemy = side.Other();
                return new EffectCtx
                {
                    State = state, Self = side, Enemy = enemy,
                    Card = held ? handAtStart[side][slot] : chains[side][slot],
                    Pending = pending, Slot = slot,
                    Chain = held ? new List<CardInst>() : chains[side],
                    EnemyChain = chains[enemy],
                    SelfAction = actions[side], EnemyAction = actions[enemy],
                    HandAtStart = handAtStart, HitsBlocked = env.HitsBlocked, HitDmgTaken = env.HitDmgTaken, HitsIn = env.HitsIn, HitsUpTo = upTo,
                    BlockNow = env.BlockNow,
                    Bonus = held ? new double[0] : bonus[side], EnemyBonus = bonus[enemy],
                    Mult = held ? new double[0] : mult[side], EnemyMult = mult[enemy],
                    Pierce = held ? new int[0] : pierce[side],
                    Blocked = blocked, Clean = clean,
                };
            }

            // 1) Before action: chain auras, plus held cards of a side that didn't Strike (e.g. "if you played Charge")
            foreach (var side in SIDES)
            {
                if (actions[side] == PlayerAction.Strike) for (int i = 0; i < chains[side].Count; i++) EffectOf(state, side, chains[side][i])?.Modify?.Invoke(CtxFor(side, i, false));
                else for (int i = 0; i < handAtStart[side].Count; i++) EffectOf(state, side, handAtStart[side][i])?.Modify?.Invoke(CtxFor(side, i, false, false, true));
            }

            int Stops(Side side) => Math.Max(0, blockStops[side] + env.BlockNow[side]);
            // Pierce: a hit marked by an effect ignores Block
            bool IsBlocked(Side side, int i) => actions[side.Other()] == PlayerAction.Block && i < Stops(side.Other()) - (env.Elusive[side] ? 1 : 0) && pierce[side][i] == 0;
            int DmgOf(Side side, int i)
            {
                var card = chains[side][i];
                // True Damage: dmg cuts (negative bonus, multiplier below 1) don't apply; only Block stops the hit
                double b = trueDmg[side] ? Math.Max(0, bonus[side][i]) : bonus[side][i];
                double m = trueDmg[side] ? Math.Max(1, mult[side][i]) : mult[side][i];
                double raw = ClassResources.BaseDmgOf(state, side, card) + (card.Grow ?? 0) + (card.GrowNext ?? 0) + b;
                // Vulnerable: the side being hit takes N% more dmg from every hit; Chill: the striker's hits deal N% less
                return (int)Math.Max(0, Math.Floor(raw * m * (100 + env.VulnPct[side.Other()]) * (100 - env.ChillPct[side]) / 10000));
            }
            // Before action combos (card types only), then Momentum stacks
            foreach (var side in strikers) Combos.Check(state, side, chains[side].Select(c => new ComboHit(c.Def.Type, false, false)).ToList(), true);
            foreach (var side in strikers) foreach (var h in Styles.HooksOf(state[side])) h.StrikeStart(state, side, chains[side]);
            foreach (var side in SIDES) Combos.ApplyConqueror(state, side, actions, bonus[side], mult[side.Other()]);
            Tuning Ts(Side side) => Tuning.Of(state, side);
            var blockDmgPct = new PerSide<double>();
            foreach (var side in SIDES)
            {
                if (actions[side] != PlayerAction.Block) continue;
                blockDmgPct[side] = Styles.HooksOf(state[side]).Aggregate(0.0, (n, h) => Math.Max(n, h.BlockDmgPct(state, side)));
            }
            // Styles that boost the chain (e.g. Fury); crit = slots a Style marked as Critical
            var crit = new PerSide<HashSet<int>>(new HashSet<int>(), new HashSet<int>());
            // a blocked hit deals half under Guard Crush, or when a Style marked it Critical
            double ThroughPct(Side side, int i) =>
                Math.Min(100, Math.Max(Math.Max(
                    guardBreak[side] ? Ts(side)["BR", "guardCrushBlockedPct"] : 0,
                    crit[side].Contains(i) ? Ts(side)["AS:2", "blockedCritPct"] : 0),
                    blockDmgPct[side.Other()]));
            // loadout Costs that make a side's Block leak: every blocked hit after its first still deals N% (Unrelenting)
            var blockLeak = new PerSide<double>(s => Styles.HooksOf(state[s]).Aggregate(0.0, (t, h) => Math.Max(t, h.BlockLeakPct(state, s))));
            double LeakPct(Side side, int i)
            {
                if (blockLeak[side.Other()] == 0) return 0;
                int earlier = 0;
                for (int j = 0; j < i; j++) if (IsBlocked(side, j)) earlier++;
                return earlier >= 1 ? blockLeak[side.Other()] : 0;
            }
            int DealtOf(Side side, int i)
            {
                int dmg = DmgOf(side, i);
                if (!IsBlocked(side, i)) return dmg;
                double stoppedThrough = Math.Min(100, Math.Max(ThroughPct(side, i), LeakPct(side, i)));
                double pierced = Math.Min(100, Math.Max(0, piercePct[side][i]));
                return Math.Min(dmg, (int)Math.Floor(dmg * stoppedThrough / 100) + (int)Math.Floor(dmg * pierced / 100));
            }

            foreach (var side in strikers)
                foreach (var h in Styles.HooksOf(state[side]))
                    h.BeforeHits(state, side, bonus[side], mult[side], crit[side], chains[side], pierce[side], piercePct[side], chains[side.Other()] ?? handAtStart[side.Other()]);
            // loadout pieces that soften every hit getting past a side's Block (Iron Hide)
            var hitCut = new PerSide<int>(s => Styles.HooksOf(state[s]).Sum(h => h.HitCut(state, s)));
            var cutLeft = new PerSide<int>(int.MaxValue, int.MaxValue);
            foreach (var side in SIDES) foreach (var h in Styles.HooksOf(state[side])) { var hh = h.HitCutHits(state, side); if (hh.HasValue) cutLeft[side] = Math.Min(cutLeft[side], hh.Value); }
            var critCut = new PerSide<double>(s => Math.Min(100, Styles.HooksOf(state[s]).Sum(h => h.CritCutPct(state, s))));

            // Every hit's outcome is worked out now, in hit order: Block, then Parry, then Shield, then HP.
            int longest = strikers.Count == 0 ? 0 : strikers.Max(s => chains[s].Count);
            var outcome = new Dictionary<string, Outcome>();
            List<Status> Sized(Side side, StatusKind kind) => state[side].Statuses.Where(s => s.Kind == kind && (s.N ?? 0) > 0).ToList();
            for (int i = 0; i < longest; i++)
            {
                foreach (var side in strikers)
                {
                    if (i >= chains[side].Count) continue;
                    var card = chains[side][i];
                    var enemy = side.Other();
                    int dealt = DealtOf(side, i);
                    // Energy Surge: Wraith Step caps hits past Block at 1, Shroud halves them
                    if (env.Wraith[enemy] && !IsBlocked(side, i)) dealt = Math.Min(dealt, 1);
                    if (env.Shroud[enemy]) dealt = (int)Math.Floor(dealt / 2.0);
                    if (critCut[enemy] != 0 && crit[side].Contains(i)) dealt = (int)Math.Floor(dealt * (100 - critCut[enemy]) / 100);
                    if (hitCut[enemy] != 0 && !IsBlocked(side, i) && dealt > 0 && cutLeft[enemy] > 0)
                    {
                        dealt = Math.Max(0, dealt - hitCut[enemy]);
                        cutLeft[enemy]--;
                    }
                    var parry = !IsBlocked(side, i) && dealt > 0 ? Sized(enemy, StatusKind.Parry).FirstOrDefault() : null;
                    if (parry != null)
                    {
                        parry.N = (parry.N ?? 1) - 1;
                        env.HitsParried[enemy]++;
                    }
                    int absorbed = 0;
                    if (parry == null)
                    {
                        foreach (var sh in Sized(enemy, StatusKind.Shield))
                        {
                            int take = Math.Min(sh.N ?? 0, dealt - absorbed);
                            sh.N = (sh.N ?? 0) - take;
                            absorbed += take;
                        }
                        if (absorbed != 0) env.ShieldHits[enemy]++;
                    }
                    if (parry != null) dealt = 0;
                    else dealt -= absorbed;
                    outcome[card.Uid] = new Outcome { Dealt = dealt, Parried = parry != null, Absorbed = absorbed };
                    env.HitsIn[enemy].Add(new HitIn { Slot = i, Type = card.Def.Type, Blocked = IsBlocked(side, i), Landed = !IsBlocked(side, i) && parry == null });
                    env.HitDmgTaken[enemy] += dealt;
                }
            }
            foreach (var side in SIDES) state[side].Statuses.RemoveAll(s => s.Kind == StatusKind.Parry && (s.N ?? 0) <= 0);

            // 2) hits, slot by slot (both chains interleave when Strike meets Strike)
            var cleanHits = new PerSide<int>();
            var hitResults = new Dictionary<string, HitResult>();
            for (int i = 0; i < longest; i++)
            {
                foreach (var side in strikers)
                {
                    if (i >= chains[side].Count) continue;
                    var card = chains[side][i];
                    var enemy = side.Other();
                    bool blocked = IsBlocked(side, i);
                    if (blocked) env.HitsBlocked[enemy]++;
                    int usedNext = card.GrowNext ?? 0;
                    int dmg = DmgOf(side, i);
                    var oc = outcome[card.Uid];
                    if (!blocked && !oc.Parried) env.HitsTaken[enemy]++;
                    bool isCrit = crit[side].Contains(i);
                    Emit(state, new TurnEvent { K = EventKind.Hit, Side = side, Slot = i, Uid = card.Uid, Type = card.Def.Type, Dmg = dmg, Dealt = oc.Dealt, Blocked = blocked, Parried = oc.Parried, Absorbed = oc.Absorbed, Crit = isCrit });
                    if (oc.Dealt > 0) LoseHp(state, enemy, oc.Dealt, HpLoss.Hit);
                    string critTag = isCrit ? " 💥 Critical" : "";
                    string guard = oc.Parried ? $" ({enemy.Key()} Parries {dmg})" : oc.Absorbed != 0 ? $" (Shield absorbs {oc.Absorbed})" : "";
                    string what = blocked
                        ? $"Blocked{(oc.Dealt != 0 ? $" ({(isCrit ? "Critical" : "Guard Crush")} through {oc.Dealt})" : "")}{critTag}"
                        : $"hits {dmg}{critTag}{guard}";
                    Log(state, $"{side.Key()} slot {i + 1} {card.Def.Id} {what}");
                    double lsPct = Combos.LifestealPct(state, side) + Styles.HooksOf(state[side]).Sum(h => h.Lifesteal(state, side));
                    int ls = (int)Math.Floor(oc.Dealt * lsPct / 100);
                    if (ls > 0 && Heal(state, side, ls) > 0) Log(state, $"{side.Key()} Lifesteal heals {ls}");
                    // clean = some dmg got through Block, Parry and Shield
                    bool clean = !blocked && oc.Dealt > 0;
                    if (clean) cleanHits[side]++;
                    if (clean && card.Def.Type != CardType.S) env.CleanPK[side]++;
                    hitResults[card.Uid] = new HitResult { Blocked = blocked, Clean = clean };
                    // On hit: fires right here, between hits, so e.g. a heal lands before the next enemy hit
                    EffectOf(state, side, card)?.OnHit?.Invoke(CtxFor(side, i, blocked, clean, false, i));
                    if (usedNext != 0) { int left = (card.GrowNext ?? 0) - usedNext; card.GrowNext = left != 0 ? left : (int?)null; }
                }
            }

            // Mark of Assassin: a Strike against a marked opponent bursts for N% of the chain's total dmg, straight from HP.
            foreach (var side in strikers)
            {
                if (!deathMarked[side.Other()]) continue;
                int total = 0;
                for (int i = 0; i < chains[side].Count; i++) total += DmgOf(side, i);
                double pct = Ts(side)["AS", "markBurstPct"];
                int burst = (int)Math.Floor(total * pct / 100);
                if (burst <= 0) continue;
                LoseHp(state, side.Other(), burst);
                env.HitDmgTaken[side.Other()] += burst;
                Log(state, $"{side.Key()} 💀 Mark of Assassin bursts {burst} ({Fmt.N(pct)}% of chain total {total})");
            }

            // Guard Crush is used up by this Strike: if the opponent Blocked it, they lose their oldest Field cards.
            // Then signature combos that look at how the hits went
            foreach (var side in strikers)
            {
                var p = state[side];
                if (guardBreak[side])
                {
                    p.Statuses.RemoveAll(s => s.Kind == StatusKind.GuardBreak);
                    var enemy = side.Other();
                    if (actions[enemy] == PlayerAction.Block)
                    {
                        var hand = state[enemy].Hand;
                        int n = Math.Min(hand.Count, (int)Ts(side)["BR", "guardCrushDiscard"]);
                        var lost = hand.GetRange(0, n);
                        hand.RemoveRange(0, n);
                        MarkDiscarded(state, enemy, lost.Select((card, i) => new Discarded(card, i + 1, "Guard Crush")));
                        ToDeckBottom(state, enemy, lost);
                        if (lost.Count > 0) Log(state, $"{side.Key()} Guard Crush: {enemy.Key()} discards {string.Join(", ", lost.Select(c => c.Def.Id))}");
                    }
                }
                Combos.Check(state, side, chains[side].Select(c => hitResults.TryGetValue(c.Uid, out var r) ? new ComboHit(c.Def.Type, r.Blocked, r.Clean) : new ComboHit(c.Def.Type, false, false)).ToList(), false);
            }

            // Styles that add to a finished chain (⟡ Infuse, Arcane Sub-Zero)
            foreach (var side in strikers)
            {
                var foe = state[side.Other()];
                int hpBefore = foe.Hp;
                var ch = chains[side];
                var unpaid = state[side].Unpaid;
                var report = new ChainReport
                {
                    ChainLength = ch.Count,
                    CleanHits = cleanHits[side],
                    EnemyField = handAtStart[side.Other()].Count,
                    Skills = ch.Count(c => c.Def.Type == CardType.S),
                    PaidSkills = ch.Count(c => c.Def.Type == CardType.S && !(unpaid != null && unpaid.Contains(c.Uid))),
                    CriticalHits = crit[side].Count,
                    CriticalBlocked = ch.Where((c, i) => crit[side].Contains(i) && hitResults.TryGetValue(c.Uid, out var r) && r.Blocked).Count(),
                    CriticalClean = ch.Where((c, i) => crit[side].Contains(i) && hitResults.TryGetValue(c.Uid, out var r) && r.Clean).Count(),
                    CriticalParried = ch.Where((c, i) => crit[side].Contains(i) && outcome.TryGetValue(c.Uid, out var o) && o.Parried).Count(),
                };
                int extra = Styles.HooksOf(state[side]).Sum(h => h.AfterChain(state, side, report));
                if (extra != 0) env.HitsTaken[side.Other()] += extra;
                env.HitDmgTaken[side.Other()] += hpBefore - foe.Hp; // extra hits count as hit dmg
            }

            // 3) used cards go under the deck, then draws from effects enter the Field
            foreach (var side in strikers)
            {
                ToDeckBottom(state, side, chains[side]);
                Emit(state, new TurnEvent { K = EventKind.Sweep, Side = side, Uids = chains[side].Select(c => c.Uid).ToList() });
            }
            foreach (var side in SIDES) if (pending[side] != 0) DrawCards(state, side, pending[side]);

            // 4) After action: end of the turn, every card that was on the Field when actions were revealed,
            //    whatever action its side picked. Struck cards still know how their hit went.
            foreach (var side in SIDES)
            {
                bool struck = actions[side] == PlayerAction.Strike;
                for (int i = 0; i < handAtStart[side].Count; i++)
                {
                    var card = handAtStart[side][i];
                    int slot = struck ? chains[side].IndexOf(card) : i;
                    if (slot < 0) continue;
                    var fx = EffectOf(state, side, card);
                    if (fx == null || (fx.OnResolve == null && fx.OnClean == null && fx.OnBlocked == null)) continue;
                    var r = hitResults.TryGetValue(card.Uid, out var hr) ? hr : new HitResult();
                    var ctx = CtxFor(side, slot, r.Blocked, r.Clean, !struck).With(null);
                    fx.OnResolve?.Invoke(ctx);
                    if (r.Blocked) fx.OnBlocked?.Invoke(ctx);
                    else if (r.Clean) fx.OnClean?.Invoke(ctx);
                }
            }
            return cleanHits;
        }

        /// <summary>Every turn: cards on the Field of a side that didn't Strike. after=false: before any hit; after=true: after hits land.</summary>
        static void ResolveHeld(GameState state, PerSide<PlayerAction> actions, TurnEnv env, bool after)
        {
            foreach (var side in SIDES)
            {
                if (actions[side] == PlayerAction.Strike) continue;
                var held = env.HandAtStart[side];
                for (int slot = 0; slot < held.Count; slot++)
                {
                    var fx = EffectOf(state, side, held[slot]);
                    var hook = after ? fx?.OnHeld : fx?.OnHeldBefore;
                    hook?.Invoke(new EffectCtx
                    {
                        State = state, Self = side, Enemy = side.Other(), Card = held[slot], Slot = slot,
                        Chain = new List<CardInst>(), SelfAction = actions[side], EnemyAction = actions[side.Other()],
                        HandAtStart = env.HandAtStart, HitsBlocked = env.HitsBlocked, HitDmgTaken = env.HitDmgTaken, HitsIn = env.HitsIn, BlockNow = env.BlockNow,
                        Bonus = new double[0], Mult = new double[0], Pierce = new int[0],
                    });
                }
            }
        }

        // ---------- data loading ----------

        /// <summary>One row of the Supabase cards table (the columns the engine needs).</summary>
        public class CardRow
        {
            public string Id = "";
            public string Type = "P";
            public int Dmg;
            public string Effect = "";
            public int Copies = 1;
            public bool? InDeck;
            public string EffectJson;
            public int? Cost;
            public string StyleOnly;
            /// <summary>cards.champion_id (used to group rows into decks).</summary>
            public string ChampionId;
        }

        /// <summary>DB rows → deck list, expanded by copies. Rows with in_deck = false are left out.</summary>
        public static List<CardDef> BuildDeck(IEnumerable<CardRow> rows) =>
            rows.Where(r => r.InDeck != false)
                .SelectMany(r => Enumerable.Range(0, r.Copies).Select(_ => new CardDef
                {
                    Id = r.Id, Type = Keys.ParseType(r.Type), Dmg = r.Dmg, EffectText = r.Effect, EffectJson = r.EffectJson, Cost = r.Cost, StyleOnly = r.StyleOnly,
                }))
                .ToList();
    }
}
