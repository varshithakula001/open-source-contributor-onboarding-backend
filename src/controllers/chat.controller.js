import * as ragService from '../services/rag.service.js';

/**
 * Controller: POST /api/contributor-chat
 * Answers contributor questions grounded in repository snapshot documentation.
 */
export async function handleContributorChat(req, res, next) {
  try {
    const { projectId, snapshotVersion, message, query } = req.body;
    const userPrompt = message || query;

    const result = await ragService.generateDocumentationAnswer({
      projectId,
      snapshotVersion,
      query: userPrompt,
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
