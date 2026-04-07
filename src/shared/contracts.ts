import { z } from "zod";

export const ipcChannels = {
  getBootstrap: "app:get-bootstrap",
  runCommand: "app:run-command",
  executionEvent: "app:execution-event",
  writeClipboard: "app:write-clipboard",
} as const;

export const releaseStageSchema = z.enum([
  "phase-01-foundation",
  "phase-02-execution-ui",
]);

export const shellSurfaceSchema = z.object({
  id: z.enum(["editor", "feed", "history", "terminal"]),
  label: z.string(),
  status: z.enum(["ready", "active", "planned", "standby"]),
  shortcut: z.string().optional(),
  description: z.string(),
});

export const shellContextSchema = z.object({
  executable: z.string(),
  shellName: z.string(),
  cwd: z.string(),
  displayCwd: z.string(),
  gitBranch: z.string().nullable(),
  sessionId: z.string(),
});

export const bootstrapPayloadSchema = z.object({
  appName: z.string(),
  platform: z.string(),
  shell: shellContextSchema,
  database: z.object({
    path: z.string(),
    appliedMigrations: z.array(z.string()),
  }),
  surfaces: z.array(shellSurfaceSchema),
  focusMode: z.object({
    defaultSurface: z.enum(["editor", "feed", "history", "terminal"]),
    keyboardFirst: z.boolean(),
  }),
  release: z.object({
    stage: releaseStageSchema,
    launchedAt: z.string(),
  }),
});

export const runCommandRequestSchema = z.object({
  commandText: z.string().trim().min(1),
});

export const runCommandResponseSchema = z.object({
  executionId: z.string(),
});

export const writeClipboardRequestSchema = z.object({
  text: z.string(),
});

export const commandExecutionSchema = z.object({
  id: z.string(),
  commandText: z.string(),
  cwd: z.string(),
  shell: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  status: z.enum(["running", "succeeded", "failed"]),
  durationMs: z.number().int().nonnegative().nullable(),
  exitCode: z.number().int().nullable(),
  outputPreview: z.string(),
  output: z.string(),
  outputPath: z.string().nullable(),
});

export const executionStartedEventSchema = z.object({
  type: z.literal("started"),
  execution: commandExecutionSchema,
});

export const executionOutputEventSchema = z.object({
  type: z.literal("output"),
  executionId: z.string(),
  chunk: z.string(),
});

export const executionCompletedEventSchema = z.object({
  type: z.literal("completed"),
  execution: commandExecutionSchema,
  shellContext: shellContextSchema,
});

export const executionEventSchema = z.discriminatedUnion("type", [
  executionStartedEventSchema,
  executionOutputEventSchema,
  executionCompletedEventSchema,
]);

export type BootstrapPayload = z.infer<typeof bootstrapPayloadSchema>;
export type CommandExecution = z.infer<typeof commandExecutionSchema>;
export type ExecutionEvent = z.infer<typeof executionEventSchema>;
export type RunCommandRequest = z.infer<typeof runCommandRequestSchema>;
export type RunCommandResponse = z.infer<typeof runCommandResponseSchema>;
export type ShellContext = z.infer<typeof shellContextSchema>;
export type ShellSurface = z.infer<typeof shellSurfaceSchema>;
