# AI OS — Sổ tay dành cho Chủ Project (Tiếng Việt)

> Mục đích: đây là tài liệu cấp **project owner** để bạn hiểu toàn bộ AI OS v1.0.0: dự án giải quyết bài toán gì, kiến trúc tại sao thiết kế như vậy, source code nằm ở đâu, dữ liệu chạy qua hệ thống thế nào, cách vận hành/debug, cách giải thích lại cho một dev khác và các nguyên tắc không nên phá khi phát triển tiếp.
>
> Baseline tài liệu: `main` tại release commit `dc26a31f8383d94cf59edca597d0d80645e5a543`. Branch dùng để tiếp tục Open Code Review: `review/open-code-review-v1.0.0`.

---

## 1. AI OS là gì?

AI OS là một **control plane local-first, độc lập nhà cung cấp AI** để quản lý toàn bộ công việc liên quan tới AI.

Nó **không phải** một model AI mới và cũng không thay thế ChatGPT, Codex, Claude Code, Gemini CLI, Ollama...

Vai trò của AI OS là đứng phía trên các tool đó và cung cấp một lớp dùng chung cho:

- danh tính project;
- knowledge dùng chung;
- lưu session AI;
- import session từ nhiều provider;
- shared durable memory;
- search local;
- theo dõi trạng thái import;
- theo dõi source nào đã mới/thay đổi;
- backup/restore;
- dashboard/API read-only;
- MCP read-only để AI agent đọc context.

Tư tưởng quan trọng nhất:

```text
AI provider có thể đổi.
Project knowledge không nên phụ thuộc provider.
Session history không nên mất khi đổi tool.
Memory không nên bị khóa trong một nền tảng AI duy nhất.
```

---

## 2. Bài toán thực tế mà dự án giải quyết

Nếu không có AI OS, dữ liệu bị chia nhỏ:

```text
ChatGPT       -> chat riêng
Codex         -> session riêng
OpenCodex     -> session riêng
Claude Code   -> session riêng
Gemini CLI    -> session riêng
Ollama        -> dữ liệu local riêng
n8n           -> workflow riêng
GitHub        -> source code
```

Mỗi tool chỉ hiểu một phần project.

Khi đổi tool, thường phải:

- copy prompt;
- copy context;
- giải thích lại kiến trúc;
- nhớ lại decision cũ;
- mất session cũ;
- tạo memory trùng lặp.

AI OS tạo một lớp trung tâm:

```text
Git + Markdown              source of truth được review
        │
        ├── project registry
        ├── architecture / decision
        ├── knowledge
        └── sanitized session archive
        │
        ▼
Provider adapter + import service
        │
        ▼
SQLite + FTS + durable memory + audit
        │
        ├── CLI              read/write
        ├── Dashboard/API    read-only
        └── MCP              read-only
```

Như vậy ChatGPT/Codex/Claude/Gemini chỉ còn là **client/provider**, không phải nơi sở hữu toàn bộ knowledge của project.

---

## 3. Các nguyên tắc bắt buộc phải giữ

Là chủ project, đây là những boundary quan trọng nhất cần bảo vệ.

### 3.1 Git + Markdown là source of truth

Thông tin quan trọng, đã review, cần giữ lâu dài phải nằm trong Git/Markdown.

SQLite chỉ là **operational state** phục vụ runtime/search/import, không phải nguồn chân lý cuối cùng.

### 3.2 Session archive và durable memory là hai khái niệm khác nhau

**Session archive** = lưu đầy đủ lịch sử làm việc.

**Durable memory** = chỉ lưu thông tin nhỏ, ổn định, cần sử dụng lại trong tương lai.

Ví dụ memory tốt:

```text
Project dùng Node 22.
CLI là mutation boundary.
Dashboard và MCP v1 là read-only.
Provider-specific code phải nằm sau adapter.
```

Ví dụ không nên đưa toàn bộ vào memory:

```text
Toàn bộ 500 message của một session debug.
```

### 3.3 Provider-specific format chỉ nằm ở adapter

Core system không được phụ thuộc trực tiếp vào JSON format riêng của ChatGPT, Codex hay provider tương lai.

Luồng đúng:

```text
raw provider data
→ adapter
→ normalized model
→ core import/database/search
```

### 3.4 Local-first

V1 được thiết kế để chạy trên máy của operator.

Không được quảng bá như một SaaS multi-user security platform.

### 3.5 CLI là write boundary

V1 cố tình giới hạn:

```text
CLI           read + write
Dashboard     read-only
API           read-only
MCP           read-only
```

