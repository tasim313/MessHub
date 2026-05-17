import { addDocTo, deleteDocFrom, setDocIn, updateDocIn, type ChangeRequest, type Member } from "./data";

export interface ActorInfo {
  uid: string;
  name: string;
  role: Member["role"];
}

export async function logActivity(input: {
  type: string;
  entity: string;
  entityId?: string;
  action: string;
  actor: ActorInfo;
  message: string;
  meta?: Record<string, unknown>;
}) {
  await addDocTo("activity_logs", {
    type: input.type,
    entity: input.entity,
    entityId: input.entityId,
    action: input.action,
    actorUid: input.actor.uid,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    message: input.message,
    meta: input.meta || {},
  });
}

export async function submitChangeRequest(input: {
  collectionName: string;
  action: ChangeRequest["action"];
  title: string;
  actor: ActorInfo;
  targetId?: string;
  payload?: object;
  previousData?: object | null;
}) {
  const requestPayload: Record<string, unknown> = {
    collectionName: input.collectionName,
    action: input.action,
    title: input.title,
    payload: input.payload || null,
    previousData: input.previousData || null,
    requestedByUid: input.actor.uid,
    requestedByName: input.actor.name,
    requestedByRole: input.actor.role,
    status: "pending",
    updatedAt: Date.now(),
  };

  if (input.targetId) {
    requestPayload.targetId = input.targetId;
  }

  const request = await addDocTo("change_requests", {
    ...requestPayload,
  });

  await logActivity({
    type: "change_request",
    entity: input.collectionName,
    entityId: input.targetId,
    action: input.action,
    actor: input.actor,
    message: `${input.actor.name} submitted ${input.action} request for ${input.collectionName}`,
    meta: { requestId: request.id, title: input.title },
  });

  return request;
}

export async function applyApprovedRequest(request: ChangeRequest, reviewer: ActorInfo, reviewNote?: string) {
  if (request.action === "create" && request.payload) {
    await addDocTo(request.collectionName, request.payload);
  }

  if (request.action === "update" && request.targetId && request.payload) {
    await updateDocIn(request.collectionName, request.targetId, request.payload);
  }

  if (request.action === "delete" && request.targetId) {
    await deleteDocFrom(request.collectionName, request.targetId);
  }

  await setDocIn("change_requests", request.id, {
    status: "approved",
    reviewNote: reviewNote || "",
    reviewedByUid: reviewer.uid,
    reviewedByName: reviewer.name,
    updatedAt: Date.now(),
  });

  await logActivity({
    type: "approval",
    entity: request.collectionName,
    entityId: request.targetId,
    action: request.action,
    actor: reviewer,
    message: `${reviewer.name} approved ${request.action} request for ${request.collectionName}`,
    meta: { requestId: request.id, reviewNote: reviewNote || "" },
  });
}

export async function rejectRequest(request: ChangeRequest, reviewer: ActorInfo, reviewNote?: string) {
  await setDocIn("change_requests", request.id, {
    status: "rejected",
    reviewNote: reviewNote || "",
    reviewedByUid: reviewer.uid,
    reviewedByName: reviewer.name,
    updatedAt: Date.now(),
  });

  await logActivity({
    type: "approval",
    entity: request.collectionName,
    entityId: request.targetId,
    action: "reject",
    actor: reviewer,
    message: `${reviewer.name} rejected request for ${request.collectionName}`,
    meta: { requestId: request.id, reviewNote: reviewNote || "" },
  });
}
