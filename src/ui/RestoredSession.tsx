import { useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { getLogger } from '../logging/logger.js';

export interface RestoredSessionProps {
  sessionId: string;
  stage?: 'interview' | 'spec' | 'architecture' | 'plan';
  onContinue: () => void;
}

export function RestoredSession({ sessionId, stage = 'interview' as const, onContinue }: RestoredSessionProps) {
  const { exit } = useApp();

  useEffect(() => {
    getLogger().info(`restoring session: ${sessionId}`);
  }, [sessionId]);

  useInput((char, key) => {
    if (key.ctrl && char === 'c') {
      exit();
      return;
    }
    if (key.return) {
      getLogger().info(`session restore continued: ${sessionId}`);
      onContinue();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold color="cyan">
        cobuild — Session Restored
      </Text>
      <Text> </Text>
      <Text>Resuming previous session:</Text>
      <Text dimColor>{'  Session: '}{sessionId.slice(0, 8)}</Text>
      <Text dimColor>{'  Stage:   '}{stage}</Text>
      <Text> </Text>
      <Text dimColor>Press Enter to continue...</Text>
    </Box>
  );
}
