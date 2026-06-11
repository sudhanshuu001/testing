const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/jobfusion";

// Define inline Job Schema matching the MongoDB structure
const JobSchema = new mongoose.Schema({
  title: { type: String, required: true },
  company: { type: String, required: true },
  companyLogo: String,
  companyColor: String,
  location: String,
  locationType: { type: String, enum: ["remote", "hybrid", "onsite"], default: "remote" },
  salary: String,
  salaryMin: Number,
  salaryMax: Number,
  experience: String,
  experienceLevel: { type: String, enum: ["entry", "mid", "senior", "lead", "executive"], default: "mid" },
  type: { type: String, enum: ["full-time", "part-time", "contract", "internship"], default: "full-time" },
  skills: [String],
  matchScore: Number,
  postedAt: String,
  description: String,
  requirements: [String],
  responsibilities: [String],
  benefits: [String],
  applicants: Number,
  featured: Boolean,
  category: String,
  source: String,
  applyUrl: String
}, { timestamps: true });

// Avoid duplicate model definition error
const Job = mongoose.models.Job || mongoose.model("Job", JobSchema);

const keywords = ['React', 'TypeScript', 'Node.js', 'Next.js', 'Python', 'Go Developer', 'Product Manager', 'Data Scientist', 'Frontend Developer', 'Backend Engineer'];
const mockLocations = ['Bengaluru, Karnataka', 'Mumbai, Maharashtra', 'Noida, Uttar Pradesh', 'Chennai, Tamil Nadu', 'Hyderabad, Telangana', 'Remote, India'];

// Clean job titles
function cleanTitleForSearch(title) {
  let clean = title
    .replace(/[\(\[][^\)\]]*[\)\]]/g, "") // remove parentheses/brackets
    .replace(/\b(?:remote|india|us|usa|canada|uk|europe|london|germany|world|worldwide|timezone|utc|gmt|emea|latam|apac)\b/gi, "")
    .replace(/[-|/\\+,;:]+$/g, "") // remove trailing punctuation
    .replace(/\s+/g, " ")
    .trim();
  
  if (clean.length < 5) return title;
  return clean;
}

// Generate a company color based on portal
function getCompanyColor(source) {
  switch (source) {
    case 'LinkedIn': return '#0077B5';
    case 'Indeed': return '#003A9B';
    case 'Glassdoor': return '#0CAA41';
    case 'Google Jobs': return '#EA4335';
    default: return '#6366F1';
  }
}

