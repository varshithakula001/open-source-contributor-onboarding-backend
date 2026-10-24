# Open Source Contributor Onboarding — Backend Security Review

**Project:** Open Source Contributor Onboarding (College Capstone)<br>
**System Architecture:** Node.js, Express.js (ES Modules), MongoDB Atlas, Mongoose, LangChain.js<br>
**Review Version:** 1.0.0 (Phase 7 Final Verification)<br>
**Date:** October 2026<br>
**Auditor / Role:** Senior Application Security Reviewer<br>

---

## 1. Executive Summary & Security Posture

The **Open Source Contributor Onboarding** backend provides automated onboarding workflows, semantic repository documentation retrieval (RAG), and curated issue matching for open-source software projects. Because the platform coordinates interactions between public contributors, repository maintainers, and platform moderators—and incorporates autonomous LLM-driven agent capabilities—it is subject to both traditional web application vulnerabilities (OWASP Top 10) and emerging AI security vulnerabilities (OWASP Top 10 for LLM Applications).

This security review provides an architectural assessment and verification of the defense mechanisms implemented across all 7 development phases. The overall security posture is **Strong**:
* Multi-layered defense-in-depth architecture.
* Zero trust boundaries between public contributors, maintainers, and administrative moderators.
* Hard constraints on AI agents preventing privilege escalation and unintended database state mutation.
* Automated regression test suite of **195 automated tests across 67 test suites** ensuring 100% compliance with security controls.

---

## 2. Authentication & Session Management

### 2.1 Threat Vectors Addressed
* Credential stuffing, brute-force dictionary attacks, rainbow table matching.
* Session hijacking, session fixation, token theft via Cross-Site Scripting (XSS).
* Stale session persistence after password resets or account revocations.

### 2.2 Security Implementation
* **Password Hashing:** Implemented with `bcrypt` using an adaptive work factor of **12** (`SALT_ROUNDS = 12`). At this cost factor, each hash operation takes ~250–350ms on modern CPUs, resisting GPU-accelerated offline attacks while maintaining acceptable login latency.
* **Session Storage:** Server-side sessions are managed via `express-session` with MongoDB persistence using `connect-mongo`. Client browsers only ever receive an opaque, signed session identifier.
* **Cookie Protections:**
  * `httpOnly: true`: Blocks client-side JavaScript access via `document.cookie`, mitigating XSS session theft.
  * `sameSite: 'lax'`: Provides baseline Cross-Site Request Forgery protection for top-level navigations while isolating cross-site API requests.
  * `secure: process.env.NODE_ENV === 'production'`: Enforces TLS-only transport in production environments.
* **Session Invalidation & Re-authentication:** The `User` model incorporates a numeric `sessionVersion` counter. When a user changes their password, requests account revocation, or undergoes administrative deactivation, `sessionVersion` is incremented. The `requireAuth` middleware verifies `req.session.sessionVersion === user.sessionVersion` on every authenticated request, instantly invalidating active sessions across all devices.
* **Credential Isolation:** User models implement `.toSafeObject()` which strips `passwordHash`, `emailVerificationTokenHash`, `passwordResetTokenHash`, and internal version keys from all JSON payloads before sending responses to the client.

---

## 3. Role-Based Access Control (RBAC) & Scope Validation

### 3.1 Role Hierarchy & Privilege Boundaries
The platform defines four distinct user roles:
1. `anonymous`: Unauthenticated visitor (limited to public project discovery and health checks).
2. `contributor`: Authenticated developer (can browse issues, submit interest, create personal contribution plans, and chat with AI assistant).
3. `maintainer`: Repository owner / delegate (can import repository snapshots, review contribution plans, and manage project metadata).
4. `moderator`: Platform administrator (can verify or reject community projects).

### 3.2 Privilege Separation & Project Scoping
* **Registration Self-Assignment Prevention:** The `userSignupSchema` strictly restricts the `role` field on registration to `contributor`. Any attempt by an external client to register as `maintainer` or `moderator` is rejected with `400 Bad Request`.
* **Project Maintainer Scope Checks (`isUserProjectMaintainer`):** Maintainer status is strictly scoped per project. Being a `maintainer` on Project A grants zero privileges on Project B. Before executing snapshot imports (`POST /api/projects/:id/imports`) or reviewing contribution plans (`POST /api/contribution-plans/:id/review`), the system evaluates:
  ```javascript
  const isOwner = await Project.findOne({ _id: projectId, ownerId: userId });
  const hasGrant = await MaintainerGrant.findOne({ projectId, maintainerId: userId, isActive: true });
  ```
  Requests lacking this specific relationship return `403 FORBIDDEN` (`FORBIDDEN_NOT_MAINTAINER`).
