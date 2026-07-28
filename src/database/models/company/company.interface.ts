import { Document, Types } from "mongoose";

export interface ICompany extends Document {
  ownerId: Types.ObjectId;

  companyName: string;

  tagline?: string;

  description?: string;

  industry: string;

  companySize: string;

  website?: string;

  email: string;

  phone: string;

  logo?: string;

  coverImage?: string;

  foundedYear?: number;

  headquarters?: string;

  city?: string;

  state?: string;

  country?: string;

  linkedin?: string;

  twitter?: string;

  facebook?: string;

  isVerified: boolean;

  createdAt: Date;

  updatedAt: Date;
}