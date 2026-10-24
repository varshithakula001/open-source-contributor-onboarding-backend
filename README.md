# Open Source Contributor Onboarding — Backend API

**Course:** AI-Powered Full Stack Development<br>
**Capstone Project:** Project 12 — Open Source Contributor Onboarding<br>
**Current Milestone:** Phase 7 (Seed Data, Demonstration Scenarios & Final Verification) — ✅ COMPLETE<br>

---

## 1. Project Purpose

The **Open Source Contributor Onboarding** portal bridges the gap between first-time student contributors and open-source project maintainers. It prevents contributors from getting lost in unfamiliar repositories by providing:
* Curated repository snapshots, setup guides, and issue summaries.
* Heading-aware markdown chunking and local semantic vector embeddings (`nomic-embed-text`).
* High-performance pre-filtered vector similarity search powered by MongoDB Atlas Vector Search.
* Natural-language documentation question-answering with strict source grounding and citation generation (`POST /api/contributor-chat`).
* Prompt-injection defenses and isolation of untrusted documentation content.
* **Purposeful AI-Powered Onboarding Agent (`POST /api/onboarding-agent`)**:
  * Bounded inspection tools (`findIssues`, `inspectPrerequisites`, `checkIssueAvailability`).
  * Solves primary contributor intent: *"Find a task I can start this weekend"*.
  * Authoritative availability re-checking with fallback to alternative candidates if top task is claimed.
  * Pragmatic starter plans with actionable steps, setup requirements, and citations without auto-approving contribution plans.
  * Audit logging in MongoDB `agentruns` collection with structured tool call histories and diagnostic safety.
* Skill-matched issue recommendations with prerequisite transparency.
* Public project and issue discovery without leaking internal or private data.
* Structured contribution plans grounded in repository evidence, reviewed by maintainers before code is written.
* Safe maintainer workflows: repository snapshot documentation imports (with zero code execution) and issue curation.
* Strict safety boundaries: no unauthorized repository modifications, isolation between public and private projects, and role-based access control.

---

## 2. Technology Stack

* **Runtime:** Node.js (v24.14.1, ES Modules)
* **Web Framework:** Express.js (v4.21.2)
* **Database ODM:** Mongoose (v8.10.1) targeting MongoDB Atlas
* **Vector Search Engine:** MongoDB Atlas Vector Search (`$vectorSearch` pipeline stage)
* **AI & Embeddings:** `@langchain/ollama` (v1.3.0), `@langchain/core` (v1.3.0)
* **Local AI Models (Ollama):** `nomic-embed-text` (768-dim embeddings) & `llama3.2` (grounded chat synthesis)
* **Validation & Schemas:** Zod (v3.24.2)
* **Password Hashing:** `bcryptjs` (v3.0.3) with 72-byte max input length guards
* **Session Store:** `express-session` (v1.19.0) & `connect-mongo` (v6.0.0)
* **CSRF Protection:** `csrf-sync` (v4.2.1) using Synchronizer Token Pattern
* **Rate Limiting:** `express-rate-limit` (v8.7.1) on authentication and chat routes
* **Security Headers & CORS:** Helmet (v8.0.0) & CORS (v2.8.5)
* **Testing:** Node.js Native Test Runner (`node:test`) & Supertest (v7.0.0)

---

## 3. Folder Structure

