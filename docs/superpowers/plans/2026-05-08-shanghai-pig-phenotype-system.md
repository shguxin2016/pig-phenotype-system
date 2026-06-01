# 上海市地方品种猪保种场表型测定记录管理系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an intranet-deployed responsive web system for fixed units to manage pig phenotype records with validations, calculations, and Excel import/export plus admin account management.

**Architecture:** Single web app (responsive UI) + REST API backend + relational database enforcing uniqueness and referential integrity. Computed fields are calculated in backend on save/import, and previewed in UI.

**Tech Stack:** To be selected from repo conventions during Task 1 (frontend framework, backend framework, DB, Excel library).

---

## Task 0: Align tech stack and scaffold (empty repo)

**Files:**
- Inspect: `/workspace` (repo currently empty)
- Create: `README.md`
- Create: `.gitignore`
- Create: `docker-compose.yml` (optional for DB)
- Create: project folders based on chosen stack

- [ ] **Step 1: Decide stack (based on organizational preference and deployment constraints)**
  
  Choose one option and use it consistently through the rest of the plan:
  
  - Option A: Frontend Next.js + Backend NestJS + PostgreSQL
  - Option B: Frontend Next.js (API routes as backend) + PostgreSQL
  - Option C: Frontend React (Vite) + Backend FastAPI + PostgreSQL

- [ ] **Step 2: Initialize repository structure**
  
  Create folders:
  - `apps/web` (frontend)
  - `apps/api` (backend)
  - `packages/shared` (shared types/constants)
  - `docs/` (already exists)

- [ ] **Step 3: Add baseline docs**
  
  Create `README.md` with:
  - How to run locally
  - How to run in intranet mode
  - How to run DB migrations
  - How to run tests

- [ ] **Step 4: Commit**
  
  ```bash
  git add .
  git commit -m "chore: initialize repository structure"
  ```

---

## Task 1: Data model and migrations

**Files:**
- Create: `apps/api/src/db/schema/*` (or equivalent)
- Create: `apps/api/src/db/migrations/*`
- Create: `packages/shared/src/domain/*`
- Test: `apps/api/src/db/schema.test.*` (or equivalent)

- [ ] **Step 1: Define fixed reference data**
  
  Add constants in `packages/shared/src/domain/reference.ts`:
  - Units (7)
  - Breeds (5)
  - Roles (保种场/测定中心/管理单位)

- [ ] **Step 2: Create database tables**
  
  Implement tables (logical model from spec):
  - `unit`
  - `breed`
  - `user`
  - `pig`
  - `growth_test`
  - `repro_litter`
  - `repro_piglet`
  - `carcass_trait`
  - `meat_quality`
  - `conservation_base_info`
  - `import_batch`
  - `import_row_error`
  
  Constraints:
  - `pig.ear_tag_no` unique global
  - `repro_litter (dam_ear_tag_no, farrowing_date)` unique
  - `repro_piglet (pig_id)` unique (one测定猪只对应一个母代窝个体信息；如需多胎次关联，改为 unique(pig_id, litter_id))

- [ ] **Step 3: Add seed migration**
  
  Seed:
  - 7 units
  - 5 breeds
  - initial admin user for 管理单位

- [ ] **Step 4: Add schema tests (smoke)**
  
  Add a smoke test that:
  - Migrates an empty DB
  - Verifies unique constraints exist (attempt duplicate insert should fail)

- [ ] **Step 5: Commit**
  
  ```bash
  git add .
  git commit -m "feat: add core schema and seed data"
  ```

---

## Task 2: Authentication and authorization (username + unit + password)

**Files:**
- Modify/Create: `apps/api/src/auth/*`
- Modify/Create: `apps/api/src/middleware/*`
- Modify/Create: `apps/api/src/routes/*`
- Test: `apps/api/src/auth/auth.test.*`
- Create: `apps/web/src/auth/*`

- [ ] **Step 1: Implement login endpoint**
  
  Request fields:
  - `username`
  - `unit_id` (or unit_name mapped to unit_id)
  - `password`
  
  Response:
  - session cookie or JWT
  - user profile (role, unit)

- [ ] **Step 2: Implement password hashing**
  
  Use a standard password hashing algorithm available in chosen stack (bcrypt/argon2).

- [ ] **Step 3: Implement role-based access control (RBAC)**
  
  Enforce:
  - 保种场: can only access rows where `unit_id == user.unit_id`
  - 测定中心: can access all units
  - 管理单位: highest privilege (all access) + account management endpoints

- [ ] **Step 4: Add auth tests**
  
  Tests:
  - login success/fail
  - unit mismatch should fail
  - permission checks for protected routes

- [ ] **Step 5: Commit**
  
  ```bash
  git add .
  git commit -m "feat: add login and RBAC"
  ```

---

## Task 3: Account management (admin only)

