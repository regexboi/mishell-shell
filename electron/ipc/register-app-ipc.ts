import { clipboard, ipcMain } from "electron";

import {
  bootstrapPayloadSchema,
  commandCompletionRequestSchema,
  commandCompletionResponseSchema,
  executionEventSchema,
  historyAutocompleteRequestSchema,
  historyAutocompleteResponseSchema,
  historyRecallRequestSchema,
  historyRecallResponseSchema,
  historySearchRequestSchema,
  historySearchResponseSchema,
  interruptExecutionRequestSchema,
  ipcChannels,
  pathCompletionRequestSchema,
  pathCompletionResponseSchema,
  runCommandRequestSchema,
  runCommandResponseSchema,
  terminalInputRequestSchema,
  terminalResizeRequestSchema,
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

  ipcMain.handle(ipcChannels.interruptExecution, (_event, input) => {
    runtime.execution.interruptExecution(
      interruptExecutionRequestSchema.parse(input),
    );
  });

  ipcMain.handle(ipcChannels.writeTerminalInput, (_event, input) => {
    runtime.execution.writeTerminalInput(terminalInputRequestSchema.parse(input));
  });

  ipcMain.handle(ipcChannels.getCommandCompletions, async (_event, input) => {
    return commandCompletionResponseSchema.parse(
      await runtime.execution.getCommandCompletions(
        commandCompletionRequestSchema.parse(input),
      ),
    );
  });

  ipcMain.handle(ipcChannels.getPathCompletions, (_event, input) => {
    return pathCompletionResponseSchema.parse(
      runtime.execution.getPathCompletions(pathCompletionRequestSchema.parse(input)),
    );
  });

  ipcMain.handle(ipcChannels.resizeTerminal, (_event, input) => {
    runtime.execution.resizeTerminal(terminalResizeRequestSchema.parse(input));
  });

  ipcMain.handle(ipcChannels.writeClipboard, (_event, input) => {
    const { text } = writeClipboardRequestSchema.parse(input);
    clipboard.writeText(text);
  });

  ipcMain.handle(ipcChannels.getHistoryAutocomplete, (_event, input) => {
    const request = historyAutocompleteRequestSchema.parse(input);

    return historyAutocompleteResponseSchema.parse(
      runtime.execution.getHistoryAutocomplete(request),
    );
  });

  ipcMain.handle(ipcChannels.searchHistory, (_event, input) => {
    const request = historySearchRequestSchema.parse(input);

    return historySearchResponseSchema.parse(
      runtime.execution.searchHistory(request),
    );
  });

  ipcMain.handle(ipcChannels.getHistoryRecall, (_event, input) => {
    const request = historyRecallRequestSchema.parse(input);

    return historyRecallResponseSchema.parse(
      runtime.execution.getHistoryRecall(request),
    );
  });
}
