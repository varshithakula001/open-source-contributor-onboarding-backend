import { MaintainerGrant } from '../models/MaintainerGrant.js';
import { Project } from '../models/Project.js';

/**
 * Global Role-Based Access Control Middleware
 * Restricts access to specified platform roles: 'contributor', 'maintainer', 'moderator'.
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
        },
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Requires one of the following roles: ${allowedRoles.join(', ')}.`,
        },
      });
    }

    next();
  };
}

/**
 * Project-Scoped Maintainer Authorization Middleware
 * Ensures a user holds an ACTIVE MaintainerGrant for the target project (or is the project owner).
 * 
 * SECURITY BOUNDARY:
 * Platform moderators are NOT automatically project maintainers.
 * Maintainer privileges are strictly scoped per-project to avoid global administrative creep.
 */
export function requireProjectMaintainer(getProjectId = (req) => req.params.id || req.params.projectId) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required.',
          },
        });
      }

      const projectId = typeof getProjectId === 'function' ? getProjectId(req) : req.params.id;

      if (!projectId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PROJECT_ID',
            message: 'Target project identifier could not be determined.',
          },
        });
      }

      // 1. Check if user holds an active project-scoped MaintainerGrant
      const activeGrant = await MaintainerGrant.findOne({
        projectId,
        userId: req.user._id,
        status: 'active',
      });

      if (activeGrant) {
        req.maintainerGrant = activeGrant;
        return next();
      }

      // 2. Check if user is the original project owner/creator
      const ownedProject = await Project.findOne({
        _id: projectId,
        ownerId: req.user._id,
      });

      if (ownedProject) {
        req.project = ownedProject;
        return next();
      }

      // If neither an active grant nor ownership exists, deny access
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN_NOT_MAINTAINER',
          message: 'You do not have maintainer privileges for this specific project.',
        },
      });
    } catch (error) {
      next(error);
    }
  };
}
