type IdentityReviewRequest = Readonly<{
  id: string;
  status: string;
}>;

export function buildIdentityReviewRevision(requests: readonly IdentityReviewRequest[]) {
  return requests
    .filter((request) => request.status === "submitted")
    .map((request) => request.id)
    .sort()
    .join("|");
}

