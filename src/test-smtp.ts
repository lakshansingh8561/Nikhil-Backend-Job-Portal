import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../.env") });

import { EmailService } from "./common/services/email.service";

async function testEmail() {
  console.log("Testing EmailService with Nodemailer...");
  console.log("EMAIL_USER:", process.env.EMAIL_USER);
  console.log("EMAIL_PASS:", process.env.EMAIL_PASS ? "****" : "MISSING");

  const success = await EmailService.sendApplicationConfirmationToJobSeeker({
    applicantEmail: "lakshansingh8561@gmail.com",
    applicantName: "Lakshan Singh",
    jobTitle: "Senior Full Stack Engineer",
    companyName: "JobBox Portal Test",
  });

  if (success) {
    console.log("✅ TEST EMAIL SENT SUCCESSFULLY!");
  } else {
    console.error("❌ TEST EMAIL FAILED TO SEND.");
  }
}

testEmail().catch(console.error);