Mục đích: tránh một AI agent hoặc browser vô tình sửa/xóa dữ liệu quan trọng.

### 3.6 Secret/runtime private data không được commit

Không commit:

- API key;
- OAuth token;
- private key;
- provider export thật nếu có dữ liệu nhạy cảm;
- attachment cá nhân;
- SQLite runtime database;
- backup local;
- credential;
- path local nhạy cảm chưa sanitize.

---

## 4. Technology stack

| Thành phần | Công nghệ |
| --- | --- |
| Runtime | Node.js 22+ |
| Language | TypeScript |
| Monorepo | pnpm 10.14.0 workspace |
| Database | SQLite qua `node:sqlite` |
| Search | SQLite FTS |
| Config | YAML + environment variable |
| Dashboard | Node HTTP server + browser UI đơn giản |
| MCP | stdio |
| CI | GitHub Actions |
| Source of Truth | Git + Markdown |

Workspace root quản lý:

```text
apps/*
packages/*
```

Các command chính ở root `package.json`:

```bash
pnpm build
pnpm check
pnpm test
pnpm bootstrap
pnpm backup
pnpm restore
pnpm smoke:clean
pnpm smoke:backup-restore
pnpm smoke:e2e
pnpm smoke:demo
```

---

## 5. Cấu trúc repository

```text
ai-os/
├── apps/
│   ├── cli/
│   ├── dashboard-api/
│   └── mcp/
├── packages/
│   ├── archive-ingest/
│   ├── batch-ingest/
│   ├── config/
│   ├── database/
│   ├── import-sources/
│   ├── memory-core/
│   ├── project-registry/
│   ├── provider-adapters/
│   ├── provider-import/
│   ├── session-core/
│   └── session-store/
├── docs/
├── projects/
├── knowledge/
├── sessions/
├── memory/
├── prompts/
├── adapters/
├── mcp/
├── scripts/
├── demo/
├── schemas/
├── AGENTS.md
├── README.md
├── CHANGELOG.md
├── package.json
└── pnpm-workspace.yaml
```

Cách nhớ:

```text
apps      = chương trình chạy trực tiếp
packages  = logic/domain reusable
scripts   = bootstrap/backup/smoke/operator workflow
Git docs  = knowledge đã review
runtime   = để ngoài Git
```

---

## 6. Project Registry

File:

```text
projects/registry.yaml
```

Registry định nghĩa danh tính ổn định của project.

Ví dụ AI OS:

```yaml
id: ai-os
name: AI OS
status: active
type: platform
repository:
  provider: github
  full_name: hunggtham/ai-os
  default_branch: main
knowledge_paths:
  - docs
  - knowledge
session_root: sessions/ai-os
memory_scope: ai-os
```

Ngoài ra có thể mô tả adapter liên quan:

```text
codex
opencodex
chatgpt
gemini-cli
claude-code
ollama
```

### Tại sao cần project registry?

Một provider có thể chỉ biết:

```text
/Users/me/code/ai-os
```

Máy khác lại là:

```text
/home/user/projects/ai-os
```

Không thể dùng local path làm project identity.

Do đó AI OS dùng:

```text
projectId = ai-os
```

như ID ổn định xuyên máy và xuyên provider.

### Registry sync

CLI có thể validate và sync registry vào SQLite.

Nó chỉ sync metadata, **không copy toàn bộ source code project vào database**.

---

## 7. `AI_OS_HOME` và runtime data

Khái niệm runtime quan trọng nhất:

```text
AI_OS_HOME
```

Đây là root directory cho dữ liệu local.

Ví dụ:

```text
$AI_OS_HOME/
├── data/
│   └── ai-os.sqlite
├── locks/
│   └── source-sync.lock
└── local operational state
```

Database path cũng có thể được override bằng environment config.

### Lợi ích

Tách runtime khỏi repository giúp:

- clone repo sạch;
- test bằng temp directory;
- không commit chat/export private;
- dễ backup;
- dễ recreate environment;
- CI có thể chạy clean-machine test.

Mental model:

```text
Git repo     = code + reviewed knowledge
AI_OS_HOME   = local runtime state
```

---

## 8. Database layer

Package:

```text
packages/database/
```

Đây là lớp quản lý SQLite.

Các nhóm dữ liệu chính:

```text
projects
sessions
memories
import_runs
source sync state
schema migration state
```

Message + FTS được quản lý thêm qua `session-store`.

### Khi mở database

