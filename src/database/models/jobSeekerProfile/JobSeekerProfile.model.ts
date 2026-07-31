import { Schema, model } from "mongoose";
import { IJobSeekerProfile } from "./jobSeekerProfile.interface";

const educationSchema = new Schema(
  {
    institution: {
      type: String,
      trim: true,
    },

    degree: {
      type: String,
      trim: true,
    },

    fieldOfStudy: {
      type: String,
      trim: true,
    },

    startDate: Date,

    endDate: Date,

    currentlyStudying: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: false,
  }
);

const experienceSchema = new Schema(
  {
    company: {
      type: String,
      trim: true,
    },

    designation: {
      type: String,
      trim: true,
    },

    employmentType: {
      type: String,
      default: "FULL_TIME",
      trim: true,
    },

    startDate: Date,

    endDate: Date,

    currentlyWorking: {
      type: Boolean,
      default: false,
    },

    description: {
      type: String,
      default: "",
    },
  },
  {
    _id: false,
  }
);

const jobSeekerProfileSchema = new Schema<IJobSeekerProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    headline: String,

    bio: String,

    currentLocation: String,

    yearsOfExperience: {
      type: Number,
      default: 0,
      min: 0,
    },

    expectedSalary: Number,

    skills: {
      type: [String],
      default: [],
    },

    education: {
      type: [educationSchema],
      default: [],
    },

    experience: {
      type: [experienceSchema],
      default: [],
    },

    resume: String,

    profilePicture: String,
  },
  {
    timestamps: true,
  }
);

export const JobSeekerProfile = model<IJobSeekerProfile>(
  "JobSeekerProfile",
  jobSeekerProfileSchema
);