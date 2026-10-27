// Signature combos, keyed by champion id (port of src/engine/combos.ts).
// A combo = 3 cards in your Strike chain with the right P/K/S types, in any order and any position; once per chain.
using System;
using System.Collections.Generic;
using System.Linq;

namespace CardClash.Core
{
    /// <summary>One slot of the chain. Before hits, Blocked / Clean are both false.</summary>
    public struct ComboHit
    {
        public CardType Type; public bool Blocked; public bool Clean;
        public ComboHit(CardType type, bool blocked, bool clean) { Type = type; Blocked = blocked; Clean = clean; }
    }

    public class ComboDef
    {
        public string Name = "";
        public CardType[] Pattern = new CardType[3];
        /// <summary>true = checked on card types right after actions are revealed; false = after the chain hit.</summary>
        public bool Before;
        public Func<ComboHit[], bool> Ok;
        public Action<GameState, Side> Fire;
    }

    public static class Combos
    {
        /// <summary>Mark of Assassin lasts the rest of the game.</summary>
        public const int DeathMarkTurns = 9999;

        static void Say(GameState state, Side side, string line) => state.Log.Add($"T{state.Turn} {side.Key()} {line}");
        static bool AllClean(ComboHit[] h) => h.All(x => x.Clean);

        /// <summary>
        /// Freeze a side: Chill clears and it can't Strike next turn. Thaw: afterwards it can't be Frozen again for a while.
        /// Flash Freeze: whoever froze it draws at the end of the turn. Returns false when Thaw stopped it.
        /// </summary>
        public static bool Freeze(GameState state, Side side, string why)
        {
            var p = state[side];
            if (p.Has(StatusKind.Thaw))
            {
                state.Log.Add($"T{state.Turn} {side.Key()} 💧 Thaw: can't be Frozen yet");
                return false;
            }
            var t = Tuning.Of(state, side.Other());
            p.Statuses.RemoveAll(s => s.Kind == StatusKind.Chill || s.Kind == StatusKind.Frozen);
            if (!p.Has(StatusKind.NoStrike)) p.Statuses.Add(new Status(StatusKind.NoStrike, 1));
            p.Statuses.Add(new Status(StatusKind.Frozen, 2));
            int thaw = (int)t["MG:2", "thawTurns"];
            if (thaw > 0) p.Statuses.Add(new Status(StatusKind.Thaw, 2 + thaw));
            var by = state[side.Other()];
            by.StyleData ??= new Dictionary<string, int>();
            by.StyleData["freezeDraw"] = (by.StyleData.TryGetValue("freezeDraw", out var fd) ? fd : 0) + (int)t["MG:2", "freezeDraw"];
            state.Log.Add($"T{state.Turn} {side.Key()} 🧊 Frozen: {why} → can't Strike next turn");
            return true;
        }

        public static readonly Dictionary<string, ComboDef[]> All = new Dictionary<string, ComboDef[]>
        {
            // Tank · P > K > P: if the opponent Blocks one of them, heal comboHealPct of your current HP
            ["TK"] = new[]
            {
                new ComboDef
                {
                    Name = "P > K > P", Pattern = new[] { CardType.P, CardType.K, CardType.P },
                    Ok = h => h.Any(x => x.Blocked),
                    Fire = (state, side) =>
                    {
                        var p = state[side];
                        double pct = Tuning.Of(state, side)["TK", "comboHealPct"];
                        int n = (int)Math.Floor(p.Hp * pct / 100);
                        if (p.Hp <= 0 || n <= 0) return; // a side at 0 HP stays down
                        int before = p.Hp;
                        p.Hp = Math.Min(p.MaxHp, p.Hp + n);
                        if (p.Hp != before) Game.Emit(state, new TurnEvent { K = EventKind.Hp, Side = side, Delta = p.Hp - before });
                        Say(state, side, $"Combo P > K > P: heal {n} ({Fmt.N(pct)}% of current HP)");
                    },
                },
            },
            // Assassin · P > K > S, all clean: Mark of Assassin on the opponent for the rest of the game
            ["AS"] = new[]
            {
                new ComboDef
                {
                    Name = "P > K > S", Pattern = new[] { CardType.P, CardType.K, CardType.S }, Ok = AllClean,
                    Fire = (state, side) =>
                    {
                        var enemy = state[side.Other()];
                        if (enemy.Has(StatusKind.DeathMark)) return;
                        enemy.Statuses.Add(new Status(StatusKind.DeathMark, DeathMarkTurns));
                        Say(state, side, "Combo P > K > S: 💀 Mark of Assassin on the enemy for the rest of the game");
                    },
                },
            },
            // Mage · S + S + S, all clean: the opponent can't Block next turn (Cryomancer: Absolute Zero also Freezes)
            ["MG"] = new[]
            {
                new ComboDef
                {
                    Name = "S + S + S", Pattern = new[] { CardType.S, CardType.S, CardType.S }, Ok = AllClean,
                    Fire = (state, side) =>
                    {
                        int turns = (int)Tuning.Of(state, side)["MG", "comboNoBlockTurns"];
                        if (turns > 0) state[side.Other()].Statuses.Add(new Status(StatusKind.NoBlock, turns));
                        if (state[side].Style == "MG:2")
                        {
                            Say(state, side, "Combo Absolute Zero: enemy can't Block next turn");
                            Freeze(state, side.Other(), "Absolute Zero");
                        }
                        else Say(state, side, "Combo S + S + S: enemy can't Block next turn");
                    },
                },
            },
            // Bruiser · S > P > P: Guard Crush, used up by your next Strike
            ["BR"] = new[]
            {
                new ComboDef
                {
                    Name = "S > P > P", Pattern = new[] { CardType.S, CardType.P, CardType.P },
                    Fire = (state, side) =>
                    {
                        var p = state[side];
                        int turns = (int)Tuning.Of(state, side)["BR", "guardCrushTurns"];
                        p.Statuses.RemoveAll(s => s.Kind == StatusKind.GuardBreak);
                        p.Statuses.Add(new Status(StatusKind.GuardBreak, turns));
                        Say(state, side, $"Combo S > P > P: Guard Crush (for your next Strike within {turns} turns)");
                    },
                },
            },
        };

