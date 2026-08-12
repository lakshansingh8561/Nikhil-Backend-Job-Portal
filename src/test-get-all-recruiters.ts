import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(__dirname, "../.env") });

import { connectDatabase } from "./config/database";
import { RecruiterService } from "./features/recruiters/recruiter.service";

async function testGetAll() {
  await connectDatabase();

  console.log("\n1. Fetching ALL recruiters...");
  const allRes = await RecruiterService.getAllRecruiters({});
  console.log(`Total Recruiters/Companies returned: ${allRes.recruiters.length}`);
  allRes.recruiters.forEach((r, idx) => {
    const compName = (r.companyId as any)?.name || (r.companyId as any)?.companyName || r.currentCompany || "No Company";
    const userEmail = (r.userId as any)?.email || "no-email";
    console.log(` ${idx + 1}. User: ${userEmail} | Company: "${compName}" | Open Jobs: ${r.openJobsCount}`);
  });

  console.log("\n2. Testing filter by letter 'X' (for Xeno Solutions)...");
  const xRes = await RecruiterService.getAllRecruiters({ letter: "X" });
  console.log(`Letter 'X' results: ${xRes.recruiters.length}`);
  xRes.recruiters.forEach((r, idx) => {
    const compName = (r.companyId as any)?.name || (r.companyId as any)?.companyName || r.currentCompany;
    console.log(` ${idx + 1}. Company: "${compName}"`);
  });

  process.exit(0);
}

testGetAll().catch(console.error);
