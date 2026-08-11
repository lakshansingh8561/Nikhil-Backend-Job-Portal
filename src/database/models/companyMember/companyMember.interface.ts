import { Document, Types } from "mongoose";

export type CompanyMemberRole = "OWNER" | "RECRUITER" | "HR" | "HIRING_MANAGER";

export interface ICompanyMember extends Document {
  companyId: Types.ObjectId;
  userId: Types.ObjectId;
  role: CompanyMemberRole;
  joinedAt: Date;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