System bật:

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
```

`foreign_keys` đảm bảo relational integrity.

`WAL` giúp database local ổn định hơn khi có nhiều thao tác read/write.

### Migration

Migration nằm tại:

```text
packages/database/migrations/
```

Flow `runMigrations()`:

```text
đọc migration files theo thứ tự
→ check schema_migrations
→ migration chưa chạy
→ BEGIN IMMEDIATE
→ chạy SQL
→ ghi version
→ COMMIT
```

Nếu lỗi:

```text
ROLLBACK
```

Không nên sửa ngầm nội dung migration đã release. Nên tạo migration mới.

### Database maintenance

CLI:

```bash
ai-os db:maintain
ai-os db:maintain --vacuum
```

Flow:

```text
PRAGMA integrity_check
→ ANALYZE
→ optional WAL checkpoint
→ optional VACUUM
```

Trước VACUUM quan trọng nên backup.

---

## 9. Session model

Một normalized session về bản chất chứa:

```text
id
projectId
provider
model
startedAt
endedAt
archivePath
contentHash
messages
```

Message:

```text
role
content
createdAt
metadata
```

### Vì sao cần normalized session?

ChatGPT và Codex lưu dữ liệu hoàn toàn khác nhau.

Nếu core system hiểu từng format riêng:

```text
Database code phải hiểu ChatGPT
Search code phải hiểu Codex
MCP phải hiểu Claude
Dashboard phải hiểu Gemini
```

=> coupling rất lớn.

AI OS thay bằng:

```text
Provider format
→ normalized session
→ mọi phần phía sau dùng chung model
```

---

## 10. Provider Adapter

Package:

```text
packages/provider-adapters/
```

Adapter interface về mặt logic:

```text
supports(source)
parse(source)
```

Output:

```text
NormalizedSessionArchive[]
```

### ChatGPT adapter

Hỗ trợ JSON export conversation.

Nó thực hiện:

- đọc conversation mapping;
- theo parent chain/current node;
- lấy message;
- normalize role;
- normalize timestamp;
- tạo stable ID;
- output normalized archive.

### Codex adapter

Hỗ trợ `.jsonl` với provider hint `codex`.

Nó có thể đọc nhiều dạng nested payload:

```text
record.payload
record.message
record.item
```

Sau đó lấy:

```text
role
content
timestamp
session_id
model
```

Invalid JSONL sẽ báo line lỗi.

### Khi thêm provider mới

Pattern cần giữ:

```text
Gemini/Claude/Provider X raw format
        ↓
Provider X adapter
        ↓
NormalizedSessionArchive
        ↓
