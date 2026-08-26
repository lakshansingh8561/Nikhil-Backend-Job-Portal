export interface ParsedResumeData {
  fullName?: string;
  email?: string;
  phone?: string;
  headline?: string;
  summary?: string;
  skills: string[];
  experience: Array<{
    title: string;
    company: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    description?: string;
  }>;
  education: Array<{
    degree: string;
    institution: string;
    fieldOfStudy?: string;
    graduationYear?: string;
  }>;
  certifications?: string[];
  languages?: string[];
  links?: string[];
}

export interface MatchAnalysisResult {
  matchPercentage: number;
  verdict: "Strong Match" | "Good Match" | "Moderate Match" | "Low Match";
  matchedSkills: string[];
  missingSkills: string[];
  strengths: string[];
  recommendations: string[];
  atsKeywords: string[];
}

export interface GenerateJobDTO {
  title: string;
  department?: string;
  jobType?: string;
  workplaceType?: string;
  experienceLevel?: string;
  keySkills?: string[];
  companyName?: string;
  additionalDetails?: string;
}

export interface GeneratedJobDescription {
  title: string;
  overview: string;
  responsibilities: string[];
  requirements: string[];
  niceToHaves: string[];
  suggestedSkills: string[];
}
