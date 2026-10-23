import { OllamaEmbeddings } from '@langchain/ollama';
import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

let defaultEmbeddingsInstance = null;
let testEmbeddingGenerator = null;

/**
 * Returns the configured LangChain OllamaEmbeddings instance.
 */
export function getOllamaEmbeddingsInstance() {
  if (!defaultEmbeddingsInstance) {
    defaultEmbeddingsInstance = new OllamaEmbeddings({
      baseUrl: env.OLLAMA_BASE_URL,
      model: env.OLLAMA_EMBED_MODEL,
    });
  }
  return defaultEmbeddingsInstance;
}

/**
 * Allows automated unit tests to inject a deterministic mock embedding generator.
 */
export function setEmbeddingGenerator(generatorFn) {
  testEmbeddingGenerator = generatorFn;
}

export function resetEmbeddingGenerator() {
  testEmbeddingGenerator = null;
}

/**
 * Validates that an embedding vector conforms strictly to numeric, finite, 768-dimensional requirements.
 * Rejects non-finite values, incorrect lengths, and all-zero placeholder vectors.
 * 
 * @param {Array<number>} vector
 * @param {number} expectedDim - Default 768
 * @returns {boolean}
 */
export function validateEmbedding(vector, expectedDim = env.EMBEDDING_DIMENSIONS || 768) {
  if (!Array.isArray(vector)) {
    throw new ApiError(500, 'INVALID_EMBEDDING', 'Embedding must be an array of numbers.');
  }

  if (vector.length !== expectedDim) {
    throw new ApiError(
      500,
      'INVALID_EMBEDDING_DIMENSIONS',
      `Embedding dimensionality mismatch: expected ${expectedDim} dimensions, received ${vector.length}.`
    );
  }

  const allFinite = vector.every((n) => typeof n === 'number' && Number.isFinite(n));
  if (!allFinite) {
    throw new ApiError(
      500,
      'INVALID_EMBEDDING_VALUES',
      'Embedding vector contains non-numeric or non-finite values (NaN / Infinity).'
    );
  }

  const isAllZero = vector.every((n) => n === 0);
  if (isAllZero) {
    throw new ApiError(
      500,
      'INVALID_EMBEDDING_ZERO',
      'Embedding vector cannot be an all-zero placeholder.'
    );
  }

  return true;
}

/**
 * Checks the live connectivity of the local Ollama instance.
 * Non-throwing: returns status object.
 */
export async function checkOllamaHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${env.OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        running: false,
        error: `Ollama returned HTTP status ${response.status}`,
        models: [],
      };
    }

    const data = await response.json();
    const models = Array.isArray(data.models) ? data.models.map((m) => m.name) : [];
    return {
      running: true,
      models,
      embedModelFound: models.some((m) => m.includes(env.OLLAMA_EMBED_MODEL)),
      llmModelFound: models.some((m) => m.includes(env.OLLAMA_LLM_MODEL)),
    };
  } catch (error) {
    return {
      running: false,
      error: error.message || 'Failed to connect to Ollama daemon',
      models: [],
    };
  }
}

/**
 * Generates and validates an embedding vector for a single query text.
 * 
 * @param {string} text - Input text to embed
 * @returns {Promise<Array<number>>} 768-dimensional float array
 */
export async function generateEmbedding(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new ApiError(400, 'EMPTY_EMBEDDING_INPUT', 'Input text for embedding generation cannot be empty.');
  }

  // Use test generator override if registered in unit tests
  if (testEmbeddingGenerator) {
    const mockVector = await testEmbeddingGenerator(text);
    validateEmbedding(mockVector);
    return mockVector;
  }

  try {
    const embeddings = getOllamaEmbeddingsInstance();
    const vector = await embeddings.embedQuery(text);
    validateEmbedding(vector);
    return vector;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    // Handle connection failures and model availability issues gracefully
    if (error.code === 'ECONNREFUSED' || error.message?.includes('fetch failed') || error.message?.includes('connect')) {
      throw new ApiError(
        503,
        'OLLAMA_UNAVAILABLE',
        `Ollama service is unreachable at ${env.OLLAMA_BASE_URL}. Ensure Ollama is installed and running.`
      );
    }

    if (error.status === 404 || error.message?.includes('model') || error.message?.includes('not found')) {
      throw new ApiError(
        503,
        'OLLAMA_MODEL_NOT_FOUND',
        `Ollama embedding model "${env.OLLAMA_EMBED_MODEL}" is not pulled. Run "ollama pull ${env.OLLAMA_EMBED_MODEL}".`
      );
    }

    throw new ApiError(500, 'EMBEDDING_GENERATION_FAILED', `Failed to generate text embedding: ${error.message}`);
  }
}

/**
 * Generates embeddings for an array of documentation chunks in bounded batches.
 * Attaches validated embedding vectors directly onto each chunk object.
 * 
 * @param {Array<Object>} chunks - Array of chunk objects with a .text property
 * @param {number} batchSize - Maximum batch size (default 10)
 * @returns {Promise<Array<Object>>} Chunks with .embedding array attached
 */
export async function generateChunkEmbeddings(chunks, batchSize = 10) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return [];
  }

  // Use test generator override if registered
  if (testEmbeddingGenerator) {
    for (const chunk of chunks) {
      const mockVector = await testEmbeddingGenerator(chunk.text);
      validateEmbedding(mockVector);
      chunk.embedding = mockVector;
    }
    return chunks;
  }

  const embeddings = getOllamaEmbeddingsInstance();

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map((c) => c.text);

    try {
      const vectors = await embeddings.embedDocuments(texts);
      if (!Array.isArray(vectors) || vectors.length !== batch.length) {
        throw new ApiError(500, 'EMBEDDING_COUNT_MISMATCH', 'Ollama returned unexpected number of document embeddings.');
      }

      for (let j = 0; j < batch.length; j++) {
        const vector = vectors[j];
        validateEmbedding(vector);
        batch[j].embedding = vector;
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;

      if (error.code === 'ECONNREFUSED' || error.message?.includes('fetch failed')) {
        throw new ApiError(
          503,
          'OLLAMA_UNAVAILABLE',
          `Ollama service is unreachable at ${env.OLLAMA_BASE_URL}. Ensure Ollama is running.`
        );
      }

      throw new ApiError(500, 'EMBEDDING_GENERATION_FAILED', `Failed to generate chunk embeddings: ${error.message}`);
    }
  }

  return chunks;
}