existing import/database/search
```

Không xây một pipeline database riêng cho mỗi provider.

---

## 11. Provider Import Service

Package:

```text
packages/provider-import/
```

Đây là pipeline import chính.

Flow:

```text
provider export
→ đọc bytes
→ SHA-256
→ resolve adapter
→ parse
→ validation
→ import audit = running
→ transaction persist session/messages
→ succeeded
```

### Idempotency

Nếu đã có successful import với cùng:

```text
source path
project ID
provider
content hash
```

thì lần sau có thể trả:

```text
skipped
```

thay vì import lại toàn bộ.

### `--force`

Force dùng khi thật sự muốn rebuild/reimport dù hash không đổi.

Không nên dùng force mặc định vì sẽ làm mất lợi ích idempotency.

### Atomic import

Đây là một fix quan trọng sau code review.

Trước khi harden, nguy cơ:

```text
session 1 save OK
session 2 save OK
session 3 fail
```

Database có thể còn partial data dù import status `failed`.

Sau fix:

```text
BEGIN
session 1
session 2
session 3
...
all OK -> COMMIT
any fail -> ROLLBACK tất cả
```

Đây là transaction boundary rất quan trọng.

### Import audit

Mỗi import run lưu:

```text
run ID
source path
project ID
provider
content hash
status
session count
message count
error
startedAt
finishedAt
```

Status:

```text
running
succeeded
failed
skipped
```

### Recover stale import

Nếu app crash khi status vẫn `running`:

```bash
ai-os provider:imports:recover
ai-os provider:imports:recover 120
```

`120` = import chạy quá 120 phút được xem xét recover.

---

## 12. Configured Import Sources

Package:

```text
packages/import-sources/
```

Thay vì mỗi lần tự chỉ path export bằng command, system có thể quản lý một source registry.

Ví dụ tư duy:

```yaml
source A -> Codex export path
source B -> ChatGPT export path
source C -> another machine/provider export
```

Source layer phụ trách:

- load registry;
- resolve path;
- relative path;
- absolute path;
- home-relative path;
- env-based path;
- detect missing;
- detect changed;
- detect synced;
- skip disabled;
- chạy import với source actionable.

State chính:

```text
new
changed
synced
missing
disabled
error
```

Nhờ đó automation chỉ cần hỏi:

```text
"Có source nào mới hoặc thay đổi không?"
```

---

## 13. Source Sync Process Lock

File:

```text
apps/cli/src/process-lock.ts
```

Khi chạy automation định kỳ, có nguy cơ:

```text
cron job 1 chưa xong
cron job 2 bắt đầu
=> cùng import một lúc
```

AI OS dùng lock:

```text
$AI_OS_HOME/locks/source-sync.lock
```

Lock được tạo atomic bằng `wx`.

### Race condition đã được fix

Case nguy hiểm:

```text
Process A tạo lock.
Lock A rất cũ.
Process B thay stale lock.
A chạy xong sau đó release.
A xóa nhầm lock của B.
Process C vào cùng lúc với B.
```

Fix:

```text
owner token
+ PID check
+ ownership validation khi release
```

Nếu lock cũ nhưng PID owner vẫn còn sống, system không steal lock chỉ vì timestamp cũ.

### Owner note

Không nên `rm lockfile` thủ công nếu chưa kiểm tra process owner.

---

## 14. Session Store + Full Text Search

Package:

```text
packages/session-store/
```

Chức năng:

- lưu/replace message của session;
- update FTS index;
- list message;
- search message.

### FTS

Search dựa trên SQLite FTS và BM25.

Concept:

```sql
WHERE FTS MATCH ?
ORDER BY bm25(...)
LIMIT ? OFFSET ?
```

Có thể filter theo project.

### Pagination fix

Bug cũ:

```text
DB trả max 500 rows
API offset = 600
sau đó JS slice(600,...)
=> luôn empty
```

Fix:

```text
LIMIT + OFFSET thực hiện ngay trong SQLite
```

Ordering cũng được làm deterministic hơn để pagination ổn định.

---

## 15. Durable Memory

Các phần liên quan:

```text
packages/memory-core/
memory/
schemas/memory.schema.json
```

Durable memory khác session.

Một memory có thể gồm:

```text
id
scope
subject
kind/category
content
confidence
provenance
status
createdAt
updatedAt
expiresAt
supersession
```

### Lifecycle

CLI hỗ trợ:

```text
import
list
invalidate
supersede
expire
```

Tại sao cần lifecycle?

Memory có thể lỗi thời.

Ví dụ:

```text
2026: dùng SQLite
2027: chuyển PostgreSQL
```

Không thể để hai memory đều active mà không có quan hệ.

Cần:

```text
old memory -> superseded
new memory -> active
```

Hoặc:

```text
temporary memory -> expired
wrong memory -> invalid
```

---

## 16. CLI App

Application:

```text
apps/cli/
```

CLI là operator interface quan trọng nhất.

Version hiện tại:

```text
1.0.0
```

Report contract:

```text
1
```

Các command chính:

```bash
ai-os version
ai-os doctor

ai-os db:migrate
ai-os db:maintain

ai-os registry:validate
ai-os registry:sync

ai-os session:validate
ai-os session:import

ai-os archive:import
ai-os archive:import-dir
ai-os archive:search

ai-os provider:import
ai-os provider:imports
ai-os provider:imports:recover

ai-os provider:sources:validate
ai-os provider:sources:status
ai-os provider:sources:sync

