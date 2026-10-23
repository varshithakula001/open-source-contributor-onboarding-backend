# MongoDB Atlas Vector Search Setup Guide

This guide provides step-by-step instructions for configuring the **MongoDB Atlas Vector Search** index required by Phase 5 of the Open Source Contributor Onboarding portal.

---

## 1. Prerequisites

Before setting up the index in MongoDB Atlas:
1. You have an active MongoDB Atlas cluster (M0 Free Tier or higher supports Vector Search).
2. Your cluster connection string is configured in `.env` (`MONGODB_URI`).
3. Your database contains or will contain the `chunks` collection (created automatically by Mongoose models on first write or snapshot import).
4. Local Ollama daemon is installed with `nomic-embed-text` model pulled (producing 768-dimensional vectors).

---

## 2. Step-by-Step Atlas UI Configuration

### Step 2.1: Navigate to Atlas Search
1. Log in to the [MongoDB Atlas Dashboard](https://cloud.mongodb.com/).
2. Under **Deployment**, click **Database**.
3. Locate your cluster and click the **Atlas Search** tab (or **Search** in newer Atlas UI navigation).

### Step 2.2: Create a Vector Search Index
1. Click the **Create Search Index** button.
2. Under **Configuration Method**, select **Atlas Vector Search - JSON Editor** (do not select Atlas Search text index).
3. Click **Next**.

### Step 2.3: Select Database and Collection
1. Choose your database (default: database defined in your `MONGODB_URI` connection string, e.g. `open_source_onboarding` or `test`).
2. Select the target collection: **`chunks`**.
3. Set the **Index Name** to:
   ```text
   vector_index
   ```
   *(Ensure this matches `ATLAS_VECTOR_INDEX_NAME` in your `.env` file, default is `vector_index`).*

### Step 2.4: Enter the JSON Index Definition
Paste the exact JSON definition below (also found in [vector_index.json](file:///c:/Users/ADMIN/Downloads/open-source-contributor-onboarding-backend/docs/vector_index.json)):

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "projectId"
    },
    {
      "type": "filter",
      "path": "snapshotId"
    }
  ]
}
```

### Explanation of Fields:
* **`path: "embedding"`**: Targets the 768-element floating-point array stored on each chunk document by `src/services/embedding.service.js`.
* **`numDimensions: 768`**: Strict dimensional match for Ollama's `nomic-embed-text` embedding model.
* **`similarity: "cosine"`**: Normalized angular distance metric ideal for semantic text similarity.
* **`path: "projectId"` (`filter`)**: Mandatory pre-filter ensuring search vectors only compare against documents belonging to the authenticated project.
* **`path: "snapshotId"` (`filter`)**: Pre-filter isolating search to the designated or latest repository snapshot.

### Step 2.5: Build the Index
1. Click **Next**, review the configuration, and click **Create Vector Search Index**.
2. Atlas will begin building the index. The status will initially show as **Building**.
3. Wait 1–3 minutes until the status updates to **Active** (green checkmark).

---

## 3. Verifying Index Readiness

Once the status is **Active**, you can populate and verify vector search:

### Ingest and Index a Repository Snapshot:
Run the repository indexing CLI command:
```bash
npm run rag:index
```
Or import a snapshot through the maintainer API:
```bash
POST /api/projects/:id/imports
```

### Query Contributor Chat Endpoint:
Submit a natural-language question:
```bash
POST /api/contributor-chat
Content-Type: application/json

{
  "projectId": "<PROJECT_OBJECT_ID>",
  "message": "How do I run tests and set up my local environment?"
}
```

If Atlas Vector Search is active, the response will return grounded answers and citations from the indexed repository chunks.

---

## 4. Local Test & Offline Fallback

The backend includes an automatic fallback for offline development, local unit/integration testing, or pre-index environments:
* If MongoDB Atlas Vector Search returns code `40324` (unrecognized `$vectorSearch` stage or index not yet ready) or if running against a local database, `src/services/vector-search.service.js` automatically executes an in-memory **exact cosine similarity** computation over candidates matching `{ projectId, snapshotId }`.
* This ensures CI pipelines and local test runners pass without requiring an active Atlas cluster or network dependency.

---

## 5. Troubleshooting & FAQ

| Issue | Root Cause | Resolution |
| :--- | :--- | :--- |
| **MongoServerError 40324** | Index `vector_index` not found or `$vectorSearch` unsupported on standalone MongoDB. | Ensure index is named `vector_index` and in **Active** status. In local testing, fallback activates automatically. |
| **Dimension Mismatch** | Embedding dimension differs from 768 (e.g. 1536 from OpenAI or 384 from MiniLM). | Re-pull Ollama model `ollama pull nomic-embed-text`. Ensure `EMBEDDING_DIMENSIONS=768` in `.env`. |
| **Empty Search Results** | `projectId` or `snapshotId` filter does not match chunk records, or snapshot has `indexingStatus: "not_indexed"`. | Run `npm run rag:index -- --force` to chunk and embed repository markdown documents. |
| **Zero Similarity Scores** | Documents contain empty chunks or zero vectors. | The backend rejects zero-norm vectors during ingestion (`src/services/embedding.service.js`). Check ingestion logs. |
