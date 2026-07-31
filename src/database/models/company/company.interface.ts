import { Document, Types } from "mongoose";

export interface ICompany extends Document {
  ownerId: Types.ObjectId;

  companyName: string;

  tagline?: string;

  description?: string;

  mission?: string;

  vision?: string;

  industry: string;

  companySize: string;

  website?: string;

  email?: string;

  phone?: string;

  logo?: string;

  coverImage?: string;

  foundedYear?: number;

  headquarters?: string;

  address?: string;

  city?: string;

  state?: string;

  country?: string;

  linkedin?: string;

  facebook?: string;

  twitter?: string;

  instagram?: string;

  github?: string;

  youtube?: string;

  officeImages?: string[];

  isVerified: boolean;

  createdAt: Date;

  updatedAt: Date;
}