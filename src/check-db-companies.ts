import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../.env") });

import { connectDatabase } from "./config/database";
import { Company, RecruiterProfile, User } from "./database/models";

async function checkData() {
  await connectDatabase();

  const companies = await Company.find();
  console.log(`--- TOTAL COMPANIES IN DB: ${companies.length} ---`);
  companies.forEach((c, idx) => {
    console.log(`${idx + 1}. Name: "${c.name}", companyName: "${(c as any).companyName}", userId: ${c.userId}, ownerId: ${c.ownerId}`);
  });

  const recruiterProfiles = await RecruiterProfile.find().populate("userId", "email role").populate("companyId");
  console.log(`\n--- TOTAL RECRUITER PROFILES IN DB: ${recruiterProfiles.length} ---`);
  recruiterProfiles.forEach((r, idx) => {
    const email = (r.userId as any)?.email || "no-email";
    console.log(`${idx + 1}. User Email: ${email}, currentCompany: "${r.currentCompany}", companyId: ${(r.companyId as any)?.name || r.companyId}`);
  });

  const recruiterUsers = await User.find({ role: "RECRUITER" });
  console.log(`\n--- TOTAL RECRUITER USERS IN DB: ${recruiterUsers.length} ---`);
  recruiterUsers.forEach((u, idx) => {
    console.log(`${idx + 1}. Email: ${u.email}, ID: ${u._id}`);
  });

  process.exit(0);
}

checkData().catch((err) => {
  console.error(err);
  process.exit(1);
});
