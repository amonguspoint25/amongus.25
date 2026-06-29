namespace GameWatcher.Core.Domain
{
    // Maps Among Us's GameOverReason to a ranked Outcome by enum NAME. Name-based on purpose:
    // the IL2CPP enum lives in the game assembly, and AU renamed the crew-win members from
    // "Humans*" to "Crewmates*" across versions — so we match by prefix and accept both.
    //
    // CRITICAL: disconnect reasons name WHO LEFT (the loser), not who won, so they invert:
    // an impostor leaving is a crew win, a crewmate leaving is an impostor win.
    public static class OutcomeMapper
    {
        public static Outcome FromReasonName(string reasonName)
        {
            string s = reasonName ?? string.Empty;

            // Disconnect endings — name the loser, so map to the OTHER side winning.
            if (s == "ImpostorDisconnect") return Outcome.CREW_WIN;                 // impostor left
            if (s == "CrewmateDisconnect" || s == "HumansDisconnect") return Outcome.IMP_WIN; // crew left

            // Win-by-vote / win-by-task. Crew-win members are "Crewmates*" (current AU) or
            // "Humans*" (legacy). Check BEFORE the impostor fallthrough.
            if (s.StartsWith("Crewmate") || s.StartsWith("Humans")) return Outcome.CREW_WIN;

            // Everything else (Impostors*/Impostor*, sabotage, kill, vote) is an impostor win.
            return Outcome.IMP_WIN;
        }
    }
}
