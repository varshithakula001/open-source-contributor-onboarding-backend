/**
 * Database Seeding Script: Open Source Contributor Onboarding
 *
 * Creates a reproducible, safe, and idempotent demonstration dataset for:
 * 1. Public & private projects (verifying multi-tenant isolation)
 * 2. Versioned documentation snapshots (fresh and stale)
 * 3. Curated issues (weekend task, skill gap, stale setup, taken, closed, alternative)
 * 4. Demonstration role accounts (contributor, maintainer, moderator)
 * 5. Related records (MaintainerGrants, Chunks, Interests, ContributionPlans, Reviews, AgentRuns)
 *
 * Safety Rules:
 * - Refuses execution when NODE_ENV === 'production' unless explicit override is provided.
 * - Idempotent: Repeated runs update or preserve existing demo data without unbounded duplication.
 * - Never prints plaintext passwords, tokens, or connection strings in logs.
 *
 * Usage:
 *   npm run db:seed
 *   node scripts/seed.js [--force-reindex] [--allow-production]
 */

import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { hashPassword } from '../src/services/password.service.js';
import { chunkMarkdownDocument } from '../src/services/chunking.service.js';
import { checkOllamaHealth, generateEmbedding } from '../src/services/embedding.service.js';
import { generateIssueEmbeddingText } from '../src/services/issue.service.js';

// Models
import { User } from '../src/models/User.js';
import { Project } from '../src/models/Project.js';
import { MaintainerGrant } from '../src/models/MaintainerGrant.js';
import { Snapshot } from '../src/models/Snapshot.js';
import { Document } from '../src/models/Document.js';
import { Chunk } from '../src/models/Chunk.js';
import { Issue } from '../src/models/Issue.js';
import { Interest } from '../src/models/Interest.js';
import { ContributionPlan } from '../src/models/ContributionPlan.js';
import { Review } from '../src/models/Review.js';
import { AgentRun } from '../src/models/AgentRun.js';

/**
 * Synthetic Documentation Content
 */
const PUBLIC_DOCS = {
  readme: `# Demo Community Portal

Welcome to the **Demo Community Portal**, an open-source collaboration platform designed to connect aspiring software contributors with meaningful tasks.

## Runtime Requirements
- Node.js >= 20.0.0
- npm >= 10.0.0
- Git 2.40+

## Project Architecture
The application is structured as a modular Express.js backend with an accessible React frontend. All data is persisted in MongoDB Atlas with session-based authentication and CSRF token exchange.

## Quick Start
1. Clone the repository locally.
2. Run \`npm install\` to install all required dependencies.
3. Configure environment variables in \`.env\`.
4. Execute \`npm test\` to verify your installation.
`,

  setup: `# Setting Up Local Development Environment

Follow these steps to set up your local development environment for the Demo Community Portal.

## Prerequisites Verification
Ensure you have Node.js 20+ installed on your system:
\`\`\`bash
node --version
\`\`\`

## Installation
\`\`\`bash
git clone https://github.com/example/demo-community-portal.git
cd demo-community-portal
npm install
\`\`\`

## Running the Test Suite
Before making changes, always run the automated tests:
\`\`\`bash
npm test
\`\`\`
`,

  contributing: `# Contributor Guidelines

Thank you for contributing to the Demo Community Portal!

## How to Contribute
1. Browse available open issues on the project board.
2. If you are new, start with issues tagged \`good-first-issue\` or \`weekend\`.
3. Submit a formal Contribution Plan via the portal before opening a pull request.
4. A project maintainer will review your proposal and provide constructive feedback.

## Branching and Code Standards
- Feature branches: \`feature/issue-<number>-description\`
- Bug fixes: \`fix/issue-<number>-description\`
- Always include automated unit tests for new functionality.
`,

  architecture: `# System Architecture & Data Flow

This document details the architectural boundaries of the Demo Community Portal.

## Security Layers
1. **CSRF Protection**: Synchronizer token exchange prevents cross-site request forgery.
2. **Session Authentication**: Server-side sessions backed by MongoDB.
3. **Role-Based Access Control**: Strict boundaries between contributors, maintainers, and platform moderators.
4. **Data Isolation**: Public projects are open for browsing; private projects require explicit maintainer grants.
`,

  staleReadme: `# Demo Community Portal (Legacy v0.9 Architecture)

> WARNING: This documentation is legacy and pertains to the deprecated v0.9 release.

## Legacy Runtime Requirements
- Node.js 16.x (Deprecated)
- npm 8.x

Run \`npm run legacy-start\` to boot the v0.9 monolith.
`,
};

