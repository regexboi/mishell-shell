import { clipboard, ipcMain } from "electron";

import {
  bootstrapPayloadSchema,
  executionEventSchema,
  ipcChannels,
  runCommandRequestSchema,
  runCommandResponseSchema,
  writeClipboardRequestSchema,
} from "@shared/contracts";

import type { AppRuntime } from "../runtime";
import { buildBootstrapPayload } from "../runtime";

export function registerAppIpc(runtime: AppRuntime) {
  ipcMain.handle(ipcChannels.getBootstrap, () => {
    return bootstrapPayloadSchema.parse(buildBootstrapPayload(runtime));
  });

  ipcMain.handle(ipcChannels.runCommand, async (event, input) => {
    const request = runCommandRequestSchema.parse(input);
    const response = await runtime.execution.runCommand(request, (executionEvent) => {
      event.sender.send(
        ipcChannels.executionEvent,
        executionEventSchema.parse(executionEvent),
      );
    });

    return runCommandResponseSchema.parse(response);
  });

  ipcMain.handle(ipcChannels.writeClipboard, (_event, input) => {
    const { text } = writeClipboardRequestSchema.parse(input);
    clipboard.writeText(text);
  });
}
