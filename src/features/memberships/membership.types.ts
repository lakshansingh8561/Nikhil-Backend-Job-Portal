import { Role } from "../../common/enums/role.enum";

export interface SubscribeInput {
  membershipId: string;
}

export interface CancelSubscriptionInput {
  reason?: string;
}

export interface MembershipQuery {
  role?: Role;
  isActive?: boolean;
}
