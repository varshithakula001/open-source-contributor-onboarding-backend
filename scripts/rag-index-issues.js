/**
 * CLI Tool: Issue Vector Embedding Indexer
 *
 * Usage:
 *   npm run rag:index-issues                      # Indexes issues missing embeddings
 *   npm run rag:index-issues -- --project <id>    # Indexes issues for a specific project
 *   npm run rag:index-issues -- --force           # Forces re-indexing of all open issues
 */

import { connectDB, disconnectDB } from '../src/config/db.js';
import { Issue } from '../src/models/Issue.js';
import { indexIssueEmbedding } from '../src/services/issue.service.js';
import { checkOllamaHealth } from '../src/services/embedding.service.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--project' && args[i + 1]) {
      flags.projectId = args[++i];
    } else if (arg === '--issue' && args[i + 1]) {
      flags.issueId = args[++i];
    } else if (arg === '--force') {
      flags.force = true;
    } else if (arg === '--limit' && args[i + 1]) {
      flags.limit = parseInt(args[++i], 10);
    }
  }
  return flags;
}

async function runIssueIndexer() {
  const flags = parseArgs();
  const limit = flags.limit || 50;

  console.log('====================================================');
  console.log('🤖 Issue Vector Embedding Indexer (Phase 6)');
  console.log('====================================================');

  console.log('🔍 Checking local Ollama connectivity...');
  const ollamaHealth = await checkOllamaHealth();
  if (!ollamaHealth.running) {
    console.error('❌ Error: Local Ollama service is unreachable.');
    console.error('   Please ensure Ollama is installed and running: "ollama serve"');
    console.error('   And that model is pulled: "ollama pull nomic-embed-text"');
    process.exit(1);
  }
  console.log(`✅ Ollama is running. Embed model available: ${ollamaHealth.embedModelFound ? 'Yes' : 'No'}`);

  console.log('🔌 Connecting to MongoDB Atlas...');
  await connectDB();

  try {
    const query = { status: 'open' };
    if (flags.issueId) {
      query._id = flags.issueId;
    } else if (flags.projectId) {
      query.projectId = flags.projectId;
    }

    if (!flags.force && !flags.issueId) {
      query.$or = [{ embedding: { $exists: false } }, { embedding: { $size: 0 } }];
    }

    const issues = await Issue.find(query).limit(limit);
    console.log(`📋 Found ${issues.length} issue(s) matching criteria.`);

    let indexedCount = 0;
    for (const issue of issues) {
      try {
        console.log(`   ⏳ Indexing Issue #${issue.issueNumber}: "${issue.title}"...`);
        await indexIssueEmbedding(issue._id);
        indexedCount++;
        console.log(`   ✅ Indexed.`);
      } catch (err) {
        console.error(`   ❌ Failed to index Issue #${issue.issueNumber}: ${err.message}`);
      }
    }

    console.log('====================================================');
    console.log(`🎉 Finished. Successfully indexed ${indexedCount}/${issues.length} issue(s).`);
    console.log('====================================================');
  } catch (error) {
    console.error('Fatal indexing error:', error);
  } finally {
    await disconnectDB();
  }
}

runIssueIndexer();
