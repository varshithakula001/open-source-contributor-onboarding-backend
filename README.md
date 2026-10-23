# Open Source Contributor Onboarding — Backend API

**Course:** AI-Powered Full Stack Development  
**Capstone Project:** Project 12 — Open Source Contributor Onboarding  
**Current Milestone:** Phase 5 (Repository RAG & MongoDB Atlas Vector Search) — ✅ COMPLETE  

---

## 1. Project Purpose

The **Open Source Contributor Onboarding** portal bridges the gap between first-time student contributors and open-source project maintainers. It prevents contributors from getting lost in unfamiliar repositories by providing:
* Curated repository snapshots, setup guides, and issue summaries.
* Heading-aware markdown chunking and local semantic vector embeddings (`nomic-embed-text`).
* High-performance pre-filtered vector similarity search powered by MongoDB Atlas Vector Search.
* Natural-language documentation question-answering with strict source grounding and citation generation (`POST /api/contributor-chat`).
* Prompt-injection defenses and isolation of untrusted documentation content.
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
│   ├── API_TESTING.md            # Comprehensive Core Business APIs testing guide
│   ├── ATLAS_VECTOR_SEARCH_SETUP.md # Step-by-step Atlas Vector Search configuration
│   ├── AUTHENTICATION.md         # Detailed authentication and security guide
│   ├── DATABASE_SCHEMA.md        # Complete ER diagram, model specifications & indexes
│   ├── IMPLEMENTATION_STATUS.md  # Detailed phase tracking document
│   ├── RAG_ARCHITECTURE.md       # RAG pipeline, chunking, retrieval & security specs
│   ├── vector_index.json         # MongoDB Atlas Search vector index definition
│   └── openapi.yaml              # OpenAPI 3.0.3 specification
├── scripts/
│   └── rag-index.js              # CLI tool for indexing snapshots into vector search
├── src/
│   ├── app.js                    # Express application instance and middleware pipeline
│   ├── config/
│   │   ├── env.js                # Zod-validated environment configuration (inc. Ollama & Vector vars)
│   │   ├── db.js                 # Reusable Mongoose connector & health inspector
│   │   ├── session.js            # Server-side session store & DB availability guard
│   │   └── csrf.js               # CSRF protection configuration
│   ├── controllers/
│   │   ├── auth.controller.js    # Signup, login, logout, verification, password recovery
│   │   ├── chat.controller.js    # Grounded contributor documentation Q&A
│   │   ├── project.controller.js # Discovery, issue browsing, verification, imports
│   │   ├── issue.controller.js   # Issue interest & maintainer issue curation
│   │   └── plan.controller.js    # Plan submission, retrieval & review
│   ├── middlewares/
│   │   ├── auth.middleware.js    # Session-based authentication (requireAuth)
│   │   ├── rbac.middleware.js    # Role checks & project-scoped maintainer guard
│   │   ├── rateLimiter.middleware.js # Rate limiters for auth and chat endpoints
│   │   ├── validate.middleware.js# Zod body, params, and query validation
│   │   └── error.middleware.js   # Centralized error handler & 404 route handler
│   ├── models/                   # Mongoose data models
│   │   ├── User.js               # User model with sessionVersion revocation
│   │   ├── Project.js            # Projects with approvalStatus & visibility separation
│   │   ├── MaintainerGrant.js    # Project-scoped maintainer privileges
│   │   ├── Snapshot.js           # Versioned snapshots with indexing status & chunk count
│   │   ├── Document.js           # Untrusted markdown documents
│   │   ├── Chunk.js              # 768-dim embeddings for Atlas Vector Search
│   │   ├── Issue.js              # Curated onboarding issues
│   │   ├── Interest.js           # Contributor availability declarations
│   │   ├── ContributionPlan.js   # Structured implementation plans
│   │   ├── Review.js             # Formal maintainer reviews
│   │   ├── AgentRun.js           # Autonomous agent execution logs
│   │   └── index.js
│   ├── routes/
│   │   ├── health.routes.js      # Public health check endpoint (GET /api/health)
│   │   ├── auth.routes.js        # Auth routes (/api/auth/*)
│   │   ├── chat.routes.js        # Contributor chat route (POST /api/contributor-chat)
│   │   ├── project.routes.js     # Project discovery, imports & review inbox
│   │   ├── issue.routes.js       # Issue interest & curation
│   │   └── plan.routes.js        # Contribution plans & reviews
│   ├── schemas/                  # Zod request validation schemas
│   ├── services/                 # Modular business logic & database queries
│   │   ├── chunking.service.js   # Heading-aware markdown chunking with line ranges
│   │   ├── embedding.service.js  # Ollama nomic-embed-text 768-dim embedding service
│   │   ├── vector-search.service.js # $vectorSearch pipeline & in-memory cosine fallback
│   │   ├── document-ingestion.service.js # Snapshot chunking & embedding ingestion
│   │   ├── rag.service.js        # RAG query flow, prompt injection defense, LLM synthesis
│   │   ├── password.service.js
│   │   ├── token.service.js
│   │   ├── email.service.js
│   │   ├── project.service.js
│   │   ├── issue.service.js
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
    └── rag.test.js               # RAG chunking, embedding, vector search & chat tests
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
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/onboarding?retryWrites=true&w=majority
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

### Repository Document Indexing CLI:
```bash
# Index all unindexed snapshots
npm run rag:index

# Force re-index a specific project's snapshot
npm run rag:index -- --project 671928374650192837465019 --force
```

### Run Automated Tests (148 passing tests across 58 suites):
```bash
npm test
```

---

## 6. Milestone Progress

* [x] **Phase 1: Project Scaffolding & Configuration** (Express, Helmet, CORS, Zod env validation, error middleware, health check).
* [x] **Phase 2: Database Schemas & Data Layer** (11 Mongoose models, 10 Zod validation schemas, ER diagram & index documentation).
* [x] **Phase 3: Authentication, Session Management, CSRF & RBAC** (`bcryptjs`, `express-session`, `connect-mongo`, `csrf-sync`, `express-rate-limit`, `requireAuth`, `requireRole`, `requireProjectMaintainer`, 82 passing tests).
* [x] **Phase 4: Core Business APIs** (Public project/issue discovery, interest declarations, contribution plans, maintainer inbox, snapshot imports, issue curation, plan reviews, moderator verification, 126 passing tests).
* [x] **Phase 5: Repository RAG & MongoDB Atlas Vector Search** (`@langchain/ollama`, heading-aware chunker, 768-dim embeddings, Atlas `$vectorSearch` pipeline with fallback, `POST /api/contributor-chat`, `npm run rag:index`).
* [ ] **Phase 6:** Purposeful Agent Workflow (`findIssues`, `inspectPrerequisites`, `checkIssueAvailability`).
* [ ] **Phase 7:** Seed Data, Demonstration Scenarios & Final Evaluation.
