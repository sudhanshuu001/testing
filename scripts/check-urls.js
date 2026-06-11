const { MongoClient } = require('mongodb');
const uri = "mongodb://localhost:27017/jobfusion";

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    const jobs = await db.collection('jobs').find({ 
      source: { $in: ['linkedin', 'internshala'] } 
    }).toArray();
    
    console.log(`Found ${jobs.length} jobs for linkedin/internshala:`);
    console.log(JSON.stringify(jobs.map(j => ({
      _id: j._id,
      title: j.title,
      company: j.company,
      source: j.source,
      applyUrl: j.applyUrl,
      sourceUrl: j.sourceUrl
    })), null, 2));
  } finally {
    await client.close();
  }
}
run().catch(console.dir);
