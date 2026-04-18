import type {
  BootstrapPayload,
  CommandCompletionRequest,
  CommandCompletionResponse,
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
  ExecutionResizeRequest,
  TerminalInputRequest,
} from "./contracts";

export interface MishellApi {
  app: {
    getBootstrap: () => Promise<BootstrapPayload>;
    runCommand: (input: RunCommandRequest) => Promise<RunCommandResponse>;
    interruptExecution: (input: InterruptExecutionRequest) => Promise<void>;
    getCommandCompletions: (
      input: CommandCompletionRequest,
    ) => Promise<CommandCompletionResponse>;
    getPathCompletions: (
      input: PathCompletionRequest,
    ) => Promise<PathCompletionResponse>;
    writeTerminalInput: (input: TerminalInputRequest) => Promise<void>;
    resizeExecution: (input: ExecutionResizeRequest) => Promise<void>;
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
