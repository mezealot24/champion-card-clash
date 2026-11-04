// Milestone 1 battle demo: press Play in any scene. Pick 2 champions, then Strike / Block / Charge
// against a random AI. Drawn with IMGUI on purpose: it's for checking the rules, real UI comes later.
using System.Collections.Generic;
using System.Linq;
using CardClash.Core;
using UnityEngine;

namespace CardClash.Client
{
    public class BattleDemo : MonoBehaviour
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            if (FindAnyObjectByType<BattleDemo>() == null) new GameObject("Battle Demo").AddComponent<BattleDemo>();
        }

        List<ChampionRow> champions;
        string source = "Loading cards from Supabase…";
        int pick1, pick2 = 1;
        GameState state;
        readonly System.Random ai = new System.Random();
        Vector2 logScroll;

        void Start()
        {
            StartCoroutine(SupabaseCards.Load(
                list => { champions = list; source = $"Cards: Supabase ({list.Count} champions). Card effects aren't ported yet: every card is plain dmg."; },
                error => { champions = SupabaseCards.Sample(); source = $"Cards: built-in sample ({error})"; Debug.LogWarning(error); }));
        }

        void NewGame()
        {
            ChampionSetup Setup(ChampionRow c) => new ChampionSetup { ChampionId = c.Id, HpStart = c.HpStart, HpMax = c.HpMax, Deck = c.Deck };
            state = Game.Create(Setup(champions[pick1]), Setup(champions[pick2]));
        }

        void Play(PlayerAction mine)
        {
            var legal = Engine.LegalActions(state, Side.P2);
            state = Engine.ResolveTurn(state, mine, legal[ai.Next(legal.Count)]);
            logScroll.y = float.MaxValue;
        }

        void OnGUI()
        {
            GUI.skin.label.fontSize = GUI.skin.button.fontSize = 16;
            GUILayout.BeginArea(new Rect(16, 16, Screen.width - 32, Screen.height - 32));
            GUILayout.Label("Champion Card Clash · Unity spike (milestone 1)");
            GUILayout.Label(source);
            if (champions == null) { GUILayout.EndArea(); return; }

            if (state == null)
            {
                var names = champions.Select(c => c.Name).ToArray();
                GUILayout.Label("You:");
                pick1 = GUILayout.Toolbar(pick1, names);
                GUILayout.Label("AI:");
                pick2 = GUILayout.Toolbar(pick2, names);
                if (GUILayout.Button("Fight!", GUILayout.Height(40))) NewGame();
                GUILayout.EndArea();
                return;
            }

            DrawSide("You", Side.P1);
            DrawSide("AI", Side.P2);
            GUILayout.Space(8);
            if (state.Winner == null)
            {
                GUILayout.BeginHorizontal();
                foreach (var a in new[] { PlayerAction.Strike, PlayerAction.Block, PlayerAction.Charge })
                {
                    GUI.enabled = Engine.LegalActions(state, Side.P1).Contains(a);
                    if (GUILayout.Button(a.ToString(), GUILayout.Height(48))) Play(a);
                }
                GUI.enabled = true;
                GUILayout.EndHorizontal();
            }
            else
            {
                GUILayout.Label(state.Winner == "draw" ? "Draw!" : state.Winner == "p1" ? "You win!" : "AI wins!");
                if (GUILayout.Button("Back to champion select", GUILayout.Height(40))) state = null;
            }
            if (state != null)
            {
                logScroll = GUILayout.BeginScrollView(logScroll);
                foreach (var line in state.Log) GUILayout.Label(line);
                GUILayout.EndScrollView();
            }
            GUILayout.EndArea();
        }

        void DrawSide(string who, Side side)
        {
            var p = state[side];
            var res = ClassResources.Of(p.ChampionId, Tuning.Of(state, side));
            string bar = res == null || res.PayWithHp ? "" : $"   {res.Name} {p.Res}/{res.Cap}";
            string statuses = p.Statuses.Count == 0 ? "" : "   [" + string.Join(", ", p.Statuses.Select(s => s.Kind.Key() + (s.N.HasValue ? $" {s.N}" : ""))) + "]";
            GUILayout.Label($"{who} · {p.ChampionId}   HP {p.Hp}/{p.MaxHp}{bar}   deck {p.Deck.Count}{statuses}");
            GUILayout.Label("   Field: " + (p.Hand.Count == 0 ? "(empty)" : string.Join("  ", p.Hand.Select((c, i) => $"{i + 1}:{c.Def.Id} {c.Def.Type}{c.Def.Dmg}"))));
        }
    }
}
