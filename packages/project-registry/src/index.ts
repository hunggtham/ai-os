import { readFile } from "node:fs/promises";
import { parse } from "yaml";

export interface ProjectRepository {
  provider?: string;
  full_name?: string;
  default_branch?: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  repository?: string | ProjectRepository;
  local_path?: string;
  local_paths?: string[];
  status: string;
  type?: string;
}

export interface ProjectRegistry {
  version?: number;
  schema_version?: number;
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
    if (candidate.repository !== undefined && typeof candidate.repository !== "string") {
      if (!candidate.repository || typeof candidate.repository !== "object") {
        throw new Error(`Project ${candidate.id} repository must be a string or object`);
      }
      const repository = candidate.repository as ProjectRepository;
      if (repository.full_name !== undefined && typeof repository.full_name !== "string") {
        throw new Error(`Project ${candidate.id} repository.full_name must be a string`);
      }
    }
    if (candidate.local_paths !== undefined && !Array.isArray(candidate.local_paths)) {
      throw new Error(`Project ${candidate.id} local_paths must be an array`);
    }
    ids.add(candidate.id);
  }

  return raw as ProjectRegistry;
}
