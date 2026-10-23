import * as planService from '../services/plan.service.js';
import * as reviewService from '../services/review.service.js';

/**
 * Controller: POST /api/contribution-plans
 * Contributor contribution plan submission
 */
export async function submitPlan(req, res, next) {
  try {
    const plan = await planService.createContributionPlan(req.user._id, req.body);
    res.status(201).json({
      success: true,
      data: {
        plan,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: GET /api/contribution-plans/:id
 * Authorized plan retrieval (Author or Project Maintainer)
 */
export async function getPlan(req, res, next) {
  try {
    const plan = await planService.getContributionPlanById(req.params.id, req.user._id);
    res.status(200).json({
      success: true,
      data: {
        plan,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: POST /api/contribution-plans/:id/review
 * Maintainer review and status transition
 */
export async function reviewPlan(req, res, next) {
  try {
    const result = await reviewService.reviewContributionPlan(req.params.id, req.user._id, req.body);
    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
