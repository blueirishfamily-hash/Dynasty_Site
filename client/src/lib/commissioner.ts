const COMMISSIONER_USER_IDS = ["900186363130503168"];

export function isLeagueCommissioner(
  user: { userId?: string } | null | undefined,
  league: { commissionerId?: string } | null | undefined,
): boolean {
  if (!user?.userId || !league) return false;
  return (
    (!!league.commissionerId && user.userId === league.commissionerId) ||
    COMMISSIONER_USER_IDS.includes(user.userId)
  );
}