ai-os memory:import
ai-os memory:list
ai-os memory:invalidate
ai-os memory:supersede
ai-os memory:expire
```

### Structured error

Thay vì output text khó parse:

```text
Something failed!!!
```

CLI trả JSON:

```json
{
  "ok": false,
  "error": {
    "code": "AI_OS_CLI_ERROR",
    "message": "...",
    "command": "..."
  },
  "contractVersion": "1"
}
```

Điều này rất quan trọng khi gọi từ:

```text
n8n
cron
launchd
systemd
shell automation
```

---

## 17. Dashboard + JSON API

Application:

```text
apps/dashboard-api/
```

Dashboard v1 được cố ý giữ đơn giản.

Mental model:

```text
localhost
read-only
operator dashboard
```

Nó không phải admin SaaS platform.

Có thể xem:

- project count/status;
- project list;
- session list;
- session detail;
- message;
- search;
- import history;
- import summary;
- source freshness.

### Tại sao không write?

Nếu cho write, ngay lập tức phải giải quyết:

```text
auth
permission
audit
validation
concurrency
delete safety
agent permissions
```

V1 tránh toàn bộ risk này bằng read-only boundary.

---

## 18. Privacy Path Redaction

Absolute path có thể leak:

```text
username
home directory
project directory
provider export location
private filesystem layout
```

Ví dụ:

```text
/Users/name/.codex/session.jsonl
```

Default output chuyển thành:

```text
~/.codex/session.jsonl
```

Repo path:

```text
/work/ai-os/config/import-sources.yaml
```

thành:

```text
<repo>/config/import-sources.yaml
```

Path khác:

```text
/private/export.json
```

thành:

```text
<local>/export.json
```

### Review fix quan trọng

Trước đây chỉ field có tên `path` mới được redact.

Nhưng error có thể là:

```text
ENOENT opening /Users/me/private/export.json
```

Field là:

```text
errorMessage
```

Nên path vẫn leak.

Sau fix, path nằm **bên trong error/message string** cũng được sanitize.

Có hỗ trợ Windows absolute path.

### Debug raw path

Chỉ bật local khi cần:

```bash
AI_OS_EXPOSE_RAW_PATHS=1
```

---

## 19. MCP Server

Application:

```text
apps/mcp/
```

MCP dùng:

```text
stdio
read-only
```

Read layer có các chức năng tương đương:

```text
listProjects
listSessions
getSession
listMessages
searchMessages
listMemories
importHealth
sourceFreshness
systemStatus
```

Tool MCP:

```text
list_projects
list_sessions
get_session
list_session_messages
search_session_messages
list_memories
get_import_health
inspect_source_freshness
get_system_status
```

### MCP dùng để làm gì?

Ví dụ Codex/Claude/Gemini agent bắt đầu task:

```text
Agent
→ MCP search session cũ
→ MCP đọc project/memory
→ lấy đúng context
→ thực hiện task
```

Agent không cần đọc SQLite trực tiếp.

### Không có write MCP trong v1

Không có:

```text
write_memory
delete_session
run_import
modify_project
```

Nếu sau này thêm, cần ADR/security model mới.

---

## 20. Backup

Script:

```text
scripts/backup.mjs
```

Backup không đơn giản là:

```bash
cp ai-os.sqlite backup.sqlite
```

Vì SQLite đang dùng WAL, copy tùy ý có thể tạo snapshot không consistent.

AI OS sử dụng SQLite-aware backup flow, gồm checkpoint/snapshot (`VACUUM INTO` style).

Manifest backup chứa metadata kiểu:

```text
role
name
bytes
sha256
```

Root command:

```bash
pnpm backup
```

---

## 21. Restore + Disaster Recovery

Script:

```text
scripts/restore.mjs
```

Restore được thiết kế theo nguyên tắc:

```text
validate trước
write runtime sau
```

Các bước bảo vệ:

```text
check manifest contract
→ database entry tồn tại
→ filename safe
→ path không escape backup dir
→ verify bytes
→ verify SHA-256
→ check target existing
→ copy vào temp DB
→ SQLite integrity_check
→ rename vào target
```

### Path traversal

Manifest độc hại có thể ghi:

```text
../secret-file
```

Nếu code chỉ:

```text
resolve(backupDir, file.name)
```

thì có thể escape backup directory.

Fix hiện tại validate resolved path phải nằm trong backup root.

### Verify toàn bộ manifest

Không chỉ DB, local config cũng phải verify:

```text
size
SHA-256
```

trước khi restore.

### Force overwrite

Nếu target DB đã tồn tại, restore không tự ghi đè trừ khi operator dùng `--force`.

---

## 22. Bootstrap

Script:

```text
scripts/bootstrap.mjs
```

Mục tiêu: một máy sạch có thể dựng lại AI OS.

Flow:

```text
git checkout
→ pnpm install
→ build
→ tạo AI_OS_HOME directories
→ migrations
→ sync project registry
→ runtime ready
```

Command:

```bash
pnpm bootstrap
```

Một nguyên tắc project owner nên nhớ:

> Nếu project chỉ chạy được vì một file/config bí mật nào đó trên máy cũ mà tài liệu không nói tới, thì project chưa reproducible.

---

## 23. CI và Smoke Tests

Workflow:

```text
.github/workflows/ci.yml
```

Chạy khi:

```text
pull_request
push main
```

Pipeline:

```bash
pnpm install --no-frozen-lockfile
pnpm check
pnpm build
pnpm test
pnpm smoke:clean
pnpm smoke:backup-restore
pnpm smoke:e2e
pnpm smoke:demo
```

### `pnpm check`

Check compile/type/workspace consistency.

### `pnpm build`

Build toàn bộ packages/apps.

### `pnpm test`

Unit + integration + regression tests.

### `smoke:clean`

Test boot trên environment sạch.

### `smoke:backup-restore`

Test backup/restore thật.

Bao gồm cả các case hardening như manifest bị sửa/path traversal.

### `smoke:e2e`

Test full system:

```text
temp AI_OS_HOME
→ bootstrap
→ import Codex fixture
→ search
→ backup
→ start dashboard
→ start MCP
→ query MCP
→ verify DB state
→ cleanup
```

### `smoke:demo`

Test demo sanitized:

```text
source new
→ import
→ search marker
→ source synced
```

---

## 24. Demo Workspace

Directory:

```text
demo/
```

Demo chứa synthetic data, không dùng chat thật.

Mục đích:

- demo project cho người khác;
- test provider import;
- CI smoke;
- tránh leak private data.

Đây là cách tốt nhất để trình bày project cho một engineer mới.

---

## 25. Các lỗi quan trọng đã được OpenCodeReview-style review phát hiện và fix

Bạn nên hiểu các lỗi này vì chúng phản ánh risk thật trong architecture.

### 25.1 Process lock ownership race

Risk:

```text
process cũ xóa lock của process mới
```

Fix:

```text
owner token
PID validation
release chỉ xóa lock nếu vẫn là owner
```

### 25.2 Partial provider import

Risk:

```text
batch fail giữa chừng nhưng DB còn data một phần
```

Fix:

```text
transaction cho toàn batch
```

### 25.3 Error leak absolute path

Risk:

```text
path được redact nhưng errorMessage vẫn leak path
```

Fix:

```text
sanitize path bên trong string
```

### 25.4 Pagination > 500

Risk:

```text
load 500 rows rồi slice offset 600
=> empty sai
```

Fix:

```text
SQLite LIMIT/OFFSET trực tiếp
```

### 25.5 Restore manifest safety

Risk:

```text
config không verify đầy đủ
path traversal qua ../
```

Fix:

```text
verify mọi manifest entry
size + hash + safe path
```

---

## 26. Cài đặt nhanh cho owner

Yêu cầu:

```text
Node >= 22
pnpm 10.14.0
Git
```

Flow:

```bash
git clone https://github.com/hunggtham/ai-os.git
cd ai-os
pnpm install --frozen-lockfile
pnpm bootstrap
pnpm smoke:e2e
```

Các tài liệu vận hành quan trọng:

```text
docs/installation.md
docs/operator-guide.md
docs/reliability-operations.md
docs/upgrade-rollback.md
docs/release-checklist.md
```

---

## 27. Workflow sử dụng hàng ngày

Ví dụ:

```bash
# Version/system information
pnpm --filter @ai-os/cli exec node dist/index.js version

