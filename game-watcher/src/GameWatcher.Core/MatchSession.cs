using System.Threading;
using System.Threading.Tasks;
using GameWatcher.Core.Domain;

namespace GameWatcher.Core
{
    public enum SessionResultKind
    {
        None,                // event handled, nothing to report
        NotRanked,           // key authoritatively invalid/revoked (401) — this game is ignored
        Recording,           // ranked game started (key validated); now accumulating
        RecordingUnverified, // site unreachable at start — recording optimistically (spec §6)
        Refused,             // game ended but the match can't be sent (see Warning)
        Sent,                // game ended; SendResult carries the outcome
    }

    public sealed record SessionOutcome(SessionResultKind Kind, string? Warning = null, SendResult? Send = null)
    {
        public static readonly SessionOutcome None = new(SessionResultKind.None);
        public static readonly SessionOutcome NotRanked = new(SessionResultKind.NotRanked);
        public static readonly SessionOutcome Recording = new(SessionResultKind.Recording);
        public static readonly SessionOutcome RecordingUnverified = new(SessionResultKind.RecordingUnverified);
        public static SessionOutcome Refuse(string warning) => new(SessionResultKind.Refused, Warning: warning);
        public static SessionOutcome SentWith(SendResult send) => new(SessionResultKind.Sent, Send: send);
    }

    // The brain's top-level API: the Game Reader (Plan #3) pumps every normalized event in
    // here and the session wires the five components together.
    //  - Chat is ALWAYS processed for linking (codes are typed in lobby chat, before arm).
    //  - At GameStarted we snapshot whether ranked is enabled (valid host key); if not, the
    //    whole game is ignored (spec §5.6 "unarmed games produce nothing").
    //  - At GameEnded we build and send (or refuse if a whole role is unlinked).
    // The link map is session-scoped (survives across games); the recorder resets per game.
    public sealed class MatchSession
    {
        private readonly RankedGate _gate;
        private readonly LinkManager _link;
        private readonly MatchRecorder _recorder;
        private readonly MatchBuilder _builder;
        private readonly Sender _sender;

        private bool _recording;

        public MatchSession(RankedGate gate, LinkManager link, MatchRecorder recorder, MatchBuilder builder, Sender sender)
        {
            _gate = gate;
            _link = link;
            _recorder = recorder;
            _builder = builder;
            _sender = sender;
        }

        public LinkManager Links => _link;

        public async Task<SessionOutcome> HandleAsync(GameEvent e, CancellationToken ct = default)
        {
            // Linking runs regardless of arm state so early-typed codes still resolve.
            if (e is ChatMessage chat)
            {
                await _link.HandleChatAsync(chat, ct).ConfigureAwait(false);
                return SessionOutcome.None;
            }

            switch (e)
            {
                case GameStarted gs:
                    var status = await _gate.GetStatusAsync(ct).ConfigureAwait(false);
                    // Only an authoritative 401 makes a game casual. On Unknown (site blip) record
                    // anyway — the ingest POST queues until the site is back, or 401s if the key is
                    // truly bad (Sender parks it for re-auth). Spec §6: a blip must not drop a game.
                    if (status == RankedStatus.Disabled)
                    {
                        _recording = false;
                        return SessionOutcome.NotRanked;
                    }
                    _recording = true;
                    _recorder.Apply(gs);
                    return status == RankedStatus.Enabled
                        ? SessionOutcome.Recording
                        : SessionOutcome.RecordingUnverified;

                case GameEnded ge when _recording:
                    _recorder.Apply(ge);
                    _recording = false;
                    var built = _builder.Build(_recorder.Snapshot(), _link.LinkMap);
                    if (!built.Ok) return SessionOutcome.Refuse(built.Warning!);
                    var send = await _sender.SendAsync(built.Payload!, ct).ConfigureAwait(false);
                    return SessionOutcome.SentWith(send);

                default:
                    if (_recording) _recorder.Apply(e);
                    return SessionOutcome.None;
            }
        }
    }
}
