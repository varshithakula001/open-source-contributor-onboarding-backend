/**
 * CLI Tool: Repository Documentation Snapshot RAG Indexing
 * 
 * Usage:
 *   npm run rag:index                      # Indexes un-indexed snapshots (up to 10)
 *   npm run rag:index -- --project <id>    # Indexes snapshots for a specific project
 *   npm run rag:index -- --snapshot <id>   # Indexes a specific snapshot by ID
 *   npm run rag:index -- --force           # Forces re-indexing of already indexed snapshots
 */

import { connectDB, disconnectDB } from '../src/config/db.js';
import { Snapshot } from '../src/models/Snapshot.js';
import { indexSnapshotDocuments } from '../src/services/document-ingestion.service.js';
import { checkOllamaHealth } from '../src/services/embedding.service.js';

// Parse command-line flags
function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--project' && args[i + 1]) {
      flags.projectId = args[++i];
    } else if (arg === '--snapshot' && args[i + 1]) {
      flags.snapshotId = args[++i];
    } else if (arg === '--force') {
      flags.force = true;
    } else if (arg === '--limit' && args[i + 1]) {
      flags.limit = parseInt(args[++i], 10);
    }
  }
  return flags;
}

async function runIndexer() {
  const flags = parseArgs();
  const limit = flags.limit || 10;

  console.log('====================================================');
  console.log('🤖 Repository Documentation Snapshot RAG Indexer');
  console.log('====================================================');

  // 1. Check Ollama connectivity
  console.log('🔍 Checking local Ollama connectivity...');
  const ollamaHealth = await checkOllamaHealth();
  if (!ollamaHealth.running) {
    console.error('❌ Error: Local Ollama service is unreachable.');
    console.error('   Please ensure Ollama is installed and running: "ollama serve"');
    console.error('   And that models are pulled: "ollama pull nomic-embed-text" and "ollama pull llama3.2"');
    process.exit(1);
  }
  console.log(`✅ Ollama is running. Available models: ${ollamaHealth.models.join(', ') || 'none'}`);

  // 2. Connect to MongoDB Atlas
  console.log('🔌 Connecting to MongoDB Atlas...');
  await connectDB();

  try {
    const query = { importStatus: 'imported' };
    if (flags.snapshotId) {
      query._id = flags.snapshotId;
    }
    if (flags.projectId) {
      query.projectId = flags.projectId;
    }
    if (!flags.force && !flags.snapshotId) {
      query.indexingStatus = { $in: ['not_indexed', 'failed'] };
    }

    const snapshots = await Snapshot.find(query).limit(limit).lean();

    if (snapshots.length === 0) {
      console.log('ℹ️ No snapshots require indexing at this time.');
      console.log('   Use --force to re-index already processed snapshots.');
      return;
    }

    console.log(`📋 Found ${snapshots.length} snapshot(s) to process (batch limit: ${limit}):\n`);

    let successCount = 0;
    let failCount = 0;

    for (const snap of snapshots) {
      console.log(`➡️  Indexing Snapshot [ID: ${snap._id}] Version: ${snap.version}...`);
      try {
        const result = await indexSnapshotDocuments(snap._id);
        console.log(`   ✅ Success! Documents: ${result.documentsCount}, Chunks Created: ${result.chunksCount}`);
        successCount++;
      } catch (err) {
        console.error(`   ❌ Failed: ${err.message}`);
        failCount++;
      }
    }

    console.log('\n====================================================');
    console.log(`🎉 Indexing run complete. Succeeded: ${successCount}, Failed: ${failCount}`);
    console.log('====================================================');
  } finally {
    await disconnectDB();
  }
}

runIndexer().catch((err) => {
  console.error('💥 Fatal Indexer Error:', err);
  process.exit(1);
});
