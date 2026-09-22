import { defaultPolicy } from "./manifest.js";
import { minimumQualifiedPool } from "./qualification.js";
import { JevRouter } from "./router.js";
import type {
  CapabilityManifest,
  CapabilityVerification,
  JevProvider,
  RiskLevel,
  RouteInput,
  RouteResult,
  RouterCandidate,
  RouterPolicy,
} from "./types.js";
import { requestId, sha256, validateJsonInput } from "./utils.js";

export interface JustWorkRouteInput extends RouteInput {
  /** Explicit capability chosen by deterministic application logic. Jev is not called. */
  capability_id?: string;
  /** Workload class used to admit only models with measured qualification evidence for this class. */
  task_class?: string;
  /** Consequential effects must pass the external Heimel/REHT authority gate before execution. */
  consequential?: boolean;
}

export type JustWorkDispatchKind = "capability" | "reasoning_fallback" | "human_review";

export interface JustWorkDispatch {
  kind: JustWorkDispatchKind;
  capability_id: string | null;
  requires_authority_gate: boolean;
  reason: string | null;
}

export interface JustWorkRouteResult {
  source: "deterministic" | "jev";
  route: RouteResult;
  dispatch: JustWorkDispatch;
}

/**
 * Thin JustWork boundary around JevRouter.
 *
 * - model candidates enter the active pool only with measured qualification evidence;
 * - deterministic capability ids bypass Jev but still receive the same policy checks;
 * - learned choices go through JevRouter unchanged;
 * - no_decision is handed to a reasoning LLM;
 * - confirmation-required choices are human exceptions;
 * - authority is never decided here: consequential work is only marked for Heimel/REHT.
 */
export class JustWorkAdapter {
  private readonly router: JevRouter;
  private readonly ordered: CapabilityManifest[];
  private readonly policy: RouterPolicy;

  constructor(
    provider: JevProvider,
    capabilities: CapabilityManifest[],
    policy: RouterPolicy = defaultPolicy,
  ) {
    this.policy = policy;
    this.ordered = [...capabilities].sort((a, b) => a.id.localeCompare(b.id));
    this.router = new JevRouter(provider, policy);
  }

  async route(input: JustWorkRouteInput): Promise<JustWorkRouteResult> {
    const active = minimumQualifiedPool(this.ordered, input.task_class);

    if (input.capability_id) {
      const route = this.routeDeterministic(input, input.capability_id, active);
      return {
        source: "deterministic",
        route,
        dispatch: toDispatch(route, Boolean(input.consequential)),
      };
    }

    const route = await this.router.route(input, active);
    return {
      source: "jev",
      route,
      dispatch: toDispatch(route, Boolean(input.consequential)),
    };
  }

  private routeDeterministic(input: JustWorkRouteInput, capabilityId: string, ordered: CapabilityManifest[]): RouteResult {
    const candidates = ordered.map((candidate) => deterministicCandidateView(candidate, input.actor_permissions, this.policy));
    const selected = candidates.find((candidate) => candidate.id === capabilityId) ?? null;
    const base = {
      request_id: requestId("req"),
      decision_id: requestId("dec"),
      mode: "decision_only" as const,
      execution: { enabled: false as const, status: "not_started" as const },
      provenance: {
        jev_provider: "not_called",
        candidate_snapshot_hash: sha256(ordered),
        policy_hash: sha256(this.policy),
      },
    };

    if (!selected) {
      return {
        ...base,
        status: "no_decision",
        decision: {
          kind: "choice",
          question: "Which single capability should handle this request?",
          selected: null,
          jev_choice: null,
          candidates,
          ...(input.input !== undefined ? { input: input.input, input_validation: null } : {}),
        },
        fallback: { type: "no_safe_candidate", reason: `Explicit capability ${capabilityId} is not in the current capability snapshot` },
        raw_jev: null,
      };
    }

    if (selected.router.filtered) {
      return {
        ...base,
        status: "no_decision",
        decision: {
          kind: "choice",
          question: "Which single capability should handle this request?",
          selected: null,
          jev_choice: null,
          candidates,
          ...(input.input !== undefined ? { input: input.input, input_validation: null } : {}),
        },
        fallback: { type: "no_safe_candidate", reason: selected.router.filter_reason },
        raw_jev: null,
      };
    }

    const manifest = ordered.find((candidate) => candidate.id === capabilityId);
    const inputErrors = manifest && input.input !== undefined
      ? validateJsonInput(input.input, manifest.input_schema)
      : [];
    const inputValidation = input.input === undefined ? null : { valid: inputErrors.length === 0, errors: inputErrors };

    if (inputValidation && !inputValidation.valid) {
      return {
        ...base,
        status: "no_decision",
        decision: {
          kind: "choice",
          question: "Which single capability should handle this request?",
          selected: null,
          jev_choice: null,
          candidates,
          input: input.input,
          input_validation: inputValidation,
        },
        fallback: { type: "manual_review", reason: `Input does not satisfy ${capabilityId} schema: ${inputErrors.join("; ")}` },
        raw_jev: null,
      };
    }

    return {
      ...base,
      status: selected.router.requires_confirmation ? "needs_confirmation" : "selected",
      decision: {
        kind: "choice",
        question: "Which single capability should handle this request?",
        selected: capabilityId,
        jev_choice: null,
        candidates,
        ...(input.input !== undefined ? { input: input.input, input_validation: inputValidation } : {}),
      },
      fallback: { type: null, reason: null },
      raw_jev: null,
    };
  }
}

