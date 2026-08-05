import { readFile } from "node:fs/promises";
import { parse } from "yaml";

export interface ProjectRecord {
  id: string;
  name: string;
  repository?: string;
  local_path?: string;
  status: string;
  type?: string;
}

export interface ProjectRegistry {
  version?: number;
  projects: ProjectRecord[];
}

export async function loadProjectRegistry(path: string): Promise<ProjectRegistry> {
  const raw = parse(await readFile(path, "utf8")) as unknown;
  if (!raw || typeof raw !== "object" || !("projects" in raw)) {
    throw new Error("Project registry must contain a projects array");
  }

  const projects = (raw as { projects: unknown }).projects;
  if (!Array.isArray(projects)) {
    throw new Error("Project registry projects must be an array");
  }

  const ids = new Set<string>();
  for (const project of projects) {
    if (!project || typeof project !== "object") {
      throw new Error("Every project must be an object");
    }
    const candidate = project as Partial<ProjectRecord>;
    if (!candidate.id || !candidate.name || !candidate.status) {
      throw new Error("Every project requires id, name, and status");
    }
    if (ids.has(candidate.id)) {
      throw new Error(`Duplicate project id: ${candidate.id}`);
    }
    ids.add(candidate.id);
  }

  return raw as ProjectRegistry;
}
