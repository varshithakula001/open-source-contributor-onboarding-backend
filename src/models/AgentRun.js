import mongoose from 'mongoose';

/**
 * AgentRun Schema
 * Records audit logs, tool execution traces, and recommendation outcomes of the AI Onboarding Agent.
 * 
 * SECURITY NOTICE:
 * Tool execution logs must NEVER record passwords, session cookies, connection strings,
 * or raw prompt injection payloads.
 */
const agentRunSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required for an agent run'],
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      index: true,
    },
    userRequest: {
      type: String,
      required: [true, 'User query/request is required'],
      trim: true,
      maxlength: [1000, 'User request cannot exceed 1000 characters'],
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'running', 'completed', 'failed'],
        message: '{VALUE} is not a valid status. Valid statuses: pending, running, completed, failed.',
      },
      default: 'pending',
      required: true,
    },
    toolExecutionRecords: {
      type: [
        {
          toolName: {
            type: String,
            required: [true, 'Tool name is required'],
          },
          toolInput: {
            type: mongoose.Schema.Types.Mixed,
          },
          toolOutput: {
            type: mongoose.Schema.Types.Mixed,
          },
          executedAt: {
            type: Date,
            default: Date.now,
          },
          durationMs: {
            type: Number,
          },
        },
      ],
      default: [],
    },
    recommendationOutcome: {
      recommendedIssueId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Issue',
      },
      reasons: {
        type: [{ type: String, trim: true }],
        default: [],
      },
      starterPlanSummary: {
        type: String,
        trim: true,
      },
    },
    evidenceReferences: {
      type: [
        {
          snapshotVersion: {
            type: String,
            trim: true,
          },
          filePath: {
            type: String,
            trim: true,
          },
          note: {
            type: String,
            trim: true,
          },
        },
      ],
      default: [],
    },
    errorDiagnostics: {
      errorCode: {
        type: String,
        trim: true,
      },
      sanitizedMessage: {
        type: String,
        trim: true,
      },
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for audit history retrieval
agentRunSchema.index({ userId: 1, createdAt: -1 });
agentRunSchema.index({ status: 1 });

export const AgentRun = mongoose.model('AgentRun', agentRunSchema);
export default AgentRun;
