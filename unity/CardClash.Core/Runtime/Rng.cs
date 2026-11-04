// Seeded RNG (mulberry32), bit-for-bit the same as nextRandom in src/engine/state.ts,
// so a match replays the same from its seed on the web and in Unity.
namespace CardClash.Core
{
    public static class Rng
    {
        public static double Next(GameState state)
        {
            unchecked
            {
                int t = state.RngSeed = state.RngSeed + 0x6d2b79f5;
                t = (t ^ (int)((uint)t >> 15)) * (t | 1);
                t ^= t + (t ^ (int)((uint)t >> 7)) * (t | 61);
                return (uint)(t ^ (int)((uint)t >> 14)) / 4294967296.0;
            }
        }
    }
}