# Xem source provider nào cần sync
pnpm provider:sources:status

# Automation-safe source sync
pnpm --filter @ai-os/cli source:sync-actionable

# Search session
pnpm --filter @ai-os/cli exec node dist/index.js archive:search "keyword"

# Dashboard
pnpm dev:api

# MCP
pnpm dev:mcp
```

Nếu package chưa build thì chạy build trước.

---

## 28. Cách giải thích project trong 60 giây

Bạn có thể nói như sau:

> AI OS là một control plane local-first để tách project knowledge khỏi các AI provider. Git và Markdown giữ source of truth đã review. ChatGPT/Codex export được adapter normalize rồi import transactionally vào SQLite. SQLite dùng cho session, memory, audit và full-text search. CLI là write boundary; dashboard và MCP chỉ đọc. Runtime data để ngoài Git, local path được redact, import có audit/idempotency, backup/restore có checksum, và toàn bộ system được test bằng clean-machine, disaster-recovery, E2E và demo CI.

Nếu giải thích câu này được rõ ràng thì bạn đã hiểu kiến trúc lớn của project.

---

## 29. Data Flow tổng quát

```text
                  REVIEWED DATA
┌────────────────────────────────────────────┐
│ Git                                        │
│ docs / projects / knowledge / sessions     │
│ schemas / prompts / decisions              │
└─────────────────────┬──────────────────────┘
                      │
                      ▼
              project identity/rules
                      │
┌─────────────────────┴──────────────────────┐
│ Provider exports                           │
│ ChatGPT JSON / Codex JSONL / future        │
└─────────────────────┬──────────────────────┘
                      ▼
                 adapter registry
                      ▼
                   normalize
                      ▼
                   validate
                      ▼
                audited import
                      ▼
              atomic transaction
                      ▼
