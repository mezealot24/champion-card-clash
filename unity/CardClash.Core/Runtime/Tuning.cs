// Champion + Style numbers a super_admin tunes in the Admin console. Port of src/engine/tuning.ts.
// Group = champion id ("TK") or Style ("MG:2"); the DB stores only the values that differ from the defaults.
using System.Collections.Generic;

namespace CardClash.Core
{
    public class Tuning
    {
        readonly Dictionary<string, Dictionary<string, double>> groups;

        Tuning(Dictionary<string, Dictionary<string, double>> groups) { this.groups = groups; }

        /// <summary>One number, e.g. t["BR", "guardCrushTurns"]. Unknown = 0 (like the TS `?? 0`).</summary>
        public double this[string group, string key] =>
            groups.TryGetValue(group, out var g) && g.TryGetValue(key, out var v) ? v : 0;

        public static readonly Tuning Default = new Tuning(TuningDefaults.Copy());

        /// <summary>Defaults filled in under any DB overrides. Unknown groups / keys are ignored.</summary>
        public static Tuning Resolve(Dictionary<string, Dictionary<string, double>> overrides = null)
        {
            var g = TuningDefaults.Copy();
            if (overrides != null)
                foreach (var o in overrides)
                    if (g.TryGetValue(o.Key, out var fields))
                        foreach (var kv in o.Value)
                            if (fields.ContainsKey(kv.Key) && !double.IsNaN(kv.Value) && !double.IsInfinity(kv.Value)) fields[kv.Key] = kv.Value;
            return new Tuning(g);
        }

        public Tuning Clone()
        {
            var g = new Dictionary<string, Dictionary<string, double>>();
            foreach (var kv in groups) g[kv.Key] = new Dictionary<string, double>(kv.Value);
            return new Tuning(g);
        }

        /// <summary>The numbers a side plays with: its loadout's own copy, else the game's, else defaults.</summary>
        public static Tuning Of(GameState state, Side? side = null) =>
            (side.HasValue ? state[side.Value].Tuning : null) ?? state.Tuning ?? Default;

        // resource defs built from this tuning (ClassResources.For), cached per instance
        internal Dictionary<string, ResourceDef> ResourceCache;
    }

    public static partial class TuningDefaults
    {
        public static Dictionary<string, Dictionary<string, double>> Copy() => Build();
    }
}
