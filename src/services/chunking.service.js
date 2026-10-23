/**
 * Markdown Document Chunking Service
 * Divides markdown repository documentation into bounded text chunks for vector embedding and RAG.
 * 
 * SECURITY MANDATE:
 * - Content is treated strictly as UNTRUSTED text. No markdown interpretation or code execution.
 * - Preserves structural lineage: documentId, snapshotId, projectId, and source file path.
 * - Respects Markdown section headings (#, ##, ###) and paragraph boundaries.
 */

/**
 * Splits a Document record's markdown content into structured, bounded chunks.
 * 
 * @param {Object} doc - Mongoose Document instance or plain object containing content, filePath, projectId, snapshotId
 * @param {Object} options - Configuration options (maxChunkSize, overlap, snapshotVersion)
 * @returns {Array<Object>} Array of chunk objects ready for Chunk model insertion
 */
export function chunkMarkdownDocument(doc, options = {}) {
  const maxChunkSize = options.maxChunkSize || 800;
  const overlap = options.overlap !== undefined ? options.overlap : 150;
  const snapshotVersion = options.snapshotVersion || doc.snapshotVersion || '';

  if (!doc || !doc.content || typeof doc.content !== 'string') {
    return [];
  }

  const trimmedContent = doc.content.trim();
  if (trimmedContent.length === 0) {
    return [];
  }

  const lines = doc.content.split(/\r?\n/);
  const chunks = [];

  let currentBuffer = [];
  let currentBufferLength = 0;
  let currentSectionTitle = doc.title || 'Introduction';
  let chunkStartLine = 1;
  let currentLineNumber = 1;

  function flushChunk(endLine) {
    const text = currentBuffer.join('\n').trim();
    if (text.length === 0) {
      return;
    }

    chunks.push({
      projectId: doc.projectId,
      snapshotId: doc.snapshotId,
      documentId: doc._id,
      chunkIndex: chunks.length,
      text,
      metadata: {
        filePath: doc.filePath,
        snapshotVersion,
        sectionTitle: currentSectionTitle,
        startLine: chunkStartLine,
        endLine: Math.max(chunkStartLine, endLine),
      },
    });

    // Create overlap for context continuity
    if (overlap > 0 && currentBuffer.length > 1) {
      let overlapChars = 0;
      const overlapLines = [];
      for (let i = currentBuffer.length - 1; i >= 0; i--) {
        overlapChars += currentBuffer[i].length + 1;
        overlapLines.unshift(currentBuffer[i]);
        if (overlapChars >= overlap) {
          break;
        }
      }
      currentBuffer = overlapLines;
      currentBufferLength = overlapChars;
      chunkStartLine = Math.max(1, endLine - overlapLines.length + 1);
    } else {
      currentBuffer = [];
      currentBufferLength = 0;
      chunkStartLine = endLine + 1;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    currentLineNumber = i + 1;

    // Detect Markdown headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      // If we already have accumulated content, flush it as a complete chunk before starting new section
      if (currentBufferLength >= 100) {
        flushChunk(currentLineNumber - 1);
      }
      currentSectionTitle = headingMatch[2].trim();
    }

    // Handle single oversized lines (e.g. minified text or huge table rows)
    if (line.length > maxChunkSize) {
      if (currentBufferLength > 0) {
        flushChunk(currentLineNumber - 1);
      }

      // Split the oversized line into sequential segments
      let lineOffset = 0;
      while (lineOffset < line.length) {
        const slice = line.slice(lineOffset, lineOffset + maxChunkSize);
        chunks.push({
          projectId: doc.projectId,
          snapshotId: doc.snapshotId,
          documentId: doc._id,
          chunkIndex: chunks.length,
          text: slice.trim(),
          metadata: {
            filePath: doc.filePath,
            snapshotVersion,
            sectionTitle: currentSectionTitle,
            startLine: currentLineNumber,
            endLine: currentLineNumber,
          },
        });
        lineOffset += maxChunkSize - overlap;
        if (maxChunkSize <= overlap) break; // prevent infinite loop
      }

      currentBuffer = [];
      currentBufferLength = 0;
      chunkStartLine = currentLineNumber + 1;
      continue;
    }

    currentBuffer.push(line);
    currentBufferLength += line.length + 1;

    // If buffer exceeds maxChunkSize, flush current chunk
    if (currentBufferLength >= maxChunkSize) {
      flushChunk(currentLineNumber);
    }
  }

  // Flush any remaining content in buffer
  if (currentBuffer.length > 0) {
    const remainingText = currentBuffer.join('\n').trim();
    if (remainingText.length > 0) {
      flushChunk(lines.length);
    }
  }

  // Ensure consecutive, 0-indexed chunk numbers
  return chunks.map((chunk, idx) => ({
    ...chunk,
    chunkIndex: idx,
  }));
}
