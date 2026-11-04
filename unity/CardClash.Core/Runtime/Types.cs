// Pure game types: no UnityEngine, no Supabase. Port of src/engine/types.ts.
using System;
using System.Collections.Generic;

namespace CardClash.Core
{
    public enum CardType { P, K, S }

    public enum PlayerAction { Strike, Block, Charge }

    public enum Side { P1, P2 }

    /// <summary>Status kinds. Key() gives the TS name ("noStrike", "deathMark", …).</summary>
    public enum StatusKind
    {
        NoStrike, NoBlock, NoCharge, BlockPlus, TrueDmg, GuardBreak, Silence, Shield, Parry, Vulnerable, DeathMark,
        Ignite, Chill, Frozen, SkillSilence, SubZero, FrozenTomb, Thaw, Venom, WoundUp, CutGuard,
    }

    public static class Keys
    {
        public static readonly Side[] Sides = { Side.P1, Side.P2 };
        public static Side Other(this Side s) => s == Side.P1 ? Side.P2 : Side.P1;
        public static string Key(this Side s) => s == Side.P1 ? "p1" : "p2";
        public static string Key(this PlayerAction a) => a == PlayerAction.Strike ? "strike" : a == PlayerAction.Block ? "block" : "charge";
        public static string Key(this StatusKind k) { var n = k.ToString(); return char.ToLowerInvariant(n[0]) + n.Substring(1); }
        public static PlayerAction ParseAction(string s) => s == "strike" ? PlayerAction.Strike : s == "block" ? PlayerAction.Block : PlayerAction.Charge;
        public static CardType ParseType(string s) => s == "P" ? CardType.P : s == "K" ? CardType.K : CardType.S;
    }

    /// <summary>One card design (one DB row). Copies share the same def.</summary>
    public class CardDef
    {
        public string Id = ""; // CLASS-NNN, e.g. BR-001
        public CardType Type;
        public int Dmg;
        public string EffectText = ""; // display only
        /// <summary>cards.effect_json as raw JSON (compiled by the effect engine, milestone 3).</summary>
        public string EffectJson;
        /// <summary>Resource cost paid when it fires in a Strike chain. Null on an S card = class default.</summary>
        public int? Cost;
        /// <summary>cards.style_only: "MG:1" = only under that Style, "!MG:1" = under every Style but that one, null = always.</summary>
        public string StyleOnly;
    }

    /// <summary>One physical card in a game. Uid is unique even for copies.</summary>
    public class CardInst
    {
        public string Uid = "";
        public CardDef Def;
        public int? Grow;
        public int? GrowNext;
        public List<int> UsedOnce;
        public int? EnteredWith;
        public Side? Owner;

        public CardInst Clone() => new CardInst
        {
            Uid = Uid, Def = Def, Grow = Grow, GrowNext = GrowNext, EnteredWith = EnteredWith, Owner = Owner,
            UsedOnce = UsedOnce == null ? null : new List<int>(UsedOnce),
        };
    }

    public class Status
    {
        public StatusKind Kind;
        public int Turns;
        public int? N;
        public Status(StatusKind kind, int turns, int? n = null) { Kind = kind; Turns = turns; N = n; }
        public Status Clone() => new Status(Kind, Turns, N);
    }

    public class Discarded
    {
        public CardInst Card;
        public int Slot;
        public string Reason;
        public Discarded(CardInst card, int slot, string reason) { Card = card; Slot = slot; Reason = reason; }
    }

    public class CostMod { public double Pct; public int Flat; public double? HpPct; }

    public class PlayerState
    {
        public string ChampionId = "";
        public int Hp;
        public int MaxHp;
        public List<CardInst> Hand = new List<CardInst>(); // index 0 = oldest = slot 1 of the Strike chain
        public List<CardInst> Deck = new List<CardInst>(); // index 0 = top
        public List<Status> Statuses = new List<Status>();
        /// <summary>Chosen Style (passive), key "CHAMP:slot".</summary>
        public string Style;
        public Dictionary<string, int> StyleData;
        public Dictionary<string, int> ComboData;
        public bool Silenced;
        public bool SkillSilenced;
        public int DrawsSinceShuffle;
        /// <summary>Class resource (Mana / Rage / Energy). Tank has none (pays HP).</summary>
        public int Res;
        /// <summary>Chain cards whose cost couldn't be paid this turn: they hit, but their effects are off.</summary>
        public List<string> Unpaid;
        /// <summary>Times this side lost HP outside a hit this turn: (foe, self). Feeds Rage.</summary>
        public int[] OtherDmg;
        public int? LostHpTurn;
        public List<Discarded> DiscardedCards = new List<Discarded>();
        public int CutTaken;
        public List<string> Perks;
        public Tuning Tuning;
        public int? FieldMax;
        public CostMod CostMod;
        public Dictionary<string, int> PerkData;

