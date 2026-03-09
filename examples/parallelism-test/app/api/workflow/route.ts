import { serve } from "@upstash/workflow/nextjs";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const CONCURRENCY_KEY = "parallelism-test:concurrent";
const MAX_KEY = "parallelism-test:max";

type Payload = {
  workflowIndex: number;
};

async function trackStep(fn: () => Promise<void>) {
  const current = await redis.incr(CONCURRENCY_KEY);
  // Update max if this is a new peak
  const prevMax = await redis.get<number>(MAX_KEY);
  if (!prevMax || current > prevMax) {
    await redis.set(MAX_KEY, current);
  }
  try {
    await fn();
  } finally {
    await redis.decr(CONCURRENCY_KEY);
  }
}

export const { POST } = serve<Payload>(async (context) => {
  await context.run("start", () => "started");
  await context.run("slow-work-1", async () => {
    await trackStep(() => new Promise((resolve) => setTimeout(resolve, 5_000)));
    return { done: true };
  });
  await context.run("middle", () => "checkpoint");
  await context.run("slow-work-2", async () => {
    await trackStep(() => new Promise((resolve) => setTimeout(resolve, 5_000)));
    return { done: true };
  });
  await context.run("end", () => "finished");
});
