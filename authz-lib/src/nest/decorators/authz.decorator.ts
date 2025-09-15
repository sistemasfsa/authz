import { SetMetadata } from "@nestjs/common";
import type { AuthzPolicy } from "../../shared/contracts";

export const AUTHZ_KEY = "authz_policy";
export const Authz = (policy: AuthzPolicy) => SetMetadata(AUTHZ_KEY, policy);