**Files:**
- Create: `apps/api/src/routes/admin/users.*`
- Modify: `apps/api/src/routes/index.*`
- Test: `apps/api/src/routes/admin/users.test.*`
- Create: `apps/web/src/pages/admin/users/*` (or equivalent)

- [ ] **Step 1: API - list users**
  
  Admin-only endpoint:
  - list users with unit, role, status, last_login_at (if tracked)

- [ ] **Step 2: API - create user for a fixed unit**
  
  Fields:
  - username
  - unit_id (must be one of fixed 7)
  - role (must match unit_type)
  - initial password (or generate and show once)

- [ ] **Step 3: API - update user**
  
  Allow:
  - change username
  - enable/disable
  - reset password

- [ ] **Step 4: Web UI - admin user management**
  
  Page:
  - table list
  - create dialog
  - reset password action
  - enable/disable toggle

- [ ] **Step 5: Commit**
  
  ```bash
  git add .
  git commit -m "feat: add admin account management"
  ```

---

## Task 4: Pig registry (基础档案) CRUD

**Files:**
- Create: `apps/api/src/routes/pigs.*`
- Test: `apps/api/src/routes/pigs.test.*`
- Create: `apps/web/src/pages/pigs/*`
- Create: `apps/web/src/components/pig/*`

- [ ] **Step 1: API - create/update/delete/list pigs**
  
  Fields per spec, validate:
  - ear_tag_no unique
  - required fields present
  - role scoping by unit

- [ ] **Step 2: Web UI - pig list + search**
  
  Search by:
  - ear_tag_no
  - individual_no
  - dam_ear_tag_no

- [ ] **Step 3: Web UI - pig detail header**
  
  Show fixed header info on detail pages:
  - ear_tag_no, individual_no, sex, birth_date, unit, breed

- [ ] **Step 4: Commit**
  
  ```bash
  git add .
  git commit -m "feat: add pig registry CRUD"
  ```

---

## Task 5: Growth performance module (生长性能)

**Files:**
- Create: `apps/api/src/routes/pigs/:pigId/growth.*`
- Test: `apps/api/src/routes/growth.test.*`
- Create: `apps/web/src/pages/pigs/[pigId]/growth/*`
- Create: `packages/shared/src/domain/calculations/growth.*`

- [ ] **Step 1: Define calculation functions in shared package**
  
  Implement:
  - test_days
  - adg_g
  - adfi_kg
  - fcr

- [ ] **Step 2: API - upsert growth record**
  
  Backend behavior:
  - compute derived fields on save
  - validate dates against birth_date

- [ ] **Step 3: UI - growth form with live preview**
  
  Date picker + manual entry
  Auto-recompute derived fields while editing

- [ ] **Step 4: Commit**
  
  ```bash
  git add .
  git commit -m "feat: add growth module with calculations"
  ```

---

## Task 6: Reproduction module (繁殖性能：母代窝共享)

**Files:**
- Create: `apps/api/src/routes/pigs/:pigId/repro.*`
- Test: `apps/api/src/routes/repro.test.*`
- Create: `apps/web/src/pages/pigs/[pigId]/repro/*`
- Create: `packages/shared/src/domain/calculations/repro.*`

- [ ] **Step 1: Define litter validations/calculations**
  
  Implement:
  - total_born = male + female
  - live_count = total - stillborn - mummy - malformed
  - weak <= live_count

- [ ] **Step 2: API - link pig to litter**
  
  Endpoint behavior:
  - accept pig_id + litter payload + piglet payload
  - find-or-create litter by (dam_ear_tag_no, farrowing_date)
  - if existing litter and payload conflicts, return a conflict error including differing fields
  - upsert piglet payload for this pig

- [ ] **Step 3: UI - repro form**
  
  Page sections:
  - Litter (shared) fields
  - Piglet (this pig) fields
  Show a banner when litter is shared and warn edits affect all linked pigs.

- [ ] **Step 4: Commit**
  
  ```bash
  git add .
  git commit -m "feat: add reproduction module with shared litter"
  ```

---

## Task 7: Carcass trait module (胴体性状) + derived metrics

**Files:**
- Create: `apps/api/src/routes/pigs/:pigId/carcass.*`
- Test: `apps/api/src/routes/carcass.test.*`
- Create: `apps/web/src/pages/pigs/[pigId]/carcass/*`
- Create: `packages/shared/src/domain/calculations/carcass.*`

- [ ] **Step 1: Confirm denominator policy in code**
  
  Add a config:
  - `slaughter_rate_denominator`: `pre_slaughter_weight` or `carcass_weight_total`
  
  Use it consistently in calculations.

- [ ] **Step 2: Implement calculations**
  
  Implement:
  - detach_loss_pct
  - slaughter_rate_pct
  - skin/bone/fat/lean rate

- [ ] **Step 3: API + UI**
  
  Upsert record, validate numeric ranges, compute derived fields on save.

