export type ClosureApprovalInput = Readonly<{
  approved: boolean;
  hasResolvedObservation: boolean;
  status: string | null;
}>;

export function canApprovePeriodClosure(input: ClosureApprovalInput): boolean {
  if (input.approved || !input.status) return false;
  if (input.status === "closed_with_observations") return input.hasResolvedObservation;
  return input.status === "closed" || input.status === "rectified";
}
