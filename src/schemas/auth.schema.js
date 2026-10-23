import { z } from 'zod';

/**
 * Public User Signup Schema
 * Validates registration payloads.
 * SECURITY: Explicitly rejects any attempts by a client to self-assign maintainer or moderator roles.
 */
export const userSignupSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Please provide a valid email address'),

    password: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .max(100, 'Password cannot exceed 100 characters'),

    profile: z
      .object({
        displayName: z
          .string()
          .trim()
          .max(100, 'Display name cannot exceed 100 characters')
          .optional()
          .default(''),

        skills: z
          .array(z.string().trim().toLowerCase())
          .optional()
          .default([]),

        interests: z
          .array(z.string().trim())
          .optional()
          .default([]),

        experienceLevel: z
          .enum(['beginner', 'intermediate', 'advanced'])
          .optional()
          .default('beginner'),

        availableHoursPerWeek: z
          .number()
          .min(0, 'Available hours cannot be negative')
          .max(168, 'Available hours cannot exceed 168 per week')
          .optional()
          .default(5),
      })
      .optional()
      .default({}),

    // Disallow self-assignment of staff roles
    role: z
      .string()
      .optional()
      .refine(
        (val) => val === undefined || val === 'contributor',
        'Self-assigning staff roles (maintainer or moderator) during signup is strictly prohibited.'
      ),
  })
  .strict(); // Rejects unrecognized top-level fields

/**
 * Contributor Profile Update Schema
 */
export const contributorProfileUpdateSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .max(100, 'Display name cannot exceed 100 characters')
      .optional(),

    skills: z
      .array(z.string().trim().toLowerCase())
      .optional(),

    interests: z
      .array(z.string().trim())
      .optional(),

    experienceLevel: z
      .enum(['beginner', 'intermediate', 'advanced'])
      .optional(),

    availableHoursPerWeek: z
      .number()
      .min(0, 'Available hours cannot be negative')
      .max(168, 'Available hours cannot exceed 168 per week')
      .optional(),
  })
  .strict();

/**
 * User Login Schema
 */
export const userLoginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Please provide a valid email address'),

    password: z
      .string()
      .min(1, 'Password is required'),
  })
  .strict();

/**
 * Email Verification Schema
 */
export const verifyEmailSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(1, 'Verification token is required'),
  })
  .strict();

/**
 * Forgot Password Schema
 */
export const forgotPasswordSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Please provide a valid email address'),
  })
  .strict();

/**
 * Reset Password Schema
 */
export const resetPasswordSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(1, 'Recovery token is required'),

    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters long')
      .max(100, 'Password cannot exceed 100 characters'),
  })
  .strict();
