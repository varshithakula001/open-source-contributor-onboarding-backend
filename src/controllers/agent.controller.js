import * as agentService from '../services/agent.service.js';

/**
 * Controller: POST /api/onboarding-agent
 * Handles contributor onboarding requests by executing the bounded agent workflow.
 */
export async function handleOnboardingAgent(req, res, next) {
  try {
    const { query, projectId, declaredSkills, availableHours } = req.body;

    const result = await agentService.executeOnboardingAgent({
      query,
      projectId,
      declaredSkills,
      availableHours,
      userId: req.user._id,
      userRole: req.user.role,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
