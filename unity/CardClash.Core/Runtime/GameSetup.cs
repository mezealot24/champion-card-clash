// Small state helpers shared by the clash resolver and effects (port of src/engine/state.ts).
// They change the GameState passed in (Engine.ResolveTurn clones first).
using System;
using System.Collections.Generic;
using System.Linq;

namespace CardClash.Core
{
    public class ChampionSetup
    {
        public string ChampionId = "";
        public int HpStart;
        public int HpMax;
        public List<CardDef> Deck = new List<CardDef>(); // already expanded by copies (Engine.BuildDeck)
        public string Style; // "CHAMP:slot"
    }

    public static class Game
    {
        static List<T> Shuffle<T>(GameState state, List<T> items)
        {
            var a = new List<T>(items);
            for (int i = a.Count - 1; i > 0; i--)
            {
                int j = (int)Math.Floor(Rng.Next(state) * (i + 1));
                (a[i], a[j]) = (a[j], a[i]);
            }
            return a;
        }

        public static GameState Create(ChampionSetup p1, ChampionSetup p2, int? seed = null, RulesConfig rules = null, Tuning tuning = null)
        {
            tuning ??= Tuning.Default;
            var state = new GameState
            {
                P1 = EmptyPlayer(p1, Side.P1, tuning),
                P2 = EmptyPlayer(p2, Side.P2, tuning),
                Rules = rules?.Clone() ?? new RulesConfig(),
                Tuning = tuning,
                RngSeed = seed ?? Environment.TickCount,
            };
            foreach (var side in Keys.Sides)
            {
                var p = state[side];
                var t = Tuning.Of(state, side);
                foreach (var h in Styles.HooksOf(p)) h.Setup(p, t);
                p.Deck = Shuffle(state, p.Deck); // shuffle once; afterwards order is learnable
                DrawCards(state, side, state.Rules.StartHand + Styles.HooksOf(p).Sum(h => h.StartDraw(t)));
            }
            return state;
        }

        /// <summary>cards.style_only: "MG:1" = only under that Style, "!MG:1" = under every Style but that one.</summary>
        public static bool InStyleDeck(CardDef def, string style)
        {
            var k = def.StyleOnly;
            if (string.IsNullOrEmpty(k)) return true;
            return k.StartsWith("!") ? k.Substring(1) != style : k == style;
        }

        static PlayerState EmptyPlayer(ChampionSetup setup, Side side, Tuning t)
        {
            var deck = setup.Deck.Where(d => InStyleDeck(d, setup.Style)).Select((d, i) => new CardInst { Uid = $"{side.Key()}-{d.Id}-{i}", Def = d }).ToList();
            return new PlayerState
            {
                ChampionId = setup.ChampionId, Hp = setup.HpStart, MaxHp = setup.HpMax, Deck = deck, Style = setup.Style,
                Res = ClassResources.Of(setup.ChampionId, t)?.Start ?? 0,
            };
        }

        /// <summary>A card's effect, or nothing while its owner is Silenced. Unpaid cards keep only their drawbacks.</summary>
        public static CardEffect EffectOf(GameState state, Side side, CardInst card)
        {
            var p = state[side];
            if (p.Silenced || (p.SkillSilenced && card.Def.Type == CardType.S)) return null;
            return EffectRegistry.Get(card.Def, p.Unpaid != null && p.Unpaid.Contains(card.Uid));
        }

