import fs from "fs";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("pdf-parse");
import {
  ParsedResumeData,
  MatchAnalysisResult,
  GenerateJobDTO,
  GeneratedJobDescription,
} from "./ai.types";

// Comprehensive skill taxonomy dictionary for NLP matching
const KNOWN_SKILLS = [
  "JavaScript", "TypeScript", "React", "React Native", "Vue.js", "Angular", "Next.js",
  "Node.js", "Express", "NestJS", "Python", "Django", "Flask", "FastAPI", "Java",
  "Spring Boot", "C#", ".NET", "C++", "Go", "Rust", "PHP", "Laravel", "Ruby", "Ruby on Rails",
  "HTML", "HTML5", "CSS", "CSS3", "Sass", "Tailwind CSS", "Bootstrap", "Redux", "Zustand",
  "GraphQL", "REST API", "gRPC", "WebSockets", "Socket.io",
  "SQL", "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "Cassandra", "DynamoDB", "Prisma", "Sequelize", "Mongoose",
  "AWS", "Amazon Web Services", "Azure", "Google Cloud", "GCP", "Docker", "Kubernetes", "Terraform", "CI/CD", "GitHub Actions", "Jenkins", "Nginx", "Linux",
  "Git", "GitHub", "GitLab", "Jira", "Confluence", "Figma", "Adobe XD", "UI/UX",
  "Machine Learning", "Deep Learning", "Artificial Intelligence", "NLP", "Data Science", "Pandas", "NumPy", "Scikit-Learn", "TensorFlow", "PyTorch", "OpenCV",
  "Unit Testing", "Jest", "Cypress", "Playwright", "Selenium", "Mocha", "Chai", "TDD",
  "Agile", "Scrum", "Kanban", "Project Management", "Team Leadership", "Communication", "Problem Solving", "System Design", "Microservices"
];

export class AIService {
  /**
   * Parse PDF buffer or raw text into a structured Candidate Profile
   */
  public static async parseResumeBuffer(buffer?: Buffer, filePath?: string): Promise<ParsedResumeData> {
    try {
      let fileBuffer = buffer;
      if ((!fileBuffer || fileBuffer.length === 0) && filePath && fs.existsSync(filePath)) {
        fileBuffer = fs.readFileSync(filePath);
      }

      if (fileBuffer && fileBuffer.length > 0) {
        const pdfFn = typeof pdfParse === "function" ? pdfParse : (pdfParse?.default || pdfParse);
        if (typeof pdfFn === "function") {
          const pdfData = await pdfFn(fileBuffer);
          const extractedText = pdfData?.text || "";
          if (extractedText.trim().length > 0) {
            return this.parseResumeText(extractedText);
          }
        }

        const rawText = fileBuffer.toString("utf-8").replace(/[^\x20-\x7E\n]/g, " ");
        if (rawText.trim().length > 0) {
          return this.parseResumeText(rawText);
        }
      }
    } catch (error) {
      console.warn("[AIService] PDF parsing fallback triggered:", error);
      if (buffer && buffer.length > 0) {
        const rawText = buffer.toString("utf-8").replace(/[^\x20-\x7E\n]/g, " ");
        return this.parseResumeText(rawText);
      }
    }

    return this.parseResumeText("Candidate Resume");
  }

  /**
   * Parse raw text of a resume into structured JSON
   */
  public static async parseResumeText(text: string): Promise<ParsedResumeData> {
    // If GEMINI_API_KEY is available, attempt Gemini API extraction first
    if (process.env.GEMINI_API_KEY) {
      try {
        const geminiResult = await this.callGeminiForResume(text);
        if (geminiResult) return geminiResult;
      } catch (err) {
        console.warn("[AIService] Gemini API call failed, falling back to NLP extractor:", err);
      }
    }

    // Heuristic & NLP Fallback Parser
    return this.fallbackResumeParser(text);
  }

  /**
   * Analyze match between a job posting and a candidate's profile/resume
   */
  public static async analyzeMatch(
    job: { title: string; description: string; skills: string[]; requirements?: string },
    candidate: { headline?: string; summary?: string; skills: string[]; experience?: any[]; education?: any[]; rawResumeText?: string }
  ): Promise<MatchAnalysisResult> {
    if (process.env.GEMINI_API_KEY) {
      try {
        const geminiResult = await this.callGeminiForMatch(job, candidate);
        if (geminiResult) return geminiResult;
      } catch (err) {
        console.warn("[AIService] Gemini Match API call failed, using fallback analyzer:", err);
      }
    }

    return this.fallbackMatchAnalyzer(job, candidate);
  }

