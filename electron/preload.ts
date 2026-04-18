import { contextBridge, ipcRenderer } from "electron";

import type { MishellApi } from "@shared/api";
import {
  bootstrapPayloadSchema,
  commandCompletionResponseSchema,
  executionEventSchema,
  executionResizeRequestSchema,
  historyAutocompleteResponseSchema,
  historyRecallResponseSchema,
  historySearchResponseSchema,
  interruptExecutionRequestSchema,
  ipcChannels,
  pathCompletionResponseSchema,
  runCommandResponseSchema,
  terminalInputRequestSchema,
} from "@shared/contracts";

const api: MishellApi = {
  app: {
    async getBootstrap() {
      const payload = await ipcRenderer.invoke(ipcChannels.getBootstrap);

      return bootstrapPayloadSchema.parse(payload);
    },
    async runCommand(input) {
      const response = await ipcRenderer.invoke(ipcChannels.runCommand, input);

      return runCommandResponseSchema.parse(response);
    },
    async interruptExecution(input) {
      await ipcRenderer.invoke(
        ipcChannels.interruptExecution,
        interruptExecutionRequestSchema.parse(input),
      );
    },
    async getCommandCompletions(input) {
      const response = await ipcRenderer.invoke(
        ipcChannels.getCommandCompletions,
        input,
      );

      return commandCompletionResponseSchema.parse(response);
    },
    async getPathCompletions(input) {
      const response = await ipcRenderer.invoke(
        ipcChannels.getPathCompletions,
        input,
      );

      return pathCompletionResponseSchema.parse(response);
    },
    async writeTerminalInput(input) {
      await ipcRenderer.invoke(
        ipcChannels.writeTerminalInput,
        terminalInputRequestSchema.parse(input),
      );
    },
    async resizeExecution(input) {
      await ipcRenderer.invoke(
        ipcChannels.resizeExecution,
        executionResizeRequestSchema.parse(input),
      );
    },
    onExecutionEvent(listener) {
      const wrappedListener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        listener(executionEventSchema.parse(payload));
      };

      ipcRenderer.on(ipcChannels.executionEvent, wrappedListener);

      return () => {
        ipcRenderer.removeListener(ipcChannels.executionEvent, wrappedListener);
      };
    },
  },
  history: {
    async getAutocomplete(input) {
      const response = await ipcRenderer.invoke(
        ipcChannels.getHistoryAutocomplete,
        input,
      );

      return historyAutocompleteResponseSchema.parse(response);
    },
    async search(input) {
      const response = await ipcRenderer.invoke(ipcChannels.searchHistory, input);

      return historySearchResponseSchema.parse(response);
    },
    async getRecall(input) {
      const response = await ipcRenderer.invoke(ipcChannels.getHistoryRecall, input);

      return historyRecallResponseSchema.parse(response);
    },
  },
  clipboard: {
    async writeText(text) {
      await ipcRenderer.invoke(ipcChannels.writeClipboard, { text });
    },
  },
};

contextBridge.exposeInMainWorld("mishell", api);