┌────────────────────────────────────────────┐
│ SQLite                                     │
│ project / session / message / FTS          │
│ memory / import / source state             │
└───────────────┬──────────────┬─────────────┘
                │              │
                │              ├── Dashboard read-only
                │              └── MCP read-only
                │
                └── CLI read/write
                      │
                  backup/restore
```

---

## 30. Debug Map

### Provider import không được

Check theo thứ tự:

```text
1. file tồn tại?
2. provider hint đúng?
3. adapter supports format?
4. parser error?
5. project ID đã có?
6. import_runs ghi gì?
7. CLI JSON error nói gì?
```

### Search không có kết quả

Check:

```text
import succeeded?
session tồn tại?
message tồn tại?
FTS row có?
query đúng?
project filter đúng?
limit/offset đúng?
```

### Source luôn `synced`

So content hash với import thành công gần nhất.

Chỉ force nếu thật sự muốn rebuild.

### Source sync báo lock

Check:

```text
$AI_OS_HOME/locks/source-sync.lock
```

Không xóa lock trước khi check PID owner.

### Restore fail

Check:

```text
manifest version
filename
safe path
bytes
SHA-256
integrity_check
target existing
--force
```

Restore fail do validation thường là system đang **bảo vệ dữ liệu**.

### MCP không thấy dữ liệu

Check:

```text
MCP đang dùng cùng AI_OS_HOME?
database path đúng?
migration đã chạy?
MCP process start được?
client initialize MCP đúng?
input schema đúng?
path alias có bị hiểu nhầm là path thật không?
```

---

## 31. Security Model — không được nói quá khả năng hệ thống

AI OS v1 **không phải** multi-user production SaaS.

V1 không đảm bảo:

- public internet security;
- login/user management;
- tenant isolation;
- remote authorization;
- internet-exposed MCP security;
- hostile multi-user database access;
- arbitrary remote write.

V1 giả định:

```text
trusted local operator
localhost dashboard
stdio MCP
local CLI mutation
```

Nếu muốn deploy public thì phải thiết kế phase mới.

Không phải chỉ thêm reverse proxy là xong.

---

## 32. Các feature cố ý để post-v1

Đang defer:

- vector embedding;
- semantic/vector retrieval;
- automatic memory extraction;
- Mem0/OpenMemory integration;
- write MCP;
- write dashboard;
- remote multi-user hosting;
- authentication;
- authorization;
- tenant isolation;
- filesystem watcher liên tục;
- event bus/job queue phân tán;
- multi-machine sync;
- mobile client;
- plugin marketplace.

Nếu implement các thay đổi lớn/hard-to-reverse, nên tạo ADR trước.

---

## 33. Thứ tự tin tưởng documentation

Nếu thông tin xung đột, dùng thứ tự:

```text
1. accepted architecture / ADR hiện tại
2. source code + migration + schema + config
3. project registry
4. durable memory có provenance
5. session summary
6. raw session
7. generated index / model inference
```

Docs quan trọng:

```text
README.md
docs/architecture.md
docs/ADR_STATUS.md
docs/PROJECT_STATUS.md
docs/installation.md
docs/operator-guide.md
docs/reliability-operations.md
docs/disaster-recovery.md
docs/mcp-operator-guide.md
docs/upgrade-rollback.md
docs/release-checklist.md
CHANGELOG.md
```

### Lưu ý đặc biệt về `AGENTS.md`

`AGENTS.md` hiện vẫn có nội dung lịch sử nói project đang ở **Phase 0** và không nên implement production modules.

Trong thực tế project đã đi qua implementation/release-hardening v1.

Do đó hiện tại nên ưu tiên:

```text
architecture hiện tại
PROJECT_STATUS
source code
```

và nên tạo một documentation cleanup PR sau để sửa `AGENTS.md`, tránh AI agent đọc rule cũ rồi hiểu sai trạng thái dự án.

---

## 34. Branch Strategy

Mental model:

```text
main
= stable reviewed baseline