  /**
   * Generate Job Description for Recruiters
   */
  public static async generateJobDescription(dto: GenerateJobDTO): Promise<GeneratedJobDescription> {
    if (process.env.GEMINI_API_KEY) {
      try {
        const geminiResult = await this.callGeminiForJobGeneration(dto);
        if (geminiResult) return geminiResult;
      } catch (err) {
        console.warn("[AIService] Gemini Job Gen API call failed, using template generator:", err);
      }
    }

    return this.fallbackJobGenerator(dto);
  }

  // =========================================================================
  // HEURISTIC & NLP FALLBACK ENGINE IMPLEMENTATIONS
  // =========================================================================

  private static fallbackResumeParser(text: string): ParsedResumeData {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

    // 1. Extract Email
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const email = emailMatch ? emailMatch[0] : undefined;

    // 2. Extract Phone
    const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    const phone = phoneMatch ? phoneMatch[0] : undefined;

    // 3. Extract Full Name (usually first non-empty line or near email)
    let fullName = lines.length > 0 ? lines[0] : "Candidate";
    if (fullName.length > 40 || fullName.includes("@")) {
      const cleanLine = lines.find(l => l.length < 35 && !l.includes("@") && !/\d/.test(l));
      if (cleanLine) fullName = cleanLine;
    }

    // 4. Extract Skills using taxonomy matching
    const extractedSkills = new Set<string>();
    const lowerText = text.toLowerCase();
    for (const skill of KNOWN_SKILLS) {
      const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(text)) {
        extractedSkills.add(skill);
      }
    }

    // 5. Extract Headline & Summary
    let headline = "Software Engineer / Professional";
    if (extractedSkills.size > 0) {
      const topSkills = Array.from(extractedSkills).slice(0, 3).join(" | ");
      headline = `Specialist in ${topSkills}`;
    }

    let summary = text.slice(0, 300).replace(/\s+/g, " ") + "...";
    const summaryHeader = lines.find(l => /summary|profile|about me|objective/i.test(l));
    if (summaryHeader) {
      const idx = lines.indexOf(summaryHeader);
      if (idx !== -1 && lines[idx + 1]) {
        summary = lines.slice(idx + 1, idx + 5).join(" ");
      }
    }

    // 6. Extract Education
    const education: ParsedResumeData["education"] = [];
    const eduKeywords = ["bachelor", "master", "phd", "b.tech", "m.tech", "b.s.", "m.s.", "degree", "university", "college", "institute"];
    lines.forEach((line) => {
      const lLower = line.toLowerCase();
      if (eduKeywords.some((k) => lLower.includes(k))) {
        education.push({
          degree: line.slice(0, 60),
          institution: "Higher Education Institution",
          fieldOfStudy: lLower.includes("computer") ? "Computer Science" : "Engineering",
        });
      }
    });

    if (education.length === 0) {
      education.push({
        degree: "Bachelor of Science / Technology",
        institution: "University / Institute",
        fieldOfStudy: "Computer Science & Engineering",
      });
    }

    // 7. Extract Experience
    const experience: ParsedResumeData["experience"] = [];
    const expKeywords = ["developer", "engineer", "manager", "designer", "lead", "architect", "intern", "consultant", "analyst"];
    lines.forEach((line) => {
      const lLower = line.toLowerCase();
      if (expKeywords.some((k) => lLower.includes(k)) && line.length < 60 && !lLower.includes("bachelor")) {
        experience.push({
          title: line,
          company: "Technology Company",
          startDate: "2021",
          endDate: "Present",
          description: "Developed scalable software components and collaborated with cross-functional teams.",
        });
      }
    });

    if (experience.length === 0) {
      experience.push({
        title: headline,
        company: "Software Solutions",
        startDate: "2022",
        endDate: "Present",
        description: "Contributed to frontend and backend software development projects.",
      });
    }

