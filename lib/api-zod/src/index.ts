export * from "./generated/types";

// Keep the shared TypeScript request/response types as the unqualified names.
// Orval emits identically named Zod schemas for bodies as well, so export those
// validation schemas with a Schema suffix to avoid duplicate barrel exports.
export {
  HealthCheckResponse,
  createCouncilRoomBodyNameMax,
  CreateCouncilRoomBody as CreateCouncilRoomBodySchema,
  CreateCouncilRoomResponse,
  RotateCouncilRoomMcpTokenParams,
  RotateCouncilRoomMcpTokenResponse,
  RevokeCouncilRoomMcpTokenParams,
  RevokeCouncilRoomMcpTokenResponse,
  HandleMiddlemainMcpRequestBody as HandleMiddlemainMcpRequestBodySchema,
  HandleMiddlemainMcpRequestResponse,
} from "./generated/api";
