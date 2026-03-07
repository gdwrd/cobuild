import { useState, useEffect, useRef, useCallback } from 'react';
import * as path from 'node:path';
import { Box, Text, useApp } from 'ink';
import type { StartupResult } from '../cli/app-shell.js';
import { App } from './App.js';
import { RestoredSession } from './RestoredSession.js';
import { GenerationScreen } from './GenerationScreen.js';
import type { GenerationStatus } from './GenerationScreen.js';
import type { InterviewMessage, Session } from '../session/session.js';
import { loadSession, persistErrorState, persistSpecArtifact, completeSpecStage } from '../session/session.js';
import { OllamaProvider } from '../providers/ollama.js';
import { runInterviewLoop } from '../interview/controller.js';
import type { ModelProvider } from '../interview/controller.js';
import { buildInterviewSystemPrompt } from '../interview/prompts.js';
import { createFinishNowHandler } from '../interview/finish-now.js';
import { createModelHandler } from '../interview/model-command.js';
import { createProviderHandler } from '../interview/provider-command.js';
import { withRetry, RetryExhaustedError } from '../interview/retry.js';
import { runArtifactPipeline } from '../artifacts/generator.js';
import { SpecGenerator } from '../artifacts/spec-generator.js';
import { ensureDocsDir, generateFilename, resolveOutputPath, writeArtifactFile } from '../artifacts/file-output.js';
import { getLogger } from '../logging/logger.js';

type Screen = 'startup' | 'restored' | 'main' | 'generating' | 'error';

export interface ScreenControllerProps {
  startupPromise: Promise<StartupResult>;
  version: string;
}

