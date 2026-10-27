// Class resources: every S card has a cost (port of src/engine/resources.ts).
// Paid when the card fires in a Strike chain, in chain order. Can't pay → the card still hits, its effects are off
// except its drawbacks.
using System;
using System.Collections.Generic;

namespace CardClash.Core
{
    /// <summary>What a resource can react to at the end of a turn.</summary>
    public class TurnSummary
    {
        public PlayerAction Action, EnemyAction;
        public int HitsTaken, CleanHits, CleanPK, FoeDmg, SelfDmg;
        public double HpPct;
    }

    public class ResourceDef
    {
        public string Name = "";
        public int Cap, Start, DefaultCost;
        /// <summary>Tank: costs are paid in HP (never down to 0) instead of a bar.</summary>
        public bool PayWithHp;
        public bool UnpaidStays;
        /// <summary>An unpaid S card still strikes but its base dmg is cut to this % (Bruiser).</summary>
        public double? UnpaidDmgPct;
        public Func<TurnSummary, double> Gain;
    }

    public static class ClassResources
    {
        /// <summary>Assassin Energy Surge: with a full bar at the start of the turn, the action picked spends it all.</summary>
        public const string SurgeChampion = "AS";
        /// <summary>A = Block (Wraith Step), B = Charge (Shroud). C (Strike) is off.</summary>
        public const string SurgeModes = "AB";
        public const int RedHpPct = 30;

        public static Dictionary<string, ResourceDef> For(Tuning t)
        {
            return new Dictionary<string, ResourceDef>
            {
                // Mana: +1 when you Charge or Block, +1 per Punch / Kick card that hits clean
                ["MG"] = new ResourceDef
                {
                    Name = "Mana", Cap = (int)t["MG", "cap"], Start = (int)t["MG", "start"], DefaultCost = (int)t["MG", "sCost"],
                    Gain = r => (r.Action == PlayerAction.Strike ? 0 : t["MG", "perChargeBlock"]) + r.CleanPK * t["MG", "perCleanPK"],
                },
                // Rage: + per hit taken / HP lost to the opponent, + per own drawback, + per clean hit; − on a quiet turn
                ["BR"] = new ResourceDef
                {
                    Name = "Rage", Cap = (int)t["BR", "cap"], Start = (int)t["BR", "start"], DefaultCost = (int)t["BR", "sCost"],
                    UnpaidDmgPct = t["BR", "unpaidDmgPct"],
                    Gain = r =>
                    {
                        bool quiet = r.Action != PlayerAction.Strike && r.EnemyAction != PlayerAction.Strike;
                        if (quiet && r.HitsTaken + r.FoeDmg + r.SelfDmg + r.CleanHits == 0) return r.HpPct < t["BR", "quietSafeHpPct"] ? 0 : -t["BR", "quietLoss"];
                        return t["BR", "perHitTaken"] * (r.HitsTaken + r.FoeDmg) + t["BR", "perSelfDmg"] * r.SelfDmg + t["BR", "perCleanHit"] * r.CleanHits;
                    },
                },
                // Energy: starts full, + every turn, small cap
                ["AS"] = new ResourceDef { Name = "Energy", Cap = (int)t["AS", "cap"], Start = (int)t["AS", "start"], DefaultCost = (int)t["AS", "sCost"], Gain = r => t["AS", "perTurn"] },
                // Tank: no bar, S cards cost HP
                ["TK"] = new ResourceDef { Name = "HP", Cap = 0, Start = 0, DefaultCost = (int)t["TK", "sCost"], PayWithHp = true },
            };
        }

        /// <summary>A class's resource under this tuning (null = the class has none).</summary>
        public static ResourceDef Of(string championId, Tuning t = null)
        {
            t ??= Tuning.Default;
            t.ResourceCache ??= For(t);
            return t.ResourceCache.TryGetValue(championId, out var r) ? r : null;
        }

        /// <summary>JS Math.round: halves go up.</summary>
        static int RoundHalfUp(double x) => (int)Math.Floor(x + 0.5);