- [ ] **Step 4: Commit**
  
  ```bash
  git add .
  git commit -m "feat: add carcass module and derived metrics"
  ```

---

## Task 8: Meat quality module (猪肉品质)

**Files:**
- Create: `apps/api/src/routes/pigs/:pigId/meatq.*`
- Test: `apps/api/src/routes/meatq.test.*`
- Create: `apps/web/src/pages/pigs/[pigId]/meatq/*`

- [ ] **Step 1: API + validation**
  
  Validate:
  - ph ranges
  - percent ranges 0-100

- [ ] **Step 2: UI**
  
  Form for all fields, date/numeric controls and required markers.

- [ ] **Step 3: Commit**
  
  ```bash
  git add .
  git commit -m "feat: add meat quality module"
  ```

---

## Task 9: Conservation base info module (保种场基本信息登记表)

**Files:**
- Create: `apps/api/src/routes/conservation-base-info.*`
- Test: `apps/api/src/routes/conservation-base-info.test.*`
- Create: `apps/web/src/pages/base-info/*`

- [ ] **Step 1: API - CRUD by year**
  
  Constraints:
  - one unit can have one record per year
  - role scoping (保种场只能管理本单位)

- [ ] **Step 2: UI - annual form + export**
  
  Allow:
  - choose year
  - fill fields
  - export to Excel

- [ ] **Step 3: Commit**
  
  ```bash
  git add .
  git commit -m "feat: add conservation base info module"
  ```

---

## Task 10: Excel import/export framework

**Files:**
- Create: `apps/api/src/excel/*`
- Create: `apps/api/src/routes/import.*`
- Create: `apps/api/src/routes/export.*`
- Test: `apps/api/src/excel/import.test.*`
- Create: `apps/web/src/pages/import/*`
- Create: `apps/web/src/pages/export/*`

- [ ] **Step 1: Define Excel templates**
  
  For each module, define:
  - required columns
  - column order
  - type parser
  - validation rules
  - unique keys

- [ ] **Step 2: Implement preview import**
  
  Endpoint:
  - upload file
  - return preview results:
    - parsed row count
    - error list with row numbers
    - dedupe/conflict detection

- [ ] **Step 3: Implement commit import**
  
  Endpoint:
  - take a preview token (or re-upload)
  - write rows in a transaction per batch
  - store ImportBatch + ImportRowError

- [ ] **Step 4: Implement export**
  
  Exports:
  - by module
  - filtered by unit and date range (admin/center can export all)

- [ ] **Step 5: UI - import/export pages**
  
  Import page:
  - file upload
  - preview table
  - error download
  - confirm import

- [ ] **Step 6: Commit**
  
  ```bash
  git add .
  git commit -m "feat: add excel import/export with validation"
  ```

---

## Task 11: Statistics and reporting (管理单位/测定中心)

**Files:**
- Create: `apps/api/src/routes/stats.*`
- Test: `apps/api/src/routes/stats.test.*`
- Create: `apps/web/src/pages/stats/*`

- [ ] **Step 1: Define minimal stats**
  
  Provide endpoints:
  - counts by unit/breed/sex
  - import batch summaries
  - missing module completeness (pig has growth? repro? carcass? meatq?)

- [ ] **Step 2: UI - stats dashboard**
  
  Table + filters:
  - date range
  - unit
  - breed

- [ ] **Step 3: Commit**
  
  ```bash
  git add .
  git commit -m "feat: add basic statistics"
  ```

---

## Task 12: Deployment hardening (intranet)

**Files:**
- Create: `Dockerfile` (web)
- Create: `Dockerfile` (api)
- Modify: `docker-compose.yml`
- Create: `apps/api/src/config/*`
- Create: `apps/web/src/config/*`

- [ ] **Step 1: Add environment configuration**
  
  Config:
  - DB connection
  - base URL
  - session/JWT secrets (not committed)

- [ ] **Step 2: Add production build and containerization**
  
  Provide:
  - `docker compose up -d` to run in intranet
  - migrations run on startup

- [ ] **Step 3: Security baseline**
  
  Ensure:
  - HTTPS termination supported (behind reverse proxy)
  - secure cookies
  - audit logs for admin actions (optional but recommended)

- [ ] **Step 4: Commit**
  
  ```bash
  git add .
  git commit -m "chore: add deployment configuration"
  ```

---

## Self-review (spec coverage)

- Units fixed (7) and roles implemented in Task 1–3
- Login with username+unit+password in Task 2
- Admin highest privilege + account management in Task 3
- Pig base info + module tabs in Task 4–8
- Repro model corrected (mother litter shared) in Task 6
- Conservation base info module in Task 9
- Excel import/export with dedupe/conflict and error list in Task 10
- Stats for admin/center in Task 11
- Intranet deployment in Task 12

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-08-shanghai-pig-phenotype-system.md`. Two execution options:

1. Subagent-Driven (recommended) - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Inline Execution - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

