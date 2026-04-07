import { z } from "zod";

export const ipcChannels = {
  getBootstrap: "app:get-bootstrap",
} as const;

export const shellSurfaceSchema = z.object({
  id: z.enum(["editor", "feed", "history", "terminal"]),
  label: z.string(),
  status: z.enum(["ready", "planned", "standby"]),
  shortcut: z.string().optional(),
  description: z.string(),
});

export const bootstrapPayloadSchema = z.object({
  appName: z.string(),
  platform: z.string(),
  shell: z.object({
    executable: z.string(),
    cwd: z.string(),
  }),
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
    stage: z.literal("phase-01-foundation"),
    launchedAt: z.string(),
  }),
});

export type BootstrapPayload = z.infer<typeof bootstrapPayloadSchema>;
export type ShellSurface = z.infer<typeof shellSurfaceSchema>;
