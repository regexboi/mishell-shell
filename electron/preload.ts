import { contextBridge, ipcRenderer } from "electron";

import type { MishellApi } from "@shared/api";
import {
  bootstrapPayloadSchema,
  executionEventSchema,
  historyAutocompleteResponseSchema,
  historyRecallResponseSchema,
  historySearchResponseSchema,
  ipcChannels,
  runCommandResponseSchema,
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
