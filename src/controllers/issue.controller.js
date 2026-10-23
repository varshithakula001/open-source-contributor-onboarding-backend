import * as issueService from '../services/issue.service.js';

/**
 * Controller: POST /api/issues/:id/interest
 * Contributor expression of interest in an open issue
 */
export async function expressInterest(req, res, next) {
  try {
    const interest = await issueService.submitIssueInterest(req.params.id, req.user._id, req.body);
    res.status(201).json({
      success: true,
      data: {
        interest,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: PATCH /api/issues/:id
 * Maintainer issue curation and status updates
 */
export async function updateIssue(req, res, next) {
  try {
    const issue = await issueService.updateIssue(req.params.id, req.user._id, req.body);
    res.status(200).json({
      success: true,
      data: {
        issue,
      },
    });
  } catch (error) {
    next(error);
  }
}