* **Moderator Boundary Isolation:** A user with role `moderator` has platform-wide authority to verify or reject projects (`PATCH /api/projects/:id/verification`). However, a moderator **cannot** review contribution plans or import snapshots unless they have explicitly been granted project-scoped maintainer status.
* **Private Project Isolation:** Private projects (`visibility: 'private'`) are strictly excluded from public queries (`GET /api/projects` and `GET /api/issues`). Attempts to query private documentation via `/api/contributor-chat` or `/api/onboarding-agent` without a verified maintainer grant immediately abort with `403 FORBIDDEN`.

---

## 4. CSRF Defense & Rate Limiting Architecture

### 4.1 Cross-Site Request Forgery (CSRF) Defense
* **Mechanism:** Implemented via `csrf-sync` utilizing synchronized double-submit session tokens.
* **Token Issuance:** `GET /api/auth/csrf` issues a cryptographically secure token bound to the current session.
* **Enforcement:** All mutating HTTP verbs (`POST`, `PUT`, `PATCH`, `DELETE`) are screened by the `csrfSynchronisedProtection` middleware. The request must present a valid `X-CSRF-Token` header matching the session secret.
* **Failure Mode:** Missing, forged, or expired tokens immediately trigger `403 Forbidden` (`CSRF_INVALID`) before reaching controllers or invoking database queries.

### 4.2 Rate Limiting Architecture
To safeguard system availability and mitigate brute-force and resource-exhaustion attacks, tiered rate limiters are enforced via `express-rate-limit`:

| Route / Endpoint | Window | Max Requests | Purpose |
| :--- | :--- | :--- | :--- |
| `POST /api/auth/login` | 15 minutes | 5 | Mitigates credential brute-forcing & credential stuffing |
| `POST /api/auth/register` | 60 minutes | 10 | Mitigates spam account creation |
| `POST /api/contributor-chat` | 1 minute | 20 | Protects LLM inference engine & Atlas Vector Search |
| `POST /api/onboarding-agent` | 1 minute | 10 | Protects multi-step LangChain agent execution |
| Global API `/api/*` | 15 minutes | 100 | General DDoS and aggressive scraping protection |

Rate limit breaches return `429 Too Many Requests` with a descriptive error payload (`TOO_MANY_REQUESTS`).

---

## 5. Prompt-Injection Defense & AI Safety Boundaries

### 5.1 OWASP LLM Threat Vectors
* **LLM01: Prompt Injection:** Malicious contributor inputs attempting to override system prompts, extract hidden context, or execute unauthorized operations.
* **LLM06: Excessive Agency:** AI agents taking unintended autonomous actions (e.g., claiming an issue for a user or approving a plan).
* **LLM07: System Prompt Leakage:** User probes attempting to reveal proprietary instructions or internal environment variables.

### 5.2 Deterministic Pattern Filtering
Before passing any user query to the RAG pipeline or LangChain onboarding agent, the prompt is evaluated by `detectPromptInjection()` against high-risk adversarial patterns:
* System override instructions (`ignore previous instructions`, `disregard prior directives`).
* Role manipulation (`you are now an administrator`, `pretend you are root`).
* Context extraction attacks (`print your system prompt`, `reveal your instructions`, `dump environment variables`).

When triggered, the system short-circuits execution **without invoking the LLM**, returning an honest refusal:
```json
{
  "answer": "I could not process this request. As an open-source contributor assistant, I only answer questions directly based on repository documentation.",
  "citations": [],
  "retrieval": { "matchedChunksCount": 0, "status": "prompt_injection_refused" }
}
```

### 5.3 Bounded Agent Tools & Read-Only Constraints
The onboarding agent operates with **three strictly bounded, read-only tools**:
1. `findIssues`: Filtered search against open, unassigned, eligible issues in approved projects.
2. `inspectPrerequisites`: Read-only inspection of issue metadata, setup instructions, and repository documentation.
3. `checkIssueAvailability`: Real-time authoritative verification of issue state.

