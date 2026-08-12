import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../.env") });

import { EmailService } from "./common/services/email.service";

async function testStatusEmails() {
  console.log("Testing Email Notifications...");

  // 1. Test Recruiter Notification when a Candidate Applies
  console.log("\n1. Testing Recruiter Application Received Email...");
  const res1 = await EmailService.sendApplicationSubmittedToRecruiter({
    recruiterEmail: "lakshansingh8561@gmail.com",
    recruiterName: "Hiring Team",
    applicantName: "Lakshan Singh",
    applicantEmail: "lakshansingh8561@gmail.com",
    jobTitle: "Senior Full Stack Developer",
    companyName: "JobBox Portal",
    coverLetter: "I am excited to submit my candidate application for this senior developer position.",
  });
  console.log("Recruiter Notification Email Sent:", res1);

  // 2. Test Candidate Notification when Status is REJECTED
  console.log("\n2. Testing Candidate Status Update Email (REJECTED)...");
  const res2 = await EmailService.sendStatusUpdateToJobSeeker({
    applicantEmail: "lakshansingh8561@gmail.com",
    applicantName: "Lakshan Singh",
    jobTitle: "Senior Full Stack Developer",
    companyName: "JobBox Portal",
    status: "REJECTED",
    notes: "Thank you for applying. We are proceeding with candidates whose skills more closely align with our current stack.",
  });
  console.log("Candidate Rejected Email Sent:", res2);

  // 3. Test Candidate Notification when Status is SHORTLISTED / INTERVIEW
  console.log("\n3. Testing Candidate Status Update Email (SHORTLISTED)...");
  const res3 = await EmailService.sendStatusUpdateToJobSeeker({
    applicantEmail: "lakshansingh8561@gmail.com",
    applicantName: "Lakshan Singh",
    jobTitle: "Senior Full Stack Developer",
    companyName: "JobBox Portal",
    status: "SHORTLISTED",
  });
  console.log("Candidate Shortlisted Email Sent:", res3);
}

testStatusEmails().catch(console.error);
