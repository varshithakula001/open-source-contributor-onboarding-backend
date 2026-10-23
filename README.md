# Open Source Contributor Onboarding — Backend API

**Course:** AI-Powered Full Stack Development  
**Capstone Project:** Project 12 — Open Source Contributor Onboarding  
**Current Milestone:** Phase 3 (Authentication, Session Management, CSRF & RBAC) — ✅ COMPLETE

---

## 1. Project Purpose

The **Open Source Contributor Onboarding** portal bridges the gap between first-time student contributors and open-source project maintainers. It prevents contributors from getting lost in unfamiliar repositories by providing:
* Curated repository snapshots, setup guides, and issue summaries.
* Skill-matched issue recommendations with prerequisite transparency.
* Retrieval-Augmented Generation (RAG) for answering setup and architectural questions with file and snapshot citations.
* A purposeful agent workflow guiding contributors from issue selection to starter plan creation, reviewed by project maintainers before code is written.
* Strict safety boundaries: no code execution, no unauthorized repository modifications, and isolation between public snapshots and private imports.

---

## 2. Technology Stack

* **Runtime:** Node.js (v24.14.1, ES Modules)
* **Web Framework:** Express.js (v4.21.2)
* **Database ODM:** Mongoose (v8.10.1) targeting MongoDB Atlas
* **Validation & Schemas:** Zod (v3.24.2)
* **Password Hashing:** `bcryptjs` (v2.4.3) with 72-byte max input length guards
* **Session Store:** `express-session` (v1.18.1) & `connect-mongo` (v5.1.0)
* **CSRF Protection:** `csrf-sync` (v4.0.4) using Synchronizer Token Pattern
* **Rate Limiting:** `express-rate-limit` (v7.5.0) on all sensitive authentication routes
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
├── server.js                     # HTTP server entry point & shutdown management
├── docs/
│   ├── AUTHENTICATION.md         # Detailed authentication and security guide
│   ├── DATABASE_SCHEMA.md        # Complete ER diagram, model specifications & indexes
│   └── IMPLEMENTATION_STATUS.md  # Detailed phase tracking document
├── src/
│   ├── app.js                    # Express application instance and middleware pipeline
│   ├── config/
│   │   ├── env.js                # Zod-validated environment configuration
│   │   ├── db.js                 # Reusable Mongoose connector & health inspector
│   │   ├── session.js            # Server-side session store & DB availability guard
│   │   └── csrf.js               # CSRF protection configuration
│   ├── controllers/
│   │   └── auth.controller.js    # Signup, login, logout, verification, password recovery
│   ├── middlewares/
│   │   ├── auth.middleware.js    # Session-based authentication (requireAuth)
│   │   ├── rbac.middleware.js    # Role checks & project-scoped maintainer guard
│   │   ├── rateLimiter.middleware.js # Rate limiters for auth endpoints
│   │   ├── validate.middleware.js# Zod body validation middleware
│   │   └── error.middleware.js   # Centralized error handler & 404 route handler
│   ├── models/                   # Mongoose data models
│   │   ├── User.js               # User model with sessionVersion revocation
│   │   ├── Project.js
│   │   ├── MaintainerGrant.js
│   │   ├── Snapshot.js
│   │   ├── Document.js
│   │   ├── Chunk.js              # 768-dim embeddings for Atlas Vector Search
│   │   ├── Issue.js
│   │   ├── Interest.js
│   │   ├── ContributionPlan.js
│   │   ├── Review.js
│   │   ├── AgentRun.js
│   │   └── index.js
│   ├── routes/
│   │   ├── health.routes.js      # Public health check endpoint (GET /api/health)
│   │   └── auth.routes.js        # Auth routes (/api/auth/*)
│   ├── schemas/                  # Zod request validation schemas
│   │   ├── common.js             # ObjectId validator and error formatters
│   │   ├── auth.schema.js        # Signup, login, reset, and profile schemas
│   │   ├── project.schema.js     # Project create, update, verification schemas
│   │   ├── snapshot.schema.js    # Snapshot import schema
│   │   ├── issue.schema.js       # Issue create & update schemas
│   │   ├── interest.schema.js    # Issue interest submission schema
│   │   ├── plan.schema.js        # Contribution plan create & update schemas
│   │   ├── review.schema.js      # Maintainer plan review schema
│   │   ├── chat.schema.js        # Contributor RAG chat schema
│   │   ├── agent.schema.js       # Onboarding agent workflow schema
│   │   └── index.js
│   └── services/
│       ├── password.service.js   # Bcrypt hashing & length validation
│       ├── token.service.js      # Crypto random tokens & SHA-256 hashing
│       └── email.service.js      # Verification & reset email dispatcher
└── tests/
    ├── app.test.js               # Health check, CORS, Helmet, 404 tests
    ├── models.test.js            # In-memory Mongoose schema validation tests
    ├── schemas.test.js           # Zod request validation unit tests
    ├── auth.services.test.js     # Password, token, and email service tests
    ├── auth.middleware.test.js   # requireAuth, requireRole, maintainer guard tests
    ├── auth.csrf.test.js         # CSRF token handshake and enforcement tests
    └── auth.routes.test.js       # Route behavior & DB unconfigured fallback tests
