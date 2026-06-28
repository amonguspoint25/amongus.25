namespace GameWatcher.Core.Domain
{
    // ponytail: member names are SCREAMING_CASE on purpose — they must serialize to the
    // exact strings the server's Zod enums accept (schema.ts). JsonStringEnumConverter
    // emits the member name verbatim, so CREW/IMPOSTOR/CREW_WIN/IMP_WIN go on the wire as-is.
    public enum Role
    {
        CREW,
        IMPOSTOR,
    }

    public enum Outcome
    {
        CREW_WIN,
        IMP_WIN,
    }
}
