// Register ts-node
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: "commonjs",
    moduleResolution: "node"
  }
});

require('dotenv').config();

const { runSourceSync } = require('../src/lib/pipeline');
const mongoose = require('mongoose');

async function testAll() {
  console.log("🚀 Starting Aggregator Pipeline Verification for ALL Sources...");
  
  if (!process.env.MONGODB_URI) {
    process.env.MONGODB_URI = "mongodb://localhost:27017/jobfusion";
  }
  
  const sources = ["wellfound", "indeed", "linkedin", "internshala"];
  
  try {
    for (const src of sources) {
      console.log(`\n--------------------------------------------`);
      console.log(`Syncing Source: ${src.toUpperCase()}`);
      console.log(`--------------------------------------------`);
      
      const result = await runSourceSync(src, ["react"]);
      console.log(`Result for ${src}:`, result);
      
      if (result.success) {
        console.log(`✅ Success! Synchronized ${result.count} jobs.`);
      } else {
        console.error(`❌ Failed:`, result.error);
      }
    }
    
    // Summary
    const Job = mongoose.models.Job || mongoose.model("Job", new mongoose.Schema({}, { strict: false }));
    console.log(`\n============================================`);
    console.log(`DATABASE SUMMARY:`);
    console.log(`============================================`);
    
    for (const src of sources) {
      const count = await Job.countDocuments({ source: src });
      console.log(`- ${src.toUpperCase()}: ${count} jobs in DB`);
    }
    
    const totalCount = await Job.countDocuments();
    console.log(`Total jobs in DB: ${totalCount}`);
    
  } catch (err) {
    console.error("Fatal test error:", err);
  } finally {
    await mongoose.disconnect();
    console.log("\nDisconnected from MongoDB.");
  }
}

testAll();
