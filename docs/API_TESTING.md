# API Testing Guide: Core Business APIs (Phase 4)

This document provides a comprehensive testing reference for the **Core Business APIs** implemented in Phase 4 of the Open Source Contributor Onboarding backend.

---

## 1. Authentication & Security Flow Overview

For protected endpoints:
1. **CSRF Protection**: All state-changing requests (`POST`, `PATCH`, `DELETE`) require an active session and a valid `X-CSRF-Token` header.
   - Fetch token: `GET /api/auth/csrf` (returns token in body and sets `osco.sid` session cookie).
2. **Session Authentication**: Pass the `osco.sid` cookie received upon login (`POST /api/auth/login`).
3. **Role-Based Access Control (RBAC)**: Enforced via `requireRole(...)`.
4. **Project-Scoped Maintainer Authorization**: Enforced via `requireProjectMaintainer(...)` (requires active `MaintainerGrant` or project ownership).
5. **Database Availability**: If MongoDB Atlas is disconnected or unconfigured, database-backed endpoints fail safely with `503 DATABASE_UNAVAILABLE`.

---

## 2. API Endpoints Reference

### A. Public Project Discovery
* **Endpoint**: `GET /api/projects`
* **Method**: `GET`
* **Authentication**: None (Public)
* **Role**: Any / Anonymous
* **CSRF**: Not required (Read-only)
* **Query Parameters**:
  * `page` (optional, default: `1`, min: `1`)
  * `limit` (optional, default: `10`, min: `1`, max: `50`)
  * `search` (optional, string max 100): Matches project name or description
  * `topic` (optional, string max 50): Filters by topic
  * `language` (optional, string max 50): Filters by programming language
* **Security Rules**: Only returns projects with `approvalStatus: "approved"` AND `visibility: "public"`. Private or pending/rejected projects are strictly excluded.
* **Example Request**:
  ```http
  GET /api/projects?page=1&limit=10&topic=ai HTTP/1.1
  Host: localhost:5000
  ```
* **Example Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "projects": [
        {
          "_id": "671928374650192837465019",
          "name": "Local RAG Assistant",
          "slug": "local-rag-assistant",
          "description": "Open source LangChain and Ollama retrieval tools.",
          "repositoryUrl": "https://github.com/example/rag-assistant",
          "topics": ["ai", "rag", "ollama"],
          "languages": ["javascript", "python"],
          "currentSnapshotVersion": "v1.0.0",
          "createdAt": "2026-10-23T12:00:00.000Z",
          "updatedAt": "2026-10-23T12:00:00.000Z"
        }
      ],
      "pagination": {
        "total": 1,
        "page": 1,
        "limit": 10,
        "totalPages": 1
      }
    }
  }
  ```
* **Expected Error Responses**:
  * `400 Bad Request` (`INVALID_QUERY`): Malformed query parameter (e.g. `limit=999`).
  * `503 Service Unavailable` (`DATABASE_UNAVAILABLE`): MongoDB is disconnected.

---

### B. Public Issue Browser
* **Endpoint**: `GET /api/projects/:id/issues`
* **Method**: `GET`
* **Authentication**: None (Public)
* **Role**: Any / Anonymous
* **CSRF**: Not required
* **URL Parameters**:
  * `id`: 24-character hexadecimal MongoDB ObjectId of the project.
* **Query Parameters**:
  * `page` (optional, default `1`)
  * `limit` (optional, default `10`, max `50`)
  * `skill` (optional, string): Filters by required skill
  * `effort` (optional, enum: `'hours' | 'weekend' | 'few_days' | 'week_plus'`)
* **Security Rules**: Returns only `open` issues for approved public projects. If the project is private, unapproved, or missing, returns 404 without leaking project metadata.
* **Example Request**:
  ```http
  GET /api/projects/671928374650192837465019/issues?effort=weekend HTTP/1.1
  Host: localhost:5000
  ```
* **Example Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "project": {
        "id": "671928374650192837465019",
        "name": "Local RAG Assistant",
        "slug": "local-rag-assistant"
      },
      "issues": [
        {
          "_id": "671939284750192847501928",
          "issueNumber": 12,
          "title": "Add vector store health probe",
          "description": "Provide a connection check for MongoDB Vector Search.",
          "requiredSkills": ["javascript", "mongodb"],
          "prerequisites": ["Docker running Ollama"],
          "setupSteps": ["npm install", "cp .env.example .env"],
          "labels": ["good-first-issue"],
          "estimatedEffort": "weekend",
          "status": "open",
          "isStaleSetup": false,
          "createdAt": "2026-10-23T12:30:00.000Z"
        }
      ],
      "pagination": {
        "total": 1,
        "page": 1,
        "limit": 10,
        "totalPages": 1
      }
    }
  }
  ```
