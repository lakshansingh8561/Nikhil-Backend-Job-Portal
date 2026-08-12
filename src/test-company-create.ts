import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../.env") });

import { connectDatabase } from "./config/database";
import { CompanyService } from "./features/companies/company.service";
import { User, Company } from "./database/models";

async function testCompanyCreation() {
  console.log("Connecting to MongoDB...");
  await connectDatabase();

  const recruiter = await User.findOne({ role: "RECRUITER" });
  if (!recruiter) {
    console.log("No test recruiter user found in DB.");
    process.exit(0);
  }

  console.log(`Testing company creation for recruiter: ${recruiter.email}`);
  const companyName = "Test Unique Company " + Date.now();
  const createdCompany = await CompanyService.createCompany(recruiter._id.toString(), {
    name: companyName,
    companyName: companyName,
    description: "An innovative recruitment company",
    industry: "Information Technology",
    companySize: "10-50",
    email: recruiter.email,
  } as any);

  console.log("✅ COMPANY CREATED SUCCESSFULLY:", createdCompany.name, createdCompany._id);
  process.exit(0);
}

testCompanyCreation().catch((err) => {
  console.error("❌ TEST COMPANY CREATION FAILED:", err);
  process.exit(1);
});
