# Onboarding Agent API Testing Guide

This guide provides testing procedures, curl commands, JSON request payloads, and expected response formats for the **Purposeful AI-Powered Onboarding Agent** (`POST /api/onboarding-agent`).

---

## 1. Prerequisites & Authentication

The onboarding agent endpoint is protected by:
* **Session Authentication**: Active user session cookie (`connect.sid`).
* **CSRF Protection**: Synchronizer token passed in the `X-CSRF-Token` header.
* **Rate Limiting**: 20 requests per 15 minutes per client IP.

### Step 1: Login or Signup as a Contributor
```bash
# 1. Obtain CSRF Token and Session Cookie
curl -c cookies.txt -b cookies.txt http://localhost:5000/api/auth/csrf

# 2. Extract CSRF token from response JSON, then log in:
curl -c cookies.txt -b cookies.txt -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <CSRF_TOKEN>" \
  -d '{
    "email": "student@example.com",
    "password": "Password123!"
  }'
```

---

## 2. API Endpoint Specification

* **Method**: `POST`
* **Route**: `/api/onboarding-agent`
* **Headers**:
  * `Content-Type: application/json`
  * `X-CSRF-Token: <CSRF_TOKEN>`
  * `Cookie: connect.sid=<SESSION_COOKIE>`

---

## 3. Test Cases & Payloads

### Test Case 1: Primary Scenario — *"Find a task I can start this weekend"*
**Request:**
```bash
curl -i -b cookies.txt -X POST http://localhost:5000/api/onboarding-agent \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <CSRF_TOKEN>" \
  -d '{
    "query": "Find a task I can start this weekend",
    "availableHours": 12,
    "effort": "weekend"
  }'
```

**Expected Status**: `200 OK`<br>
**Expected Response Body**:
```json
{
  "success": true,
  "data": {
    "agentRunId": "6718d45f9e2b1a001a112233",
    "recommendationFound": true,
    "recommendedIssue": {
      "issueId": "6718d45f9e2b1a001a112244",
      "projectId": "6718d45f9e2b1a001a112255",
      "projectName": "Open Source Contributor Onboarding",
      "issueNumber": 101,
      "title": "Add responsive navigation tests",
      "description": "Write unit tests in React and Node.js for nav component.",
      "status": "open",
      "requiredSkills": ["react", "node.js"],
      "prerequisites": ["Node 20+ installed"],
      "setupSteps": ["npm install", "npm test"],
      "estimatedEffort": "weekend",
      "matchReasons": [
        "Matches your skills: react, node.js.",
        "Estimated effort (weekend) fits your target timeframe."
      ],
      "skillGaps": []
    },
    "prerequisiteCheck": {
      "issueId": "6718d45f9e2b1a001a112244",
      "requiredSkills": ["react", "node.js"],
      "matchingSkills": ["react", "node.js"],
      "skillGaps": [],
      "prerequisites": ["Node 20+ installed"],
      "setupSteps": ["npm install", "npm test"],
      "snapshotFreshnessStatus": "fresh",
      "staleWarning": null,
      "documentationReferences": [
        {
          "filePath": "README.md",
          "sectionTitle": "Testing Instructions",
          "snapshotVersion": "v1.0.0"
        }
      ]
    },
    "availabilityCheck": {
      "issueId": "6718d45f9e2b1a001a112244",
      "isAvailable": true,
      "status": "open",
      "checkedAt": "2026-10-24T02:00:00.000Z",
      "disclaimer": "Authoritative check confirms issue status as open. This check does NOT reserve or lock the issue."
    },
    "starterPlan": {
      "summary": "Recommended task #101 (\"Add responsive navigation tests\") is ideal for your weekend schedule.",
      "suggestedInitialSteps": [
        "1. Verify local Node.js environment matches required version Node 20+ installed.",
        "2. Clone the repository and execute setup commands: npm install; npm test.",
        "3. Review project documentation at README.md (Testing Instructions).",
        "4. Prepare and submit a formal ContributionPlan for maintainer review before opening a pull request."
      ],
      "estimatedTimeframe": "weekend",
      "evidenceCitations": [
        {
          "filePath": "README.md",
          "sectionTitle": "Testing Instructions",
          "snapshotVersion": "v1.0.0"
        }
      ]
    },
    "disclaimer": "AI recommendations and starter plans are exploratory and do NOT reserve or assign the issue. Please submit a formal contribution plan for maintainer review."
  }
}
```

---

### Test Case 2: Project-Scoped Task Discovery
**Request:**
```bash
curl -i -b cookies.txt -X POST http://localhost:5000/api/onboarding-agent \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <CSRF_TOKEN>" \
  -d '{
    "query": "Find good first bugs in this repository",
    "projectId": "6718d45f9e2b1a001a112255",
    "skills": ["javascript", "css"],
    "availableHours": 5,
    "effort": "hours"
  }'
```
**Expected Status**: `200 OK`

---

### Test Case 3: Unauthorized Access to Private Project
**Request:**
```bash
curl -i -b cookies.txt -X POST http://localhost:5000/api/onboarding-agent \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <CSRF_TOKEN>" \
  -d '{
    "query": "Find issues in private enterprise project",
    "projectId": "6718d45f9e2b1a001a999999"
  }'
```
**Expected Status**: `403 Forbidden`<br>
**Expected Response Body**:
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Access denied to private project issues."
  }
}
```

---

### Test Case 4: Missing CSRF Protection Token
**Request:**
```bash
curl -i -b cookies.txt -X POST http://localhost:5000/api/onboarding-agent \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Find a task for this weekend"
  }'
```
**Expected Status**: `403 Forbidden`<br>
**Expected Response Body**:
```json
{
  "success": false,
  "error": {
    "code": "CSRF_INVALID",
    "message": "Invalid or missing CSRF token."
  }
}
```

---

### Test Case 5: Input Validation Error (Query Too Short)
**Request:**
```bash
curl -i -b cookies.txt -X POST http://localhost:5000/api/onboarding-agent \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <CSRF_TOKEN>" \
  -d '{
    "query": "hi"
  }'
```
**Expected Status**: `400 Bad Request`<br>
**Expected Response Body**:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "query",
        "message": "Query must be at least 3 characters long"
      }
    ]
  }
}
```

---

## 4. Batch Issue Embedding CLI Testing

To precompute and store 768-dimensional embeddings for all open issues across registered projects:

```bash
# Run CLI indexer script:
npm run rag:index-issues

# Or target a specific project:
node scripts/rag-index-issues.js --projectId 6718d45f9e2b1a001a112255
```

**Expected CLI Output**:
```
Starting Issue Vector Indexing...
MongoDB Atlas connected.
Found 14 eligible open issues.
[1/14] Generating embedding for Issue #101: "Add responsive navigation tests"
[2/14] Generating embedding for Issue #102: "Fix broken doc links"
...
Embedding generation completed. 14 issues indexed.
```
