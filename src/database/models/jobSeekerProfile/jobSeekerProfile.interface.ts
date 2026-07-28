import { Document, Types } from "mongoose";

export interface IEducation {
  institution: string;
  degree: string;
  fieldOfStudy: string;
  startDate: Date;
  endDate?: Date;
  currentlyStudying: boolean;
}

export interface IExperience {
  company: string;
  designation: string;
  employmentType: string;
  startDate: Date;
  endDate?: Date;
  currentlyWorking: boolean;
  description?: string;
}

export interface IJobSeekerProfile extends Document {
  userId: Types.ObjectId;

  firstName: string;
  lastName: string;

  phone: string;

  headline?: string;

  bio?: string;

  currentLocation?: string;

  yearsOfExperience: number;

  expectedSalary?: number;

  skills: string[];

  education: IEducation[];

  experience: IExperience[];

  resume?: string;

  profilePicture?: string;

  createdAt: Date;

  updatedAt: Date;
}