```text
open-source-contributor-onboarding-backend/
├── .env.example                  # Environment configuration template
├── .gitignore                    # Excludes credentials, dependencies, logs
├── package.json                  # Application manifest and scripts
├── package-lock.json             # Pinned dependency tree
├── README.md                     # Project documentation & guide
├── server.js                     # HTTP server entry point & graceful shutdown
├── docs/
│   ├── AGENT_ARCHITECTURE.md     # Purposeful agent workflow, tools & safety guardrails
│   ├── AGENT_TESTING.md          # Testing guide for POST /api/onboarding-agent
│   ├── API_TESTING.md            # Comprehensive Core Business APIs testing guide
│   ├── ATLAS_VECTOR_SEARCH_SETUP.md # Step-by-step Atlas Vector Search configuration
│   ├── AUTHENTICATION.md         # Detailed authentication and security guide
│   ├── DATABASE_SCHEMA.md        # Complete ER diagram, model specifications & indexes
│   ├── DEMO_SCRIPT.md            # Interactive 9-step contributor lifecycle demonstration
│   ├── FINAL_VERIFICATION.md     # Final backend verification report & benchmarks
│   ├── IMPLEMENTATION_STATUS.md  # Detailed phase tracking document
│   ├── RAG_ARCHITECTURE.md       # RAG pipeline, chunking, retrieval & security specs
│   ├── SECURITY_REVIEW.md        # Comprehensive backend security architecture review
│   ├── vector_index.json         # MongoDB Atlas Search vector index definition (chunks)
│   ├── issue_vector_index.json   # MongoDB Atlas Search vector index definition (issues)
│   └── openapi.yaml              # OpenAPI 3.0.3 specification
├── scripts/
│   ├── seed.js                   # Safe & idempotent multi-scenario database seeder
│   ├── rag-index.js              # CLI tool for indexing snapshots into vector search
│   └── rag-index-issues.js       # CLI tool for generating & indexing issue embeddings
├── src/
│   ├── app.js                    # Express application instance and middleware pipeline
│   ├── agent/
│   │   ├── onboardingAgent.js    # Purposeful onboarding agent orchestrator & starter planner
│   │   └── tools/
│   │       ├── findIssues.tool.js              # Bounded tool: issue discovery & vector search
│   │       ├── inspectPrerequisites.tool.js    # Bounded tool: prerequisites & snapshot checks
│   │       └── checkIssueAvailability.tool.js  # Bounded tool: authoritative status verification
│   ├── config/
│   │   ├── env.js                # Zod-validated environment configuration (inc. Ollama & Vector vars)
│   │   ├── db.js                 # Reusable Mongoose connector & health inspector
│   │   ├── session.js            # Server-side session store & DB availability guard
│   │   └── csrf.js               # CSRF protection configuration
│   ├── controllers/
│   │   ├── agent.controller.js   # Onboarding agent controller (POST /api/onboarding-agent)
│   │   ├── auth.controller.js    # Signup, login, logout, verification, password recovery
│   │   ├── chat.controller.js    # Grounded contributor documentation Q&A
│   │   ├── project.controller.js # Discovery, issue browsing, verification, imports
│   │   ├── issue.controller.js   # Issue interest & maintainer issue curation
│   │   └── plan.controller.js    # Plan submission, retrieval & review
│   ├── middlewares/
│   │   ├── auth.middleware.js    # Session-based authentication (requireAuth)
│   │   ├── rbac.middleware.js    # Role checks & project-scoped maintainer guard
│   │   ├── rateLimiter.middleware.js # Rate limiters for auth, chat, and agent endpoints
│   │   ├── validate.middleware.js# Zod body, params, and query validation
│   │   └── error.middleware.js   # Centralized error handler & 404 route handler
│   ├── models/                   # Mongoose data models
│   │   ├── User.js               # User model with sessionVersion revocation
│   │   ├── Project.js            # Projects with approvalStatus & visibility separation
│   │   ├── MaintainerGrant.js    # Project-scoped maintainer privileges
│   │   ├── Snapshot.js           # Versioned snapshots with indexing status & chunk count
│   │   ├── Document.js           # Untrusted markdown documents
│   │   ├── Chunk.js              # 768-dim embeddings for Atlas Vector Search
│   │   ├── Issue.js              # Curated onboarding issues with 768-dim vector embeddings
│   │   ├── Interest.js           # Contributor availability declarations
│   │   ├── ContributionPlan.js   # Structured implementation plans
│   │   ├── Review.js             # Formal maintainer reviews
│   │   ├── AgentRun.js           # Autonomous agent execution logs & tool call tracking
│   │   └── index.js
│   ├── routes/
│   │   ├── agent.routes.js       # Onboarding agent route (POST /api/onboarding-agent)
│   │   ├── health.routes.js      # Public health check endpoint (GET /api/health)
│   │   ├── auth.routes.js        # Auth routes (/api/auth/*)
│   │   ├── chat.routes.js        # Contributor chat route (POST /api/contributor-chat)
│   │   ├── project.routes.js     # Project discovery, imports & review inbox
│   │   ├── issue.routes.js       # Issue interest & curation
│   │   └── plan.routes.js        # Contribution plans & reviews
│   ├── schemas/                  # Zod request validation schemas
│   ├── services/                 # Modular business logic & database queries
│   │   ├── agent.service.js      # Agent run lifecycle, execution tracking & error isolation
│   │   ├── chunking.service.js   # Heading-aware markdown chunking with line ranges
│   │   ├── embedding.service.js  # Ollama nomic-embed-text 768-dim embedding service
│   │   ├── vector-search.service.js # $vectorSearch pipeline & in-memory cosine fallback
│   │   ├── document-ingestion.service.js # Snapshot chunking & embedding ingestion
│   │   ├── rag.service.js        # RAG query flow, prompt injection defense, LLM synthesis
│   │   ├── password.service.js
│   │   ├── token.service.js
│   │   ├── email.service.js
│   │   ├── project.service.js
│   │   ├── issue.service.js      # Issue curation, embedding generation & issue vector search
│   │   ├── plan.service.js
│   │   ├── snapshot.service.js
│   │   └── review.service.js
│   └── utils/
│       └── errors.js             # Standardized ApiError class
└── tests/
    ├── app.test.js               # Health check, CORS, Helmet, 404 tests
    ├── models.test.js            # In-memory Mongoose schema validation tests
    ├── schemas.test.js           # Zod request validation unit tests
    ├── auth.services.test.js     # Password, token, and email service tests
    ├── auth.middleware.test.js   # requireAuth, requireRole, maintainer guard tests
    ├── auth.csrf.test.js         # CSRF token handshake and enforcement tests
    ├── auth.routes.test.js       # Auth routes behavior & DB fallback tests
    ├── business.routes.test.js   # Core Business APIs integration & security tests
    ├── rag.test.js               # RAG chunking, embedding, vector search & chat tests
    ├── agent.test.js             # Onboarding agent tools, embeddings, workflow & route tests
    └── e2e.workflow.test.js      # Phase 7 End-to-end evaluation & acceptance test suite
```

