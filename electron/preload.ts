import { clipboard, contextBridge, ipcRenderer } from "electron";

import type { MishellApi } from "@shared/api";
import {
  bootstrapPayloadSchema,
  executionEventSchema,
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
  clipboard: {
    async writeText(text) {
      clipboard.writeText(text);
    },
  },
};

contextBridge.exposeInMainWorld("mishell", api);