        /// <summary>What this card costs its holder. P/K cost nothing unless cards.cost says so.</summary>
        public static int CostOf(string championId, CardInst card, Tuning t = null, CostMod mod = null)
        {
            var def = Of(championId, t);
            if (def == null) return 0;
            int b = card.Def.Cost.HasValue ? Math.Max(0, card.Def.Cost.Value) : card.Def.Type == CardType.S ? def.DefaultCost : 0;
            if (mod == null || card.Def.Type != CardType.S) return b;
            return Math.Max(0, RoundHalfUp(b * (100 + mod.Pct) / 100) + mod.Flat);
        }

        /// <summary>Add n to a side's bar, kept between 0 and its cap. No-op for Tank.</summary>
        public static void AddRes(GameState state, Side side, double n)
        {
            var p = state[side];
            var def = Of(p.ChampionId, Tuning.Of(state, side));
            if (def == null || def.PayWithHp) return;
            p.Res = (int)Math.Max(0, Math.Min(def.Cap, p.Res + n));
        }

        /// <summary>Pay for every card in the chain, in order. Cards that can't be paid go into p.Unpaid.</summary>
        public static void PayChain(GameState state, Side side, List<CardInst> chain)
        {
            var p = state[side];
            var t = Tuning.Of(state, side);
            var def = Of(p.ChampionId, t);
            p.Unpaid = new List<string>();
            if (def == null || p.Silenced || !state.Rules.Resources) return; // Silenced: effects are off anyway
            foreach (var card in chain)
            {
                // Grasp of the Undying's Cost: S cards cost hpPct% of current HP instead
                int cost = p.CostMod?.HpPct is double hpPct && hpPct != 0 && card.Def.Type == CardType.S && def.PayWithHp
                    ? Math.Max(1, (int)Math.Floor(p.Hp * hpPct / 100))
                    : CostOf(p.ChampionId, card, t, p.CostMod);
                if (cost <= 0 || (p.SkillSilenced && card.Def.Type == CardType.S)) continue;
                if (def.PayWithHp ? p.Hp > cost : p.Res >= cost)
                {
                    if (def.PayWithHp)
                    {
                        p.Hp -= cost;
                        Game.Emit(state, new TurnEvent { K = EventKind.Hp, Side = side, Delta = -cost });
                    }
                    else p.Res -= cost;
                    Game.Log(state, $"{side.Key()} pays {cost} {def.Name} for {card.Def.Id}");
                }
                else
                {
                    p.Unpaid.Add(card.Uid);
                    string what = def.UnpaidStays ? "can't play, stays on Field" : def.UnpaidDmgPct.HasValue ? $"hits for {Fmt.N(def.UnpaidDmgPct.Value)}% base dmg, drawbacks only" : "hits, drawbacks only";
                    Game.Log(state, $"{side.Key()} not enough {def.Name} for {card.Def.Id} (needs {cost}): {what}");
                }
            }
        }

        /// <summary>End of turn: each class fills (or drains) its bar.</summary>
        public static void GainRes(GameState state, Side side, TurnSummary s)
        {
            if (!state.Rules.Resources) return;
            var def = Of(state[side].ChampionId, Tuning.Of(state, side));
            double n = def?.Gain?.Invoke(s) ?? 0;
            if (n != 0) AddRes(state, side, n);
        }

        /// <summary>Base dmg of a card this turn: cut when it went unpaid (Bruiser).</summary>
        public static int BaseDmgOf(GameState state, Side side, CardInst card)
        {
            var p = state[side];
            var pct = Of(p.ChampionId, Tuning.Of(state, side))?.UnpaidDmgPct;
            return pct.HasValue && p.Unpaid != null && p.Unpaid.Contains(card.Uid) ? (int)Math.Floor(card.Def.Dmg * pct.Value / 100) : card.Def.Dmg;
        }
    }

    /// <summary>Numbers in log lines, printed the way JS prints them (50, 0.5).</summary>
    public static class Fmt
    {
        public static string N(double v) => v.ToString("R", System.Globalization.CultureInfo.InvariantCulture);
    }
}
