#!/usr/bin/env node
import { access, mkdir, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { parseArchive } from "@ai-os/archive-ingest";
import { importArchiveDirectory } from "@ai-os/batch-ingest";
import { loadConfig } from "@ai-os/config";
import { expireMemories, invalidateMemory, listMemories, openDatabase, runMigrations, supersedeMemory, upsertMemory, upsertProjects, upsertSession } from "@ai-os/database";
import { loadAndValidateMemory } from "@ai-os/memory-core";
import { loadProjectRegistry } from "@ai-os/project-registry";
import { importProviderExport as runProviderImport, listImportRuns } from "@ai-os/provider-import";
import { loadAndValidateSession } from "@ai-os/session-core";
import { replaceSessionMessages, searchSessionMessages } from "@ai-os/session-store";

async function exists(path: string): Promise<boolean> { try { await access(path, constants.F_OK); return true; } catch { return false; } }
const migrationsPath = (): string => resolve("packages/database/migrations");
async function withDatabase<T>(work: (database: ReturnType<typeof openDatabase>) => Promise<T> | T): Promise<T> { const config = loadConfig(); const database = openDatabase(config.databasePath); try { await runMigrations(database, migrationsPath()); return await work(database); } finally { database.close(); } }
async function doctor(): Promise<void> { const config = loadConfig(); await mkdir(config.dataDir,{recursive:true}); console.log(JSON.stringify({node:process.version,platform:process.platform,home:config.home,dataDir:config.dataDir,databasePath:config.databasePath,databaseExists:await exists(config.databasePath)},null,2)); }
async function migrate(pathArg?: string): Promise<void> { const config=loadConfig(); const database=openDatabase(config.databasePath); try { console.log(JSON.stringify(await runMigrations(database,resolve(pathArg??migrationsPath())),null,2)); } finally { database.close(); } }
async function validateRegistry(pathArg?: string): Promise<void> { const path=resolve(pathArg??"projects/registry.yaml"); const registry=await loadProjectRegistry(path); console.log(JSON.stringify({path,valid:true,projects:registry.projects.length},null,2)); }
async function syncRegistry(pathArg?: string): Promise<void> { const path=resolve(pathArg??"projects/registry.yaml"); const registry=await loadProjectRegistry(path); const synced=await withDatabase(db=>upsertProjects(db,registry.projects.map(p=>({id:p.id,name:p.name,repository:p.repository,localPath:p.local_path,status:p.status})))); console.log(JSON.stringify({path,synced},null,2)); }
async function validateSession(pathArg?: string): Promise<void> { if(!pathArg) throw new Error("session:validate requires a manifest path"); const result=await loadAndValidateSession(resolve(pathArg),resolve("schemas/session.schema.json")); console.log(JSON.stringify(result.valid?{valid:true,id:result.value?.manifest.id,contentHash:result.value?.contentHash}:{valid:false,errors:result.errors},null,2)); if(!result.valid) process.exitCode=1; }
async function importSession(pathArg?: string): Promise<void> { if(!pathArg) throw new Error("session:import requires a manifest path"); const result=await loadAndValidateSession(resolve(pathArg),resolve("schemas/session.schema.json")); if(!result.valid||!result.value){console.error(JSON.stringify({imported:false,errors:result.errors},null,2));process.exitCode=1;return;} const {manifest,contentHash}=result.value; await withDatabase(db=>upsertSession(db,{id:manifest.id,projectId:manifest.project_id,provider:manifest.provider,model:manifest.model,startedAt:manifest.started_at,endedAt:manifest.ended_at,archivePath:manifest.archive_path,contentHash})); console.log(JSON.stringify({imported:true,id:manifest.id,contentHash},null,2)); }
async function importArchive(pathArg?: string, sessionId?: string, projectId?: string, provider="unknown"): Promise<void> { if(!pathArg||!sessionId||!projectId) throw new Error("archive:import requires path, session-id and project-id"); const path=resolve(pathArg); const startedAt=new Date().toISOString(); const archive=await parseArchive({path,projectId,providerHint:provider},sessionId,startedAt); const contentHash=createHash("sha256").update(await readFile(path)).digest("hex"); const count=await withDatabase(db=>{ upsertSession(db,{id:sessionId,projectId,provider:archive.provider,startedAt,archivePath:path,contentHash}); return replaceSessionMessages(db,archive); }); console.log(JSON.stringify({imported:true,id:sessionId,messages:count,contentHash},null,2)); }
async function importArchiveBatch(directory?: string, projectId?: string, provider="unknown"): Promise<void> { if(!directory||!projectId) throw new Error("archive:import-dir requires directory and project-id"); const result=await withDatabase(db=>importArchiveDirectory(db,{directory:resolve(directory),projectId,provider})); console.log(JSON.stringify(result,null,2)); if(result.failed.length>0) process.exitCode=1; }
async function importProviderExport(pathArg?: string, projectId?: string, providerHint?: string, forceArg?: string): Promise<void> {
  if(!pathArg||!projectId) throw new Error("provider:import requires path and project-id");
  const path=resolve(pathArg);
  const result=await withDatabase(db=>runProviderImport(db,{path,projectId,...(providerHint?{providerHint}:{}),force:forceArg==="--force"}));
  console.log(JSON.stringify(result,null,2));
}
async function showProviderImports(limitArg?: string): Promise<void> { const limit=Number(limitArg??50); const runs=await withDatabase(db=>listImportRuns(db,Number.isFinite(limit)?limit:50)); console.log(JSON.stringify({count:runs.length,runs},null,2)); }
async function searchArchive(query?: string, projectId?: string): Promise<void> { if(!query) throw new Error("archive:search requires a query"); const results=await withDatabase(db=>searchSessionMessages(db,query,projectId)); console.log(JSON.stringify({query,count:results.length,results},null,2)); }
async function importMemory(pathArg?: string): Promise<void> { if(!pathArg) throw new Error("memory:import requires a JSON path"); const result=await loadAndValidateMemory(resolve(pathArg),resolve("schemas/memory.schema.json")); if(!result.valid||!result.value){console.error(JSON.stringify({imported:false,errors:result.errors},null,2));process.exitCode=1;return;} const m=result.value; await withDatabase(db=>upsertMemory(db,{id:m.id,scope:m.scope.type,subjectId:m.scope.id,kind:m.category,content:m.content,confidence:m.confidence,sourceSessionId:m.provenance.sourceType==="session"?m.provenance.sourceId:undefined,status:m.status,createdAt:m.createdAt,updatedAt:m.updatedAt??m.createdAt,expiresAt:m.expiresAt??undefined,supersedes:m.supersedes??undefined})); console.log(JSON.stringify({imported:true,id:m.id},null,2)); }
async function showMemories(scope?: string, subjectId?: string): Promise<void> { const memories=await withDatabase(db=>listMemories(db,scope,subjectId)); console.log(JSON.stringify({count:memories.length,memories},null,2)); }
async function invalidate(id?: string): Promise<void> { if(!id) throw new Error("memory:invalidate requires an id"); const updated=await withDatabase(db=>invalidateMemory(db,id,new Date().toISOString())); if(!updated){process.exitCode=1;throw new Error(`Memory not found: ${id}`);} console.log(JSON.stringify({invalidated:true,id},null,2)); }
async function supersede(id?: string, replacementId?: string): Promise<void> { if(!id||!replacementId) throw new Error("memory:supersede requires old-id and replacement-id"); const updated=await withDatabase(db=>supersedeMemory(db,id,replacementId,new Date().toISOString())); if(!updated){process.exitCode=1;throw new Error(`Memory not found: ${id}`);} console.log(JSON.stringify({superseded:true,id,replacementId},null,2)); }
async function expire(): Promise<void> { const now=new Date().toISOString(); const count=await withDatabase(db=>expireMemories(db,now)); console.log(JSON.stringify({expired:count,at:now},null,2)); }

const [command,...args]=process.argv.slice(2);
try {
  switch(command){
    case "doctor":await doctor();break; case "db:migrate":await migrate(args[0]);break;
    case "registry:validate":await validateRegistry(args[0]);break; case "registry:sync":await syncRegistry(args[0]);break;
    case "session:validate":await validateSession(args[0]);break; case "session:import":await importSession(args[0]);break;
    case "archive:import":await importArchive(args[0],args[1],args[2],args[3]);break; case "archive:import-dir":await importArchiveBatch(args[0],args[1],args[2]);break; case "archive:search":await searchArchive(args[0],args[1]);break;
    case "provider:import":await importProviderExport(args[0],args[1],args[2],args[3]);break; case "provider:imports":await showProviderImports(args[0]);break;
    case "memory:import":await importMemory(args[0]);break; case "memory:list":await showMemories(args[0],args[1]);break; case "memory:invalidate":await invalidate(args[0]);break;
    case "memory:supersede":await supersede(args[0],args[1]);break; case "memory:expire":await expire();break;
    default: console.error("Usage: ai-os <doctor|db:migrate|registry:validate|registry:sync|session:validate|session:import|archive:import|archive:import-dir|archive:search|provider:import|provider:imports|memory:import|memory:list|memory:invalidate|memory:supersede|memory:expire> [args]"); process.exitCode=1;
  }
} catch(error){ console.error(error instanceof Error?error.message:String(error)); process.exitCode=1; }