* **Expected Error Responses**:
  * `400 Bad Request` (`INVALID_PARAMETERS`): Malformed ObjectId format.
  * `404 Not Found` (`PROJECT_NOT_FOUND`): Project does not exist or is private/unapproved.

---

### C. Contributor Issue-Interest Submission
* **Endpoint**: `POST /api/issues/:id/interest`
* **Method**: `POST`
* **Authentication**: Required (`requireAuth`)
* **Role**: `contributor`
* **CSRF**: Required (`X-CSRF-Token` header)
* **Payload**:
  ```json
  {
    "declaredAvailableHours": 15,
    "message": "I have experience with Express and MongoDB and would like to solve this task."
  }
  ```
* **Security Rules**:
  * Contributor ID is derived securely from the authenticated session (never trusted from request body).
  * Issue must be `open` and belong to an approved public project.
  * Enforces uniqueness for active interests (prevents duplicate submissions).
  * Issue status is NOT changed to taken (assignment requires formal review).
* **Example Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "data": {
      "interest": {
        "_id": "671948375620194837562019",
        "issueId": "671939284750192847501928",
        "contributorId": "671900000000000000000001",
        "declaredAvailableHours": 15,
        "message": "I have experience with Express and MongoDB and would like to solve this task.",
        "status": "active",
        "createdAt": "2026-10-23T14:00:00.000Z"
      }
    }
  }
  ```
* **Expected Error Responses**:
  * `400 Bad Request` (`ISSUE_NOT_AVAILABLE`): Issue is already taken or closed.
  * `401 Unauthorized` (`UNAUTHORIZED`): Missing or invalid session.
  * `403 Forbidden` (`FORBIDDEN`): User does not hold the `contributor` role.
  * `403 Forbidden` (`CSRF_INVALID`): Missing or mismatched CSRF token.
  * `404 Not Found` (`ISSUE_NOT_FOUND`): Issue missing or belongs to a private/unapproved project.
  * `409 Conflict` (`INTEREST_ALREADY_EXISTS`): Contributor already has an active interest record.

---

### D. Contribution-Plan Submission
* **Endpoint**: `POST /api/contribution-plans`
* **Method**: `POST`
* **Authentication**: Required (`requireAuth`)
* **Role**: `contributor`
* **CSRF**: Required (`X-CSRF-Token` header)
* **Payload**:
  ```json
  {
    "projectId": "671928374650192837465019",
    "issueId": "671939284750192847501928",
    "snapshotId": "671911111111111111111111",
    "planObjective": "Implement health probe checking vector index ping latency.",
    "proposedApproach": "Add a ping method to vector search client and mount it on health route.",
    "orderedImplementationSteps": [
      {
        "stepNumber": 1,
        "description": "Inspect Mongoose connection and vector search collection.",
        "targetFiles": ["src/config/db.js"]
      },
      {
        "stepNumber": 2,
        "description": "Add ping test cases asserting latency measurements.",
        "targetFiles": ["tests/health.test.js"]
      }
    ],
    "supportingEvidence": [
      {
        "snapshotVersion": "v1.0.0",
        "filePath": "docs/architecture.md",
        "quoteOrExplanation": "Section 3 describes vector store ping interface."
      }
    ],
    "prerequisitesChecked": true
  }
  ```
* **Security Rules**:
  * Contributor ID is derived from the session.
  * Verifies issue and snapshot belong to the target project.
  * Plan status begins strictly as `'submitted'` (clients cannot self-approve).
* **Example Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "data": {
      "plan": {
        "_id": "671955555555555555555555",
        "contributorId": "671900000000000000000001",
        "projectId": "671928374650192837465019",
        "issueId": "671939284750192847501928",
        "snapshotId": "671911111111111111111111",
        "planObjective": "Implement health probe checking vector index ping latency.",
        "status": "submitted",
        "submittedAt": "2026-10-23T14:30:00.000Z",
        "orderedImplementationSteps": [ ... ]
      }
    }
  }
  ```
