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
    url: `${baseUrl}/api/workflow/mainWorkflow`,
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

type LogsResult = Awaited<ReturnType<typeof client.logs>>;
type RunLog = LogsResult["runs"][number];

function parseWorkflowRun(run: RunLog, startStep: string, endStep: string) {
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
    hasStarted: completedStepNames.has(startStep),
    hasFinishedWork: completedStepNames.has(endStep),
  };
}

export async function getWorkflowStatus(runIds: string[]) {
  const baseUrl =
    process.env.UPSTASH_WORKFLOW_URL ?? "http://localhost:3001";

  const [mainResults, subLogs, currentConcurrent, maxConcurrent] = await Promise.all([
    Promise.all(runIds.map((id) => client.logs({ workflowRunId: id }))),
    client.logs({ workflowUrl: `${baseUrl}/api/workflow/subWorkflow` }),
    redis.get<number>("parallelism-test:concurrent").then((v) => v ?? 0),
    redis.get<number>("parallelism-test:max").then((v) => v ?? 0),
  ]);

  const workflows = mainResults.map(({ runs }, index) => {
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
    return parseWorkflowRun(run, "start", "end");
  });

  const subWorkflows = subLogs.runs.map((run) =>
    parseWorkflowRun(run, "sub-start", "sub-end")
  );

  const completed = workflows.filter((w) => w.state === "RUN_SUCCESS").length;
  const subCompleted = subWorkflows.filter((w) => w.state === "RUN_SUCCESS").length;
  const allComplete = completed === runIds.length;
  const parallelismRespected = maxConcurrent <= 5;

  return {
    summary: {
      totalRuns: workflows.length,
      completed,
      subTotal: subWorkflows.length,
      subCompleted,
      allComplete,
      currentConcurrent,
      maxConcurrentObserved: maxConcurrent,
      parallelismLimit: 5,
      parallelismRespected,
      verdict: parallelismRespected
        ? `PASS: max concurrency ${maxConcurrent} <= 5`
        : `FAIL: max concurrency ${maxConcurrent} > 5`,
    },
    workflows,
    subWorkflows,
  };
}
