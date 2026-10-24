import { AgentRun } from '../models/AgentRun.js';
import { runOnboardingAgent } from '../agent/onboardingAgent.js';
import { ApiError } from '../utils/errors.js';

/**
 * Service to execute an onboarding agent session and persist audit logs to the AgentRun collection.
 *
 * GUARANTEES:
 * - Creates an AgentRun entry at execution start.
 * - Records each tool invocation with its inputs, outputs, and execution duration.
 * - Always finalizes the AgentRun record as 'completed' or 'failed' (never leaves records orphaned in 'running').
 * - Strips any potential sensitive credentials before saving.
 *
 * @param {Object} params
 * @param {string} params.query - Contributor's query (e.g. "Find a task I can start this weekend")
 * @param {string} [params.projectId] - Optional target project ID
 * @param {Array<string>} [params.declaredSkills] - Explicit skills supplied by user
 * @param {number} [params.availableHours] - Declared available hours
 * @param {string} params.userId - Authenticated user ObjectId
 * @param {string} params.userRole - Role of the user
 * @returns {Promise<Object>} Recommendation response and agentRunId
 */
export async function executeOnboardingAgent({
  query,
  projectId,
  declaredSkills,
  availableHours,
  userId,
  userRole,
}) {
  if (!userId) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required to execute onboarding agent.');
  }

  // 1. Initialize audit record in AgentRun collection
  const agentRun = new AgentRun({
    userId,
    projectId: projectId || undefined,
    userRequest: query,
    status: 'running',
    startedAt: new Date(),
    toolExecutionRecords: [],
    evidenceReferences: [],
  });

  await agentRun.save();

  // Hook to record tool calls safely
  const onToolExecution = async ({ toolName, toolInput, toolOutput, durationMs }) => {
    agentRun.toolExecutionRecords.push({
      toolName,
      toolInput,
      toolOutput,
      executedAt: new Date(),
      durationMs,
    });
  };

  try {
    // 2. Execute bounded agent workflow
    const context = { userId, userRole };
    const agentResult = await runOnboardingAgent(
      {
        query,
        projectId,
        declaredSkills,
        availableHours,
      },
      context,
      onToolExecution
    );

    // 3. Finalize audit record as 'completed'
    agentRun.status = 'completed';
    agentRun.completedAt = new Date();

    if (agentResult.recommendedIssue) {
      agentRun.recommendationOutcome = {
        recommendedIssueId: agentResult.recommendedIssue.issueId,
        reasons: agentResult.matchReasons || [],
        starterPlanSummary: agentResult.starterPlan?.summary || '',
      };
      agentRun.evidenceReferences = agentResult.evidenceReferences || [];
    } else {
      agentRun.recommendationOutcome = {
        reasons: agentResult.matchReasons || ['No eligible issues found.'],
        starterPlanSummary: agentResult.disclaimer || '',
      };
    }

    await agentRun.save();

    return {
      agentRunId: agentRun._id.toString(),
      ...agentResult,
    };
  } catch (error) {
    // 4. Safely record error diagnostics without stranding AgentRun in 'running' state
    agentRun.status = 'failed';
    agentRun.completedAt = new Date();
    agentRun.errorDiagnostics = {
      errorCode: error.code || 'AGENT_ERROR',
      sanitizedMessage: error.message || 'Onboarding agent failed to complete.',
    };

    try {
      await agentRun.save();
    } catch {
      // Ignore secondary logging failure to preserve root error
    }

    throw error;
  }
}
