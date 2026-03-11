import { useState, useEffect, useRef, useCallback, useReducer } from 'react';
import * as path from 'node:path';
import { useApp } from 'ink';
import type { StartupResult, StartupProgressChannel, StartupStep } from '../cli/app-shell.js';
import { AppShell } from './AppShell.js';
import { StartupScreen } from './StartupScreen.js';
import { ErrorScreen } from './ErrorScreen.js';
import { App } from './App.js';
import { RestoredSession } from './RestoredSession.js';
import { GenerationScreen, STAGE_DISPLAY_LABELS, DEV_PLAN_PHASE_LABEL_PREFIX } from './GenerationScreen.js';
import type { GenerationStatus, GenerationStage, CompletedStage } from './GenerationScreen.js';
import { YesNoPrompt } from './YesNoPrompt.js';
import type { InterviewMessage, Session } from '../session/session.js';
import { loadSession, saveSession, persistErrorState, persistSpecArtifact, completeSpecStage, persistRetryExhaustedState } from '../session/session.js';
import { createProvider, supportsModelListing } from '../providers/factory.js';
import { resolveOllamaModel } from '../providers/ollama.js';
import { runInterviewLoop } from '../interview/controller.js';
import type { ModelProvider } from '../interview/controller.js';
import { buildInterviewSystemPrompt } from '../interview/prompts.js';
import { createFinishNowHandler } from '../interview/finish-now.js';
import { createModelHandler } from '../interview/model-command.js';
import { createProviderHandler } from '../interview/provider-command.js';
import { parseCommand, HELP_MESSAGE } from '../interview/commands.js';
import { withRetry, RetryExhaustedError } from '../interview/retry.js';
import { formatUserMessage, logFullError } from '../errors/errors.js';
import { runArtifactPipeline } from '../artifacts/generator.js';
import { SpecGenerator } from '../artifacts/spec-generator.js';
import { ArchGenerator } from '../artifacts/arch-generator.js';
import { PlanGenerator } from '../artifacts/plan-generator.js';
import { ensureDocsDir, generateFilename, generateArchitectureFilename, generatePlanFilename, resolveOutputPath, writeArtifactFile } from '../artifacts/file-output.js';
import { runPostSpecWorkflow } from '../artifacts/workflow-controller.js';
import { runDevPlanLoop } from '../artifacts/dev-plan-loop.js';
import { getLogger } from '../logging/logger.js';
import { checkProviderReadiness } from '../validation/env.js';
import type { GlobalSettings } from '../settings/settings.js';
import type { Screen, SessionStage, StatusHeaderData, FooterHelpData, FlowWrapperState, FlowLifecyclePhase, ExecutionUserAction } from './types.js';
import { applyExecutionEvent, INITIAL_EXECUTION_STATE } from './types.js';
import { ExecutionConsole } from './ExecutionConsole.js';
import { FlowWrapper } from './FlowWrapper.js';

const INTERVIEW_FOOTER: FooterHelpData = {
  commands: ['/finish-now', '/model', '/provider', '/help'],
  keybindings: ['ctrl+c: quit'],
};

const RESTORED_FOOTER: FooterHelpData = {
  commands: [],
  keybindings: ['enter: continue', 'ctrl+c: quit'],
};

const YESNO_FOOTER: FooterHelpData = {
  commands: [],
  keybindings: ['y: yes', 'n: no', '←/→: select', 'Enter: confirm', 'ctrl+c: quit'],
};

const GENERATING_FOOTER: FooterHelpData = {
  commands: [],
  keybindings: ['ctrl+c: quit'],
};

const EXECUTION_FOOTER: FooterHelpData = {
  commands: [],
  keybindings: ['r: retry', 'l: inspect logs', 'y: continue', 'ctrl+c: quit'],
};

const TRANSIENT_ERROR_DISPLAY_MS = 5000;

/** Derive a FlowWrapperState from ExecutionState so the execution screen reuses FlowWrapper chrome. */
function toExecutionFlowWrapperState(execState: ReturnType<typeof applyExecutionEvent>): FlowWrapperState {
  const phase: FlowLifecyclePhase =
    execState.phase === 'idle' || execState.phase === 'preflight'
      ? 'preflight'
      : execState.phase === 'awaiting-confirmation'
        ? 'start-confirmation'
        : execState.phase === 'running' || execState.phase === 'paused'
          ? 'running'
          : execState.phase === 'validating'
            ? 'validating'
            : execState.phase === 'failed'
              ? 'failure'
              : 'complete';
  return {
    phase,
    interactive: execState.phase === 'awaiting-confirmation',
    confirmationMessage: execState.confirmationMessage,
    failureReason: execState.failureReason,
    metadata: execState.currentTask
      ? { planFile: execState.currentTask.planFile, taskLabel: execState.currentTask.label }
      : undefined,
  };
}

export interface ScreenControllerProps {
  startupPromise: Promise<StartupResult>;
  version: string;
  /** Optional channel for receiving staged startup progress updates. */
  startupProgressChannel?: StartupProgressChannel;
}