        /// <summary>
        /// Draw from the top of the deck onto the Field. Stops at Field max. Fires OnDraw.
        /// Once a whole deck's worth has been drawn the deck reshuffles, except the last HandMax cards at the bottom.
        /// </summary>
        public static int DrawCards(GameState state, Side side, int n)
        {
            var p = state[side];
            int drawn = 0;
            int max = HandMaxOf(state, side);
            for (int i = 0; i < n && p.Hand.Count < max && p.Deck.Count > 0; i++)
            {
                var card = p.Deck[0];
                p.Deck.RemoveAt(0);
                p.Hand.Add(card);
                card.EnteredWith = p.Hand.Count;
                Emit(state, new TurnEvent { K = EventKind.Draw, Side = side, Card = card, Uid = card.Uid });
                drawn++;
                p.DrawsSinceShuffle++;
                if (p.DrawsSinceShuffle >= p.Deck.Count + p.Hand.Count)
                {
                    // the newest cards at the bottom (just left the Field) stay there, so a discard is never drawn right back
                    int keep = Math.Min(p.Deck.Count, state.Rules.HandMax);
                    var top = Shuffle(state, p.Deck.GetRange(0, p.Deck.Count - keep));
                    top.AddRange(p.Deck.GetRange(p.Deck.Count - keep, keep));
                    p.Deck = top;
                    p.DrawsSinceShuffle = 0;
                    Log(state, $"{side.Key()} drew the whole deck: deck reshuffled");
                }
                EffectOf(state, side, card)?.OnDraw?.Invoke(new EffectCtx { State = state, Self = side, Enemy = side.Other(), Card = card, Slot = p.Hand.Count - 1 });
            }
            return drawn;
        }

        public static int HandMaxOf(GameState state, Side side) => Math.Min(state.Rules.HandMax, state[side].FieldMax ?? state.Rules.HandMax);

        /// <summary>Used / lost cards go under the deck (it never runs out). A stolen card goes back under its owner's deck.</summary>
        public static void ToDeckBottom(GameState state, Side side, IEnumerable<CardInst> cards)
        {
            foreach (var card in cards.ToList())
            {
                var to = card.Owner ?? side;
                card.Owner = null;
                state[to].Deck.Add(card);
            }
        }

        /// <summary>Heal up to Max HP (Ignite cuts it). A side already at 0 HP is down for good. Returns HP gained.</summary>
        public static int Heal(GameState state, Side side, int n)
        {
            var p = state[side];
            if (p.Hp <= 0) return 0;
            n = Elements.HealAfterIgnite(p, n, Tuning.Of(state, side.Other()));
            int before = p.Hp;
            p.Hp = Math.Min(p.MaxHp, p.Hp + n);
            if (p.Hp != before) Emit(state, new TurnEvent { K = EventKind.Hp, Side = side, Delta = p.Hp - before });
            return p.Hp - before;
        }

        public enum HpLoss { Hit, Foe, Self }

        /// <summary>Hit = a Strike chain card's hit; Foe / Self = any other HP loss, counted for Bruiser Rage.</summary>
        public static void LoseHp(GameState state, Side side, int n, HpLoss from = HpLoss.Foe)
        {
            var p = state[side];
            int before = p.Hp;
            p.Hp = Math.Max(0, p.Hp - n);
            if (p.Hp < before) foreach (var h in Styles.HooksOf(p)) h.OnHpLoss(state, side);
            if (p.Hp != before) Emit(state, new TurnEvent { K = EventKind.Hp, Side = side, Delta = p.Hp - before });
            if (from == HpLoss.Hit || p.Hp >= before) return;
            p.OtherDmg ??= new int[2];
            p.OtherDmg[from == HpLoss.Foe ? 0 : 1]++;
        }

        public static void Emit(GameState state, TurnEvent ev) => state.Events.Add(ev);

        /// <summary>Cards a side lost from its Field this turn (shown on the Field until the next turn).</summary>
        public static void MarkDiscarded(GameState state, Side side, IEnumerable<Discarded> lost)
        {
            foreach (var d in lost.ToList())
            {
                state[side].DiscardedCards.Add(d);
                Emit(state, new TurnEvent { K = EventKind.Discard, Side = side, Uid = d.Card.Uid, Reason = d.Reason });
            }
        }

        public static void Log(GameState state, string line) => state.Log.Add($"T{state.Turn} {line}");
    }
}
