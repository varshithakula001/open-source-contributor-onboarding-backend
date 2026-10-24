import { ChatOllama } from '@langchain/ollama';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { env } from '../config/env.js';
import { findIssues } from './tools/findIssues.tool.js';
import { inspectPrerequisites } from './tools/inspectPrerequisites.tool.js';
import { checkIssueAvailability } from './tools/checkIssueAvailability.tool.js';

let testAgentLlmGenerator = null;

/**
 * Allows automated tests to inject a deterministic mock LLM response generator for the agent.
 */
export function setAgentLlmGenerator(fn) {
  testAgentLlmGenerator = fn;
}

export function resetAgentLlmGenerator() {
  testAgentLlmGenerator = null;
}

/**
 * System prompt defining the Onboarding Agent's role, constraints, and boundaries.
 */
export const AGENT_SYSTEM_PROMPT = `You are an AI Open Source Contributor Onboarding Assistant.
Your role is to help contributors find suitable open-source issues and prepare a practical starter plan.

STRICT BOUNDARIES & SAFETY RULES:
1. You must NEVER claim that an issue has been assigned, reserved, or that a contribution plan has been approved. Finding an issue is only a recommendation.
2. Base all recommendations strictly on verified tool outputs. NEVER invent issues, file paths, prerequisites, or repository commands.
3. NEVER execute shell commands, process operations, or write to repositories.
4. If the contributor asks for a weekend task, prioritize issues estimated as "weekend" or "hours".
5. If an issue is unavailable, you must consider alternative candidates.
6. Return clear, evidence-based reasons explaining why an issue is suitable for the contributor.`;

/**
 * Synthesizes a practical, grounded starter plan for the recommended issue.
 * Uses local Ollama (llama3.2) if available or test generator if registered,
 * with deterministic fallback.
 *
 * @param {Object} params
 * @param {Object} params.issue - Selected candidate issue
 * @param {Object} params.prerequisites - Inspected prerequisites and documentation references
 * @param {Array<string>} params.contributorSkills - Contributor's skills
 * @param {number} params.availableHours - Contributor's available hours
 * @param {string} params.query - Original contributor query
 * @returns {Promise<string>} Plan summary text
 */
export async function generateStarterPlanText({
  issue,
  prerequisites,
  contributorSkills,
  availableHours,
  query,
}) {
  const prompt = `Contributor Query: "${query}"
Selected Issue: #${issue.issueNumber} - "${issue.title}"
Estimated Effort: ${issue.estimatedEffort} (Available time: ${availableHours} hours)
Required Skills: ${(issue.requiredSkills || []).join(', ') || 'None specified'}
Prerequisites: ${(issue.prerequisites || []).join('; ') || 'None specified'}
Setup Steps: ${(issue.setupSteps || []).join('; ') || 'Follow standard project setup'}
Documentation Citations: ${(prerequisites.documentationReferences || []).map((d) => d.filePath).join(', ') || 'Standard README'}
Snapshot Staleness: ${prerequisites.staleWarning ? prerequisites.staleWarning : 'Up-to-date'}

Generate a concise 3-4 sentence starter plan summarizing:
1. Why this task fits their timeframe and skills.
2. Initial preparation steps (reading docs, local setup).
3. The next action: drafting a formal Contribution Plan for maintainer review.`;

  if (testAgentLlmGenerator) {
    return testAgentLlmGenerator({
      prompt,
      systemPrompt: AGENT_SYSTEM_PROMPT,
      issue,
      prerequisites,
    });
  }

  try {
    const chat = new ChatOllama({
      baseUrl: env.OLLAMA_BASE_URL,
      model: env.OLLAMA_LLM_MODEL,
      temperature: 0.2,
    });

    const response = await chat.invoke([
      new SystemMessage(AGENT_SYSTEM_PROMPT),
      new HumanMessage(prompt),
    ]);

    return typeof response.content === 'string' ? response.content.trim() : JSON.stringify(response.content);
  } catch {
    // Deterministic fallback if Ollama is not running
    return `Recommended task #${issue.issueNumber} ("${issue.title}") aligns with your available ${availableHours} hours and skills (${(issue.requiredSkills || []).join(', ')}). Begin by reviewing the project setup documentation and completing prerequisites before submitting a formal Contribution Plan for maintainer review.`;
  }
}