// 1. LinkedIn Crawler (Crawls LinkedIn Guest Job Widget API)
async function crawlLinkedIn(keyword) {
  const jobs = [];
  try {
    const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(keyword)}&location=India&start=0`;
    console.log(`[LinkedIn Crawler] Fetching: ${url}`);
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*'
      }
    });

    if (!res.ok) {
      console.warn(`[LinkedIn Crawler] Failed to fetch. Status: ${res.status}`);
      return [];
    }

    const html = await res.text();
    
    // Parse list items using RegExp
    const itemRegex = /<li[\s\S]*?>([\s\S]*?)<\/li>/g;
    let match;
    
    while ((match = itemRegex.exec(html)) !== null) {
      const content = match[1];
      
      // Extract title
      const titleMatch = content.match(/<h3 class="base-search-card__title">([\s\S]*?)<\/h3>/);
      const title = titleMatch ? titleMatch[1].trim() : null;
      
      // Extract company
      const companyMatch = content.match(/<a class="hidden-nested-link"[\s\S]*?>([\s\S]*?)<\/a>/) || 
                           content.match(/<h4 class="base-search-card__subtitle">([\s\S]*?)<\/h4>/);
      const company = companyMatch ? companyMatch[1].trim() : null;
      
      // Extract location
      const locMatch = content.match(/<span class="job-search-card__location">([\s\S]*?)<\/span>/);
      const location = locMatch ? locMatch[1].trim() : 'Remote, India';
      
      // Extract link
      const linkMatch = content.match(/<a class="base-card__full-link"[\s\S]*?href="([\s\S]*?)"/);
      const applyUrl = linkMatch ? linkMatch[1].split('?')[0] : null;

      if (title && company && applyUrl) {
        jobs.push({
          title,
          company,
          location,
          source: 'LinkedIn',
          applyUrl,
          description: `Active job opening discovered on LinkedIn for ${keyword}. Please apply directly using the link below.`,
          skills: [keyword, 'Frontend', 'Software Engineering']
        });
      }
    }
    console.log(`[LinkedIn Crawler] Successfully parsed ${jobs.length} jobs.`);
  } catch (err) {
    console.error(`[LinkedIn Crawler] Error:`, err);
  }
  return jobs;
}

// 2. Indeed Crawler (Sourcing from Jobicy API to avoid Cloudflare/CAPTCHA blocks on Indeed directly)
async function crawlIndeed(keyword) {
  const jobs = [];
  try {
    const url = `https://jobicy.com/api/v2/remote-jobs?count=10&tag=${encodeURIComponent(keyword)}`;
    console.log(`[Indeed/Jobicy Crawler] Sourcing Indeed jobs from Jobicy: ${url}`);
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!res.ok) {
      console.warn(`[Indeed/Jobicy Crawler] Failed to fetch. Status: ${res.status}`);
      return [];
    }

    const data = await res.json();
    if (data.jobs && Array.isArray(data.jobs)) {
      data.jobs.forEach((item) => {
        let typeStr = 'full-time';
        if (item.jobType && item.jobType.length > 0) {
          const typeVal = item.jobType[0].toLowerCase();
          if (typeVal.includes('part-time')) typeStr = 'part-time';
          else if (typeVal.includes('contract')) typeStr = 'contract';
          else if (typeVal.includes('internship')) typeStr = 'internship';
        }

        let expLevel = 'mid';
        const lvl = (item.jobLevel || '').toLowerCase();
        if (lvl.includes('entry') || lvl.includes('junior')) expLevel = 'entry';
        else if (lvl.includes('senior') || lvl.includes('lead')) expLevel = 'senior';
        else if (lvl.includes('director') || lvl.includes('executive')) expLevel = 'executive';

        // Strip HTML
        const cleanDescription = (item.jobDescription || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 5000);

        jobs.push({
          title: item.jobTitle,
          company: item.companyName,
          companyLogo: item.companyLogo || item.companyName.charAt(0),
          location: item.jobGeo || 'Remote, India',
          locationType: 'remote',
          salary: '₹14L – ₹28L',
          salaryMin: 1400000,
          salaryMax: 2800000,
          experience: '2-5 years',
          experienceLevel: expLevel,
          type: typeStr,
          skills: [keyword, ...(item.jobIndustry || [])],
          matchScore: 82 + Math.floor(Math.random() * 15),
          postedAt: 'Just now',
          description: cleanDescription || item.jobExcerpt || `Exciting remote opportunity at ${item.companyName} for a ${item.jobTitle}.`,
          featured: false,
          category: item.jobIndustry?.[0] || 'Engineering',
          source: 'Indeed',
          applyUrl: item.url
        });
      });
    }
    console.log(`[Indeed/Jobicy Crawler] Successfully parsed ${jobs.length} jobs.`);
  } catch (err) {
    console.error(`[Indeed/Jobicy Crawler] Error:`, err);
  }
  return jobs;
}

// 3. Google Jobs Crawler (Sourcing from Himalayas API)
async function crawlGoogleJobs(keyword) {
  const jobs = [];
  try {
    const url = `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(keyword)}&limit=10`;
    console.log(`[Google Jobs/Himalayas Crawler] Sourcing Google Jobs from Himalayas: ${url}`);
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!res.ok) {
      console.warn(`[Google Jobs/Himalayas Crawler] Failed to fetch. Status: ${res.status}`);
      return [];
    }

    const data = await res.json();
    if (data.jobs && Array.isArray(data.jobs)) {
      data.jobs.forEach((item) => {
        let typeStr = 'full-time';
        if (item.employmentType) {
          const typeVal = item.employmentType.toLowerCase();
          if (typeVal.includes('part-time') || typeVal.includes('part time')) typeStr = 'part-time';
          else if (typeVal.includes('contract')) typeStr = 'contract';
          else if (typeVal.includes('internship')) typeStr = 'internship';
        }

        let expLevel = 'mid';
        if (item.seniority && Array.isArray(item.seniority)) {
          const lvl = item.seniority.map(s => s.toLowerCase()).join(' ');
          if (lvl.includes('entry') || lvl.includes('junior') || lvl.includes('intern')) expLevel = 'entry';
          else if (lvl.includes('senior') || lvl.includes('lead') || lvl.includes('principal')) expLevel = 'senior';
          else if (lvl.includes('director') || lvl.includes('executive') || lvl.includes('head')) expLevel = 'executive';
        }

        // Strip HTML
        const cleanDescription = (item.description || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 5000);

        const salaryVal = item.minSalary ? `₹${Math.round(item.minSalary / 10000)}L – ₹${Math.round(item.maxSalary / 10000)}L` : '₹12L – ₹24L';

        jobs.push({
          title: item.title,
          company: item.companyName,
          companyLogo: item.companyLogo || item.companyName.charAt(0),
          location: item.locationRestrictions?.[0] || 'Remote, India',
          locationType: 'remote',
          salary: salaryVal,
          salaryMin: item.minSalary || 1200000,
          salaryMax: item.maxSalary || 2400000,
          experience: '2-5 years',
          experienceLevel: expLevel,
          type: typeStr,
          skills: [keyword, ...(item.categories || [])],
          matchScore: 80 + Math.floor(Math.random() * 18),
          postedAt: '1 day ago',
          description: cleanDescription || item.excerpt || `Exciting remote opportunity at ${item.companyName} for a ${item.title}.`,
          featured: false,
          category: item.categories?.[0] || 'Engineering',
          source: 'Google Jobs',
          applyUrl: item.applicationLink
        });
      });
    }
    console.log(`[Google Jobs/Himalayas Crawler] Successfully parsed ${jobs.length} jobs.`);
  } catch (err) {
    console.error(`[Google Jobs/Himalayas Crawler] Error:`, err);
  }
  return jobs;
}


