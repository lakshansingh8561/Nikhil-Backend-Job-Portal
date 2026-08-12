import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../.env") });

import { connectDatabase } from "./config/database";
import { User, RecruiterProfile, CompanyMember, Company } from "./database/models";

async function debugSakshi() {
  await connectDatabase();

  const sakshi = await User.findOne({ email: "sakshi8585@yopmail.com" });
  if (!sakshi) {
    console.log("sakshi user not found.");
    process.exit(0);
  }

  console.log(`Sakshi User ID: ${sakshi._id}`);

  const member = await CompanyMember.findOne({ userId: sakshi._id });
  console.log("CompanyMember record for Sakshi:", member);

  const recruiterProfile = await RecruiterProfile.findOne({ userId: sakshi._id });
  console.log("RecruiterProfile record for Sakshi:", recruiterProfile);

  const ownedCompany = await Company.findOne({
    $or: [{ userId: sakshi._id }, { ownerId: sakshi._id }],
  });
  console.log("Company owned by Sakshi:", ownedCompany);

  // Search for TechNova in Company collection
  const techNova = await Company.find({
    $or: [
      { name: /TechNova/i },
      { companyName: /TechNova/i },
      { tagline: /Building Tomorrow/i },
    ],
  });
  console.log("\nTechNova companies in DB:", techNova);

  // Search for CompanyMembers linked to TechNova
  if (techNova.length > 0) {
    const techNovaMembers = await CompanyMember.find({
      companyId: { $in: techNova.map(t => t._id) },
    });
    console.log("CompanyMembers linked to TechNova:", techNovaMembers);
  }

  process.exit(0);
}

debugSakshi().catch(console.error);