        public bool Has(StatusKind k) => Statuses.Exists(s => s.Kind == k);

        public PlayerState Clone() => new PlayerState
        {
            ChampionId = ChampionId, Hp = Hp, MaxHp = MaxHp,
            Hand = Hand.ConvertAll(c => c.Clone()), Deck = Deck.ConvertAll(c => c.Clone()),
            Statuses = Statuses.ConvertAll(s => s.Clone()),
            Style = Style,
            StyleData = StyleData == null ? null : new Dictionary<string, int>(StyleData),
            ComboData = ComboData == null ? null : new Dictionary<string, int>(ComboData),
            Silenced = Silenced, SkillSilenced = SkillSilenced, DrawsSinceShuffle = DrawsSinceShuffle, Res = Res,
            Unpaid = Unpaid == null ? null : new List<string>(Unpaid),
            OtherDmg = OtherDmg == null ? null : (int[])OtherDmg.Clone(),
            LostHpTurn = LostHpTurn,
            DiscardedCards = new List<Discarded>(), // only meaningful for the turn that made them
            CutTaken = CutTaken,
            Perks = Perks == null ? null : new List<string>(Perks),
            Tuning = Tuning, FieldMax = FieldMax, CostMod = CostMod,
            PerkData = PerkData == null ? null : new Dictionary<string, int>(PerkData),
        };
    }

    public class RulesConfig
    {
        public int HandMax = 5;
        public int StartHand = 0; // Q 2026-10-13: start with an empty Field, cards come only from Charge
        public int BlockStopsHits = 2;
        public int BlockStreakDiscard = 3;
        public int ChargeDraw = 1;
        /// <summary>Class resources + S card costs. Off = every card is free.</summary>
        public bool Resources = true;

        public RulesConfig Clone() => (RulesConfig)MemberwiseClone();
    }

    public enum EventKind { Hit, Hp, Draw, Discard, Sweep, Combo }

    /// <summary>What happened during the last ResolveTurn, in order, for the battle screen to play back.</summary>
    public class TurnEvent
    {
        public EventKind K;
        public Side Side;
        // hit
        public int Slot;
        public string Uid;
        public CardType Type;
        public int Dmg, Dealt, Absorbed;
        public bool Blocked, Parried, Crit;
        // hp
        public int Delta;
        // draw
        public CardInst Card;
        // discard
        public string Reason;
        // sweep
        public List<string> Uids;
        // combo
        public string Name;
    }

    public class GameState
    {
        public int Turn = 1;
        public PlayerState P1 = new PlayerState();
        public PlayerState P2 = new PlayerState();
        public int BlockStreak;
        /// <summary>null = still playing; otherwise "p1", "p2" or "draw".</summary>
        public string Winner;
        public RulesConfig Rules = new RulesConfig();
        public Tuning Tuning;
        public int RngSeed;
        public List<string> Log = new List<string>(); // human-readable, newest last
        public List<TurnEvent> Events = new List<TurnEvent>(); // last turn only

        public PlayerState this[Side s] => s == Side.P1 ? P1 : P2;

        public GameState Clone() => new GameState
        {
            Turn = Turn, P1 = P1.Clone(), P2 = P2.Clone(), BlockStreak = BlockStreak, Winner = Winner,
            Rules = Rules.Clone(), Tuning = Tuning, RngSeed = RngSeed, Log = new List<string>(Log), Events = new List<TurnEvent>(Events),
        };
    }

    /// <summary>A value per side (p1, p2), so code reads like the TS Record&lt;Side, T&gt;.</summary>
    public class PerSide<T>
    {
        readonly T[] v = new T[2];
        public PerSide() { }
        public PerSide(T p1, T p2) { v[0] = p1; v[1] = p2; }
        public PerSide(Func<Side, T> make) { v[0] = make(Side.P1); v[1] = make(Side.P2); }
        public T this[Side s] { get => v[(int)s]; set => v[(int)s] = value; }
    }
}