```

---

## 4. Installation and Environment Setup

### Prerequisites
* **Node.js** (>= 20.0.0, tested with v24.14.1)
* **npm** (>= 10.0.0, tested with 11.19.1)

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

Generate a secure 32+ character session secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Fill in `.env`:
```env
PORT=5000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:3000
SESSION_SECRET=<your-generated-32-char-secret>
DEV_AUTH_TOKEN_LOGGING=true
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/onboarding?retryWrites=true&w=majority
```

> **Development Mode Note:** If `MONGODB_URI` is left unconfigured, the server will start in development mode. `GET /api/health` will return status `healthy`, while database-backed auth endpoints will return `503 Service Unavailable` until a MongoDB Atlas cluster is provided.

---

## 5. Running the Application and Tests

### Start in Development Mode:
```bash
npm run dev
```

### Run Automated Tests (82 passing tests across 42 suites):
```bash
npm test
```

---

## 6. Authentication Workflows & API Guide

Detailed documentation is available in [`docs/AUTHENTICATION.md`](file:///c:/Users/ADMIN/Downloads/open-source-contributor-onboarding-backend/docs/AUTHENTICATION.md).

### Step 1: Obtain a CSRF Token
All state-changing endpoints (`POST`, `PATCH`, `DELETE`) require a CSRF token.
```bash
curl -X GET http://localhost:5000/api/auth/csrf -c cookies.txt
```
Response:
```json
{
  "success": true,
  "data": {
    "csrfToken": "abc123xyz..."
  }
}
```

### Step 2: Register a Contributor Account
```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <csrfToken>" \
  -d '{
    "email": "contributor@example.com",
    "password": "StrongPassword123!",
    "profile": {
      "displayName": "Alex",
      "skills": ["javascript", "react"],
      "availableHoursPerWeek": 10
    }
  }'
```
*(When `DEV_AUTH_TOKEN_LOGGING=true`, the verification link is displayed in your terminal).*

### Step 3: Verify Email
```bash
curl -X POST http://localhost:5000/api/auth/verify-email \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <csrfToken>" \
  -d '{ "token": "<raw-verification-token>" }'
```

### Step 4: Log In
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -b cookies.txt -c cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <csrfToken>" \
  -d '{
    "email": "contributor@example.com",
    "password": "StrongPassword123!"
  }'
```

### Step 5: Access Protected Profile (`GET /api/auth/me`)
```bash
curl -X GET http://localhost:5000/api/auth/me -b cookies.txt
```

### Step 6: Log Out
```bash
curl -X POST http://localhost:5000/api/auth/logout \
  -b cookies.txt -c cookies.txt \
  -H "X-CSRF-Token: <csrfToken>"
```

---

## 7. Milestone Progress

* [x] **Phase 1: Project Scaffolding & Configuration** (Express, Helmet, CORS, Zod env validation, error middleware, health check).
* [x] **Phase 2: Database Schemas & Data Layer** (11 Mongoose models, 10 Zod validation schemas, ER diagram & index documentation).
* [x] **Phase 3: Authentication, Session Management, CSRF & RBAC** (`bcryptjs`, `express-session`, `connect-mongo`, `csrf-sync`, `express-rate-limit`, `requireAuth`, `requireRole`, `requireProjectMaintainer`, 82 passing tests).
* [ ] **Phase 4:** Core Business APIs (Projects, Issues, Interests, Plans, Reviews, Moderator verification).
* [ ] **Phase 5:** Repository RAG & MongoDB Atlas Vector Search (`nomic-embed-text`).
* [ ] **Phase 6:** Purposeful Agent Workflow (`findIssues`, `inspectPrerequisites`, `checkIssueAvailability`).
* [ ] **Phase 7:** Seed Data, Demonstration Scenarios & Final Evaluation.