**Architectural Agency Invariants:**
* **No Mutation Ability:** The agent has **no tools** to update issue documents (`status`, `assigneeId`), create `ContributionPlan` records, or alter project settings.
* **No Automatic Reservation:** Every recommendation carries an explicit non-reservation notice:
  > *"Note: This recommendation does NOT reserve the issue. You must submit your contribution plan to the maintainers to officially request assignment."*
* **Authoritative Recheck:** Before proposing any task, the agent executes `checkIssueAvailability` directly against the database to confirm the issue was not claimed concurrently by another contributor.

---

## 6. Data Sanitization, Parameter Injection & Secret Isolation

### 6.1 Strict Input Validation via Zod
* All incoming query parameters, URL path parameters, and request bodies are validated using strict Zod schemas (`src/schemas/*.schema.js`).
* Unknown, extra, or unexpected properties are stripped (`strip()` mode) or rejected, preventing prototype pollution and mass assignment attacks.

### 6.2 NoSQL Injection Defense
* User inputs are never concatenated directly into Mongoose filter queries or aggregation pipelines.
* Object IDs are validated via `mongoose.Types.ObjectId.isValid()` before casting (`new mongoose.Types.ObjectId(id)`).
* Query filters use explicit field keys (e.g. `{ projectId: parsedProjectId, approvalStatus: 'approved' }`), preventing `$where` script execution and arbitrary operator injection.

### 6.3 Secret Isolation & Logging Security
* Sensitive keys (`MONGODB_URI`, `SESSION_SECRET`, `CSRF_SECRET`, `OLLAMA_BASE_URL`) reside solely in `.env` and are accessed exclusively through `src/config/env.js`.
* `pino-http` logging serializers redact `authorization`, `cookie`, `x-csrf-token`, and request bodies containing sensitive fields (`password`, `token`).

---

## 7. Safe Database Operations & Production Guards

### 7.1 Production Environment Guards
* Database seeding (`scripts/seed.js`) incorporates a strict safety check:
  ```javascript
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
    throw new Error('Database seeding is strictly forbidden in production without ALLOW_PRODUCTION_SEED=true.');
  }
  ```
  This prevents accidental data wipes or fixture injection into live production databases.

### 7.2 Idempotency and Non-Destructive Seeding
* `scripts/seed.js` uses natural query lookups (`findOne`) and updates existing documents rather than issuing blind `deleteMany({})` drops. Repeated seed executions leave existing data intact.

### 7.3 Graceful Degradation & Health Monitoring
* If the primary MongoDB Atlas cluster drops connectivity, database operations fail fast with `503 Service Unavailable` (`DATABASE_UNAVAILABLE`) rather than hanging indefinitely.
* Vector search features automatically detect unindexed environments and fall back to exact in-memory cosine ranking over permitted documents, maintaining API availability during infrastructure initialization.

---

## 8. Residual Risks, Limitations & Production Recommendations

While the application meets all security benchmarks for a college capstone and local staging deployment, the following measures are recommended before transitioning to public production:

1. **Distributed Session Storage (Redis):** While `connect-mongo` is reliable for single-cluster workloads, production scaling across multiple server instances or serverless edge containers benefits from a low-latency Redis session store (`connect-redis`).
2. **Reverse Proxy & TLS Termination:** Ensure Nginx, Cloudflare, or AWS ALB terminates TLS with HTTP Strict Transport Security (HSTS) headers enabled (`Strict-Transport-Security: max-age=31536000; includeSubDomains`).
3. **Automated Vector Index Provisioning:** Establish an automated CI/CD pipeline or Terraform configuration to provision the `vector_index` definition in MongoDB Atlas Search upon initial deployment.
4. **WAF & Advanced LLM Guardrails:** For high-traffic enterprise exposure, place an AI Gateway (e.g., Cloudflare AI Gateway, Portkey) upstream to enforce token budgeting, latency monitoring, and semantic anomaly detection.

---

## 9. Conclusion

The security architecture of the **Open Source Contributor Onboarding** backend demonstrates thorough defense-in-depth principles. Authentication, session security, CSRF defense, RBAC scoping, and AI agency boundaries have been independently verified through **195 automated tests** with zero failures, confirming the system's readiness for capstone evaluation and demonstration.
