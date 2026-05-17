import { a as addDocTo, u as updateDocIn, d as deleteDocFrom, s as setDocIn } from "./router-lCZ3tuDB.js";
async function logActivity(input) {
  await addDocTo("activity_logs", {
    type: input.type,
    entity: input.entity,
    entityId: input.entityId,
    action: input.action,
    actorUid: input.actor.uid,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    message: input.message,
    meta: input.meta || {}
  });
}
async function submitChangeRequest(input) {
  const request = await addDocTo("change_requests", {
    collectionName: input.collectionName,
    action: input.action,
    title: input.title,
    targetId: input.targetId,
    payload: input.payload || null,
    previousData: input.previousData || null,
    requestedByUid: input.actor.uid,
    requestedByName: input.actor.name,
    requestedByRole: input.actor.role,
    status: "pending",
    updatedAt: Date.now()
  });
  await logActivity({
    type: "change_request",
    entity: input.collectionName,
    entityId: input.targetId,
    action: input.action,
    actor: input.actor,
    message: `${input.actor.name} submitted ${input.action} request for ${input.collectionName}`,
    meta: { requestId: request.id, title: input.title }
  });
  return request;
}
async function applyApprovedRequest(request, reviewer, reviewNote) {
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
    reviewNote: "",
    reviewedByUid: reviewer.uid,
    reviewedByName: reviewer.name,
    updatedAt: Date.now()
  });
  await logActivity({
    type: "approval",
    entity: request.collectionName,
    entityId: request.targetId,
    action: request.action,
    actor: reviewer,
    message: `${reviewer.name} approved ${request.action} request for ${request.collectionName}`,
    meta: { requestId: request.id, reviewNote: "" }
  });
}
async function rejectRequest(request, reviewer, reviewNote) {
  await setDocIn("change_requests", request.id, {
    status: "rejected",
    reviewNote: "",
    reviewedByUid: reviewer.uid,
    reviewedByName: reviewer.name,
    updatedAt: Date.now()
  });
  await logActivity({
    type: "approval",
    entity: request.collectionName,
    entityId: request.targetId,
    action: "reject",
    actor: reviewer,
    message: `${reviewer.name} rejected request for ${request.collectionName}`,
    meta: { requestId: request.id, reviewNote: "" }
  });
}
export {
  applyApprovedRequest as a,
  rejectRequest as r,
  submitChangeRequest as s
};
