import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createValidator, type ValidationResult } from "@ai-os/contracts";

export interface SessionManifest {
  id: string;
  project_id: string;
  provider: string;
  model?: string;
  started_at: string;
  ended_at?: string;
  archive_path: string;
  tags?: string[];
  summary?: string;
}

export interface LoadedSession {
  manifest: SessionManifest;
  contentHash: string;
}

export async function loadAndValidateSession(
  manifestPath: string,
  schemaPath: string,
): Promise<ValidationResult<LoadedSession>> {
  const [manifestText, schemaText] = await Promise.all([
    readFile(manifestPath, "utf8"),
    readFile(schemaPath, "utf8"),
  ]);

  const manifest = JSON.parse(manifestText) as unknown;
  const schema = JSON.parse(schemaText) as object;
  const result = createValidator<SessionManifest>(schema)(manifest);

  if (!result.valid || !result.value) {
    return { valid: false, errors: result.errors };
  }

  return {
    valid: true,
    errors: [],
    value: {
      manifest: result.value,
      contentHash: createHash("sha256").update(manifestText).digest("hex"),
    },
  };
}
