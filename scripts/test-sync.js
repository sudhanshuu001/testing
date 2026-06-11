// Register TS paths and ts-node so we can execute TS files directly in Node.js
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: "commonjs",
    moduleResolution: "node"
  }
});
const path = require('path');

// Configure environment
require('dotenv').config();

const { runSourceSync } = require('../src/lib/pipeline');
const mongoose = require('mongoose');

async function test() {
  console.log("🚀 Starting Aggregator Pipeline Verification...");
  
  // Set default MONGODB_URI if not present
  if (!process.env.MONGODB_URI) {
    process.env.MONGODB_URI = "mongodb://localhost:27017/jobfusion";
  }
  
  console.log(`- Database Target: ${process.env.MONGODB_URI}`);
  
  try {
    // 1. Run Wellfound sync (forces public Remotive fallback in test environment)
    console.log("\n1. Running sync cycle for Wellfound/Startups source...");
    const result = await runSourceSync("wellfound", ["software engineer"]);
    
    console.log("Result:", result);
    if (result.success) {
      console.log(`✅ Sync successful! Upserted ${result.count} startup jobs.`);
    } else {
      console.error(`❌ Sync failed:`, result.error);
    }
    
    // 2. Query stored jobs to verify fields
    const Job = mongoose.models.Job || mongoose.model("Job", new mongoose.Schema({}, { strict: false }));
    const count = await Job.countDocuments({ source: "wellfound" });
    console.log(`\n2. Total Wellfound jobs in DB: ${count}`);
    
    if (count > 0) {
      const sample = await Job.findOne({ source: "wellfound" }).sort({ createdAt: -1 });
      console.log("3. Sample Job Document Verification:");
      console.log(JSON.stringify({
        title: sample.title,
        company: sample.company,
        location: sample.location,
        source: sample.source,
        applyUrl: sample.applyUrl,
        dedupeHash: sample.dedupeHash,
        fetchedAt: sample.fetchedAt,
        skills: sample.skills,
        salary: sample.salary
      }, null, 2));
      
      // 4. Test Deduplication (Run sync again to verify no duplicates are created)
      console.log("\n4. Running Wellfound sync again to test deduplication...");
      const result2 = await runSourceSync("wellfound", ["software engineer"]);
      const countAfter = await Job.countDocuments({ source: "wellfound" });
      console.log(`Total Wellfound jobs in DB after second run: ${countAfter}`);
      
      if (count === countAfter) {
        console.log("✅ Deduplication test passed! No duplicate documents were created.");
      } else {
        console.warn("⚠️ Deduplication warning: job count changed. Please inspect hashes.");
      }
    }
    
  } catch (err) {
    console.error("❌ Test crashed:", err);
  } finally {
    await mongoose.disconnect();
    console.log("\nDisconnected from MongoDB. Test finished.");
  }
}

test();
