// The TS engine is the spec: replay matches it recorded (unity/tools/export-golden.ts) and check
// every turn ends in the same state, with the same log lines and events.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using CardClash.Core;
using NUnit.Framework;

namespace CardClash.Core.Tests
{
    public class GoldenReplayTests
    {
        static JsonElement Load(string file) =>
            JsonDocument.Parse(File.ReadAllText(Path.Combine(TestContext.CurrentContext.TestDirectory, "Fixtures", file))).RootElement;

        public static IEnumerable<TestCaseData> Matches()
        {
            foreach (var m in Load("golden-m1.json").GetProperty("matches").EnumerateArray())
                yield return new TestCaseData(m.GetProperty("name").GetString()).SetName("golden_m1_" + m.GetProperty("name").GetString());
        }

        static ChampionSetup Setup(JsonElement e) => new ChampionSetup
        {
            ChampionId = e.GetProperty("championId").GetString(),
            HpStart = e.GetProperty("hpStart").GetInt32(),
            HpMax = e.GetProperty("hpMax").GetInt32(),
            Deck = e.GetProperty("deck").EnumerateArray().Select(d => new CardDef
            {
                Id = d.GetProperty("id").GetString(),
                Type = Keys.ParseType(d.GetProperty("type").GetString()),
                Dmg = d.GetProperty("dmg").GetInt32(),
                Cost = d.GetProperty("cost").ValueKind == JsonValueKind.Number ? d.GetProperty("cost").GetInt32() : (int?)null,
            }).ToList(),
        };

        [TestCaseSource(nameof(Matches))]
        public void ReplaysLikeTheWebEngine(string name)
        {
            var m = Load("golden-m1.json").GetProperty("matches").EnumerateArray().First(x => x.GetProperty("name").GetString() == name);
            var rules = new RulesConfig();
            if (m.GetProperty("rules").TryGetProperty("startHand", out var sh)) rules.StartHand = sh.GetInt32();
            var s = Game.Create(Setup(m.GetProperty("p1")), Setup(m.GetProperty("p2")), m.GetProperty("seed").GetInt32(), rules);
            Same(m.GetProperty("initial"), s, 0, "start");
            int logFrom = s.Log.Count;
            foreach (var t in m.GetProperty("turns").EnumerateArray())
            {
                var a = t.GetProperty("actions");
                string at = $"turn {s.Turn}";
                s = Engine.ResolveTurn(s, Keys.ParseAction(a.GetProperty("p1").GetString()), Keys.ParseAction(a.GetProperty("p2").GetString()));
                Same(t.GetProperty("after"), s, logFrom, at);
                logFrom = s.Log.Count;
            }
        }

        static void Same(JsonElement want, GameState s, int logFrom, string at)
        {
            Assert.That(s.Log.Skip(logFrom).ToArray(), Is.EqualTo(want.GetProperty("log").EnumerateArray().Select(x => x.GetString()).ToArray()), $"{at}: log");
            Assert.That(s.Turn, Is.EqualTo(want.GetProperty("turn").GetInt32()), $"{at}: turn");
            var w = want.GetProperty("winner");
            Assert.That(s.Winner, Is.EqualTo(w.ValueKind == JsonValueKind.Null ? null : w.GetString()), $"{at}: winner");
            Assert.That(s.BlockStreak, Is.EqualTo(want.GetProperty("blockStreak").GetInt32()), $"{at}: blockStreak");
            Assert.That(s.RngSeed, Is.EqualTo(want.GetProperty("rngSeed").GetInt32()), $"{at}: rngSeed");
            foreach (var side in Keys.Sides)
            {
                var p = s[side];
                var wp = want.GetProperty(side.Key());
                string who = $"{at} {side.Key()}";
                Assert.That(p.Hp, Is.EqualTo(wp.GetProperty("hp").GetInt32()), $"{who}: hp");
                Assert.That(p.MaxHp, Is.EqualTo(wp.GetProperty("maxHp").GetInt32()), $"{who}: maxHp");
                Assert.That(p.Res, Is.EqualTo(wp.GetProperty("res").GetInt32()), $"{who}: res");
                Assert.That(p.Hand.Select(c => c.Uid).ToArray(), Is.EqualTo(Strings(wp.GetProperty("hand"))), $"{who}: Field");
                Assert.That(p.Deck.Select(c => c.Uid).ToArray(), Is.EqualTo(Strings(wp.GetProperty("deck"))), $"{who}: deck");
                Assert.That(p.Statuses.Select(x => $"{x.Kind.Key()}/{x.Turns}/{x.N}").ToArray(),
                    Is.EqualTo(wp.GetProperty("statuses").EnumerateArray().Select(x => $"{x.GetProperty("kind").GetString()}/{x.GetProperty("turns").GetInt32()}/{(x.GetProperty("n").ValueKind == JsonValueKind.Null ? "" : x.GetProperty("n").GetInt32().ToString())}").ToArray()), $"{who}: statuses");
                Assert.That(p.DiscardedCards.Select(d => $"{d.Card.Uid}/{d.Slot}/{d.Reason}").ToArray(),
                    Is.EqualTo(wp.GetProperty("discarded").EnumerateArray().Select(d => $"{d.GetProperty("uid").GetString()}/{d.GetProperty("slot").GetInt32()}/{d.GetProperty("reason").GetString()}").ToArray()), $"{who}: discarded");
            }
            Assert.That(s.Events.Select(EventKey).ToArray(), Is.EqualTo(want.GetProperty("events").EnumerateArray().Select(WantEventKey).ToArray()), $"{at}: events");
        }

        static string[] Strings(JsonElement a) => a.EnumerateArray().Select(x => x.GetString()).ToArray();

        static string EventKey(TurnEvent e)
        {
            string side = e.Side.Key();
            switch (e.K)
            {
                case EventKind.Hit: return $"hit {side} {e.Slot} {e.Uid} {e.Dmg} {e.Dealt} {e.Blocked} {e.Parried} {e.Absorbed}";
                case EventKind.Hp: return $"hp {side} {e.Delta}";
                case EventKind.Draw: return $"draw {side} {e.Card.Uid}";
                case EventKind.Discard: return $"discard {side} {e.Uid} {e.Reason}";
                case EventKind.Sweep: return $"sweep {side} {string.Join(",", e.Uids)}";
                default: return $"combo {side} {e.Name}";
            }
        }

        static string WantEventKey(JsonElement e)
        {
            string k = e.GetProperty("k").GetString(), side = e.GetProperty("side").GetString();
            switch (k)
            {
                case "hit": return $"hit {side} {e.GetProperty("slot").GetInt32()} {e.GetProperty("uid").GetString()} {e.GetProperty("dmg").GetInt32()} {e.GetProperty("dealt").GetInt32()} {e.GetProperty("blocked").GetBoolean()} {e.GetProperty("parried").GetBoolean()} {e.GetProperty("absorbed").GetInt32()}";
                case "hp": return $"hp {side} {e.GetProperty("delta").GetInt32()}";
                case "draw": return $"draw {side} {e.GetProperty("uid").GetString()}";
                case "discard": return $"discard {side} {e.GetProperty("uid").GetString()} {e.GetProperty("reason").GetString()}";
                case "sweep": return $"sweep {side} {string.Join(",", Strings(e.GetProperty("uids")))}";
                default: return $"combo {side} {e.GetProperty("name").GetString()}";
            }
        }
    }
}