const PRIVATE_DOCS = {
  readme: `# Demo Enterprise Internal Audit (Restricted)

CONFIDENTIAL: This repository contains internal compliance auditing tools and privileged inspection scripts.

## Access Notice
Access is restricted strictly to authorized enterprise maintainers holding an active MaintainerGrant. Unauthorized access or data exfiltration is strictly prohibited.
`,
};

/**
 * Seed execution function
 *
 * @param {Object} options
 * @param {boolean} options.silent - Suppress non-error logging
 * @param {boolean} options.allowProduction - Allow running in production
 * @param {boolean} options.forceReindex - Force regeneration of vector embeddings
 * @returns {Promise<Object>} Summary metrics
 */
export async function seedDatabase(options = {}) {
  const silent = options.silent || false;
  const allowProduction = options.allowProduction || false;

  const log = (...args) => {
    if (!silent) console.log(...args);
  };

  // 1. Production Execution Guard
  if (process.env.NODE_ENV === 'production' && !allowProduction) {
    throw new Error(
      'SAFETY BLOCK: Database seeding is refused because NODE_ENV is "production". ' +
      'Pass the --allow-production flag or set ALLOW_PRODUCTION_SEED=true to override.'
    );
  }

  log('====================================================');
  log('🌱 Open Source Contributor Onboarding: Database Seed');
  log('====================================================');

  const summary = {
    users: { created: 0, updated: 0, unchanged: 0 },
    projects: { created: 0, updated: 0, unchanged: 0 },
    grants: { created: 0, updated: 0, unchanged: 0 },
    snapshots: { created: 0, updated: 0, unchanged: 0 },
    documents: { created: 0, updated: 0, unchanged: 0 },
    chunks: { created: 0, updated: 0, unchanged: 0 },
    issues: { created: 0, updated: 0, unchanged: 0 },
    interests: { created: 0, updated: 0, unchanged: 0 },
    plans: { created: 0, updated: 0, unchanged: 0 },
    reviews: { created: 0, updated: 0, unchanged: 0 },
    agentRuns: { created: 0, updated: 0, unchanged: 0 },
  };

  const defaultPassword = process.env.DEMO_PASSWORD || 'DemoPassword123!';
  const hashedPassword = await hashPassword(defaultPassword);

  // -------------------------------------------------------------------------
  // 2. Demonstration Users (Contributor, Maintainer, Moderator)
  // -------------------------------------------------------------------------
  log('👤 Seeding demonstration user accounts...');

  const demoUsersConfig = [
    {
      email: 'contributor.demo@example.com',
      role: 'contributor',
      profile: {
        displayName: 'Alice Contributor',
        bio: 'Aspiring full-stack student looking for weekend open-source tasks.',
        skills: ['javascript', 'react', 'node.js'],
        interests: ['testing', 'documentation', 'ui'],
        experienceLevel: 'beginner',
        availableHoursPerWeek: 15,
      },
    },
    {
      email: 'maintainer.demo@example.com',
      role: 'maintainer',
      profile: {
        displayName: 'Bob Maintainer',
        bio: 'Core maintainer and mentor for community projects.',
        skills: ['javascript', 'node.js', 'docker', 'mongodb'],
        interests: ['architecture', 'mentorship'],
        experienceLevel: 'advanced',
        availableHoursPerWeek: 20,
      },
    },
    {
      email: 'moderator.demo@example.com',
      role: 'moderator',
      profile: {
        displayName: 'Charlie Moderator',
        bio: 'Platform compliance and quality moderator.',
        skills: ['code-review', 'security'],
        interests: ['governance', 'compliance'],
        experienceLevel: 'intermediate',
        availableHoursPerWeek: 10,
      },
    },
    {
      email: 'other.contributor@example.com',
      role: 'contributor',
      profile: {
        displayName: 'David Collaborator',
        bio: 'Active contributor working on backend optimization.',
        skills: ['javascript', 'node.js'],
        availableHoursPerWeek: 10,
      },
    },
  ];

  const userMap = {};

  for (const u of demoUsersConfig) {
    let user = await User.findOne({ email: u.email });
    if (!user) {
      user = await User.create({
        email: u.email,
        passwordHash: hashedPassword,
        role: u.role,
        isActive: true,
        emailVerified: true,
        profile: u.profile,
      });
      summary.users.created++;
    } else {
      user.role = u.role;
      user.isActive = true;
      user.emailVerified = true;
      user.profile = u.profile;
      await user.save();
      summary.users.updated++;
    }
    userMap[u.email] = user;
  }

  // -------------------------------------------------------------------------
  // 3. Demonstration Projects (Public & Private)
  // -------------------------------------------------------------------------
  log('📁 Seeding demonstration projects (public & private isolation)...');

  const demoProjectsConfig = [
    {
      name: 'Demo Community Portal',
      slug: 'demo-community-portal',
      description: 'An open-source collaboration portal connecting student developers to curated onboarding tasks.',
      repositoryUrl: 'https://github.com/example/demo-community-portal',
      visibility: 'public',
      approvalStatus: 'approved',
      ownerId: userMap['maintainer.demo@example.com']._id,
      topics: ['javascript', 'react', 'node.js', 'onboarding'],
      languages: ['JavaScript', 'HTML', 'CSS'],
      currentSnapshotVersion: 'v1.0.0',
    },
    {
      name: 'Demo Enterprise Internal Audit',
      slug: 'demo-enterprise-audit',
      description: 'Internal security and compliance auditing utility for enterprise infrastructure.',
      repositoryUrl: 'https://github.com/example/demo-enterprise-audit',
      visibility: 'private', // STRICT PRIVACY ISOLATION
      approvalStatus: 'approved',
      ownerId: userMap['maintainer.demo@example.com']._id,
      topics: ['security', 'audit', 'compliance'],
      languages: ['JavaScript', 'Python'],
      currentSnapshotVersion: 'v1.0.0',
    },
  ];

  const projectMap = {};

  for (const p of demoProjectsConfig) {
    let project = await Project.findOne({ slug: p.slug });
    if (!project) {
      project = await Project.create(p);
      summary.projects.created++;
    } else {
      Object.assign(project, p);
      await project.save();
      summary.projects.updated++;
    }
    projectMap[p.slug] = project;
  }

  // -------------------------------------------------------------------------
  // 4. Maintainer Grants (Project-Scoped Access)
  // -------------------------------------------------------------------------
  log('🔑 Seeding project-scoped maintainer grants...');

  const maintainerUser = userMap['maintainer.demo@example.com'];
  const moderatorUser = userMap['moderator.demo@example.com'];

  for (const slug of ['demo-community-portal', 'demo-enterprise-audit']) {
    const proj = projectMap[slug];
    let grant = await MaintainerGrant.findOne({ projectId: proj._id, userId: maintainerUser._id });
    if (!grant) {
      await MaintainerGrant.create({
        projectId: proj._id,
        userId: maintainerUser._id,
        grantedBy: moderatorUser._id,
        status: 'active',
      });
      summary.grants.created++;
    } else {
      grant.status = 'active';
      await grant.save();
      summary.grants.unchanged++;
    }
  }

  // -------------------------------------------------------------------------
  // 5. Documentation Snapshots & Documents
  // -------------------------------------------------------------------------
  log('📚 Seeding versioned repository snapshots and documentation...');

  const publicProject = projectMap['demo-community-portal'];
  const privateProject = projectMap['demo-enterprise-audit'];

  // 5a. Public Project Snapshot v1.0.0 (Fresh)
  let publicFreshSnap = await Snapshot.findOne({ projectId: publicProject._id, version: 'v1.0.0' });
  if (!publicFreshSnap) {
    publicFreshSnap = await Snapshot.create({
      projectId: publicProject._id,
      version: 'v1.0.0',
      importStatus: 'imported',
      importSource: 'release-tag:v1.0.0',
      importedBy: maintainerUser._id,
      isStale: false,
      indexingStatus: 'not_indexed',
    });
    summary.snapshots.created++;
  } else {
    publicFreshSnap.isStale = false;
    publicFreshSnap.importSource = 'release-tag:v1.0.0';
    await publicFreshSnap.save();
    summary.snapshots.unchanged++;
  }

  // 5b. Public Project Snapshot v0.9.0-stale (Stale Warning Demo)
  let publicStaleSnap = await Snapshot.findOne({ projectId: publicProject._id, version: 'v0.9.0-stale' });
  if (!publicStaleSnap) {
    publicStaleSnap = await Snapshot.create({
      projectId: publicProject._id,
      version: 'v0.9.0-stale',
      importStatus: 'imported',
      importSource: 'release-tag:v0.9.0',
      importedBy: maintainerUser._id,
      isStale: true,
      staleReason: 'Major architectural update in v1.0.0 upgraded runtime to Node.js 20+; instructions in v0.9.0 are deprecated.',
      indexingStatus: 'not_indexed',
    });
    summary.snapshots.created++;
  } else {
    publicStaleSnap.isStale = true;
    publicStaleSnap.importSource = 'release-tag:v0.9.0';
    publicStaleSnap.staleReason = 'Major architectural update in v1.0.0 upgraded runtime to Node.js 20+; instructions in v0.9.0 are deprecated.';
    await publicStaleSnap.save();
    summary.snapshots.unchanged++;
  }

  // 5c. Private Project Snapshot v1.0.0 (Restricted)
  let privateSnap = await Snapshot.findOne({ projectId: privateProject._id, version: 'v1.0.0' });
  if (!privateSnap) {
    privateSnap = await Snapshot.create({
      projectId: privateProject._id,
      version: 'v1.0.0',
      importStatus: 'imported',
      importSource: 'git-commit:e4f8a1c9',
      importedBy: maintainerUser._id,
      isStale: false,
      indexingStatus: 'not_indexed',
    });
    summary.snapshots.created++;
  } else {
    summary.snapshots.unchanged++;
  }

  // 5d. Documents
  const demoDocsConfig = [
    // Public Fresh Docs
    {
      projectId: publicProject._id,
      snapshotId: publicFreshSnap._id,
      filePath: 'README.md',
      title: 'Project Overview & Runtime Requirements',
      docType: 'readme',
      content: PUBLIC_DOCS.readme,
      visibility: 'public',
    },
    {
      projectId: publicProject._id,
      snapshotId: publicFreshSnap._id,
      filePath: 'SETUP.md',
      title: 'Local Development Environment Setup',
      docType: 'setup',
      content: PUBLIC_DOCS.setup,
      visibility: 'public',
    },
    {
      projectId: publicProject._id,
      snapshotId: publicFreshSnap._id,
      filePath: 'CONTRIBUTING.md',
      title: 'Contributor Guidelines & Workflow',
      docType: 'guide',
      content: PUBLIC_DOCS.contributing,
      visibility: 'public',
    },
    {
      projectId: publicProject._id,
      snapshotId: publicFreshSnap._id,
      filePath: 'ARCHITECTURE.md',
      title: 'System Architecture & Data Flow',
      docType: 'architecture',
      content: PUBLIC_DOCS.architecture,
      visibility: 'public',
    },
    // Public Stale Doc
    {
      projectId: publicProject._id,
      snapshotId: publicStaleSnap._id,
      filePath: 'README.md',
      title: 'Legacy Monolith Overview',
      docType: 'readme',
      content: PUBLIC_DOCS.staleReadme,
      visibility: 'public',
    },
    // Private Doc
    {
      projectId: privateProject._id,
      snapshotId: privateSnap._id,
      filePath: 'README.md',
      title: 'Restricted Internal Audit Guide',
      docType: 'readme',
      content: PRIVATE_DOCS.readme,
      visibility: 'private',
    },
  ];

  const docMap = {};

  for (const d of demoDocsConfig) {
    let doc = await Document.findOne({ snapshotId: d.snapshotId, filePath: d.filePath });
    if (!doc) {
      doc = await Document.create(d);
      summary.documents.created++;
    } else {
      Object.assign(doc, d);
      await doc.save();
      summary.documents.updated++;
    }
    docMap[`${d.snapshotId}_${d.filePath}`] = doc;
  }

  // -------------------------------------------------------------------------
  // 6. Documentation Chunks & Vector Search Readiness
  // -------------------------------------------------------------------------
  log('🧩 Chunking documentation documents for RAG...');

  // Check Ollama connectivity
  let ollamaRunning = false;
  try {
    const health = await checkOllamaHealth();
    ollamaRunning = health.running;
  } catch {
    ollamaRunning = false;
  }

  if (ollamaRunning) {
    log('✨ Local Ollama is available. Generating embeddings for chunks and issues...');
  } else {
    log('ℹ️  Local Ollama service is not running. Documents will be chunked with indexingStatus: "not_indexed".');
  }

  for (const d of demoDocsConfig) {
    const doc = docMap[`${d.snapshotId}_${d.filePath}`];
    const generatedChunks = chunkMarkdownDocument(doc);

    for (const ch of generatedChunks) {
      let chunkDoc = await Chunk.findOne({ documentId: doc._id, chunkIndex: ch.chunkIndex });

      let embedding = [];
      if (ollamaRunning) {
        try {
          embedding = await generateEmbedding(ch.text);
        } catch {
          embedding = [];
        }
      }

      if (!chunkDoc) {
        await Chunk.create({
          projectId: doc.projectId,
          snapshotId: doc.snapshotId,
          documentId: doc._id,
          chunkIndex: ch.chunkIndex,
          text: ch.text,
          metadata: ch.metadata,
          ...(embedding.length === 768 ? { embedding } : {}),
        });
        summary.chunks.created++;
      } else {
        chunkDoc.text = ch.text;
        chunkDoc.metadata = ch.metadata;
        if (embedding.length === 768) {
          chunkDoc.embedding = embedding;
        }
        await chunkDoc.save();
        summary.chunks.updated++;
      }
    }
  }

  // Update snapshot chunk counts and status
  for (const snap of [publicFreshSnap, publicStaleSnap, privateSnap]) {
    const count = await Chunk.countDocuments({ snapshotId: snap._id });
    snap.chunksCount = count;
    if (ollamaRunning && count > 0) {
      snap.indexingStatus = 'indexed';
      snap.indexedAt = new Date();
    }
    await snap.save();
  }

  // -------------------------------------------------------------------------
  // 7. Curated Issues (Covering all evaluation profiles)
  // -------------------------------------------------------------------------
  log('🎯 Seeding curated issues with diverse profiles and constraints...');

  const otherContributor = userMap['other.contributor@example.com'];

  const demoIssuesConfig = [
    // 1. Weekend Task: matches contributor skills (React, JavaScript, Node.js)
    {
      projectId: publicProject._id,
      snapshotId: publicFreshSnap._id,
      issueNumber: 101,
      title: 'Implement Responsive Navigation Bar Unit Tests',
      description: 'Write comprehensive Supertest and React component tests for the responsive navigation header across mobile and desktop viewport widths.',
      status: 'open',
      requiredSkills: ['react', 'javascript', 'node.js'],
      prerequisites: ['Node.js v20+ installed', 'npm install dependencies', 'Review README.md and SETUP.md'],
      setupSteps: [
        'git checkout -b feature/nav-tests',
        'npm install',
        'npm test',
      ],
      estimatedEffort: 'weekend',
      labels: ['good-first-issue', 'testing', 'frontend'],
      isStaleSetup: false,
    },

    // 2. Short Task (Hours): Quick documentation fix
    {
      projectId: publicProject._id,
      snapshotId: publicFreshSnap._id,
      issueNumber: 102,
      title: 'Fix Stale Documentation Links in Contributing Guide',
      description: 'Review CONTRIBUTING.md and verify all internal markdown links to ensure zero broken references.',
      status: 'open',
      requiredSkills: ['documentation', 'markdown'],
      prerequisites: ['Review CONTRIBUTING.md'],
      setupSteps: ['npm test'],
      estimatedEffort: 'hours',
      labels: ['documentation', 'good-first-issue'],
      isStaleSetup: false,
    },

    // 3. Skill Gap Task: Requires Rust/WebAssembly which contributor lacks
    {
      projectId: publicProject._id,
      snapshotId: publicFreshSnap._id,
      issueNumber: 103,
      title: 'Implement Advanced Rust WebAssembly Parsing Engine',
      description: 'Construct a high-performance WebAssembly module compiled from Rust to accelerate AST syntax parsing for huge repositories.',
      status: 'open',
      requiredSkills: ['rust', 'webassembly', 'c++'],
      prerequisites: ['Rust toolchain installed', 'wasm-pack configured'],
      setupSteps: ['cargo build --target wasm32-unknown-unknown'],
      estimatedEffort: 'week_plus',
      labels: ['performance', 'wasm', 'advanced'],
      isStaleSetup: false,
    },

    // 4. Stale Setup Task: Outdated environment instructions
    {
      projectId: publicProject._id,
      snapshotId: publicFreshSnap._id,
      issueNumber: 104,
      title: 'Update Legacy Build Pipeline Scripts',
      description: 'Modernize automated deployment shell scripts originally designed for Node 16 build agents.',
      status: 'open',
      requiredSkills: ['bash', 'devops'],
      prerequisites: ['Docker installed'],
      setupSteps: ['bash ./scripts/build-legacy.sh'],
      estimatedEffort: 'few_days',
      labels: ['devops', 'maintenance'],
      isStaleSetup: true,
      staleSetupNotes: 'Build scripts were written for legacy Node 16 and will fail under current Node 20 runtime.',
    },

    // 5. Taken Issue: Status is 'taken'
    {
      projectId: publicProject._id,
      snapshotId: publicFreshSnap._id,
      issueNumber: 105,
      title: 'Refactor Database Session Adapter',
      description: 'Optimize session serialization in connect-mongo wrapper.',
      status: 'taken',
      assignedContributorId: otherContributor._id,
      requiredSkills: ['javascript', 'mongodb'],
      estimatedEffort: 'weekend',
      labels: ['database', 'backend'],
      isStaleSetup: false,
    },

    // 6. Closed Issue: Status is 'closed'
    {
      projectId: publicProject._id,
      snapshotId: publicFreshSnap._id,
      issueNumber: 106,
      title: 'Deprecate Legacy v0.8 API Endpoints',
      description: 'Remove legacy v0.8 routing endpoints and update OpenAPI specification.',
      status: 'closed',
      requiredSkills: ['javascript', 'express'],
      estimatedEffort: 'hours',
      labels: ['api', 'cleanup'],
      isStaleSetup: false,
    },

    // 7. Alternative Weekend Task: For testing alternative selection if #101 is claimed
    {
      projectId: publicProject._id,
      snapshotId: publicFreshSnap._id,
      issueNumber: 107,
      title: 'Add E2E Integration Tests for Auth Routes',
      description: 'Add automated end-to-end Supertest test coverage for authentication route rate-limiting and session cookies.',
      status: 'open',
      requiredSkills: ['javascript', 'node.js'],
      prerequisites: ['Node.js v20+ installed', 'npm install'],
      setupSteps: ['npm test'],
      estimatedEffort: 'weekend',
      labels: ['testing', 'security'],
      isStaleSetup: false,
    },
  ];

  const issueMap = {};

  for (const iss of demoIssuesConfig) {
    let issue = await Issue.findOne({ projectId: iss.projectId, issueNumber: iss.issueNumber });

    let embedding = [];
    if (ollamaRunning) {
      try {
        const text = generateIssueEmbeddingText(iss);
        embedding = await generateEmbedding(text);
      } catch {
        embedding = [];
      }
    }

    if (!issue) {
      issue = await Issue.create({
        ...iss,
        ...(embedding.length === 768 ? { embedding } : {}),
      });
      summary.issues.created++;
    } else {
      Object.assign(issue, iss);
      if (embedding.length === 768) {
        issue.embedding = embedding;
      }
      await issue.save();
      summary.issues.updated++;
    }
    issueMap[iss.issueNumber] = issue;
  }

  // -------------------------------------------------------------------------
  // 8. Related Demonstration Records (Interest, Plan, Review, AgentRun)
  // -------------------------------------------------------------------------
  log('📝 Seeding related demonstration records (interests, plans, reviews, agent runs)...');

  const contributorUser = userMap['contributor.demo@example.com'];

  // 8a. Contributor Interest on Issue #102
  const issue102 = issueMap[102];
  let interest = await Interest.findOne({ issueId: issue102._id, contributorId: contributorUser._id });
  if (!interest) {
    await Interest.create({
      issueId: issue102._id,
      contributorId: contributorUser._id,
      status: 'active',
      declaredAvailableHours: 5,
      message: 'Interested in fixing documentation links as a good-first-issue.',
    });
    summary.interests.created++;
  } else {
    summary.interests.unchanged++;
  }

  // 8b. Contribution Plan on Issue #101
  const issue101 = issueMap[101];
  let plan = await ContributionPlan.findOne({ issueId: issue101._id, contributorId: contributorUser._id });
  if (!plan) {
    plan = await ContributionPlan.create({
      projectId: publicProject._id,
      issueId: issue101._id,
      contributorId: contributorUser._id,
      snapshotId: publicFreshSnap._id,
      status: 'submitted',
      planObjective: 'Add unit tests for navigation component verifying mobile and desktop layouts.',
      proposedApproach: 'Use Supertest to verify routes and components across viewport configurations.',
      orderedImplementationSteps: [
        {
          stepNumber: 1,
          description: 'Clone repository and checkout feature/nav-tests branch.',
          targetFiles: ['package.json'],
          estimatedHours: 1,
        },
        {
          stepNumber: 2,
          description: 'Run npm install and verify local test suite execution with npm test.',
          targetFiles: ['tests/app.test.js'],
          estimatedHours: 1,
        },
        {
          stepNumber: 3,
          description: 'Inspect navigation header markup and existing test cases.',
          targetFiles: ['README.md', 'SETUP.md'],
          estimatedHours: 2,
        },
        {
          stepNumber: 4,
          description: 'Implement Supertest integration tests for responsive route headers.',
          targetFiles: ['tests/nav.test.js'],
          estimatedHours: 4,
        },
      ],
      evidenceCitations: [
        {
          documentPath: 'README.md',
          sectionHeading: 'Runtime Requirements',
          snapshotVersion: 'v1.0.0',
          citationSnippet: 'Node.js >= 20.0.0 and npm >= 10.0.0',
        },
      ],
    });
    summary.plans.created++;
  } else {
    summary.plans.unchanged++;
  }

  // 8c. Maintainer Review on Contribution Plan
  let review = await Review.findOne({ contributionPlanId: plan._id });
  if (!review) {
    await Review.create({
      contributionPlanId: plan._id,
      projectId: publicProject._id,
      reviewingMaintainerId: maintainerUser._id,
      decision: 'approved',
      feedback: 'Excellent breakdown of testing steps. Verified alignment with repository architecture.',
    });
    // Update plan status to reflect review
    plan.status = 'approved';
    await plan.save();
    summary.reviews.created++;
  } else {
    summary.reviews.unchanged++;
  }

  // 8d. Agent Run Execution Record
  let agentRun = await AgentRun.findOne({ userId: contributorUser._id, status: 'completed' });
  if (!agentRun) {
    await AgentRun.create({
      userId: contributorUser._id,
      projectId: publicProject._id,
      userRequest: 'Find a task I can start this weekend',
      status: 'completed',
      toolExecutionRecords: [
        {
          toolName: 'findIssues',
          toolInput: { query: 'Find a task I can start this weekend', effort: 'weekend' },
          toolOutput: { candidateCount: 2, topIssueId: issue101._id.toString() },
          durationMs: 45,
          executedAt: new Date(),
        },
        {
          toolName: 'inspectPrerequisites',
          toolInput: { issueId: issue101._id.toString() },
          toolOutput: { snapshotFreshnessStatus: 'fresh', missingSkillsCount: 0 },
          durationMs: 30,
          executedAt: new Date(),
        },
        {
          toolName: 'checkIssueAvailability',
          toolInput: { issueId: issue101._id.toString() },
          toolOutput: { isAvailable: true, status: 'open' },
          durationMs: 15,
          executedAt: new Date(),
        },
      ],
      recommendedIssueId: issue101._id,
      recommendationSummary: 'Recommended task #101 ("Implement Responsive Navigation Bar Unit Tests") fits your weekend availability.',
      durationMs: 250,
    });
    summary.agentRuns.created++;
  } else {
    summary.agentRuns.unchanged++;
  }

  log('====================================================');
  log('✅ Demonstration Database Seeding Complete!');
  log('====================================================');
  log('Summary of Operations:');
  for (const [col, counts] of Object.entries(summary)) {
    log(`  - ${col.padEnd(12)}: Created: ${counts.created}, Updated: ${counts.updated}, Unchanged: ${counts.unchanged}`);
  }
  log('====================================================');

  return summary;
}

// CLI Execution entrypoint
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const allowProduction = process.argv.includes('--allow-production') || process.env.ALLOW_PRODUCTION_SEED === 'true';

  connectDB()
    .then(() => seedDatabase({ allowProduction }))
    .then(async () => {
      await disconnectDB();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('❌ Database Seeding Failed:', err.message);
      await disconnectDB();
      process.exit(1);
    });
}