* **Expected Error Responses**:
  * `400 Bad Request` (`INVALID_RELATIONSHIP`): Issue or snapshot does not belong to target project.
  * `400 Bad Request` (`VALIDATION_ERROR`): Empty implementation steps or missing fields.

---

### E. Authorized Contribution-Plan Retrieval
* **Endpoint**: `GET /api/contribution-plans/:id`
* **Method**: `GET`
* **Authentication**: Required (`requireAuth`)
* **Role**: `contributor` (author) OR `maintainer` (project-authorized)
* **CSRF**: Not required (Read-only)
* **Security Rules**:
  * Permitted: The plan's author.
  * Permitted: A maintainer holding an active `MaintainerGrant` for the plan's project (or project owner).
  * Denied: Unrelated contributors and maintainers without an applicable grant.
* **Example Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "plan": {
        "_id": "671955555555555555555555",
        "contributorId": "671900000000000000000001",
        "projectId": "671928374650192837465019",
        "planObjective": "Implement health probe checking vector index ping latency.",
        "status": "submitted",
        "orderedImplementationSteps": [ ... ]
      }
    }
  }
  ```
* **Expected Error Responses**:
  * `403 Forbidden` (`FORBIDDEN`): Requester is neither the author nor an authorized maintainer.
  * `404 Not Found` (`PLAN_NOT_FOUND`): Plan does not exist.

---

### F. Supplementary Maintainer Review-Inbox
* **Endpoint**: `GET /api/projects/:id/contribution-plans`
* **Method**: `GET`
* **Authentication**: Required (`requireAuth`)
* **Role**: `maintainer` or `moderator` WITH active project grant
* **Project-Scoped Grant**: Required (`requireProjectMaintainer`)
* **CSRF**: Not required (Read-only)
* **Query Parameters**:
  * `page` (default `1`)
  * `limit` (default `10`, max `50`)
  * `status` (optional, default: `'submitted'`, allowed: `'draft' | 'submitted' | 'in_review' | 'changes_requested' | 'approved' | 'rejected'`)
* **Example Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "plans": [
        {
          "_id": "671955555555555555555555",
          "contributorId": "671900000000000000000001",
          "projectId": "671928374650192837465019",
          "planObjective": "Implement health probe checking vector index ping latency.",
          "status": "submitted",
          "createdAt": "2026-10-23T14:30:00.000Z"
        }
      ],
      "pagination": {
        "total": 1,
        "page": 1,
        "limit": 10,
        "totalPages": 1
      }
    }
  }
  ```
* **Expected Error Responses**:
  * `403 Forbidden` (`FORBIDDEN_NOT_MAINTAINER`): Requester lacks maintainer authority on this project.

---

### G. Maintainer Repository-Snapshot Import
* **Endpoint**: `POST /api/projects/:id/imports`
* **Method**: `POST`
* **Authentication**: Required (`requireAuth`)
* **Role**: `maintainer` or `moderator`
* **Project-Scoped Grant**: Required (`requireProjectMaintainer`)
* **CSRF**: Required (`X-CSRF-Token` header)
* **Request Size Limit**: Bounded to 2MB (route-specific parser).
* **Payload**:
  ```json
  {
    "version": "v1.0.0",
    "importSource": "github-release-tag",
    "contentDigest": "sha256-abcdef1234567890",
    "documents": [
      {
        "filePath": "README.md",
        "title": "Project README",
        "content": "# Project Title\nUntrusted repository documentation.",
        "docType": "readme",
        "visibility": "public"
      }
    ],
    "issues": [
      {
        "issueNumber": 1,
        "title": "Add local setup guide",
        "description": "Provide installation instructions for local contributors.",
        "requiredSkills": ["markdown", "docker"],
        "estimatedEffort": "weekend"
      }
    ]
  }
  ```
