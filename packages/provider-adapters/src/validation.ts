import type { NormalizedSessionArchive } from "./index.js";

export interface ArchiveInspection {
  sessions: number;
  messages: number;
  emptySessions: string[];
  providers: Record<string, number>;
  roles: Record<string, number>;
  earliestStartedAt?: string;
  latestStartedAt?: string;
}

export function inspectNormalizedArchives(
  archives: NormalizedSessionArchive[],
): ArchiveInspection {
  const providers: Record<string, number> = {};
  const roles: Record<string, number> = {};
  const emptySessions: string[] = [];
  const startedTimes: string[] = [];
  let messages = 0;

  for (const archive of archives) {
    providers[archive.provider] = (providers[archive.provider] ?? 0) + 1;
    if (archive.messages.length === 0) emptySessions.push(archive.id);
    messages += archive.messages.length;
    if (archive.startedAt) startedTimes.push(archive.startedAt);

    for (const message of archive.messages) {
      roles[message.role] = (roles[message.role] ?? 0) + 1;
    }
  }

  startedTimes.sort();
  return {
    sessions: archives.length,
    messages,
    emptySessions,
    providers,
    roles,
    ...(startedTimes[0] ? { earliestStartedAt: startedTimes[0] } : {}),
    ...(startedTimes.at(-1) ? { latestStartedAt: startedTimes.at(-1) } : {}),
  };
}

export function assertImportableArchives(
  archives: NormalizedSessionArchive[],
): void {
  if (archives.length === 0) {
    throw new Error("Provider adapter returned no sessions");
  }

  const duplicateIds = archives
    .map((archive) => archive.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    throw new Error(`Provider adapter returned duplicate session IDs: ${[...new Set(duplicateIds)].join(", ")}`);
  }

  const empty = archives.filter((archive) => archive.messages.length === 0);
  if (empty.length > 0) {
    throw new Error(`Provider adapter returned empty sessions: ${empty.map((archive) => archive.id).join(", ")}`);
  }
}
