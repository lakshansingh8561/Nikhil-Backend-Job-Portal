import { Document, Types } from "mongoose";
import { Role } from "../../../common/enums/role.enum";

export interface IMembershipFeature {
  title: string;
  description?: string;
  enabled: boolean;
}

export interface IMembership extends Document {
  name: string;
  role: Role;
  price: number;
  currency: string;
  durationInDays: number;
  description: string;
  features: IMembershipFeature[];
  isPopular: boolean;
  isRecommended: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