/**
 * Executes the purposeful onboarding agent workflow deterministically through bounded tools.
 *
 * WORKFLOW:
 * 1. Understand request and profile (findIssues).
 * 2. Discover candidate issues.
 * 3. Inspect prerequisites and repository documentation (inspectPrerequisites).
 * 4. Verify live availability of candidates (checkIssueAvailability).
 * 5. Re-check alternative candidate if top candidate is taken/closed.
 * 6. Generate practical starter plan and citations.
 *
 * @param {Object} params
 * @param {string} params.query - Contributor's request (e.g. "Find a task I can start this weekend")
 * @param {string} [params.projectId] - Optional target project ObjectId
 * @param {Array<string>} [params.declaredSkills] - Explicit skills supplied with request
 * @param {number} [params.availableHours] - Declared available hours
 * @param {Object} context - Server context { userId, userRole }
 * @param {Function} [onToolExecution] - Callback hook to record tool execution in AgentRun
 * @returns {Promise<Object>} Final structured onboarding recommendation
 */
export async function runOnboardingAgent(
  { query, projectId, declaredSkills = [], availableHours = 10 },
  context = {},
  onToolExecution = null
) {
  const isWeekendQuery = query.toLowerCase().includes('weekend');
  const effortPreference = isWeekendQuery ? 'weekend' : undefined;

  // 1. Tool 1: findIssues
  const startFind = Date.now();
  const findInput = {
    query,
    projectId,
    skills: declaredSkills,
    availableHours,
    effort: effortPreference,
    limit: 5,
  };

  const candidates = await findIssues(findInput, context);

  if (onToolExecution) {
    await onToolExecution({
      toolName: 'findIssues',
      toolInput: findInput,
      toolOutput: { count: candidates.length, candidateIds: candidates.map((c) => c.issueId) },
      durationMs: Date.now() - startFind,
    });
  }

  if (candidates.length === 0) {
    return {
      recommendationFound: false,
      recommendedIssue: null,
      matchReasons: ['No open issues found matching your requested criteria and available hours.'],
      starterPlan: null,
      evidenceReferences: [],
      availabilityCheck: null,
      disclaimer: 'No issues were recommended. Try expanding your declared skills or adjusting your timeframe.',
    };
  }

  // 2. Iterate candidates, inspect prerequisites, and authoritatively verify availability
  let selectedCandidate = null;
  let selectedPrerequisites = null;
  let selectedAvailability = null;

  for (const candidate of candidates) {
    // Tool 2: inspectPrerequisites
    const startPrereq = Date.now();
    const prereqInput = { issueId: candidate.issueId };
    const prereqResult = await inspectPrerequisites(prereqInput, context);

    if (onToolExecution) {
      await onToolExecution({
        toolName: 'inspectPrerequisites',
        toolInput: prereqInput,
        toolOutput: {
          issueId: candidate.issueId,
          snapshotVersion: prereqResult.snapshotVersion,
          citationsCount: prereqResult.documentationReferences.length,
          staleWarning: prereqResult.staleWarning,
        },
        durationMs: Date.now() - startPrereq,
      });
    }

    // Tool 3: checkIssueAvailability
    const startAvail = Date.now();
    const availInput = { issueId: candidate.issueId };
    const availResult = await checkIssueAvailability(availInput, context);

    if (onToolExecution) {
      await onToolExecution({
        toolName: 'checkIssueAvailability',
        toolInput: availInput,
        toolOutput: {
          issueId: candidate.issueId,
          isAvailable: availResult.isAvailable,
          status: availResult.status,
          checkedAt: availResult.checkedAt,
        },
        durationMs: Date.now() - startAvail,
      });
    }

    if (availResult.isAvailable) {
      selectedCandidate = candidate;
      selectedPrerequisites = prereqResult;
      selectedAvailability = availResult;
      break; // Found top available candidate
    }
  }

  // If all examined candidates were unavailable (taken/closed)
  if (!selectedCandidate) {
    return {
      recommendationFound: false,
      recommendedIssue: null,
      matchReasons: ['All examined candidate issues are currently taken or unavailable in the repository.'],
      starterPlan: null,
      evidenceReferences: [],
      availabilityCheck: null,
      disclaimer: 'No currently available issues found. Please check back later or consider other projects.',
    };
  }

  // 3. Generate practical starter plan
  const starterPlanSummary = await generateStarterPlanText({
    issue: selectedCandidate,
    prerequisites: selectedPrerequisites,
    contributorSkills: declaredSkills,
    availableHours,
    query,
  });

  const structuredStarterPlan = {
    summary: starterPlanSummary,
    suggestedInitialSteps: [
      `1. Clone repository and inspect target codebase for Issue #${selectedCandidate.issueNumber}.`,
      `2. Review setup prerequisites: ${(selectedCandidate.prerequisites || []).join(', ') || 'Standard repository configuration'}.`,
      `3. Verify documented guidelines in ${(selectedPrerequisites.documentationReferences || []).map((d) => d.filePath).join(', ') || 'project README'}.`,
      '4. Draft and submit a structured Contribution Plan (POST /api/contribution-plans) for maintainer review before writing code.',
    ],
    requiredSkills: selectedCandidate.requiredSkills,
    skillGaps: selectedCandidate.skillGaps,
    estimatedEffort: selectedCandidate.estimatedEffort,
  };

  const evidenceReferences = (selectedPrerequisites.documentationReferences || []).map((doc) => ({
    snapshotVersion: doc.snapshotVersion || selectedPrerequisites.snapshotVersion,
    filePath: doc.filePath,
    note: `Section: ${doc.sectionTitle}${doc.startLine ? ` (Lines ${doc.startLine}-${doc.endLine})` : ''}`,
  }));

  return {
    recommendationFound: true,
    recommendedIssue: {
      issueId: selectedCandidate.issueId,
      issueNumber: selectedCandidate.issueNumber,
      projectId: selectedCandidate.projectId,
      projectName: selectedCandidate.projectName,
      title: selectedCandidate.title,
      description: selectedCandidate.description,
      estimatedEffort: selectedCandidate.estimatedEffort,
      requiredSkills: selectedCandidate.requiredSkills,
      prerequisites: selectedCandidate.prerequisites,
      status: selectedCandidate.status,
      matchingMethod: selectedCandidate.matchingMethod,
    },
    matchReasons: selectedCandidate.matchReasons,
    prerequisites: {
      setupPrerequisites: selectedPrerequisites.setupPrerequisites,
      setupSteps: selectedPrerequisites.setupSteps,
      requiredBackgroundKnowledge: selectedPrerequisites.requiredBackgroundKnowledge,
      missingInformationNotes: selectedPrerequisites.missingInformationNotes,
      snapshotVersion: selectedPrerequisites.snapshotVersion,
      snapshotFreshnessStatus: selectedPrerequisites.snapshotFreshnessStatus,
      staleWarning: selectedPrerequisites.staleWarning,
    },
    starterPlan: structuredStarterPlan,
    evidenceReferences,
    availabilityCheck: selectedAvailability,
    disclaimer: 'IMPORTANT: This recommendation confirms issue availability in the database. It does NOT reserve, assign, or approve the issue. To contribute, submit a formal Contribution Plan for maintainer review.',
  };
}
