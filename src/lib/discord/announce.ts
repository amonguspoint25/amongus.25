// Fire a match-result embed to the configured Discord channel webhook. Best-effort: any failure
// (no webhook, network error, Discord 5xx, or the 2s timeout) is swallowed so it can never break
// ingest. The timeout matters because the ingest route awaits this — a hung webhook must not stall
// the ingest response (the match is already committed by the time we get here).
export async function announceMatch(embed: unknown): Promise<void> {
  const url = process.env.DISCORD_MATCH_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // intentionally ignored — announcements are non-critical
  }
}