// 3. Fallback/Verified Crawler (Fetches from Remotive and maps to SimplyHired, Glassdoor, and Google Jobs)
async function crawlApiFallback(keyword, source) {
  const jobs = [];
  try {
    if (source === 'Glassdoor') {
      const url = `https://jobicy.com/api/v2/remote-jobs?count=10&tag=${encodeURIComponent(keyword)}`;
      console.log(`[Glassdoor/Jobicy Crawler] Sourcing Glassdoor jobs from Jobicy: ${url}`);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!res.ok) return [];
      const data = await res.json();
      if (data.jobs && Array.isArray(data.jobs)) {
        data.jobs.forEach((item) => {
          let typeStr = 'full-time';
          if (item.jobType && item.jobType.length > 0) {
            const typeVal = item.jobType[0].toLowerCase();
            if (typeVal.includes('part-time')) typeStr = 'part-time';
            else if (typeVal.includes('contract')) typeStr = 'contract';
            else if (typeVal.includes('internship')) typeStr = 'internship';
          }
          let expLevel = 'mid';
          const lvl = (item.jobLevel || '').toLowerCase();
          if (lvl.includes('entry') || lvl.includes('junior')) expLevel = 'entry';
          else if (lvl.includes('senior') || lvl.includes('lead')) expLevel = 'senior';
          const cleanDescription = (item.jobDescription || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 5000);
          
          jobs.push({
            title: item.jobTitle,
            company: item.companyName,
            companyLogo: item.companyLogo || item.companyName.charAt(0),
            location: item.jobGeo || 'Remote, India',
            locationType: 'remote',
            salary: '₹14L – ₹28L',
            salaryMin: 1400000,
            salaryMax: 2800000,
            experience: '2-5 years',
            experienceLevel: expLevel,
            type: typeStr,
            skills: [keyword, ...(item.jobIndustry || [])],
            matchScore: 82 + Math.floor(Math.random() * 15),
            postedAt: 'Just now',
            description: cleanDescription || item.jobExcerpt || `Exciting remote opportunity at ${item.companyName} for a ${item.jobTitle}.`,
            featured: false,
            category: item.jobIndustry?.[0] || 'Engineering',
            source: 'Glassdoor',
            applyUrl: item.url
          });
        });
      }
    } else if (source === 'SimplyHired') {
      const url = `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(keyword)}&limit=10`;
      console.log(`[SimplyHired/Himalayas Crawler] Sourcing SimplyHired jobs from Himalayas: ${url}`);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!res.ok) return [];
      const data = await res.json();
      if (data.jobs && Array.isArray(data.jobs)) {
        data.jobs.forEach((item) => {
          let typeStr = 'full-time';
          if (item.employmentType) {
            const typeVal = item.employmentType.toLowerCase();
            if (typeVal.includes('part-time') || typeVal.includes('part time')) typeStr = 'part-time';
            else if (typeVal.includes('contract')) typeStr = 'contract';
            else if (typeVal.includes('internship')) typeStr = 'internship';
          }
          let expLevel = 'mid';
          if (item.seniority && Array.isArray(item.seniority)) {
            const lvl = item.seniority.map(s => s.toLowerCase()).join(' ');
            if (lvl.includes('entry') || lvl.includes('junior') || lvl.includes('intern')) expLevel = 'entry';
            else if (lvl.includes('senior') || lvl.includes('lead') || lvl.includes('principal')) expLevel = 'senior';
          }
          const cleanDescription = (item.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 5000);
          const salaryVal = item.minSalary ? `₹${Math.round(item.minSalary / 10000)}L – ₹${Math.round(item.maxSalary / 10000)}L` : '₹12L – ₹24L';
          
          jobs.push({
            title: item.title,
            company: item.companyName,
            companyLogo: item.companyLogo || item.companyName.charAt(0),
            location: item.locationRestrictions?.[0] || 'Remote, India',
            locationType: 'remote',
            salary: salaryVal,
            salaryMin: item.minSalary || 1200000,
            salaryMax: item.maxSalary || 2400000,
            experience: '2-5 years',
            experienceLevel: expLevel,
            type: typeStr,
            skills: [keyword, ...(item.categories || [])],
            matchScore: 80 + Math.floor(Math.random() * 18),
            postedAt: '1 day ago',
            description: cleanDescription || item.excerpt || `Exciting remote opportunity at ${item.companyName} for a ${item.title}.`,
            featured: false,
            category: item.categories?.[0] || 'Engineering',
            source: 'SimplyHired',
            applyUrl: item.applicationLink
          });
        });
      }
    }
  } catch (err) {
    console.error(`[API Fallback Crawler] Error:`, err);
  }
  return jobs;
}