        /// <summary>Does a trio of hits hold exactly the card types of the pattern (any order)?</summary>
        static bool SameTypes(ComboHit[] three, CardType[] pattern)
        {
            var left = new List<CardType>(pattern);
            foreach (var h in three) if (!left.Remove(h.Type)) return false;
            return true;
        }

        /// <summary>Fire this side's combos for one timing if any 3 cards of its chain match (once each).</summary>
        public static void Check(GameState state, Side side, IList<ComboHit> hits, bool before)
        {
            if (!All.TryGetValue(state[side].ChampionId, out var combos)) return;
            foreach (var combo in combos)
            {
                if (combo.Before != before) continue;
                bool found = false;
                for (int i = 0; i < hits.Count && !found; i++)
                    for (int j = i + 1; j < hits.Count && !found; j++)
                        for (int k = j + 1; k < hits.Count && !found; k++)
                        {
                            var three = new[] { hits[i], hits[j], hits[k] };
                            if (SameTypes(three, combo.Pattern) && (combo.Ok == null || combo.Ok(three))) found = true;
                        }
                if (found)
                {
                    combo.Fire(state, side);
                    Game.Emit(state, new TurnEvent { K = EventKind.Combo, Side = side, Name = combo.Name });
                }
            }
        }

        public static int ConquerorOf(GameState state, Side side) =>
            state[side].ComboData != null && state[side].ComboData.TryGetValue("conqueror", out var n) ? n : 0;

        /// <summary>Momentum stacks (Bruiser Juggernaut): +dmg on every slot; at max, a charge break makes enemy hits deal more.</summary>
        public static void ApplyConqueror(GameState state, Side side, PerSide<PlayerAction> actions, double[] bonus, double[] enemyMult)
        {
            int n = ConquerorOf(state, side);
            if (n == 0) return;
            var t = Tuning.Of(state, side);
            if (bonus != null) for (int i = 0; i < bonus.Length; i++) bonus[i] += n * t["BR:2", "dmgPerStack"];
            double pct = t["BR:2", "chargeBreakTakenPct"];
            if (n >= t["BR:2", "conquerorMax"] && actions[side] == PlayerAction.Charge && enemyMult != null && pct != 0)
            {
                for (int i = 0; i < enemyMult.Length; i++) enemyMult[i] *= 1 + pct / 100;
                Say(state, side, $"Momentum: charge break hit, takes +{Fmt.N(pct)}% dmg");
            }
        }

        /// <summary>Lifesteal: % of each hit's dmg healed back (0 when not at max Momentum).</summary>
        public static double LifestealPct(GameState state, Side side)
        {
            var t = Tuning.Of(state, side);
            return ConquerorOf(state, side) >= t["BR:2", "conquerorMax"] ? t["BR:2", "omnivampPct"] : 0;
        }
    }
}
