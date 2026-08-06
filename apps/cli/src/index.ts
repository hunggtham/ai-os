#!/usr/bin/env node
import { access, mkdir, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { parseArchive } from "@ai-os/archive-ingest";
import { importArchiveDirectory } from "@ai-os/batch-ingest";
import { loadConfig } from "@ai-os/config";
import { expireMemories, getMigrationVersion, invalidateMemory, listMemories, maintainDatabase, openDatabase, runMigrations, supersedeMemory, upsertMemory, upsertProjects, upsertSession } from "@ai-os/database";
import { inspectImportSources, loadImportSourceRegistry, syncImportSources } from "@ai-os/import-sources";
import { loadAndValidateMemory } from "@ai-os/memory-core";
import { loadProjectRegistry } from "@ai-os/project-registry";
import { importProviderExport as runProviderImport, listImportRuns, recoverStaleImportRuns } from "@ai-os/provider-import";
import { loadAndValidateSession } from "@ai-os/session-core";
import { replaceSessionMessages, searchSessionMessages } from "@ai-os/session-store";

const CLI_VERSION = "0.9.0";
const REPORT_CONTRACT_VERSION = "1";

async function exists(path: string): Promise<boolean> { try { await access(path, constants.F_OK); return true; } catch { return false; } }
const migrationsPath = (): string => resolve("packages/database/migrations");
async function withDatabase<T>(work: (database: ReturnType<typeof openDatabase>) => Promise<T> | T): Promise<T> { const config = loadConfig(); const database = openDatabase(config.databasePath); try { await runMigrations(database, migrationsPath()); return await work(database); } finally { database.close(); } }
const output = (value: unknown): void => console.log(JSON.stringify(value, null, 2));

async function version(): Promise<void> { const migrationVersion=await withDatabase(db=>getMigrationVersion(db)); output({cliVersion:CLI_VERSION,nodeVersion:process.version,reportContractVersion:REPORT_CONTRACT_VERSION,migrationVersion}); }
async function doctor(): Promise<void> { const config = loadConfig(); await mkdir(config.dataDir,{recursive:true}); output({node:process.version,platform:process.platform,home:config.home,dataDir:config.dataDir,databasePath:config.databasePath,databaseExists:await exists(config.databasePath)}); }
async function migrate(pathArg?: string): Promise<void> { const config=loadConfig(); const database=openDatabase(config.databasePath); try { output(await runMigrations(database,resolve(pathArg??migrationsPath()))); } finally { database.close(); } }
async function maintain(vacuumArg?: string): Promise<void> { const result=await withDatabase(db=>maintainDatabase(db,{analyze:true,vacuum:vacuumArg==="--vacuum"})); output({maintained:true,...result}); }
async function validateRegistry(pathArg?: string): Promise<void> { const path=resolve(pathArg??"projects/registry.yaml"); const registry=await loadProjectRegistry(path); output({path,valid:true,projects:registry.projects.length}); }
async function syncRegistry(pathArg?: string): Promise<void> {
  const path=resolve(pathArg??"projects/registry.yaml");
  const registry=await loadProjectRegistry(path);
  const rows=registry.projects.map(project=>{
    const repository=typeof project.repository==="string" ? project.repository : typeof project.repository?.full_name==="string" ? project.repository.full_name : undefined;
    const localPath=typeof project.local_path==="string" ? project.local_path : typeof project.local_paths?.[0]==="string" ? project.local_paths[0] : undefined;
    return {id:String(project.id),name:String(project.name),...(repository?{repository:String(repository)}:{}),...(localPath?{localPath:String(localPath)}:{}),status:String(project.status)};
  });
  const synced=await withDatabase(db=>upsertProjects(db,rows));
  output({path,synced});
}
async function validateSession(pathArg?: string): Promise<void> { if(!pathArg) throw new Error("session:validate requires a manifest path"); const result=await loadAndValidateSession(resolve(pathArg),resolve("schemas/session.schema.json")); output(result.valid?{valid:true,id:result.value?.manifest.id,contentHash:result.value?.contentHash}:{valid:false,errors:result.errors}); if(!result.valid) process.exitCode=1; }
async function importSession(pathArg?: string): Promise<void> { if(!pathArg) throw new Error("session:import requires a manifest path"); const result=await loadAndValidateSession(resolve(pathArg),resolve("schemas/session.schema.json")); if(!result.valid||!result.value){output({imported:false,errors:result.errors});process.exitCode=1;return;} const {manifest,contentHash}=result.value; await withDatabase(db=>upsertSession(db,{id:manifest.id,projectId:manifest.project_id,provider:manifest.provider,model:manifest.model,startedAt:manifest.started_at,endedAt:manifest.ended_at,archivePath:manifest.archive_path,contentHash})); output({imported:true,id:manifest.id,contentHash}); }
async function importArchive(pathArg?: string, sessionId?: string, projectId?: string, provider="unknown"): Promise<void> { if(!pathArg||!sessionId||!projectId) throw new Error("archive:import requires path, session-id and project-id"); const path=resolve(pathArg); const startedAt=new Date().toISOString(); const archive=await parseArchive({path,projectId,providerHint:provider},sessionId,startedAt); const contentHash=createHash("sha256").update(await readFile(path)).digest("hex"); const count=await withDatabase(db=>{ upsertSession(db,{id:sessionId,projectId,provider:archive.provider,startedAt,archivePath:path,contentHash}); return replaceSessionMessages(db,archive); }); output({imported:true,id:sessionId,messages:count,contentHash}); }
async function importArchiveBatch(directory?: string, projectId?: string, provider="unknown"): Promise<void> { if(!directory||!projectId) throw new Error("archive:import-dir requires directory and project-id"); const result=await withDatabase(db=>importArchiveDirectory(db,{directory:resolve(directory),projectId,provider})); output(result); if(result.failed.length>0) process.exitCode=1; }
async function importProviderExport(pathArg?: string, projectId?: string, providerHint?: string, forceArg?: string): Promise<void> { if(!pathArg||!projectId) throw new Error("provider:import requires path and project-id"); const path=resolve(pathArg); const result=await withDatabase(db=>runProviderImport(db,{path,projectId,...(providerHint?{providerHint}:{}),force:forceArg==="--force"})); output(result); }
async function showProviderImports(limitArg?: string): Promise<void> { const limit=Number(limitArg??50); const runs=await withDatabase(db=>listImportRuns(db,Number.isFinite(limit)?limit:50)); output({count:runs.length,runs}); }
async function recoverProviderImports(minutesArg?: string): Promise<void> { const minutes=Math.min(Math.max(Number(minutesArg??60),1),10080); if(!Number.isFinite(minutes)) throw new Error("provider:imports:recover requires a numeric age in minutes"); const olderThan=new Date(Date.now()-minutes*60_000).toISOString(); const recovered=await withDatabase(db=>recoverStaleImportRuns(db,olderThan)); output({recovered,olderThan,ageMinutes:minutes}); }
async function validateImportSources(pathArg?: string): Promise<void> { const path=resolve(pathArg??"config/import-sources.yaml"); const registry=await loadImportSourceRegistry(path); output({path,valid:true,sources:registry.sources.length,enabled:registry.sources.filter(source=>source.enabled).length}); }
async function showConfiguredImportSourceStatus(pathArg?: string, sourceId?: string): Promise<void> { const path=resolve(pathArg??"config/import-sources.yaml"); const registry=await loadImportSourceRegistry(path); const sources=await withDatabase(db=>inspectImportSources(db,registry,sourceId)); const summary=sources.reduce((counts,source)=>({...counts,[source.state]:(counts[source.state]??0)+1}),{} as Record<string,number>); output({path,summary,sources}); if(sources.some(source=>source.state==="missing"||source.state==="error")) process.exitCode=1; }
async function syncConfiguredImportSources(pathArg?: string, sourceId?: string, forceArg?: string): Promise<void> { const path=resolve(pathArg??"config/import-sources.yaml"); const registry=await loadImportSourceRegistry(path); const force=sourceId==="--force"||forceArg==="--force"; const selectedSourceId=sourceId&&sourceId!=="--force"?sourceId:undefined; const results=await withDatabase(db=>syncImportSources(db,registry,{...(selectedSourceId?{sourceId:selectedSourceId}:{}),...(force?{force:true}:{})})); const summary=results.reduce((counts,result)=>({...counts,[result.status]:(counts[result.status]??0)+1}),{} as Record<string,number>); output({path,summary,results}); if(results.some(result=>result.status==="failed")) process.exitCode=1; }
async function searchArchive(query?: string, projectId?: string): Promise<void> { if(!query) throw new Error("archive:search requires a query"); const results=await withDatabase(db=>searchSessionMessages(db,query,projectId)); output({query,count:results.length,results}); }
async function importMemory(pathArg?: string): Promise<void> { if(!pathArg) throw new Error("memory:import requires a JSON path"); const result=await loadAndValidateMemory(resolve(pathArg),resolve("schemas/memory.schema.json")); if(!result.valid||!result.value){output({imported:false,errors:result.errors});process.exitCode=1;return;} const m=result.value; await withDatabase(db=>upsertMemory(db,{id:m.id,scope:m.scope.type,subjectId:m.scope.id,kind:m.category,content:m.content,confidence:m.confidence,sourceSessionId:m.provenance.sourceType==="session"?m.provenance.sourceId:undefined,status:m.status,createdAt:m.createdAt,updatedAt:m.updatedAt??m.createdAt,expiresAt:m.expiresAt??undefined,supersedes:m.supersedes??undefined})); output({imported:true,id:m.id}); }
async function showMemories(scope?: string, subjectId?: string): Promise<void> { const memories=await withDatabase(db=>listMemories(db,scope,subjectId)); output({count:memories.length,memories}); }
async function invalidate(id?: string): Promise<void> { if(!id) throw new Error("memory:invalidate requires an id"); const updated=await withDatabase(db=>invalidateMemory(db,id,new Date().toISOString())); if(!updated) throw new Error(`Memory not found: ${id}`); output({invalidated:true,id}); }
async function supersede(id?: string, replacementId?: string): Promise<void> { if(!id||!replacementId) throw new Error("memory:supersede requires old-id and replacement-id"); const updated=await withDatabase(db=>supersedeMemory(db,id,replacementId,new Date().toISOString())); if(!updated) throw new Error(`Memory not found: ${id}`); output({superseded:true,id,replacementId}); }
async function expire(): Promise<void> { const now=new Date().toISOString(); const count=await withDatabase(db=>expireMemories(db,now)); output({expired:count,at:now}); }

const [command,...args]=process.argv.slice(2);
try {
  switch(command){
    case "version":await version();break; case "doctor":await doctor();break; case "db:migrate":await migrate(args[0]);break; case "db:maintain":await maintain(args[0]);break;
    case "registry:validate":await validateRegistry(args[0]);break; case "registry:sync":await syncRegistry(args[0]);break;
    case "session:validate":await validateSession(args[0]);break; case "session:import":await importSession(args[0]);break;
    case "archive:import":await importArchive(args[0],args[1],args[2],args[3]);break; case "archive:import-dir":await importArchiveBatch(args[0],args[1],args[2]);break; case "archive:search":await searchArchive(args[0],args[1]);break;
    case "provider:import":await importProviderExport(args[0],args[1],args[2],args[3]);break; case "provider:imports":await showProviderImports(args[0]);break; case "provider:imports:recover":await recoverProviderImports(args[0]);break;
    case "provider:sources:validate":await validateImportSources(args[0]);break; case "provider:sources:status":await showConfiguredImportSourceStatus(args[0],args[1]);break; case "provider:sources:sync":await syncConfiguredImportSources(args[0],args[1],args[2]);break;
    case "memory:import":await importMemory(args[0]);break; case "memory:list":await showMemories(args[0],args[1]);break; case "memory:invalidate":await invalidate(args[0]);break;
    case "memory:supersede":await supersede(args[0],args[1]);break; case "memory:expire":await expire();break;
    default: throw new Error("Usage: ai-os <version|doctor|db:migrate|db:maintain|registry:validate|registry:sync|session:validate|session:import|archive:import|archive:import-dir|archive:search|provider:import|provider:imports|provider:imports:recover|provider:sources:validate|provider:sources:status|provider:sources:sync|memory:import|memory:list|memory:invalidate|memory:supersede|memory:expire> [args]");
  }
} catch(error){
  const message=error instanceof Error?error.message:String(error);
  console.error(JSON.stringify({ok:false,error:{code:"AI_OS_CLI_ERROR",message,command:command??null},contractVersion:REPORT_CONTRACT_VERSION},null,2));
  process.exitCode=1;
}
