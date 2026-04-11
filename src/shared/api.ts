import type {
  BootstrapPayload,
  ExecutionEvent,
  HistoryAutocompleteRequest,
  HistoryAutocompleteResponse,
  HistoryRecallRequest,
  HistoryRecallResponse,
  HistorySearchRequest,
  HistorySearchResponse,
  InterruptExecutionRequest,
  PathCompletionRequest,
  PathCompletionResponse,
  RunCommandRequest,
  RunCommandResponse,
  TerminalInputRequest,
  TerminalResizeRequest,
} from "./contracts";

export interface MishellApi {
  app: {
    getBootstrap: () => Promise<BootstrapPayload>;
    runCommand: (input: RunCommandRequest) => Promise<RunCommandResponse>;
    interruptExecution: (input: InterruptExecutionRequest) => Promise<void>;
    getPathCompletions: (
      input: PathCompletionRequest,
    ) => Promise<PathCompletionResponse>;
    writeTerminalInput: (input: TerminalInputRequest) => Promise<void>;
    resizeTerminal: (input: TerminalResizeRequest) => Promise<void>;
    onExecutionEvent: (listener: (event: ExecutionEvent) => void) => () => void;
  };
  history: {
    getAutocomplete: (
      input: HistoryAutocompleteRequest,
    ) => Promise<HistoryAutocompleteResponse>;
    search: (input: HistorySearchRequest) => Promise<HistorySearchResponse>;
    getRecall: (input: HistoryRecallRequest) => Promise<HistoryRecallResponse>;
  };
  clipboard: {
    writeText: (text: string) => Promise<void>;
  };
}