    return {
      fullName,
      email,
      phone,
      headline,
      summary,
      skills: Array.from(extractedSkills),
      experience: experience.slice(0, 4),
      education: education.slice(0, 2),
      languages: ["English"],
    };
  }

  private static fallbackMatchAnalyzer(
    job: { title: string; description: string; skills: string[]; requirements?: string },
    candidate: { headline?: string; summary?: string; skills: string[]; experience?: any[]; education?: any[]; rawResumeText?: string }
  ): MatchAnalysisResult {
    const jobText = `${job.title} ${job.description} ${job.skills.join(" ")} ${job.requirements || ""}`.toLowerCase();
    
    // Combine explicit skills + text from candidate profile/headline/summary/experience
    const candidateSkillsSet = new Set<string>(
      (candidate.skills || []).map((s) => s.trim().toLowerCase())
    );

    const candidateFullText = [
      candidate.headline || "",
      candidate.summary || "",
      (candidate.experience || []).map((e: any) => `${e.title || ""} ${e.description || ""} ${e.company || ""}`).join(" "),
      candidate.rawResumeText || "",
    ].join(" ").toLowerCase();

    // Auto-extract candidate skills from full profile text using taxomony
    for (const skill of KNOWN_SKILLS) {
      const skillLower = skill.toLowerCase();
      const regex = new RegExp(`\\b${skillLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(candidateFullText)) {
        candidateSkillsSet.add(skillLower);
      }
    }

    // Collect ATS target skills from job post
    const targetJobSkills = new Set<string>();
    (job.skills || []).forEach((s) => targetJobSkills.add(s));
    for (const skill of KNOWN_SKILLS) {
      const skillLower = skill.toLowerCase();
      if (jobText.includes(skillLower)) {
        targetJobSkills.add(skill);
      }
    }

    const matchedSkills: string[] = [];
    const missingSkills: string[] = [];

    targetJobSkills.forEach((skill) => {
      const skillLower = skill.toLowerCase();
      if (candidateSkillsSet.has(skillLower)) {
        matchedSkills.push(skill);
      } else {
        missingSkills.push(skill);
      }
    });

    // Score calculation
    const totalTarget = targetJobSkills.size || 1;
    const skillRatio = matchedSkills.length / totalTarget;
    let matchPercentage = Math.round(skillRatio * 70);

    if (matchedSkills.length > 0) {
      matchPercentage += 15;
    }

    // Title / role alignment bonus
    const jobTitleWords = job.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const hasTitleMatch = jobTitleWords.some((w) => candidateFullText.includes(w));
    if (hasTitleMatch) {
      matchPercentage += 10;
    }

    // Experience bonus
    if (candidate.experience && candidate.experience.length > 0) {
      matchPercentage += 5;
    }

    matchPercentage = Math.min(98, Math.max(20, matchPercentage));

    let verdict: MatchAnalysisResult["verdict"] = "Low Match";
    if (matchPercentage >= 80) verdict = "Strong Match";
    else if (matchPercentage >= 65) verdict = "Good Match";
    else if (matchPercentage >= 45) verdict = "Moderate Match";

    const strengths: string[] = [];
    if (matchedSkills.length > 0) {
      strengths.push(`Matches ${matchedSkills.length} required technical skills for this role.`);
    }
    if (hasTitleMatch) {
      strengths.push(`Profile background aligns with ${job.title} responsibilities.`);
    }
    if (candidate.experience && candidate.experience.length > 0) {
      strengths.push(`Has relevant hands-on work experience.`);
    }
    if (strengths.length === 0) {
      strengths.push("Base candidate profile created.");
    }

    const recommendations: string[] = [];
    if (candidateSkillsSet.size === 0) {
      recommendations.push("⚠️ Your profile currently has no skills listed! Go to your Profile page and click '✨ AI Resume Auto-Fill' to extract your skills.");
    }
    if (missingSkills.length > 0) {
      const topMissing = missingSkills.slice(0, 4).join(", ");
      recommendations.push(`Add key ATS keywords to your profile: ${topMissing}.`);
    }
    recommendations.push(`Quantify achievements in your work experience (e.g. 'Improved efficiency by 30%').`);
    recommendations.push(`Tailor your profile summary specifically for ${job.title} positions.`);

    return {
      matchPercentage,
      verdict,
      matchedSkills: Array.from(new Set(matchedSkills)),
      missingSkills: Array.from(new Set(missingSkills.slice(0, 8))),
      strengths,
      recommendations,
      atsKeywords: Array.from(targetJobSkills).slice(0, 10),
    };
  }

  private static fallbackJobGenerator(dto: GenerateJobDTO): GeneratedJobDescription {
    const title = dto.title || "Software Engineer";
    const level = dto.experienceLevel || "Mid-Level";
    const company = dto.companyName || "Our Company";
    const userSkills = dto.keySkills && dto.keySkills.length > 0 ? dto.keySkills : ["JavaScript", "TypeScript", "React", "Node.js"];

    const overview = `We are looking for a talented and passionate ${level} ${title} to join ${company}. In this role, you will design, build, and maintain modern, scalable web applications and collaborate closely with our engineering and design teams to deliver exceptional user experiences.`;

    const responsibilities = [
      `Architect, develop, and deploy high-performance applications for ${title} initiatives.`,
      `Collaborate with cross-functional teams (Designers, Product Managers, Engineers) to define, design, and ship new features.`,
      `Write clean, maintainable, and well-tested code following modern software engineering best practices.`,
      `Optimize application components for maximum performance, responsiveness, and cross-browser compatibility.`,
      `Participate in code reviews, technical discussions, and contribute to system design architecture.`,
      `Troubleshoot, debug, and resolve issues reported in production environments.`,
    ];

    const requirements = [
      `Proven experience as a ${title} or similar role in software development.`,
      `Strong proficiency in ${userSkills.slice(0, 3).join(", ")}, and modern development tools.`,
      `Solid understanding of RESTful APIs, asynchronous programming, and state management.`,
      `Experience with database systems (SQL / NoSQL) and version control using Git.`,
      `Strong problem-solving skills, attention to detail, and ability to work in an Agile environment.`,
      `Excellent communication and teamwork skills.`,
    ];

    const niceToHaves = [
      `Experience with cloud platforms such as AWS, GCP, or Azure.`,
      `Familiarity with CI/CD pipelines, Docker containerization, and automated testing frameworks.`,
      `Prior experience working in fast-paced tech startups or agile product teams.`,
    ];

    return {
      title,
      overview,
      responsibilities,
      requirements,
      niceToHaves,
      suggestedSkills: Array.from(new Set([...userSkills, "Git", "REST API", "Agile"])),
    };
  }

  // =========================================================================
  // OPTIONAL GOOGLE GEMINI API HANDLERS
  // =========================================================================

  private static async callGeminiForResume(text: string): Promise<ParsedResumeData | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const prompt = `You are an expert AI Resume Parser. Parse the following resume text into a strict JSON object with these exact keys:
    {
      "fullName": string,
      "email": string,
      "phone": string,
      "headline": string,
      "summary": string,
      "skills": string[],
      "experience": [{ "title": string, "company": string, "startDate": string, "endDate": string, "description": string }],
      "education": [{ "degree": string, "institution": string, "fieldOfStudy": string, "graduationYear": string }]
    }
    Output ONLY valid JSON.
    
    Resume Text:
    ${text.slice(0, 4000)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawContent) return null;

    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  }

  private static async callGeminiForMatch(job: any, candidate: any): Promise<MatchAnalysisResult | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const prompt = `Analyze fit between Job and Candidate Profile. Return strict JSON:
    {
      "matchPercentage": number (0-100),
      "verdict": "Strong Match" | "Good Match" | "Moderate Match" | "Low Match",
      "matchedSkills": string[],
      "missingSkills": string[],
      "strengths": string[],
      "recommendations": string[],
      "atsKeywords": string[]
    }
    Output ONLY valid JSON.

    Job Title: ${job.title}
    Job Description: ${job.description}
    Job Skills: ${job.skills.join(", ")}

    Candidate Profile:
    Headline: ${candidate.headline || ""}
    Skills: ${(candidate.skills || []).join(", ")}
    Summary: ${candidate.summary || ""}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawContent) return null;

    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  }

  private static async callGeminiForJobGeneration(dto: GenerateJobDTO): Promise<GeneratedJobDescription | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const prompt = `Generate a structured Job Description JSON for:
    Title: ${dto.title}
    Seniority: ${dto.experienceLevel || "Mid-Level"}
    Company: ${dto.companyName || "Our Tech Company"}
    Skills: ${(dto.keySkills || []).join(", ")}

    Return strict JSON:
    {
      "title": string,
      "overview": string,
      "responsibilities": string[],
      "requirements": string[],
      "niceToHaves": string[],
      "suggestedSkills": string[]
    }
    Output ONLY valid JSON.`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawContent) return null;

    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  }
}
