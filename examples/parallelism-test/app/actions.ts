"use server";

import { Client, TriggerOptions } from "@upstash/workflow";
import { Redis } from "@upstash/redis";

const client = new Client({
  token: process.env.QSTASH_TOKEN!,
  baseUrl: process.env.QSTASH_URL,
});

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const WORKFLOW_COUNT = 40;
const LABEL = "parallelism-test";

export async function triggerWorkflows() {
  const baseUrl =
    process.env.UPSTASH_WORKFLOW_URL ?? "http://localhost:3001";

  // Cancel previous test runs and reset counters
  await client
    .cancel({ urlStartingWith: `${baseUrl}/api/workflow` })
    .catch(() => {});
  await redis.del("parallelism-test:concurrent", "parallelism-test:max");

  const triggerOptions = Array.from({ length: WORKFLOW_COUNT }, (_, i): TriggerOptions => ({
    url: `${baseUrl}/api/workflow`,
    body: { workflowIndex: i },
    label: LABEL,
    flowControl: {
      key: "parallelism-test",
      parallelism: 5,
    },
  }));

  const results = await client.trigger(triggerOptions);

  return {
    triggered: WORKFLOW_COUNT,
    workflowRunIds: results.map((r) => r.workflowRunId),
  };
}

export async function getWorkflowStatus(runIds: string[]) {
  const results = await Promise.all(
    runIds.map((id) => client.logs({ workflowRunId: id }))
  );

  const workflows = results.map(({ runs }, index) => {
    const run = runs[0];
    if (!run) {
      return {
        runId: runIds[index],
        state: "RUN_STARTED" as const,
        createdAt: 0,
        hasStarted: false,
        hasFinishedWork: false,
      };
    }

    const completedStepNames = new Set<string>();
    for (const stepGroup of run.steps) {
      if (stepGroup.type === "next") continue;
      for (const step of stepGroup.steps) {
        completedStepNames.add(step.stepName);
      }
    }

    return {
      runId: run.workflowRunId,
      state: run.workflowState,
      createdAt: run.workflowRunCreatedAt,
      completedAt: run.workflowRunCompletedAt,
      hasStarted: completedStepNames.has("start"),
      hasFinishedWork: completedStepNames.has("end"),
    };
  });

  // Read concurrency from Redis (set by workflow steps)
  const [currentConcurrent, maxConcurrent] = await Promise.all([
    redis.get<number>("parallelism-test:concurrent").then((v) => v ?? 0),
    redis.get<number>("parallelism-test:max").then((v) => v ?? 0),
  ]);

  const completed = workflows.filter((w) => w.state === "RUN_SUCCESS").length;
  const parallelismRespected = maxConcurrent <= 5;

  return {
    summary: {
      totalRuns: workflows.length,
      completed,
      allComplete: completed === runIds.length,
      currentConcurrent,
      maxConcurrentObserved: maxConcurrent,
      parallelismLimit: 5,
      parallelismRespected,
      verdict: parallelismRespected
        ? `PASS: max concurrency ${maxConcurrent} <= 5`
        : `FAIL: max concurrency ${maxConcurrent} > 5`,
    },
    workflows,
  };
}
