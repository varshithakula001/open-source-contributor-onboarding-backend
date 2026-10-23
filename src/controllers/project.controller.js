import * as projectService from '../services/project.service.js';
import * as planService from '../services/plan.service.js';
import * as snapshotService from '../services/snapshot.service.js';

/**
 * Controller: GET /api/projects
 * Public project discovery
 */
export async function getProjects(req, res, next) {
  try {
    const result = await projectService.getPublicProjects(req.query);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: GET /api/projects/:id/issues
 * Public issue browser for an approved public project
 */
export async function getProjectIssues(req, res, next) {
  try {
    const result = await projectService.getPublicProjectIssues(req.params.id, req.query);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: PATCH /api/projects/:id/verification
 * Moderator project verification
 */
export async function verifyProject(req, res, next) {
  try {
    const result = await projectService.verifyProject(req.params.id, req.user._id, req.body);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: GET /api/projects/:id/contribution-plans
 * Maintainer review inbox (supplementary endpoint)
 */
export async function getProjectContributionPlans(req, res, next) {
  try {
    const result = await planService.getProjectContributionPlans(req.params.id, req.user._id, req.query);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Controller: POST /api/projects/:id/imports
 * Maintainer snapshot import
 */
export async function importSnapshot(req, res, next) {
  try {
    const result = await snapshotService.importSnapshot(req.params.id, req.user._id, req.body);
    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}
