#!/usr/bin/env node
import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { loadConfig } from "@ai-os/config";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function doctor(): Promise<void> {
  const config = loadConfig();
  await mkdir(config.dataDir, { recursive: true });

  const report = {
    node: process.version,
    platform: process.platform,
    home: config.home,
    dataDir: config.dataDir,
    databasePath: config.databasePath,
    databaseExists: await exists(config.databasePath),
  };

  console.log(JSON.stringify(report, null, 2));
}

const command = process.argv[2];

if (command === "doctor") {
  await doctor();
} else {
  console.error("Usage: ai-os doctor");
  process.exitCode = 1;
}
