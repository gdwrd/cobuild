import { useState, useEffect } from 'react';
import { Box, Text, useApp } from 'ink';
import type { StartupResult } from '../cli/app-shell.js';
import { App } from './App.js';

type Screen = 'startup' | 'main' | 'error';

export interface ScreenControllerProps {
  startupPromise: Promise<StartupResult>;
  version: string;
}

export function ScreenController({ startupPromise, version }: ScreenControllerProps) {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>('startup');
  const [statusMessage] = useState('Starting cobuild...');
  const [sessionId, setSessionId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    startupPromise
      .then(result => {
        if (result.success) {
          setSessionId(result.sessionId ?? '');
          setScreen('main');
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

  if (screen === 'error') {
    return (
      <Box paddingX={1} paddingY={1}>
        <Text color="red">Error: {errorMessage}</Text>
      </Box>
    );
  }

  return <App sessionId={sessionId} version={version} />;
}