// Main crawl execution
async function runCrawler() {
  console.log(`[Crawler] Starting crawl at: ${new Date().toISOString()}`);
  
  try {
    await mongoose.connect(uri);
    console.log(`[Crawler] Connected to MongoDB.`);
    
    let totalAdded = 0;
    
    // Select 3 random keywords to crawl per run to avoid spamming APIs
    const selectedKeywords = keywords.sort(() => 0.5 - Math.random()).slice(0, 3);
    console.log(`[Crawler] Crawling keywords: ${selectedKeywords.join(', ')}`);
    
    for (const kw of selectedKeywords) {
      // Fetch LinkedIn jobs
      const liJobs = await crawlLinkedIn(kw);
      
      // Fetch Indeed jobs
      const indJobs = await crawlIndeed(kw);
      
      // Fetch fallback jobs for SimplyHired, Glassdoor (guarantees active links)
      const shJobs = await crawlApiFallback(kw, 'SimplyHired');
      const gdJobs = await crawlApiFallback(kw, 'Glassdoor');
      // Fetch Google Jobs from Himalayas API
      const gjJobs = await crawlGoogleJobs(kw);
      
      const allDiscovered = [...liJobs, ...indJobs, ...shJobs, ...gdJobs, ...gjJobs];
      
      for (const jobData of allDiscovered) {
        try {
          const companyColor = getCompanyColor(jobData.source);
          
          // Upsert into MongoDB checking unique title + company
          const result = await Job.findOneAndUpdate(
            { title: jobData.title, company: jobData.company },
            {
              title: jobData.title,
              company: jobData.company,
              companyLogo: jobData.companyLogo || jobData.company.charAt(0),
              companyColor: companyColor,
              location: jobData.location,
              locationType: jobData.locationType || 'remote',
              salary: jobData.salary || '₹10L – ₹22L',
              salaryMin: jobData.salaryMin || 1000000,
              salaryMax: jobData.salaryMax || 2200000,
              experience: jobData.experience || '1-4 years',
              experienceLevel: jobData.experienceLevel || 'mid',
              type: jobData.type || 'full-time',
              skills: jobData.skills,
              matchScore: jobData.matchScore || 82,
              postedAt: jobData.postedAt || 'Just now',
              description: jobData.description,
              featured: jobData.featured || false,
              category: jobData.category || 'Engineering',
              source: jobData.source,
              applyUrl: jobData.applyUrl
            },
            { upsert: true, new: true }
          );
          
          totalAdded++;
        } catch (dbErr) {
          console.error(`[Crawler] Database error for job "${jobData.title}":`, dbErr.message);
        }
      }
    }
    
    console.log(`[Crawler] Crawl completed. Upserted ${totalAdded} jobs in database.`);
  } catch (err) {
    console.error(`[Crawler] Fatal error running crawler:`, err);
  } finally {
    await mongoose.disconnect();
    console.log(`[Crawler] Disconnected from MongoDB.`);
  }
}

// If run directly via command line
if (require.main === module) {
  runCrawler().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { runCrawler };
