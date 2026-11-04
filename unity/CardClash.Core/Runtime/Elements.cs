// Ignite / Chill / Shield helpers the core rules read (port of the top of src/engine/styles.ts).
using System;

namespace CardClash.Core
{
    public static class Elements
    {
        public static int ChillStacks(PlayerState p) => p.Statuses.Find(s => s.Kind == StatusKind.Chill)?.N ?? 0;
        /// <summary>% the chilled side's hits lose.</summary>
        public static double ChillCut(PlayerState p, Tuning t) => ChillStacks(p) * t["MG:2", "chillDmgCut"];

        public static int IgniteStacks(PlayerState p) => p.Statuses.Find(s => s.Kind == StatusKind.Ignite)?.N ?? 0;
        /// <summary>HP one end-of-turn burn takes.</summary>
        public static int IgniteBurn(PlayerState p, Tuning t)
        {
            int n = IgniteStacks(p);
            return (int)(n * t["MG:1", "igniteFlat"] + Math.Floor(p.MaxHp * n * t["MG:1", "ignitePctMaxHp"] / 100));
        }
        /// <summary>Heals are cut per Ignite stack, and by a loadout heal cut (perkData.healPct).</summary>
        public static int HealAfterIgnite(PlayerState p, int n, Tuning t)
        {
            double cut = Math.Min(t["MG:1", "healCutMax"], t["MG:1", "healCutPerStack"] * IgniteStacks(p));
            int pct = p.PerkData != null && p.PerkData.TryGetValue("healPct", out var v) ? v : 100;
            return (int)Math.Floor(n * (100 - cut) * pct / 10000);
        }
    }
}
