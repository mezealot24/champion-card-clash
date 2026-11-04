// Reads champions + cards from the same Supabase project as the web game (public read, RLS on).
// URL and publishable key come from the web project's .env at the repo root (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY),
// so there is nothing new to set up. No .env → the demo plays with a built-in sample deck.
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using CardClash.Core;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace CardClash.Client
{
    public class ChampionRow
    {
        public string Id;
        public string Name;
        public int HpStart;
        public int HpMax;
        public List<CardDef> Deck = new List<CardDef>();
    }

    public static class SupabaseCards
    {
        /// <summary>VITE_* values from repo-root .env.local / .env (the Unity project lives in unity/ChampionCardClash).</summary>
        public static (string url, string key) ReadEnv()
        {
            var root = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", ".."));
            string url = null, key = null;
            foreach (var name in new[] { ".env.local", ".env" })
            {
                var file = Path.Combine(root, name);
                if (!File.Exists(file)) continue;
                foreach (var raw in File.ReadAllLines(file))
                {
                    var line = raw.Trim();
                    int eq = line.IndexOf('=');
                    if (line.StartsWith("#") || eq < 0) continue;
                    var k = line.Substring(0, eq).Trim();
                    var v = line.Substring(eq + 1).Trim().Trim('"', '\'');
                    if (k == "VITE_SUPABASE_URL" && url == null) url = v;
                    if (k == "VITE_SUPABASE_PUBLISHABLE_KEY" && key == null) key = v;
                }
            }
            return (url, key);
        }

        static IEnumerator Get(string url, string key, string path, Action<JArray> ok, Action<string> fail)
        {
            using (var req = UnityWebRequest.Get($"{url.TrimEnd('/')}/rest/v1/{path}"))
            {
                req.SetRequestHeader("apikey", key);
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success) fail($"{path.Split('?')[0]}: {req.error} {req.downloadHandler?.text}");
                else ok(JArray.Parse(req.downloadHandler.text));
            }
        }

        /// <summary>Every champion with its deck (in_deck cards, expanded by copies).</summary>
        public static IEnumerator Load(Action<List<ChampionRow>> done, Action<string> fail)
        {
            var (url, key) = ReadEnv();
            if (string.IsNullOrEmpty(url) || string.IsNullOrEmpty(key)) { fail("no VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in the repo's .env"); yield break; }
            JArray champs = null, cards = null;
            string error = null;
            yield return Get(url, key, "champions?select=id,name,hp_start,hp_max&order=sort_order", a => champs = a, e => error = e);
            if (error == null) yield return Get(url, key, "cards?select=*&order=sort_order", a => cards = a, e => error = e);
            if (error != null) { fail(error); yield break; }

            var rows = cards.Select(c => new Engine.CardRow
            {
                Id = (string)c["id"],
                Type = (string)c["type"],
                Dmg = (int?)c["dmg"] ?? 0,
                Effect = (string)c["effect"] ?? "",
                Copies = (int?)c["copies"] ?? 1,
                InDeck = (bool?)c["in_deck"],
                EffectJson = c["effect_json"] == null || c["effect_json"].Type == JTokenType.Null ? null : c["effect_json"].ToString(Newtonsoft.Json.Formatting.None),
                Cost = (int?)c["cost"],
                StyleOnly = (string)c["style_only"],
                ChampionId = (string)c["champion_id"],
            }).ToList();
            done(champs.Select(ch => new ChampionRow
            {
                Id = (string)ch["id"],
                Name = (string)ch["name"],
                HpStart = (int?)ch["hp_start"] ?? 100,
                HpMax = (int?)ch["hp_max"] ?? 100,
                Deck = Engine.BuildDeck(rows.Where(r => r.ChampionId == (string)ch["id"])),
            }).Where(c => c.Deck.Count > 0).ToList());
        }

        /// <summary>Offline fallback: a plain 25-card deck so the demo always runs.</summary>
        public static List<ChampionRow> Sample()
        {
            ChampionRow Make(string id, string name, int hp)
            {
                var deck = new List<CardDef>();
                for (int i = 0; i < 25; i++)
                {
                    var type = i % 5 == 4 ? CardType.S : i % 2 == 0 ? CardType.P : CardType.K;
                    deck.Add(new CardDef { Id = $"{id}-S{i:00}", Type = type, Dmg = type == CardType.S ? 14 : 6 + i % 7 });
                }
                return new ChampionRow { Id = id, Name = name, HpStart = hp, HpMax = hp, Deck = deck };
            }
            return new List<ChampionRow> { Make("BR", "Bruiser (sample)", 210), Make("AS", "Assassin (sample)", 160), Make("MG", "Mage (sample)", 130), Make("TK", "Tank (sample)", 250) };
        }
    }
}
