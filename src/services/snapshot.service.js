import mongoose from 'mongoose';
import { Snapshot } from '../models/Snapshot.js';
import { Project } from '../models/Project.js';
import { Document } from '../models/Document.js';
import { Issue } from '../models/Issue.js';
import { indexSnapshotDocuments } from './document-ingestion.service.js';
import { isUserProjectMaintainer } from './project.service.js';
import { ApiError } from '../utils/errors.js';

/**
 * Maintainer Repository-Snapshot Import Service
 * Handles ingestion of vetted repository documentation and curated issues.
 * 
 * SECURITY MANDATE:
 * - Does NOT clone arbitrary repositories or execute any code.
 * - All documents are treated strictly as UNTRUSTED content.
 * - Requires project-scoped maintainer privileges.
 * - Prevents silent overwriting of existing snapshot versions.
 * - Atomic write semantics with rollback on failure.
 */
export async function importSnapshot(projectId, maintainerUserId, { version, importSource, contentDigest, documents = [], issues = [] }) {
  // 1. Verify project exists
  const project = await Project.findById(projectId);
  if (!project) {
    throw new ApiError(404, 'PROJECT_NOT_FOUND', 'Target project not found.');
  }

  // 2. Enforce maintainer authorization
  const isAuthorized = await isUserProjectMaintainer(projectId, maintainerUserId);
  if (!isAuthorized) {
    throw new ApiError(
      403,
      'FORBIDDEN_NOT_MAINTAINER',
      'You do not have maintainer privileges for this specific project.'
    );
  }

  // 3. Prevent duplicate snapshot versions
  const existingSnapshot = await Snapshot.findOne({ projectId, version });
  if (existingSnapshot) {
    throw new ApiError(
      409,
      'SNAPSHOT_VERSION_EXISTS',
      `Snapshot version "${version}" already exists for this project.`
    );
  }

  // 4. Validate issue number collision with existing project issues
  if (issues.length > 0) {
    const issueNumbers = issues.map((i) => i.issueNumber);
    const existingIssues = await Issue.find({
      projectId,
      issueNumber: { $in: issueNumbers },
    })
      .select('issueNumber')
      .lean();

    if (existingIssues.length > 0) {
      const colliding = existingIssues.map((i) => i.issueNumber).join(', ');
      throw new ApiError(
        409,
        'ISSUE_NUMBER_EXISTS',
        `Issue number(s) [${colliding}] already exist in this project.`
      );
    }
  }

  // 5. Execute import safely with transactional support or manual rollback
  let session = null;
  let useTransaction = false;

  try {
    session = await mongoose.startSession();
    session.startTransaction();
    useTransaction = true;
  } catch {
    // Standalone instances or mocked environments without replica sets
    session = null;
    useTransaction = false;
  }

  let createdSnapshot = null;

  try {
    // Step A: Create Snapshot record in 'importing' status
    const snapshotOptions = useTransaction ? { session } : {};
    const createdArray = await Snapshot.create(
      [
        {
          projectId,
          version,
          importStatus: 'importing',
          importSource,
          contentDigest: contentDigest || '',
          importedBy: maintainerUserId,
        },
      ],
      snapshotOptions
    );
    createdSnapshot = createdArray[0];

    // Step B: Insert documentation files (treated as untrusted content)
    const docsToInsert = documents.map((doc) => ({
      projectId,
      snapshotId: createdSnapshot._id,
      filePath: doc.filePath,
      title: doc.title,
      content: doc.content,
      docType: doc.docType || 'other',
      visibility: doc.visibility || 'public',
    }));

    if (docsToInsert.length > 0) {
      await Document.insertMany(docsToInsert, snapshotOptions);
    }

    // Step C: Insert curated issue records
    const issuesToInsert = issues.map((iss) => ({
      projectId,
      snapshotId: createdSnapshot._id,
      issueNumber: iss.issueNumber,
      title: iss.title,
      description: iss.description,
      requiredSkills: iss.requiredSkills || [],
      prerequisites: iss.prerequisites || [],
      setupSteps: iss.setupSteps || [],
      contributionRequirements: iss.contributionRequirements,
      labels: iss.labels || [],
      estimatedEffort: iss.estimatedEffort || 'weekend',
      status: 'open',
    }));

    if (issuesToInsert.length > 0) {
      await Issue.insertMany(issuesToInsert, snapshotOptions);
    }

    // Step D: Update project's current snapshot version
    await Project.findByIdAndUpdate(
      projectId,
      { currentSnapshotVersion: version },
      snapshotOptions
    );

    // Step E: Finalize snapshot status as 'imported'
    createdSnapshot.importStatus = 'imported';
    await createdSnapshot.save(snapshotOptions);

    if (useTransaction && session) {
      await session.commitTransaction();
    }

    // Step F: Trigger document chunking & RAG indexing if documents were provided
    let indexedChunksCount = 0;
    if (docsToInsert.length > 0) {
      try {
        const indexingResult = await indexSnapshotDocuments(createdSnapshot._id);
        indexedChunksCount = indexingResult.chunksCount;
      } catch (indexingErr) {
        // Document and issue records remain completely intact.
        // Snapshot is marked as 'failed' in indexingStatus, awaiting manual CLI indexing via npm run rag:index.
        console.warn(`[Snapshot Indexing] Ingestion indexing for snapshot ${version} paused: ${indexingErr.message}`);
      }
    }

    return {
      snapshot: {
        id: createdSnapshot._id,
        projectId: createdSnapshot.projectId,
        version: createdSnapshot.version,
        importStatus: 'imported',
        indexingStatus: createdSnapshot.indexingStatus || 'not_indexed',
        importSource: createdSnapshot.importSource,
        importedBy: createdSnapshot.importedBy,
        createdAt: createdSnapshot.createdAt,
      },
      importedDocumentsCount: docsToInsert.length,
      importedIssuesCount: issuesToInsert.length,
      indexedChunksCount,
    };
  } catch (err) {
    if (useTransaction && session) {
      await session.abortTransaction();
    } else if (createdSnapshot && createdSnapshot._id) {
      // Non-transactional rollback cleanup
      await Promise.allSettled([
        Document.deleteMany({ snapshotId: createdSnapshot._id }),
        Issue.deleteMany({ snapshotId: createdSnapshot._id }),
        Snapshot.findByIdAndDelete(createdSnapshot._id),
      ]);
    }
    throw err;
  } finally {
    if (session) {
      session.endSession();
    }
  }
}
