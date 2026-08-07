import { Document } from "mongoose";
import { Role } from "../../../common/enums/role.enum";
import { UserStatus } from "../../../common/enums/userStatus.enum";

export interface IUser extends Document {
  email: string;
  password: string;
  role: Role;
  status: UserStatus;
  isVerified: boolean;
  lastLogin?: Date;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}