function toDispatch(route: RouteResult, consequential: boolean): JustWorkDispatch {
  if (route.status === "no_decision") {
    return {
      kind: "reasoning_fallback",
      capability_id: null,
      requires_authority_gate: false,
      reason: route.fallback.reason,
    };
  }

  if (route.status === "needs_confirmation") {
    return {
      kind: "human_review",
      capability_id: route.decision.selected,
      requires_authority_gate: consequential,
      reason: route.fallback.reason,
    };
  }

  return {
    kind: "capability",
    capability_id: route.decision.selected,
    requires_authority_gate: consequential,
    reason: route.fallback.reason,
  };
}

function deterministicCandidateView(
  candidate: CapabilityManifest,
  actorPermissions: string[] | undefined,
  policy: RouterPolicy,
): RouterCandidate {
  const riskLevel: RiskLevel = candidate.risk?.level ?? "low";
  const available = candidate.availability?.available !== false;
  const verificationStatus: CapabilityVerification = candidate.verification?.status ?? "unknown";
  const verified = verificationStatus === "verified";
  const required = new Set(policy.required_permissions ?? []);
  const permissions = new Set(candidate.permissions ?? []);
  const actorPermissionSet = new Set(actorPermissions ?? []);
  const missingPolicyPermissions = [...required].filter((permission) => !permissions.has(permission));
  const missingActorPermissions = actorPermissions === undefined
    ? []
    : [...permissions].filter((permission) => !actorPermissionSet.has(permission));
  const allowedRisk = (policy.allowed_risk_levels ?? defaultPolicy.allowed_risk_levels ?? []).includes(riskLevel);
  const reasons: string[] = [];

  if (!available && !policy.allow_unavailable_fallback) reasons.push(candidate.availability?.reason ?? "capability_unavailable");
  if (missingPolicyPermissions.length > 0) reasons.push(`manifest_missing_permissions:${missingPolicyPermissions.join(",")}`);
  if (missingActorPermissions.length > 0) reasons.push(`actor_missing_permissions:${missingActorPermissions.join(",")}`);
  if (!allowedRisk) reasons.push(`risk_not_allowed:${riskLevel}`);
  if (policy.require_verified_candidates && !verified) reasons.push(`capability_not_verified:${verificationStatus}`);

  const requiresConfirmation = Boolean(
    candidate.policy?.requires_confirmation || (policy.confirmation_risk_levels ?? []).includes(riskLevel),
  );

  return {
    id: candidate.id,
    type: candidate.type,
    name: candidate.name,
    jev_probability: null,
    jev_confidence: null,
    jev_stage: null,
    router_rank: null,
    router: {
      available,
      verified,
      verification_status: verificationStatus,
      verification_source: candidate.verification?.source ?? null,
      allowed: reasons.length === 0,
      risk_level: riskLevel,
      requires_confirmation: requiresConfirmation,
      filtered: reasons.length > 0,
      filter_reason: reasons.length > 0 ? reasons.join(";") : null,
    },
  };
}
