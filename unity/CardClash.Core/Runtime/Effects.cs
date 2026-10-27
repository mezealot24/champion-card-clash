// Card effects: what every effect can see, and the hooks a card can have (port of src/engine/effects/types.ts).
// Milestone 3 compiles cards.effect_json into these. Until then every card plays as plain dmg.
using System;
using System.Collections.Generic;

namespace CardClash.Core
{
    /// <summary>One enemy hit a side received: Landed = not stopped by Block or Parry.</summary>
    public class HitIn { public int Slot; public CardType Type; public bool Blocked; public bool Landed; }

    /// <summary>What an effect sees. Pending != null means draws wait until the chain ends.</summary>
    public class EffectCtx
    {
        public GameState State;
        public Side Self, Enemy;
        public CardInst Card;
        public PerSide<int> Pending;
        /// <summary>Field / chain position (0-based).</summary>
        public int Slot;
        // ---- chain context (held cards get an empty chain) ----
        public List<CardInst> Chain;
        public List<CardInst> EnemyChain; // only when the enemy also Strikes
        public PlayerAction SelfAction, EnemyAction;
        public PerSide<List<CardInst>> HandAtStart;
        public PerSide<int> HitsBlocked, BlockNow, HitDmgTaken;
        public PerSide<List<HitIn>> HitsIn;
        public int? HitsUpTo;
        public double[] Bonus, EnemyBonus, Mult, EnemyMult;
        public int[] Pierce;
        public bool Blocked, Clean;

        public EffectCtx With(PerSide<int> pending) { var c = (EffectCtx)MemberwiseClone(); c.Pending = pending; return c; }
    }

    /// <summary>
    /// Hooks a card can have. All optional.
    /// Modify = before any hit; OnHit = right after its own hit; OnResolve / OnClean / OnBlocked = After action;
    /// OnDraw = drawn onto the Field; OnHeld / OnHeldBefore = Every turn while held and its side didn't Strike.
    /// </summary>
    public class CardEffect
    {
        public Action<EffectCtx> Modify, OnHit, OnResolve, OnClean, OnBlocked, OnDraw, OnHeld, OnHeldBefore;
    }

    public static class EffectRegistry
    {
        /// <summary>The effect of a card (drawbacksOnly = its cost wasn't paid). Milestone 3: compile EffectJson.</summary>
        public static CardEffect Get(CardDef def, bool drawbacksOnly) => null;
    }
}
