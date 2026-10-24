import dotenv from 'dotenv';
import { z } from 'zod';

// Detect whether process is executing under automated test runner (e.g. node --test)
const isTestExecution =
  process.env.NODE_ENV === 'test' ||
  process.execArgv.some((arg) => arg.includes('test')) ||
  process.argv.some((arg) => arg.includes('test') || arg.endsWith('.test.js'));

if (isTestExecution && process.env.NODE_ENV !== 'production') {
  process.env.NODE_ENV = 'test';
}

// Load variables from .env file into process.env (dotenv preserves pre-set environment variables)
dotenv.config();

/**
 * Environment configuration schema validated using Zod.
 * Ensures that all critical runtime configuration is present and formatted correctly.
 */
const envSchema = z.object({
  PORT: z
    .string()
    .default('5000')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val >= 1024 && val <= 65535, {
      message: 'PORT must be an integer between 1024 and 65535',
    }),

  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  CLIENT_ORIGIN: z
    .string()
    .min(1, 'CLIENT_ORIGIN is required for CORS configuration')
    .default('http://localhost:3000'),

  MONGODB_URI: z
    .string()
    .optional()
    .transform((val) => (val && val.trim().length > 0 ? val.trim() : undefined)),

  SESSION_SECRET: z
    .string()
    .optional()
    .transform((val) => (val && val.trim().length > 0 ? val.trim() : undefined)),

  SESSION_MAX_AGE_MS: z
    .string()
    .default('604800000') // 7 days in milliseconds
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0, {
      message: 'SESSION_MAX_AGE_MS must be a positive integer in milliseconds',
    }),

  DEV_AUTH_TOKEN_LOGGING: z
    .string()
    .default('false')
    .transform((val) => val === 'true' || val === '1'),

  BCRYPT_SALT_ROUNDS: z
    .string()
    .default('12')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val >= 10 && val <= 14, {
      message: 'BCRYPT_SALT_ROUNDS must be an integer between 10 and 14',
    }),

  // Phase 5: Ollama and MongoDB Atlas Vector Search settings
  OLLAMA_BASE_URL: z
    .string()
    .default('http://localhost:11434')
    .transform((val) => val.trim().replace(/\/+$/, '')),

  OLLAMA_LLM_MODEL: z
    .string()
    .default('llama3.2')
    .transform((val) => val.trim()),

  OLLAMA_EMBED_MODEL: z
    .string()
    .default('nomic-embed-text')
    .transform((val) => val.trim()),

  ATLAS_VECTOR_INDEX_NAME: z
    .string()
    .default('vector_index')
    .transform((val) => val.trim()),

  ATLAS_ISSUE_VECTOR_INDEX_NAME: z
    .string()
    .default('issue_vector_index')
    .transform((val) => val.trim()),

  EMBEDDING_DIMENSIONS: z
    .string()
    .default('768')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0, {
      message: 'EMBEDDING_DIMENSIONS must be a positive integer',
    }),
}).superRefine((data, ctx) => {
  // In production, MONGODB_URI and SESSION_SECRET are strictly required.
  if (data.NODE_ENV === 'production') {
    if (!data.MONGODB_URI) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MONGODB_URI'],
        message: 'MONGODB_URI is strictly required when NODE_ENV is "production".',
      });
    }

    if (!data.SESSION_SECRET || data.SESSION_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SESSION_SECRET'],
        message: 'SESSION_SECRET must be at least 32 characters in production.',
      });
    }
  }

  // If SESSION_SECRET is provided in development, ensure it has at least 32 characters
  if (data.SESSION_SECRET && data.SESSION_SECRET.length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SESSION_SECRET'],
      message: 'SESSION_SECRET must be at least 32 characters long for security.',
    });
  }

  // If a MONGODB_URI is provided, ensure it starts with standard MongoDB protocol prefixes.
  if (data.MONGODB_URI && !data.MONGODB_URI.startsWith('mongodb://') && !data.MONGODB_URI.startsWith('mongodb+srv://')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['MONGODB_URI'],
      message: 'MONGODB_URI must start with "mongodb://" or "mongodb+srv://".',
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Critical Environment Configuration Error:');
  parsed.error.errors.forEach((err) => {
    console.error(`  - ${err.path.join('.') || 'configuration'}: ${err.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;
