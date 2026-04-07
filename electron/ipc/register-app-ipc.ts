import { ipcMain } from "electron";

import { bootstrapPayloadSchema, ipcChannels } from "@shared/contracts";

import type { AppRuntime } from "../runtime";
import { buildBootstrapPayload } from "../runtime";

export function registerAppIpc(runtime: AppRuntime) {
  ipcMain.handle(ipcChannels.getBootstrap, () => {
    return bootstrapPayloadSchema.parse(buildBootstrapPayload(runtime));
  });
}
