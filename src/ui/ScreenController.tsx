import { useState, useEffect, useRef, useCallback } from 'react';
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
import { loadSession, persistErrorState, persistSpecArtifact, completeSpecStage, persistRetryExhaustedState } from '../session/session.js';
import { createProvider, supportsModelListing } from '../providers/factory.js';
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
import type { Screen, SessionStage, StatusHeaderData, FooterHelpData } from './types.js';
import { ExecutionConsole } from './ExecutionConsole.js';
import { INITIAL_EXECUTION_STATE } from './types.js';

const INTERVIEW_FOOTER: FooterHelpData = {
  commands: ['/finish-now', '/model', '/provider', '/help'],
  keybindings: ['ctrl+c: quit'],
};

const QUIT_FOOTER: FooterHelpData = {
  commands: [],
  keybindings: ['ctrl+c: quit'],
};

const RESTORED_FOOTER: FooterHelpData = {
  commands: [],
  keybindings: ['enter: continue', 'ctrl+c: quit'],
};

const YESNO_FOOTER: FooterHelpData = {
  commands: [],
  keybindings: ['y: yes', 'n: no', 'ctrl+c: quit'],
};

const GENERATING_FOOTER: FooterHelpData = {
  commands: [],
  keybindings: ['ctrl+c: quit'],
};

const TRANSIENT_ERROR_DISPLAY_MS = 5000;

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

  const userInputResolverRef = useRef<((input: string) => void) | null>(null);
  const yesNoResolverRef = useRef<((answer: boolean) => void) | null>(null);
  const currentSessionRef = useRef<Session | null>(null);
  const providerRef = useRef<ModelProvider | null>(null);
  const currentModelRef = useRef<string>('llama3');
  const interviewStartedRef = useRef(false);
  const pipelineStartedRef = useRef(false);
  const isSelectingModelRef = useRef(false);
  const commandRunnerRef = useRef<((input: string) => Promise<boolean>) | null>(null);

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
                setCurrentModel(s.model ?? undefined);
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

    const model = session.model ?? 'llama3';
    currentModelRef.current = model;
    const activeProvider = session.provider ?? 'ollama';
    setCurrentProvider(activeProvider);
    setCurrentModel(model);
    getLogger().info(`screen: initializing provider=${activeProvider} model=${model} (session ${session.id})`);
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
      const updatedModel = updated.model ?? currentModelRef.current ?? 'llama3';
      currentModelRef.current = updatedModel;
      setCurrentProvider(updatedProvider);
      setCurrentModel(updatedModel);
      getLogger().info(`screen: session updated provider=${updatedProvider} model=${updatedModel} (session ${updated.id})`);
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
      const byIndex = Number(trimmed);
      if (Number.isInteger(byIndex) && byIndex >= 1 && byIndex <= models.length) {
        return models[byIndex - 1];
      }
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

    interviewStartedRef.current = true;
    setIsThinking(true);
    runInterviewLoop(session, providerProxy, systemPrompt, onUserInput, onAssistantResponse, {
      '/finish-now': finishNowHandler,
      '/model': modelHandler,
      '/provider': providerHandler,
      '/help': helpHandler,
    })
      .then((finalSession) => {
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
  }, [screen, sessionId, sessionStage, isActiveProviderReady, refreshProviderStatus, exit]);

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

    const model = session.model ?? 'llama3';
    const resumeProvider = session.provider ?? 'ollama';
    getLogger().info(`dev-plan resume: initializing provider=${resumeProvider} model=${model} (session ${sessionId})`);
    providerRef.current = createProvider(resumeProvider, model);
    setCurrentProvider(resumeProvider);
    setCurrentModel(model);
    const provider = providerRef.current;

    setGenerationStage('dev-plan');
    setScreen('generating');

    runDevPlanLoop(session, provider, {
      onPhaseStart: (phaseNumber, total) => {
        setDevPlanProgress({ current: phaseNumber, total });
      },
      onPhaseComplete: (phaseNumber, filePath) => {
        setCompletedStages((prev) => [
          ...prev,
          { label: `${DEV_PLAN_PHASE_LABEL_PREFIX} ${phaseNumber}`, filePath },
        ]);
      },
    })
      .then((resultSession) => {
        if (resultSession.devPlanHalted) {
          setGenerationError('Dev plan generation stopped after repeated failures. Resume cobuild in this directory to retry from the failed phase.');
          setGenerationStatus('error');
        } else {
          setGenerationStatus('success');
        }
      })
      .catch((err: unknown) => {
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
    setGenerationStage('spec');
    setCompletedStages([]);
    setGenerationFilePath(undefined);
    setWorkflowTerminatedEarly(false);
    setRetryTrigger((n) => n + 1);
  }, [sessionId]);

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

  // 'execution' — dormant ralphex execution console (no code transitions here yet).
  // Wire in a real runner by:
  //   1. Adding executionState to ScreenController useState (driven via applyExecutionEvent)
  //   2. Transitioning screen to 'execution' when a plan run starts
  //   3. Implementing onUserAction handler for retry / continue / inspect-logs
  if (screen === 'execution') {
    return (
      <AppShell statusBar={statusBar} notice={noticeMessage ?? undefined} footer={QUIT_FOOTER}>
        <ExecutionConsole state={INITIAL_EXECUTION_STATE} />
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
        onSubmit={handleSubmit}
      />
    </AppShell>
  );
}
