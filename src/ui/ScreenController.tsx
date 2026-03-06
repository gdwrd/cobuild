import { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text, useApp } from 'ink';
import type { StartupResult } from '../cli/app-shell.js';
import { App } from './App.js';
import { RestoredSession } from './RestoredSession.js';
import type { InterviewMessage, Session } from '../session/session.js';
import { loadSession, persistErrorState } from '../session/session.js';
import { OllamaProvider } from '../providers/ollama.js';
import { runInterviewLoop } from '../interview/controller.js';
import type { ModelProvider } from '../interview/controller.js';
import { buildInterviewSystemPrompt } from '../interview/prompts.js';
import { createFinishNowHandler } from '../interview/finish-now.js';
import { createModelHandler } from '../interview/model-command.js';
import { createProviderHandler } from '../interview/provider-command.js';
import { withRetry } from '../interview/retry.js';

type Screen = 'startup' | 'restored' | 'main' | 'error';

export interface ScreenControllerProps {
  startupPromise: Promise<StartupResult>;
  version: string;
}

export function ScreenController({ startupPromise, version }: ScreenControllerProps) {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>('startup');
  const [statusMessage] = useState('Starting cobuild...');
  const [sessionId, setSessionId] = useState('');
  const [sessionStage, setSessionStage] = useState<'interview' | 'spec'>('interview');
  const [errorMessage, setErrorMessage] = useState('');
  const [transcript, setTranscript] = useState<InterviewMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [interviewError, setInterviewError] = useState<string | null>(null);

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
            const s = loadSession(sessionId);
            if (s) {
              persistErrorState(s, `Model request failed after ${attempts} attempts: ${err.message}`);
            }
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
      const choice = await onUserInput();
      isSelectingModelRef.current = false;
      setIsThinking(true);
      const trimmed = choice.trim();
      if (!trimmed) return null;
      const byIndex = parseInt(trimmed, 10);
      if (!isNaN(byIndex) && byIndex >= 1 && byIndex <= models.length) {
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
        setInterviewError(msg);
        setIsThinking(false);
      });
  }, [screen, sessionId]);

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

  return (
    <App
      sessionId={sessionId}
      version={version}
      transcript={transcript}
      isThinking={isThinking}
      isComplete={interviewComplete}
      errorMessage={interviewError}
      onSubmit={handleSubmit}
    />
  );
}