* **Security Rules**:
  * Maximum 50 documents and 100 issues per snapshot payload.
  * Rejects duplicate file paths or duplicate issue numbers.
  * Rejects duplicate snapshot versions (prevents silent overwrites).
  * Stored content is treated strictly as UNTRUSTED third-party text (no arbitrary code execution).
* **Example Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "data": {
      "snapshot": {
        "id": "671911111111111111111111",
        "projectId": "671928374650192837465019",
        "version": "v1.0.0",
        "importStatus": "imported",
        "importSource": "github-release-tag",
        "importedBy": "671900000000000000000002",
        "createdAt": "2026-10-23T15:00:00.000Z"
      },
      "importedDocumentsCount": 1,
      "importedIssuesCount": 1
    }
  }
  ```
* **Expected Error Responses**:
  * `400 Bad Request` (`VALIDATION_ERROR`): Duplicate file paths or issue numbers.
  * `409 Conflict` (`SNAPSHOT_VERSION_EXISTS`): Version string already exists for this project.
  * `409 Conflict` (`ISSUE_NUMBER_EXISTS`): Issue number already taken in this project.
  * `413 Payload Too Large` (`PAYLOAD_TOO_LARGE`): Request exceeds 2MB limit.

---

### H. Maintainer Issue Management
* **Endpoint**: `PATCH /api/issues/:id`
* **Method**: `PATCH`
* **Authentication**: Required (`requireAuth`)
* **Role**: `maintainer` or `moderator`
* **Project-Scoped Grant**: Required (checked against `issue.projectId`)
* **CSRF**: Required (`X-CSRF-Token` header)
* **Payload**:
  ```json
  {
    "title": "Updated Issue Guidance",
    "status": "taken",
    "isStaleSetup": true,
    "staleSetupNotes": "Updated for Docker Compose v2."
  }
  ```
* **Security Rules**: Only allowed fields can be updated. Protected fields (`_id`, `projectId`, `issueNumber`, `snapshotId`) cannot be mutated.
* **Example Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "issue": {
        "_id": "671939284750192847501928",
        "issueNumber": 12,
        "title": "Updated Issue Guidance",
        "status": "taken",
        "isStaleSetup": true,
        "staleSetupNotes": "Updated for Docker Compose v2."
      }
    }
  }
  ```

---

### I. Maintainer Contribution-Plan Review
* **Endpoint**: `POST /api/contribution-plans/:id/review`
* **Method**: `POST`
* **Authentication**: Required (`requireAuth`)
* **Role**: `maintainer` or `moderator` (must hold project grant)
* **CSRF**: Required (`X-CSRF-Token` header)
* **Payload**:
  ```json
  {
    "decision": "approved",
    "feedback": "Comprehensive plan with excellent test assertions. Approved to proceed."
  }
  ```
* **Decision Mapping**:
  * `approved` → plan transitions to `approved`
  * `request_changes` → plan transitions to `changes_requested`
  * `rejected` → plan transitions to `rejected`
* **Security Rules**:
  * Contributors cannot review or self-approve their own plans (`SELF_REVIEW_FORBIDDEN`).
  * Plans already `approved` or `rejected` cannot be re-reviewed (`INVALID_STATE_TRANSITION`).
* **Example Success Response (201 Created)**:
  ```json
  {
    "success": true,
    "data": {
      "review": {
        "_id": "671966666666666666666666",
        "contributionPlanId": "671955555555555555555555",
        "projectId": "671928374650192837465019",
        "reviewingMaintainerId": "671900000000000000000002",
        "decision": "approved",
        "feedback": "Comprehensive plan with excellent test assertions. Approved to proceed.",
        "reviewedAt": "2026-10-23T15:30:00.000Z"
      },
      "planStatus": "approved"
    }
  }
  ```
