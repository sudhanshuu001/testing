const { runCrawler } = require('./job-crawler');

const INTERVAL_HOURS = 12;
const INTERVAL_MS = INTERVAL_HOURS * 60 * 60 * 1000; // 12 hours

console.log(`[Scheduler] Starting JobFusion Cron Scheduler Daemon...`);
console.log(`[Scheduler] Intervals configured for every ${INTERVAL_HOURS} hours.`);

async function scheduleCycle() {
  console.log(`[Scheduler] Cycle initiated at: ${new Date().toISOString()}`);
  try {
    await runCrawler();
  } catch (err) {
    console.error(`[Scheduler] Error encountered during crawler execution:`, err);
  }
  console.log(`[Scheduler] Cycle completed. Next cycle scheduled in ${INTERVAL_HOURS} hours.`);
}

// 1. Run crawler immediately on startup
scheduleCycle();

// 2. Set interval to repeat every 12 hours
const timer = setInterval(scheduleCycle, INTERVAL_MS);

// Handle process termination cleanly
process.on('SIGINT', () => {
  console.log(`[Scheduler] SIGINT received. Shutting down Cron Scheduler...`);
  clearInterval(timer);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(`[Scheduler] SIGTERM received. Shutting down Cron Scheduler...`);
  clearInterval(timer);
  process.exit(0);
});