---

## 4. Installation and Environment Setup

### Prerequisites
* **Node.js** (>= 20.0.0, tested with v24.14.1)
* **npm** (>= 10.0.0, tested with 11.19.1)
* **Ollama** (for local embeddings and grounded synthesis):
  ```bash
  # Pull required local models
  ollama pull nomic-embed-text
  ollama pull llama3.2
  ```

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Copy `.env.example` to create your local `.env`:
```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

Fill in `.env`:
```env
PORT=5000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:3000
SESSION_SECRET=<your-generated-32-char-secret>
Configure MONGODB_URI in your local .env file using your own MongoDB connection string. Never commit database credentials
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_LLM_MODEL=llama3.2
OLLAMA_EMBED_MODEL=nomic-embed-text
ATLAS_VECTOR_INDEX_NAME=vector_index
EMBEDDING_DIMENSIONS=768
```

---

## 5. Running the Application, CLI Tools & Tests

### Start in Development Mode:
```bash
npm run dev
```

### Database Seeding CLI (Phase 7):
Populate MongoDB Atlas with realistic, idempotent demonstration fixtures:
```bash
npm run db:seed
```
*Note: Seeding in production requires explicit confirmation via `ALLOW_PRODUCTION_SEED=true`.*

#### Demonstration User Accounts (Created by Seeder):
| Role | Email | Password | Display Name |
| :--- | :--- | :--- | :--- |
| **Contributor** | `contributor.demo@example.com` | Alice Contributor |
| **Maintainer** | `maintainer.demo@example.com`  | Bob Maintainer |
| **Moderator** | `moderator.demo@example.com`  | Charlie Moderator |
| **Other Maintainer** | `other.maintainer@example.com` | Frank Maintainer |

### Repository Document Indexing CLI:
```bash
# Index all unindexed snapshots
npm run rag:index

# Force re-index a specific project's snapshot
npm run rag:index -- --project 671928374650192837465019 --force
```

### Issue Vector Indexing CLI (Phase 6):
```bash
# Generate 768-dim embeddings for all open issues across projects
npm run rag:index-issues

# Force re-index issues for a specific project
npm run rag:index-issues -- --projectId 671928374650192837465019 --force
```

### Run Automated Tests (195 passing tests across 67 suites):
```bash
npm test
```

---

## 6. Milestone Progress

* [x] **Phase 1: Project Scaffolding & Configuration** (Express, Helmet, CORS, Zod env validation, error middleware, health check).
* [x] **Phase 2: Database Schemas & Data Layer** (11 Mongoose models, 10 Zod validation schemas, ER diagram & index documentation).
* [x] **Phase 3: Authentication, Session Management, CSRF & RBAC** (`bcryptjs`, `express-session`, `connect-mongo`, `csrf-sync`, `express-rate-limit`, `requireAuth`, `requireRole`, `requireProjectMaintainer`, 82 passing tests).
* [x] **Phase 4: Core Business APIs** (Public project/issue discovery, interest declarations, contribution plans, maintainer inbox, snapshot imports, issue curation, plan reviews, moderator verification, 126 passing tests).
* [x] **Phase 5: Repository RAG & MongoDB Atlas Vector Search** (`@langchain/ollama`, heading-aware chunker, 768-dim embeddings, Atlas `$vectorSearch` pipeline with fallback, `POST /api/contributor-chat`, `npm run rag:index`, 148 passing tests).
* [x] **Phase 6: Purposeful AI-Powered Onboarding Agent** (Bounded tools `findIssues`, `inspectPrerequisites`, `checkIssueAvailability`, LangChain orchestration, issue semantic vector search, `POST /api/onboarding-agent`, audit logging to `AgentRun`, 172 passing tests).
* [x] **Phase 7: Seed Data, Demonstration Scenarios & Final Verification** (Idempotent seeder `scripts/seed.js`, 9-step demo script `docs/DEMO_SCRIPT.md`, security review `docs/SECURITY_REVIEW.md`, final verification report `docs/FINAL_VERIFICATION.md`, and 195 passing automated tests across 67 suites).