* **Expected Error Responses**:
  * `400 Bad Request` (`INVALID_STATE_TRANSITION`): Plan already approved or rejected.
  * `403 Forbidden` (`SELF_REVIEW_FORBIDDEN`): Contributor attempting to review own plan.
  * `403 Forbidden` (`FORBIDDEN_NOT_MAINTAINER`): Requester lacks project maintainer authority.

---

### J. Moderator Project Verification
* **Endpoint**: `PATCH /api/projects/:id/verification`
* **Method**: `PATCH`
* **Authentication**: Required (`requireAuth`)
* **Role**: `moderator`
* **CSRF**: Required (`X-CSRF-Token` header)
* **Payload**:
  ```json
  {
    "verificationStatus": "approved"
  }
  ```
  *(Or when rejecting: `{"verificationStatus": "rejected", "rejectionReason": "Repository URL does not contain valid license."}`)*
* **Security Rules**:
  * Strictly restricted to `moderator` role.
  * Moderators cannot verify projects they own (`SELF_VERIFICATION_FORBIDDEN`).
  * Approval status is strictly separate from visibility (private projects remain private).
* **Example Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "671928374650192837465019",
      "name": "Local RAG Assistant",
      "slug": "local-rag-assistant",
      "visibility": "public",
      "approvalStatus": "approved",
      "approvalInfo": {
        "approvedBy": "671900000000000000000003",
        "approvedAt": "2026-10-23T16:00:00.000Z"
      }
    }
  }
  ```
* **Expected Error Responses**:
  * `400 Bad Request` (`VALIDATION_ERROR`): Rejection reason missing when rejecting.
  * `403 Forbidden` (`SELF_VERIFICATION_FORBIDDEN`): Moderator attempting to verify own project.
  * `403 Forbidden` (`FORBIDDEN`): Requester is not a platform moderator.

---

### K. Contributor Documentation RAG Chat (Phase 5)
* **Endpoint**: `POST /api/contributor-chat`
* **Method**: `POST`
* **Authentication**: Required (`requireAuth`)
* **Role**: `contributor`, `maintainer`, or `moderator`
* **Rate Limiting**: `chatRateLimiter` (30 requests / 15 minutes)
* **CSRF**: Required (`X-CSRF-Token` header)
* **Payload**:
  ```json
  {
    "projectId": "671928374650192837465019",
    "message": "How do I set up the test environment for this project?"
  }
  ```
  *(Alternative accepted query field: `"query": "How do I set up..."`)*
* **Optional Payload Fields**:
  * `snapshotId` (optional 24-character hex ObjectId): Targets a specific snapshot version rather than latest.
* **Security Rules**:
  * Project must exist and have `approvalStatus: "approved"`.
  * Non-maintainers cannot query private projects (`FORBIDDEN_PRIVATE_PROJECT`).
  * Prompt-injection defense blocks malicious query overrides (e.g. `ignore previous instructions`).
  * System prompt forces the LLM to ground answers strictly in retrieved chunks and explicitly cite source file paths and line ranges.
* **Example Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "answer": "To set up the test suite, install dependencies using `npm install` and run `npm test` as specified in CONTRIBUTING.md.",
      "sources": [
        {
          "filePath": "CONTRIBUTING.md",
          "startLine": 12,
          "endLine": 45,
          "sectionTitle": "Testing Guidelines",
          "similarityScore": 0.884
        }
      ],
      "snapshotVersion": "v1.0.0",
      "staleSnapshotWarning": null
    }
  }
  ```
* **Expected Error Responses**:
  * `400 Bad Request` (`VALIDATION_ERROR`): Missing `projectId` or query length < 2 or > 2000 characters.
  * `401 Unauthorized` (`UNAUTHORIZED`): Contributor session absent.
  * `403 Forbidden` (`FORBIDDEN_PRIVATE_PROJECT`): Contributor lacks grant to query private project.
  * `404 Not Found` (`PROJECT_NOT_FOUND`): Target project does not exist.
  * `429 Too Many Requests` (`RATE_LIMIT_EXCEEDED`): Rate limit exceeded.
  * `503 Service Unavailable` (`AI_SERVICE_UNAVAILABLE`): Ollama inference engine offline or model missing.
