import "server-only";

import packageMetadata from "../../package.json";

export type AppRelease = Readonly<{
  revision: string | null;
  version: string;
}>;

export function currentAppRelease(): AppRelease {
  const revision = (
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_COMMIT_SHA ??
    ""
  ).trim();

  return {
    revision: revision ? revision.slice(0, 12) : null,
    version: packageMetadata.version,
  };
}
