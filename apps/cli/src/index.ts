#!/usr/bin/env node
import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "@ai-os/config";
import { invalidateMemory, listMemories, openDatabase, runMigrations, upsertMemory, upsertProjects, upsertSession } from "@ai-os/database";
import { loadAndValidateMemory } from "@ai-os/memory-core";
import { loadProjectRegistry } from "@ai-os/project-registry";
import { loadAndValidateSession } from "@ai-os/session-core";

async function exists(path: string): Promise<boolean> { try { await access(path, constants.F_OK); return true; } catch { return false; } }
const migrationsPath = (): string => resolve("packages/database/migrations");
async function withDatabase<T>(work: (database: ReturnType<typeof openDatabase>) => Promise<T> | T): Promise<T> {
  const config = loadConfig(); const database = openDatabase(config.databasePath);
  try { await runMigrations(database, migrationsPath()); return await work(database); } finally { database.close(); }
}
async function doctor(): Promise<void> { const config = loadConfig(); await mkdir(config.dataDir,{recursive:true}); console.log(JSON.stringify({node:process.version,platform:process.platform,home:config.home,dataDir:config.dataDir,databasePath:config.databasePath,databaseExists:await exists(config.databasePath)},null,2)); }
async function migrate(pathArg?: string): Promise<void> { const config=loadConfig(); const database=openDatabase(config.databasePath); try { console.log(JSON.stringify(await runMigrations(database,resolve(pathArg??migrationsPath())),null,2)); } finally { database.close(); } }
async function validateRegistry(pathArg?: string): Promise<void> { const path=resolve(pathArg??"projects/registry.yaml"); const registry=await loadProjectRegistry(path); console.log(JSON.stringify({path,valid:true,projects:registry.projects.length},null,2)); }
async function syncRegistry(pathArg?: string): Promise<void> { const path=resolve(pathArg??"projects/registry.yaml"); const registry=await loadProjectRegistry(path); const synced=await withDatabase(db=>upsertProjects(db,registry.projects.map(p=>({id:p.id,name:p.name,repository:p.repository,localPath:p.local_path,status:p.status})))); console.log(JSON.stringify({path,synced},null,2)); }
async function validateSession(pathArg?: string): Promise<void> { if(!pathArg) throw new Error("session:validate requires a manifest path"); const result=await loadAndValidateSession(resolve(pathArg),resolve("schemas/session.schema.json")); console.log(JSON.stringify(result.valid?{valid:true,id:result.value?.manifest.id,contentHash:result.value?.contentHash}:{valid:false,errors:result.errors},null,2)); if(!result.valid) process.exitCode=1; }
async function importSession(pathArg?: string): Promise<void> { if(!pathArg) throw new Error("session:import requires a manifest path"); const result=await loadAndValidateSession(resolve(pathArg),resolve("schemas/session.schema.json")); if(!result.valid||!result.value){console.error(JSON.stringify({imported:false,errors:result.errors},null,2));process.exitCode=1;return;} const {manifest,contentHash}=result.value; await withDatabase(db=>upsertSession(db,{id:manifest.id,projectId:manifest.project_id,provider:manifest.provider,model:manifest.model,startedAt:manifest.started_at,endedAt:manifest.ended_at,archivePath:manifest.archive_path,contentHash})); console.log(JSON.stringify({imported:true,id:manifest.id,contentHash},null,2)); }
async function importMemory(pathArg?: string): Promise<void> { if(!pathArg) throw new Error("memory:import requires a JSON path"); const result=await loadAndValidateMemory(resolve(pathArg),resolve("schemas/memory.schema.json")); if(!result.valid||!result.value){console.error(JSON.stringify({imported:false,errors:result.errors},null,2));process.exitCode=1;return;} const m=result.value; await withDatabase(db=>upsertMemory(db,{id:m.id,scope:m.scope.type,subjectId:m.scope.id,kind:m.category,content:m.content,confidence:m.confidence,sourceSessionId:m.provenance.sourceType==="session"?m.provenance.sourceId:undefined,status:m.status,createdAt:m.createdAt,updatedAt:m.updatedAt??m.createdAt})); console.log(JSON.stringify({imported:true,id:m.id},null,2)); }
async function showMemories(scope?: string, subjectId?: string): Promise<void> { const memories=await withDatabase(db=>listMemories(db,scope,subjectId)); console.log(JSON.stringify({count:memories.length,memories},null,2)); }
async function invalidate(id?: string): Promise<void> { if(!id) throw new Error("memory:invalidate requires an id"); const updated=await withDatabase(db=>invalidateMemory(db,id,new Date().toISOString())); if(!updated){process.exitCode=1;throw new Error(`Memory not found: ${id}`);} console.log(JSON.stringify({invalidated:true,id},null,2)); }

const [command,arg1,arg2]=process.argv.slice(2);
try {
  switch(command){
    case "doctor":await doctor();break; case "db:migrate":await migrate(arg1);break;
    case "registry:validate":await validateRegistry(arg1);break; case "registry:sync":await syncRegistry(arg1);break;
    case "session:validate":await validateSession(arg1);break; case "session:import":await importSession(arg1);break;
    case "memory:import":await importMemory(arg1);break; case "memory:list":await showMemories(arg1,arg2);break; case "memory:invalidate":await invalidate(arg1);break;
    default: console.error("Usage: ai-os <doctor|db:migrate|registry:validate|registry:sync|session:validate|session:import|memory:import|memory:list|memory:invalidate> [args]"); process.exitCode=1;
  }
} catch(error){ console.error(error instanceof Error?error.message:String(error)); process.exitCode=1; }
