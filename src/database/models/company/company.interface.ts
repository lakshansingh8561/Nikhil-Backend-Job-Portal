import { Document, Types } from "mongoose";

export type CompanyVerificationStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ICompanyLocation {
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
}

export interface ICompanySocialLinks {
  linkedin?: string;
  twitter?: string;
  github?: string;
  facebook?: string;
  website?: string;
}

export interface ICompany extends Document {
  name: string;
  userId?: Types.ObjectId;
  ownerId?: Types.ObjectId;
  slug: string;
  description?: string;
  industry: string;
  companySize: string;
  email?: string;
  phone?: string;
  website?: string;
  logo?: string;
  coverImage?: string;
  location?: ICompanyLocation;
  socialLinks?: ICompanySocialLinks;
  verificationStatus: CompanyVerificationStatus;
  status: string;
  isDeleted?: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}