feature/*
reliability/*
review/*
release/*
= nơi thay đổi code

PR
= review + CI boundary
```

Branch hiện tại dành cho OCR:

```text
review/open-code-review-v1.0.0
```

Base:

```text
dc26a31f8383d94cf59edca597d0d80645e5a543
```

Mọi fix từ OCR nên commit vào branch này rồi PR về `main`.

---

## 35. Workflow với Open Code Review

```bash
git fetch origin
git switch review/open-code-review-v1.0.0
ocr scan
```

Ưu tiên review:

```text
1. data loss/corruption
2. transaction
3. concurrency
4. security/privacy
5. filesystem/path safety
6. idempotency
7. backup/restore
8. MCP/API contract
9. test/observability
10. style
```

Sau khi fix:

```bash
pnpm check
pnpm build
pnpm test
pnpm smoke:clean
pnpm smoke:backup-restore
pnpm smoke:e2e
pnpm smoke:demo
```

Sau đó PR về `main`.

---

## 36. Khi thêm provider mới

Ví dụ muốn hỗ trợ Claude Code export hoặc Gemini export.

Không làm:

```text
ClaudeImporter -> ClaudeDatabase
GeminiImporter -> GeminiDatabase
```

Nên làm:

```text
Claude format
→ Claude adapter
→ normalized session
→ existing provider-import

Gemini format
→ Gemini adapter
→ normalized session
→ existing provider-import
```

Checklist:

```text
[ ] hiểu raw format thật
[ ] adapter
[ ] deterministic ID
[ ] normalized model
[ ] sanitized fixture
[ ] parser test
[ ] import test
[ ] idempotency test
[ ] source freshness
[ ] privacy path test
[ ] E2E
```

---

## 37. Khi thay đổi database

Không sửa DB tùy tiện.

Flow nên là:

```text
1. xác định backward compatibility
2. tạo migration mới
3. update TypeScript model/query
4. update integration tests
5. xem backup/restore có bị ảnh hưởng không
6. update docs
7. ghi rõ rollback limitation
```

Quan trọng:

```text
git rollback code != database rollback
```

Nếu migration destructive, cần đặc biệt cẩn thận.

---

## 38. Khi muốn thêm write vào Dashboard/MCP

Không chỉ thêm:

```text
POST /api/memory
```

hoặc:

```text
mcp tool write_memory
```

Mà phải giải quyết:

```text
Authentication
Authorization
Agent permission
Audit
Validation
Concurrency
Idempotency
Rollback
Destructive actions
Secret handling
Remote trust model
```

Đây gần như là một architecture milestone mới.

---

## 39. Release Checklist dành cho Owner

Trước version tương lai:

```text
[ ] version đồng bộ package/runtime
[ ] migration test OK
[ ] provider regression OK
[ ] pnpm check OK
[ ] pnpm build OK
[ ] pnpm test OK
[ ] smoke clean OK
[ ] backup/restore OK
[ ] E2E OK
[ ] demo OK
[ ] privacy review OK
[ ] không commit secret/provider private data/runtime DB
[ ] CHANGELOG update
[ ] install docs update
[ ] upgrade/rollback docs update
[ ] final main SHA xác định
[ ] tag đúng SHA
```

---

## 40. Những câu hỏi chủ project phải trả lời được

Bạn nên có thể tự giải thích:

1. AI OS dùng để làm gì?
2. Tại sao không chỉ dùng ChatGPT memory?
3. Vì sao Git là source of truth?
4. Vì sao SQLite không phải source of truth?
5. Session và memory khác gì?
6. ChatGPT/Codex export vào DB như thế nào?
7. Adapter dùng để làm gì?
8. Duplicate import được tránh ra sao?
9. Import fail giữa chừng thì sao?
10. Vì sao cần process lock?
11. Vì sao dashboard/MCP read-only?
12. Path privacy được bảo vệ thế nào?
13. Search chạy bằng gì?
14. Backup SQLite có gì đặc biệt?
15. Restore verify gì?
16. CI E2E test những gì?
17. Thêm provider mới theo pattern nào?
18. Khi nào phải tạo ADR?
19. Những gì đang defer post-v1?
20. Nếu local DB mất thì recover thế nào?

Nếu chưa trả lời được câu nào, xem lại section tương ứng trước khi thay đổi architecture.

---

## 41. Mental Model cuối cùng cần nhớ

Có thể nén toàn dự án thành:

```text
Git/Markdown
= reviewed knowledge + decision

Provider exports
= raw external data

Adapters
= translation boundary

Provider Import
= validation + audit + transaction boundary

SQLite
= local operational state

FTS
= local search index

Durable Memory
= cross-session compact knowledge

CLI
= trusted write boundary

Dashboard
= human read surface

MCP
= AI/tool read surface

Backup/Restore
= khả năng sống sót khi runtime gặp sự cố

CI Smoke Gates
= bằng chứng các phần trên vẫn chạy cùng nhau
```

Nếu tương lai có feature mới nhưng vẫn giữ được các boundary này, project vẫn dễ hiểu và maintain.

Nếu muốn phá/chuyển boundary, hãy coi đó là architecture decision chứ không phải một code change nhỏ.
