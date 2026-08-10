import { Schema, model } from "mongoose";
import { IJobSeekerProfile } from "./jobSeekerProfile.interface";

const educationSchema = new Schema({
  institution: { type: String, required: true, trim: true },
  degree: { type: String, required: true, trim: true },
  fieldOfStudy: { type: String, default: "", trim: true },
  startDate: { type: Date },
  endDate: { type: Date },
  currentlyStudying: { type: Boolean, default: false },
});

const experienceSchema = new Schema({
  company: { type: String, required: true, trim: true },
  designation: { type: String, required: true, trim: true },
  employmentType: { type: String, default: "Full-Time", trim: true },
  startDate: { type: Date },
  endDate: { type: Date },
  currentlyWorking: { type: Boolean, default: false },
  description: { type: String, default: "", trim: true },
});

const jobSeekerProfileSchema = new Schema<IJobSeekerProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    resumeUrl: {
      type: String,
      default: "",
      trim: true,
    },
    resume: {
      type: String,
      default: "",
      trim: true,
    },
    profilePicture: {
      type: String,
      default: "",
      trim: true,
    },
    yearsOfExperience: {
      type: Number,
      default: 0,
      min: 0,
    },
    expectedSalary: {
      type: Number,
      default: 0,
    },
    noticePeriodDays: {
      type: Number,
      default: 0,
    },
    education: [educationSchema],
    experience: [experienceSchema],
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const JobSeekerProfile = model<IJobSeekerProfile>(
  "JobSeekerProfile",
  jobSeekerProfileSchema
);