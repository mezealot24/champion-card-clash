// Styles and loadout pieces hook into the turn through the same shape (port of StyleDef in src/engine/styles.ts).
// Every hook is optional: the defaults here do nothing. Milestone 4 ports the Styles, milestone 5 the loadouts.
using System.Collections.Generic;

namespace CardClash.Core
{
    /// <summary>What a side went through in this turn's Strike phase.</summary>
    public class HitReport
    {
        public bool Attacked; public int HitsTaken, HitsBlocked, HitsParried, ShieldHits, Facing;
    }

    /// <summary>What this side's Strike chain did this turn.</summary>
    public class ChainReport
    {
        public int ChainLength, CleanHits, EnemyField, PaidSkills, Skills, CriticalHits, CriticalBlocked, CriticalClean, CriticalParried;
    }

    public class DualStrike { public System.Func<Tuning, int> Draw; public bool FillRes; }

    public abstract class StyleDef
    {
        public abstract string Name { get; }
        public virtual void Setup(PlayerState p, Tuning t) { }
        public virtual int StartDraw(Tuning t) => 0;
        public virtual void AfterHits(GameState state, Side side, HitReport r) { }
        public virtual void BeforeHits(GameState state, Side side, double[] bonus, double[] mult, HashSet<int> crit, List<CardInst> chain, int[] pierce, double[] piercePct, List<CardInst> enemyChain) { }
        public virtual int AfterChain(GameState state, Side side, ChainReport r) => 0;
        public virtual void StrikeStart(GameState state, Side side, List<CardInst> chain) { }
        public virtual int? ChargeBreakSafe(GameState state, Side side) => null;
        public virtual void OnChargeBreak(GameState state, Side side) { }
        public virtual DualStrike DualStrike => null;
        public virtual int ChargeDraw => 0;
        public virtual void ActionStart(GameState state, Side side, PlayerAction action, PlayerAction enemyAction) { }
        public virtual void EndTurn(GameState state, Side side, PlayerAction action, PlayerAction enemyAction) { }
        public virtual void OnHpLoss(GameState state, Side side) { }
        public virtual int Infuse(GameState state, Side target, int n) => 0;
        public virtual bool HasInfuse => false;
        // ---- used by loadout pieces ----
        public virtual int BlockBonus(GameState state, Side side) => 0;
        public virtual double Lifesteal(GameState state, Side side) => 0;
        public virtual int HitCut(GameState state, Side side) => 0;
        public virtual int? HitCutHits(GameState state, Side side) => null;
        public virtual double BurnCutPct(GameState state, Side side) => 0;
        public virtual double CritCutPct(GameState state, Side side) => 0;
        public virtual double BlockLeakPct(GameState state, Side side) => 0;
        public virtual double BlockDmgPct(GameState state, Side side) => 0;
        public virtual int EndDraw(GameState state, Side side) => 0;
        public virtual int ExtraChargeDraw(GameState state, Side side) => 0;
        public virtual int DualOnCharge(GameState state, Side side) => 0;
        public virtual int CutMore(GameState state, Side side) => 0;
    }

    public static class Styles
    {
        /// <summary>Styles by "CHAMP:slot". Empty until milestone 4.</summary>
        public static readonly Dictionary<string, StyleDef> All = new Dictionary<string, StyleDef>();
        /// <summary>Loadout pieces by key ("oath:TK:o1"). Empty until milestone 5.</summary>
        public static readonly Dictionary<string, StyleDef> PerkHooks = new Dictionary<string, StyleDef>();

        public static StyleDef Get(string key) => key != null && All.TryGetValue(key, out var s) ? s : null;

        /// <summary>Everything that hooks into a side's turn: its Style, then its loadout pieces in order.</summary>
        public static List<StyleDef> HooksOf(PlayerState p)
        {
            var o = new List<StyleDef>();
            var style = Get(p.Style);
            if (style != null) o.Add(style);
            if (p.Perks != null) foreach (var k in p.Perks) if (PerkHooks.TryGetValue(k, out var h)) o.Add(h);
            return o;
        }
    }
}