export function ScreenController({ startupPromise, startupProgressChannel, version }: ScreenControllerProps) {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>('startup');
  const [sessionId, setSessionId] = useState('');
  const [sessionStage, setSessionStage] = useState<SessionStage>('interview');
  const [errorMessage, setErrorMessage] = useState('');
  const [transcript, setTranscript] = useState<InterviewMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [fatalInterviewError, setFatalInterviewError] = useState<string | null>(null);
  const [transientError, setTransientError] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [isSelectingModel, setIsSelectingModel] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>('generating');
  const [generationFilePath, setGenerationFilePath] = useState<string | undefined>(undefined);
  const [generationError, setGenerationError] = useState<string | undefined>(undefined);
  const [generationStage, setGenerationStage] = useState<GenerationStage>('spec');
  const [completedStages, setCompletedStages] = useState<CompletedStage[]>([]);
  const [workflowTerminatedEarly, setWorkflowTerminatedEarly] = useState(false);
  const [devPlanProgress, setDevPlanProgress] = useState<{ current: number; total: number } | undefined>(undefined);

  const [modelSelectOptions, setModelSelectOptions] = useState<string[] | undefined>(undefined);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [restoredDevPlanProgress, setRestoredDevPlanProgress] = useState<
    { completed: number; total: number } | undefined
  >(undefined);
  const [startupSteps, setStartupSteps] = useState<ReadonlyArray<StartupStep>>([]);
  const [isActiveProviderReady, setIsActiveProviderReady] = useState(true);
  const [currentProvider, setCurrentProvider] = useState<string>('ollama');
  const [currentModel, setCurrentModel] = useState<string | undefined>(undefined);
  const [resumabilityContext, setResumabilityContext] = useState<string | undefined>(undefined);

  const [yesNoQuestion, setYesNoQuestion] = useState('');
  const [executionState, dispatchExecutionEvent] = useReducer(applyExecutionEvent, INITIAL_EXECUTION_STATE);

  const userInputResolverRef = useRef<((input: string) => void) | null>(null);
  const yesNoResolverRef = useRef<((answer: boolean) => void) | null>(null);
  const currentSessionRef = useRef<Session | null>(null);
  const providerRef = useRef<ModelProvider | null>(null);
  const currentModelRef = useRef<string | undefined>(undefined);
  const interviewStartedRef = useRef(false);
  const pipelineStartedRef = useRef(false);
  const isSelectingModelRef = useRef(false);
  const commandRunnerRef = useRef<((input: string) => Promise<boolean>) | null>(null);
  // Monotonically increasing counter used to detect and discard stale Ollama model resolutions
  // that complete after a newer resolution has already started.
  const ollamaResolutionGenRef = useRef(0);
  const globalSettingsRef = useRef<GlobalSettings | undefined>(undefined);

  // Subscribe to staged startup progress events
  useEffect(() => {
    if (!startupProgressChannel) return;
    startupProgressChannel.subscribe((steps) => {
      setStartupSteps(steps);
    });
  }, [startupProgressChannel]);

  // Auto-dismiss transient errors after a short delay
  useEffect(() => {
    if (!transientError) return;
    const timer = setTimeout(() => setTransientError(null), TRANSIENT_ERROR_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [transientError]);

  const refreshProviderStatus = useCallback(async (provider: Session['provider'] = 'ollama') => {
    const readiness = await checkProviderReadiness(provider);
    setIsActiveProviderReady(readiness.ok);
    return readiness;
  }, []);

  useEffect(() => {
    startupPromise
      .then(result => {
        if (result.success) {
          globalSettingsRef.current = result.globalSettings;
          setSessionId(result.sessionId ?? '');
          setSessionStage(result.sessionStage ?? 'interview');
          setNoticeMessage(result.startupNotice ?? null);
          const activeProvider = result.activeProvider ?? 'ollama';
          setCurrentProvider(activeProvider);
          const activeStatus = result.providerStatuses?.find(status => status.provider === activeProvider);
          setIsActiveProviderReady(activeStatus?.ok ?? true);
          if (result.sessionResolution === 'resumed') {
            const resumeStage = result.sessionStage ?? 'interview';
            setResumabilityContext(`resumed from ${resumeStage}`);
            getLogger().info(`screen: restoring session ${result.sessionId} at stage ${resumeStage}`);
            if (result.sessionId) {
              const s = loadSession(result.sessionId);
              if (s) {
                const resumeProvider = s.provider ?? 'ollama';
                setCurrentModel(resumeProvider === 'codex-cli' ? undefined : (s.model ?? undefined));
                if (resumeStage === 'dev-plans') {
                  const completed = s.completedPhaseCount ?? (s.devPlanArtifacts?.length ?? 0);
                  const total = s.extractedPhases?.length ?? 0;
                  if (total > 0) {
                    setRestoredDevPlanProgress({ completed, total });
                  }
                }
              }
            }
            setScreen('restored');
          } else {
            setScreen('main');
          }
        } else {
          setErrorMessage(result.message);
          setScreen('error');
          setTimeout(() => {
            exit();
            process.exit(1);
          }, 100);
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setErrorMessage(message);
        setScreen('error');
        setTimeout(() => {
          exit();
          process.exit(1);
        }, 100);
      });
  }, [startupPromise]);

  useEffect(() => {
    if (screen !== 'main' || interviewStartedRef.current || !sessionId) return;

    const session = loadSession(sessionId);
    if (!session) {
      setErrorMessage(`Failed to load session ${sessionId}`);
      setScreen('error');
      setTimeout(() => {
        exit();
        process.exit(1);
      }, 100);
      return;
    }

    currentSessionRef.current = session;
    setTranscript(session.transcript);

    const activeProvider = session.provider ?? 'ollama';
    const model = activeProvider === 'codex-cli' ? undefined : (session.model ?? undefined);
    currentModelRef.current = model;
    setCurrentProvider(activeProvider);
    setCurrentModel(model);
    getLogger().info(`screen: initializing provider=${activeProvider} model=${model ?? 'none'} (session ${session.id})`);
    providerRef.current = createProvider(activeProvider, model);
    commandRunnerRef.current = null;

    // Proxy delegates to current provider ref, enabling /model switching
    const providerProxy: ModelProvider = {
      generate: (messages) =>
        withRetry(() => providerRef.current!.generate(messages), {
          onRetryExhausted: (err, attempts) => {
            const errorText = `Model request failed after ${attempts} attempts: ${err.message}`;
            const s = loadSession(sessionId);
            if (s) {
              persistErrorState(s, errorText);
            }
            setTransientError(errorText);
          },
        }),
    };

    const systemPrompt = buildInterviewSystemPrompt('');

    const onUserInput = (): Promise<string> =>
      new Promise<string>((resolve) => {
        setIsThinking(false);
        userInputResolverRef.current = resolve;
      });

    const onAssistantResponse = async (response: string, _complete: boolean): Promise<void> => {
      setIsThinking(false);
      setTranscript((t) => [
        ...t,
        { role: 'assistant', content: response, timestamp: new Date().toISOString() },
      ]);
    };

    const onSessionUpdate = (updated: Session): void => {
      currentSessionRef.current = updated;
      const updatedProvider = updated.provider ?? 'ollama';
      const updatedModel = updatedProvider === 'codex-cli' ? undefined : (updated.model ?? currentModelRef.current);
      currentModelRef.current = updatedModel;
      setCurrentProvider(updatedProvider);
      setCurrentModel(updatedModel);
      getLogger().info(`screen: session updated provider=${updatedProvider} model=${updatedModel ?? 'none'} (session ${updated.id})`);
      // When switching to Ollama with no model, immediately point providerRef at the new Ollama
      // provider (model-less) so any prompts during resolution fail with "No Ollama model selected"
      // rather than silently routing to the previous provider. Async resolution fills in the model.
      if (updatedProvider === 'ollama' && !updatedModel) {
        const tempProvider = createProvider('ollama', undefined);
        // Immediately update providerRef so prompts during resolution hit the correct backend.
        providerRef.current = tempProvider;
        if (supportsModelListing(tempProvider)) {
          const ollamaProvider = tempProvider as { listModels(): Promise<string[]> };
          const resolutionGen = ++ollamaResolutionGenRef.current;
          void resolveOllamaModel(undefined, () => ollamaProvider.listModels()).then((resolution) => {
            // Guard: discard if provider changed or a newer resolution has since started.
            if (currentSessionRef.current?.provider !== 'ollama') return;
            if (ollamaResolutionGenRef.current !== resolutionGen) return;
            if (resolution.noModelsInstalled) {
              providerRef.current = createProvider('ollama', undefined);
              setNoticeMessage(
                resolution.notice ?? 'No Ollama models are installed. Run `ollama pull <model>` to install one.',
              );
              return;
            }
            if (!resolution.resolvedModel) {
              providerRef.current = createProvider('ollama', undefined);
              setNoticeMessage(
                'Could not determine an Ollama model. Ensure Ollama is running with at least one model installed, then try again.',
              );
              return;
            }
            const resolvedModel = resolution.resolvedModel;
            currentModelRef.current = resolvedModel;
            setCurrentModel(resolvedModel);
            // Always update the notice — clear any stale "unavailable" messages when resolution succeeds.
            setNoticeMessage(resolution.notice ?? null);
            // Reload from disk to capture any transcript updates written by appendInterviewMessage
            // during the async resolution period (those calls save to disk but do not update the ref).
            const diskSession = loadSession(updated.id) ?? currentSessionRef.current!;
            const freshSession: Session = {
              ...diskSession,
              model: resolvedModel,
              updatedAt: new Date().toISOString(),
            };
            saveSession(freshSession);
            currentSessionRef.current = freshSession;
            providerRef.current = createProvider('ollama', resolvedModel);
            getLogger().info(
              `screen: post-switch Ollama model resolved to "${resolvedModel}" (session ${updated.id})`,
            );
          }).catch((err: unknown) => {
            getLogger().warn(`screen: Ollama post-switch model resolution failed: ${String(err)}`);
          });
          // Skip refreshProviderStatus: listModels already proves Ollama reachability, and a
          // concurrent notice write would race with the resolver above and clear its messages.
          return;
        }
      }
      // Invalidate any in-flight Ollama model resolution so it cannot overwrite this explicit state.
      ollamaResolutionGenRef.current++;
      providerRef.current = createProvider(updatedProvider, updatedModel);
      void refreshProviderStatus(updatedProvider).then(readiness => {
        setNoticeMessage(readiness.ok ? null : `Active provider ${updatedProvider} is unavailable. ${readiness.message}`);
      });
    };

    const onSelectModel = async (models: string[]): Promise<string | null> => {
      // Show the dedicated ModelSelectPrompt component instead of a transcript message.
      setModelSelectOptions(models);
      isSelectingModelRef.current = true;
      setIsSelectingModel(true);
      const choice = await onUserInput();
      isSelectingModelRef.current = false;
      setIsSelectingModel(false);
      setModelSelectOptions(undefined);
      setIsThinking(true);
      const trimmed = choice.trim();
      if (!trimmed) return null;
      return models.includes(trimmed) ? trimmed : null;
    };

    const helpHandler = async (_args: string[]) => ({
      handled: true,
      continueInterview: true,
      message: HELP_MESSAGE,
    });
    const providerHandler = (args: string[]) =>
      createProviderHandler({
        getSession: () => loadSession(sessionId) ?? currentSessionRef.current!,
        onSessionUpdate,
        checkReadiness: async provider => refreshProviderStatus(provider),
      })(args);
    const modelHandler = (args: string[]) =>
      createModelHandler({
        getSession: () => loadSession(sessionId) ?? currentSessionRef.current!,
        onSessionUpdate,
        modelLister: {
          listModels: () =>
            supportsModelListing(providerRef.current!)
              ? providerRef.current!.listModels()
              : Promise.resolve([]),
        },
        onSelectModel,
        supportsModelListing: supportsModelListing(providerRef.current!),
      })(args);
    const finishNowHandler = createFinishNowHandler({
      getSession: () => loadSession(sessionId) ?? currentSessionRef.current!,
      onSessionUpdate,
      provider: providerProxy,
      systemPrompt,
      onResponse: async (response) => {
        await onAssistantResponse(response, true);
      },
    });
    commandRunnerRef.current = async (input: string) => {
      const parsed = parseCommand(input);
      if (!parsed) return false;
      const handler =
        parsed.command === '/provider'
          ? providerHandler
          : parsed.command === '/model'
            ? modelHandler
            : parsed.command === '/help'
              ? helpHandler
              : finishNowHandler;
      const result = await handler(parsed.args);
      if (result.message) {
        await onAssistantResponse(result.message, false);
      }
      return result.handled;
    };
    if (!isActiveProviderReady || sessionStage === 'dev-plans') {
      setIsThinking(false);
      return;
    }

    // Prevent re-entry before the async model resolution below.
    interviewStartedRef.current = true;

    const runWithModelResolution = async (): Promise<Session | null> => {
      // For Ollama: resolve which model to use before the first interview turn.
      if (activeProvider === 'ollama' && supportsModelListing(providerRef.current!)) {
        const ollamaProvider = providerRef.current as { listModels(): Promise<string[]> };
        // Snapshot the generation counter so we can detect explicit /model changes during resolution.
        const resolutionGen = ollamaResolutionGenRef.current;
        // Prefer: saved session model > global settings default > first available model
        const modelHint = currentModelRef.current ?? globalSettingsRef.current?.defaultOllamaModel;
        const resolution = await resolveOllamaModel(
          modelHint,
          () => ollamaProvider.listModels(),
        );

        if (resolution.noModelsInstalled) {
          // Show the notice here so it is not displayed if this resolution is later discarded by a guard.
          if (resolution.notice) {
            setNoticeMessage(resolution.notice);
          }
          getLogger().info(
            `screen: no Ollama models installed, keeping session interactive (session ${sessionId})`,
          );
          // Reset so that switching providers via /provider or /model can re-trigger this effect
          interviewStartedRef.current = false;
          return null;
        }

        // Finding 2: listing failed and no model was previously set — can't start the interview.
        if (resolution.resolvedModel === undefined) {
          getLogger().warn(
            `screen: Ollama model resolution returned undefined (listing may have failed with no current model), keeping session interactive (session ${sessionId})`,
          );
          interviewStartedRef.current = false;
          setNoticeMessage(
            'Could not determine an Ollama model. Ensure Ollama is running with at least one model installed, then try again. Alternatively, switch with /provider codex-cli.',
          );
          return null;
        }

        if (resolution.resolvedModel !== currentModelRef.current) {
          // Guard: if the user ran /provider during resolution, don't overwrite their choice.
          if (currentSessionRef.current?.provider !== activeProvider) {
            getLogger().info(
              `screen: provider changed during Ollama model resolution, skipping model update (session ${sessionId})`,
            );
          // Guard: if the user ran /model during resolution, the gen counter will have advanced.
          } else if (ollamaResolutionGenRef.current !== resolutionGen) {
            getLogger().info(
              `screen: model changed during Ollama model resolution, skipping stale update (session ${sessionId})`,
            );
          } else {
            const updatedSession: Session = {
              ...currentSessionRef.current!,
              model: resolution.resolvedModel,
              updatedAt: new Date().toISOString(),
            };
            saveSession(updatedSession);
            currentSessionRef.current = updatedSession;
            currentModelRef.current = resolution.resolvedModel;
            setCurrentModel(resolution.resolvedModel);
            providerRef.current = createProvider(activeProvider, resolution.resolvedModel);
            // Only show the displacement notice when we actually apply the resolved model;
            // if either guard above fired and discarded the resolution, suppressing the
            // notice avoids showing a misleading "switched to X" message.
            if (resolution.notice) {
              setNoticeMessage(resolution.notice);
            }
            getLogger().info(
              `screen: Ollama model resolved to "${resolution.resolvedModel ?? 'none'}" (session ${sessionId})`,
            );
          }
        }
      }

      setIsThinking(true);
      return runInterviewLoop(
        currentSessionRef.current!,
        providerProxy,
        systemPrompt,
        onUserInput,
        onAssistantResponse,
        {
          '/finish-now': finishNowHandler,
          '/model': modelHandler,
          '/provider': providerHandler,
          '/help': helpHandler,
        },
      );
    };

    void runWithModelResolution()
      .then((finalSession) => {
        if (finalSession === null) return;
        // Reload from disk so that session state written by command handlers (e.g. /finish-now
        // calling completeInterview) is not overwritten by the stale local session from the loop.
        currentSessionRef.current = loadSession(finalSession.id) ?? finalSession;
        setIsThinking(false);
        setInterviewComplete(true);
      })
      .catch((err: unknown) => {
        logFullError(getLogger(), 'interview loop', err);
        setFatalInterviewError(formatUserMessage(err));
        setIsThinking(false);
        interviewStartedRef.current = false;
      });
  }, [screen, sessionId, sessionStage, isActiveProviderReady, currentProvider, currentModel, refreshProviderStatus, exit]);

  useEffect(() => {
    if (screen !== 'main' || sessionStage !== 'dev-plans' || !sessionId) return;
    if (pipelineStartedRef.current) return;
    if (!isActiveProviderReady) return;
    pipelineStartedRef.current = true;

    const session = loadSession(sessionId);
    if (!session) {
      setErrorMessage(`Failed to load session ${sessionId}`);
      setScreen('error');
      setTimeout(() => {
        exit();
        process.exit(1);
      }, 100);
      return;
    }

    getLogger().info(`dev-plan resume: resuming dev plan generation from session ${sessionId}`);
    currentSessionRef.current = session;

    // Populate completed stages from existing session artifacts
    const resumeStages: CompletedStage[] = [];
    if (session.specArtifact) {
      resumeStages.push({ label: STAGE_DISPLAY_LABELS.spec, filePath: session.specArtifact.filePath });
    }
    if (session.architectureArtifact) {
      resumeStages.push({ label: STAGE_DISPLAY_LABELS.architecture, filePath: session.architectureArtifact.filePath });
    }
    if (session.planArtifact) {
      resumeStages.push({ label: STAGE_DISPLAY_LABELS.plan, filePath: session.planArtifact.filePath });
    }
    setCompletedStages(resumeStages);

    const resumeProvider = session.provider ?? 'ollama';
    const model = resumeProvider === 'codex-cli' ? undefined : (session.model ?? undefined);
    getLogger().info(`dev-plan resume: initializing provider=${resumeProvider} model=${model ?? 'none'} (session ${sessionId})`);
    providerRef.current = createProvider(resumeProvider, model);
    setCurrentProvider(resumeProvider);
    setCurrentModel(model);

    const runDevPlanWithModelResolution = async () => {
      // For Ollama: resolve which model to use before running the dev plan loop.
      if (resumeProvider === 'ollama' && supportsModelListing(providerRef.current!)) {
        const ollamaProvider = providerRef.current as { listModels(): Promise<string[]> };
        const resolution = await resolveOllamaModel(
          model,
          () => ollamaProvider.listModels(),
        );

        if (resolution.notice) {
          setNoticeMessage(resolution.notice);
        }

        if (resolution.noModelsInstalled) {
          getLogger().info(
            `dev-plan resume: no Ollama models installed, cannot resume (session ${sessionId})`,
          );
          setGenerationStage('dev-plan');
          setScreen('generating');
          setGenerationError(
            'No Ollama models are installed. Run `ollama pull <model>` to install one, or use /provider codex-cli to switch providers.',
          );
          setGenerationStatus('error');
          return;
        }

        // Finding 2: listing failed and no model was previously set — can't start the dev-plan loop.
        if (resolution.resolvedModel === undefined) {
          getLogger().warn(
            `dev-plan resume: Ollama model resolution returned undefined (listing may have failed with no current model), cannot resume (session ${sessionId})`,
          );
          setGenerationStage('dev-plan');
          setScreen('generating');
          setGenerationError(
            'Could not determine an Ollama model. Ensure Ollama is running with at least one model installed, then try again.',
          );
          setGenerationStatus('error');
          return;
        }

        if (resolution.resolvedModel !== model) {
          const updatedSession: Session = {
            ...currentSessionRef.current!,
            model: resolution.resolvedModel,
            updatedAt: new Date().toISOString(),
          };
          saveSession(updatedSession);
          currentSessionRef.current = updatedSession;
          currentModelRef.current = resolution.resolvedModel;
          setCurrentModel(resolution.resolvedModel);
          providerRef.current = createProvider(resumeProvider, resolution.resolvedModel);
          getLogger().info(
            `dev-plan resume: Ollama model resolved to "${resolution.resolvedModel ?? 'none'}" (session ${sessionId})`,
          );
        }
      }

      setGenerationStage('dev-plan');
      setScreen('generating');

      const resultSession = await runDevPlanLoop(currentSessionRef.current!, providerRef.current!, {
        onPhaseStart: (phaseNumber, total) => {
          setDevPlanProgress({ current: phaseNumber, total });
        },
        onPhaseComplete: (phaseNumber, filePath) => {
          setCompletedStages((prev) => [
            ...prev,
            { label: `${DEV_PLAN_PHASE_LABEL_PREFIX} ${phaseNumber}`, filePath },
          ]);
        },
      });

      if (resultSession.devPlanHalted) {
        setGenerationError(
          'Dev plan generation stopped after repeated failures. Resume cobuild in this directory to retry from the failed phase.',
        );
        setGenerationStatus('error');
      } else {
        setGenerationStatus('success');
      }
    };

    void runDevPlanWithModelResolution().catch((err: unknown) => {
      logFullError(getLogger(), 'generation screen: dev-plan resume failed', err);
      const msg = formatUserMessage(err);
      const s = loadSession(sessionId) ?? currentSessionRef.current;
      if (s) {
        try { persistErrorState(s, msg); } catch (persistErr) { getLogger().warn(`generation screen: failed to persist error state: ${String(persistErr)}`); }
      }
      setGenerationError(msg);
      setGenerationStatus('error');
    });
  }, [screen, sessionId, sessionStage, isActiveProviderReady, exit]);

  useEffect(() => {
    if (!interviewComplete) return;
    if (pipelineStartedRef.current) return;
    const session = currentSessionRef.current;
    const provider = providerRef.current;
    if (!session || !provider) return;
    pipelineStartedRef.current = true;

    setScreen('generating');
    setSessionStage('spec');

    const makeOnDecision = (question: string): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        setYesNoQuestion(question);
        yesNoResolverRef.current = resolve;
        setScreen('yesno');
      });

    const makeWriteArtifact = (content: string, workingDirectory: string, type: 'architecture' | 'plan'): string => {
      const dir = ensureDocsDir(workingDirectory);
      const projectName = path.basename(workingDirectory) || 'project';
      const artifactFilename = type === 'architecture'
        ? generateArchitectureFilename(projectName)
        : generatePlanFilename(projectName);
      const artifactPath = resolveOutputPath(dir, artifactFilename);
      writeArtifactFile(artifactPath, content);
      getLogger().info(`generation screen: ${type} saved to ${artifactPath}`);
      const label = type === 'architecture' ? STAGE_DISPLAY_LABELS.architecture : STAGE_DISPLAY_LABELS.plan;
      setCompletedStages((prev) => [...prev, { label, filePath: artifactPath }]);
      return artifactPath;
    };

    const specGenerator = new SpecGenerator();
    const archGenerator = new ArchGenerator();
    const planGenerator = new PlanGenerator();

    const postSpecOptions = {
      architectureGenerator: archGenerator,
      planGenerator: planGenerator,
      onDecision: makeOnDecision,
      writeArtifactFile: makeWriteArtifact,
      onStageUpdate: (stage: string) => {
        if (stage === 'asking-architecture') {
          setSessionStage('architecture');
        } else if (stage === 'generating-architecture') {
          setGenerationStage('architecture');
          setSessionStage('architecture');
          setScreen('generating');
        } else if (stage === 'asking-plan') {
          setSessionStage('plan');
        } else if (stage === 'generating-plan') {
          setGenerationStage('plan');
          setSessionStage('plan');
          setScreen('generating');
        } else if (stage === 'complete') {
          setSessionStage('dev-plans');
        }
      },
      onRestoreCompletedStage: (label: string, filePath: string) => {
        setCompletedStages((prev) => [...prev, { label, filePath }]);
      },
    };

    // If spec was already generated (retry after arch/plan failure), skip re-generating it
    const existingSpec = session.specArtifact;
    const postSpecPromise = existingSpec
      ? (() => {
          setGenerationFilePath(existingSpec.filePath);
          setCompletedStages([{ label: STAGE_DISPLAY_LABELS.spec, filePath: existingSpec.filePath }]);
          getLogger().info(`generation screen: spec already exists, resuming post-spec workflow (session ${session.id})`);
          const specSession = loadSession(session.id) ?? session;
          return runPostSpecWorkflow(specSession, provider, postSpecOptions);
        })()
      : runArtifactPipeline(session, provider, specGenerator, 'spec')
          .then(({ session: updatedSession, result }) => {
            // Reload session from disk to pick up fields written by the generator (e.g. generationAttempts)
            const freshSession = loadSession(updatedSession.id) ?? updatedSession;
            const projectName = path.basename(freshSession.workingDirectory) || 'project';
            const docsDir = ensureDocsDir(freshSession.workingDirectory);
            const filename = generateFilename(projectName);
            const filePath = resolveOutputPath(docsDir, filename);
            try {
              writeArtifactFile(filePath, result.content);
            } catch (err) {
              logFullError(getLogger(), `generation screen: file write failed for ${filePath}`, err);
              const msg = formatUserMessage(err);
              try { persistErrorState(freshSession, `File write failed: ${msg}`); } catch (persistErr) { getLogger().warn(`generation screen: failed to persist error state: ${String(persistErr)}`); }
              setGenerationError(`File write failed: ${msg}`);
              setGenerationStatus('error');
              return null;
            }
            const afterArtifact = persistSpecArtifact(freshSession, result.content, filePath);
            const afterSpecStage = completeSpecStage(afterArtifact);
            getLogger().info(`generation screen: spec saved to ${filePath}`);
            setGenerationFilePath(filePath);
            setCompletedStages((prev) => [...prev, { label: STAGE_DISPLAY_LABELS.spec, filePath }]);

            const specSession = loadSession(afterSpecStage.id) ?? afterSpecStage;
            return runPostSpecWorkflow(specSession, provider, postSpecOptions);
          });

    postSpecPromise
      .then(async (workflowResult) => {
        if (workflowResult === null || workflowResult === undefined) return;
        if (workflowResult.terminatedAt) {
          getLogger().info(`generation screen: workflow terminated at ${workflowResult.terminatedAt}, exiting`);
          setWorkflowTerminatedEarly(true);
          setGenerationStatus('success');
          return;
        }
        // User accepted dev plan generation — run the sequential phase loop
        const devPlanSession = workflowResult.finalSession;
        const devPlanResult = await runDevPlanLoop(devPlanSession, provider, {
          onPhaseStart: (phaseNumber, total) => {
            setGenerationStage('dev-plan');
            setSessionStage('dev-plans');
            setDevPlanProgress({ current: phaseNumber, total });
            setScreen('generating');
          },
          onPhaseComplete: (phaseNumber, filePath) => {
            setCompletedStages((prev) => [
              ...prev,
              { label: `${DEV_PLAN_PHASE_LABEL_PREFIX} ${phaseNumber}`, filePath },
            ]);
          },
        });
        if (devPlanResult.devPlanHalted) {
          setGenerationError('Dev plan generation stopped after repeated failures. Resume cobuild in this directory to retry from the failed phase.');
          setGenerationStatus('error');
        } else {
          setGenerationStatus('success');
        }
      })
      .catch((err: unknown) => {
        logFullError(getLogger(), 'generation screen: pipeline failed', err);
        const msg = formatUserMessage(err);
        const s = loadSession(sessionId) ?? currentSessionRef.current;
        if (err instanceof RetryExhaustedError) {
          getLogger().error(`generation screen: retry exhaustion reached during artifact generation; prompting user to retry or exit`);
          if (s) {
            try { persistRetryExhaustedState(s); } catch (persistErr) { getLogger().warn(`generation screen: failed to persist retry exhaustion state: ${String(persistErr)}`); }
          }
          setGenerationError(msg);
          setGenerationStatus('retry-exhausted');
        } else {
          if (s) {
            try { persistErrorState(s, msg); } catch (persistErr) { getLogger().warn(`generation screen: failed to persist error state: ${String(persistErr)}`); }
          }
          setGenerationError(msg);
          setGenerationStatus('error');
        }
      });
  }, [interviewComplete, retryTrigger, isActiveProviderReady]);

  const handleRetry = useCallback(() => {
    getLogger().info(`generation screen: user requested retry after retry exhaustion`);
    // Reload session from disk so the retry pipeline sees the latest state (e.g. specArtifact
    // already written) and can skip stages that were already completed.
    const fresh = loadSession(sessionId);
    if (fresh) currentSessionRef.current = fresh;
    pipelineStartedRef.current = false;
    setGenerationStatus('generating');
    setGenerationError(undefined);
    // Pre-populate completed stages from the reloaded session to avoid a visual
    // flicker where already-completed stages briefly appear as "pending" before
    // the pipeline effect restores them.
    {
      const resumeStages: Array<{ label: string; filePath: string }> = [];
      let nextStage: GenerationStage = 'spec';
      if (fresh?.specArtifact) {
        resumeStages.push({ label: STAGE_DISPLAY_LABELS.spec, filePath: fresh.specArtifact.filePath });
        nextStage = 'architecture';
      }
      if (fresh?.architectureArtifact) {
        resumeStages.push({ label: STAGE_DISPLAY_LABELS.architecture, filePath: fresh.architectureArtifact.filePath });
        nextStage = 'plan';
      }
      if (fresh?.planArtifact) {
        resumeStages.push({ label: STAGE_DISPLAY_LABELS.plan, filePath: fresh.planArtifact.filePath });
        nextStage = 'dev-plan';
      }
      setGenerationStage(nextStage);
      setGenerationFilePath(resumeStages.length > 0 ? resumeStages[resumeStages.length - 1].filePath : undefined);
      setCompletedStages(resumeStages);
    }
    setDevPlanProgress(undefined);
    setWorkflowTerminatedEarly(false);
    setRetryTrigger((n) => n + 1);
  }, [sessionId]);

  const handleExecutionUserAction = useCallback((action: ExecutionUserAction) => {
    getLogger().info(`execution: user action: ${action}`);
    switch (action) {
      case 'retry':
        dispatchExecutionEvent({ type: 'phase-change', phase: 'preflight' });
        break;
      case 'continue':
        dispatchExecutionEvent({ type: 'phase-change', phase: 'running' });
        break;
      case 'inspect-logs':
        // Future: surface full log viewer; output is already visible in the output pane.
        break;
    }
  }, []);

  const handleYesNoAnswer = useCallback((answer: boolean) => {
    if (!yesNoResolverRef.current) return;
    yesNoResolverRef.current(answer);
    yesNoResolverRef.current = null;
    setScreen('generating');
  }, []);

  const handleSubmit = useCallback(
    (input: string) => {
      if (!userInputResolverRef.current) {
        if (parseCommand(input) && commandRunnerRef.current) {
          void commandRunnerRef.current(input).catch((err: unknown) => {
            setTransientError(err instanceof Error ? err.message : String(err));
          });
          return;
        }
        if (!isActiveProviderReady) {
          setTransientError('The active provider is unavailable. Use /provider <ollama|codex-cli> or /model <name> to adjust the session before continuing.');
          return;
        }
        setTransientError('cobuild is still initializing. Try again in a moment.');
        return;
      }
      if (!isSelectingModelRef.current) {
        if (!input.startsWith('/')) {
          setTranscript((t) => [
            ...t,
            { role: 'user', content: input, timestamp: new Date().toISOString() },
          ]);
        }
        setIsThinking(true);
      }
      userInputResolverRef.current(input);
      userInputResolverRef.current = null;
    },
    [isActiveProviderReady],
  );

  // Build the status bar data for AppShell when a session is active
  const statusBar: StatusHeaderData | undefined = sessionId
    ? {
        sessionId,
        stage: sessionStage,
        provider: currentProvider,
        model: currentModel,
        providerReady: isActiveProviderReady,
        version,
        resumabilityContext,
      }
    : undefined;

  if (screen === 'startup') {
    return (
      <AppShell>
        <StartupScreen version={version} steps={startupSteps} />
      </AppShell>
    );
  }

  if (screen === 'error') {
    return (
      <AppShell>
        <ErrorScreen message={errorMessage} />
      </AppShell>
    );
  }

  if (screen === 'restored') {
    return (
      <AppShell statusBar={statusBar} notice={noticeMessage ?? undefined} footer={RESTORED_FOOTER}>
        <RestoredSession
          sessionId={sessionId}
          stage={sessionStage}
          provider={currentProvider}
          model={currentModel}
          providerReady={isActiveProviderReady}
          devPlanProgress={restoredDevPlanProgress}
          onContinue={() => setScreen('main')}
        />
      </AppShell>
    );
  }

  if (screen === 'generating') {
    return (
      <AppShell statusBar={statusBar} notice={noticeMessage ?? undefined} footer={GENERATING_FOOTER}>
        <GenerationScreen
          status={generationStatus}
          filePath={generationFilePath}
          errorMessage={generationError}
          currentStage={generationStage}
          completedStages={completedStages}
          terminatedEarly={workflowTerminatedEarly}
          devPlanProgress={devPlanProgress}
          onRetry={handleRetry}
        />
      </AppShell>
    );
  }

  if (screen === 'yesno') {
    return (
      <AppShell statusBar={statusBar} notice={noticeMessage ?? undefined} footer={YESNO_FOOTER}>
        <YesNoPrompt
          question={yesNoQuestion}
          onAnswer={handleYesNoAnswer}
        />
      </AppShell>
    );
  }

  // 'execution' — ralphex execution console, driven by applyExecutionEvent reducer.
  // To activate: transition screen to 'execution' and dispatch ExecutionEvents via dispatchExecutionEvent.
  // The FlowWrapper provides outer lifecycle chrome; ExecutionConsole renders running content.
  if (screen === 'execution') {
    const execFlowState = toExecutionFlowWrapperState(executionState);
    // Terminal phases (failed/complete) are handled exclusively by FlowWrapper's
    // FailureFooter/CompletionFooter to avoid contradictory duplicate messages.
    const showConsole =
      executionState.phase === 'running' ||
      executionState.phase === 'validating' ||
      executionState.phase === 'paused';
    return (
      <AppShell statusBar={statusBar} notice={noticeMessage ?? undefined} footer={EXECUTION_FOOTER}>
        <FlowWrapper
          state={execFlowState}
          onConfirm={() => handleExecutionUserAction('continue')}
        >
          {showConsole && (
            <ExecutionConsole state={executionState} onUserAction={handleExecutionUserAction} />
          )}
        </FlowWrapper>
      </AppShell>
    );
  }

  // 'main' — interview screen
  return (
    <AppShell
      statusBar={statusBar}
      notice={noticeMessage ?? undefined}
      transientError={transientError ?? undefined}
      footer={INTERVIEW_FOOTER}
    >
      <App
        transcript={transcript}
        isThinking={isThinking}
        isComplete={interviewComplete}
        fatalErrorMessage={fatalInterviewError}
        allowEmptySubmit={isSelectingModel}
        modelSelectOptions={modelSelectOptions}
        currentModel={currentModel}
        onSubmit={handleSubmit}
      />
    </AppShell>
  );
}
