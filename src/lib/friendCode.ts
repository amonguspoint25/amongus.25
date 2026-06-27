// Among Us friend codes look like "gifteddolphin#5731": lowercase letters, a '#',
// then digits. They are the stable, host-mod-readable identity we map to a website
// account (see /api/lobby/roster). Normalize to lowercase so "GiftedDolphin#5731"
// and "gifteddolphin#5731" claim the same account.
// ponytail: permissive pattern (letters # 3-6 digits). Tighten if real codes never vary.
const FRIEND_CODE_RE = /^[a-z]+#\d{3,6}$/;

export function normalizeFriendCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const fc = raw.trim().toLowerCase();
  return FRIEND_CODE_RE.test(fc) ? fc : null;
}