export function ScreenController({ startupPromise, version }: ScreenControllerProps) {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>('startup');
  const [statusMessage] = useState('Starting cobuild...');
  const [sessionId, setSessionId] = useState('');
  const [sessionStage, setSessionStage] = useState<'interview' | 'spec' | 'architecture'>('interview');
  const [errorMessage, setErrorMessage] = useState('');
  const [transcript, setTranscript] = useState<InterviewMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [fatalInterviewError, setFatalInterviewError] = useState<string | null>(null);
  const [transientError, setTransientError] = useState<string | null>(null);
  const [isSelectingModel, setIsSelectingModel] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>('generating');
  const [generationFilePath, setGenerationFilePath] = useState<string | undefined>(undefined);
  const [generationError, setGenerationError] = useState<string | undefined>(undefined);

  const userInputResolverRef = useRef<((input: string) => void) | null>(null);
  const currentSessionRef = useRef<Session | null>(null);
  const providerRef = useRef<OllamaProvider | null>(null);
  const currentModelRef = useRef<string>('llama3');
  const interviewStartedRef = useRef(false);
  const isSelectingModelRef = useRef(false);

  useEffect(() => {
    startupPromise
      .then(result => {
        if (result.success) {
          setSessionId(result.sessionId ?? '');
          setSessionStage(result.sessionStage ?? 'interview');
          if (result.sessionResolution === 'resumed') {
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
    interviewStartedRef.current = true;

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
    providerRef.current = new OllamaProvider({ model });

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
      if (updated.model && updated.model !== currentModelRef.current) {
        currentModelRef.current = updated.model;
        providerRef.current = new OllamaProvider({ model: updated.model });
      }
    };

    const onSelectModel = async (models: string[]): Promise<string | null> => {
      const modelList = models.map((m, i) => `${i + 1}. ${m}`).join('\n');
      await onAssistantResponse(
        `Available models:\n${modelList}\n\nType a model name or number to switch, or press Enter to keep current.`,
        false,
      );
      isSelectingModelRef.current = true;
      setIsSelectingModel(true);
      const choice = await onUserInput();
      isSelectingModelRef.current = false;
      setIsSelectingModel(false);
      setIsThinking(true);
      const trimmed = choice.trim();
      if (!trimmed) return null;
      const byIndex = Number(trimmed);
      if (Number.isInteger(byIndex) && byIndex >= 1 && byIndex <= models.length) {
        return models[byIndex - 1];
      }
      return models.includes(trimmed) ? trimmed : null;
    };

    setIsThinking(true);
    runInterviewLoop(session, providerProxy, systemPrompt, onUserInput, onAssistantResponse, {
      '/finish-now': createFinishNowHandler({
        getSession: () => loadSession(sessionId) ?? currentSessionRef.current!,
        onSessionUpdate,
        provider: providerProxy,
        systemPrompt,
        onResponse: async (response) => {
          await onAssistantResponse(response, true);
        },
      }),
      '/model': createModelHandler({
        getSession: () => loadSession(sessionId) ?? currentSessionRef.current!,
        onSessionUpdate,
        modelLister: { listModels: () => providerRef.current!.listModels() },
        onSelectModel,
      }),
      '/provider': createProviderHandler(),
    })
      .then((finalSession) => {
        currentSessionRef.current = finalSession;
        setIsThinking(false);
        setInterviewComplete(true);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setFatalInterviewError(msg);
        setIsThinking(false);
      });
  }, [screen, sessionId]);

  useEffect(() => {
    if (!interviewComplete) return;
    const session = currentSessionRef.current;
    const provider = providerRef.current;
    if (!session || !provider) return;

    setScreen('generating');

    const specGenerator = new SpecGenerator();
    runArtifactPipeline(session, provider, specGenerator, 'spec')
      .then(({ session: updatedSession, result }) => {
        const projectName = path.basename(updatedSession.workingDirectory) || 'project';
        const docsDir = ensureDocsDir(updatedSession.workingDirectory);
        const filename = generateFilename(projectName);
        const filePath = resolveOutputPath(docsDir, filename);
        try {
          writeArtifactFile(filePath, result.content);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          getLogger().error(`generation screen: file write failed for ${filePath}: ${msg}`);
          persistErrorState(updatedSession, `File write failed: ${msg}`);
          setGenerationError(`File write failed: ${msg}`);
          setGenerationStatus('error');
          return;
        }
        const afterArtifact = persistSpecArtifact(updatedSession, result.content, filePath);
        completeSpecStage(afterArtifact);
        getLogger().info(`generation screen: spec saved to ${filePath}`);
        setGenerationFilePath(filePath);
        setGenerationStatus('success');
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        getLogger().error(`generation screen: spec generation failed: ${msg}`);
        // RetryExhaustedError: onRetryExhausted already persisted error state inside the generator
        if (!(err instanceof RetryExhaustedError)) {
          const s = currentSessionRef.current;
          if (s) {
            persistErrorState(s, msg);
          }
        }
        setGenerationError(msg);
        setGenerationStatus('error');
      });
  }, [interviewComplete]);

  const handleSubmit = useCallback(
    (input: string) => {
      if (!userInputResolverRef.current) return;
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
    [],
  );

  if (screen === 'startup') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Text bold color="cyan">
          cobuild v{version}
        </Text>
        <Text dimColor>{'  '}{statusMessage}</Text>
      </Box>
    );
  }

  if (screen === 'restored') {
    return (
      <RestoredSession
        sessionId={sessionId}
        stage={sessionStage}
        onContinue={() => setScreen('main')}
      />
    );
  }

  if (screen === 'error') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="red">Error: {errorMessage}</Text>
      </Box>
    );
  }

  if (screen === 'generating') {
    return (
      <GenerationScreen
        status={generationStatus}
        filePath={generationFilePath}
        errorMessage={generationError}
      />
    );
  }

  return (
    <App
      sessionId={sessionId}
      version={version}
      transcript={transcript}
      isThinking={isThinking}
      isComplete={interviewComplete}
      errorMessage={transientError}
      fatalErrorMessage={fatalInterviewError}
      allowEmptySubmit={isSelectingModel}
      onSubmit={handleSubmit}
    />
  );
}
