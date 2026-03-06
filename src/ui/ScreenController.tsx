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
  const [statusMessages, setStatusMessages] = useState<string[]>(['Starting cobuild...']);
  const [sessionId, setSessionId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    startupPromise.then(result => {
      if (result.success) {
        setSessionId(result.sessionId ?? '');
        setStatusMessages(prev => [...prev, 'Ready.']);
        setScreen('main');
      } else {
        setErrorMessage(result.message);
        setScreen('error');
        setTimeout(() => {
          exit();
          process.exit(1);
        }, 100);
      }
    });
  }, []);

  if (screen === 'startup') {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Text bold color="cyan">
          cobuild v{version}
        </Text>
        {statusMessages.map((msg, i) => (
          <Text key={i} dimColor>
            {'  '}
            {msg}
          </Text>
        ))}
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
