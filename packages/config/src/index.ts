import { homedir } from "node:os";
import { resolve } from "node:path";

export interface AiOsConfig {
  home: string;
  dataDir: string;
  databasePath: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AiOsConfig {
  const home = resolve(env.AI_OS_HOME ?? resolve(homedir(), ".ai-os"));
  const dataDir = resolve(env.AI_OS_DATA_DIR ?? resolve(home, "data"));
  const databasePath = resolve(env.AI_OS_DATABASE_PATH ?? resolve(dataDir, "ai-os.sqlite"));

  return { home, dataDir, databasePath };
}
