import { useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { getLogger } from '../logging/logger.js';

export interface RestoredSessionProps {
  sessionId: string;
  stage?: 'interview' | 'spec' | 'architecture' | 'plan' | 'dev-plans';
  devPlanProgress?: { completed: number; total: number };
  onContinue: () => void;
}

function stageLabel(stage: 'interview' | 'spec' | 'architecture' | 'plan' | 'dev-plans'): string {
  switch (stage) {
    case 'interview':
      return 'Interview in progress';
    case 'spec':
      return 'Spec generation';
    case 'architecture':
      return 'Architecture generation';
    case 'plan':
      return 'Plan generation';
    case 'dev-plans':
      return 'Dev plan generation';
  }
}

export function RestoredSession({
  sessionId,
  stage = 'interview',
  devPlanProgress,
  onContinue,
}: RestoredSessionProps) {
  const { exit } = useApp();

  useEffect(() => {
    const progressNote =
      devPlanProgress
        ? ` (${devPlanProgress.completed}/${devPlanProgress.total} phases complete)`
        : '';
    getLogger().info(`restoring session: ${sessionId} at stage ${stage}${progressNote}`);
  }, [sessionId, stage, devPlanProgress]);

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
      <Text dimColor>{'  Stage:   '}{stageLabel(stage)}</Text>
      {devPlanProgress !== undefined && (
        <Text dimColor>
          {'  Progress: '}
          {devPlanProgress.completed} of {devPlanProgress.total} phases complete
        </Text>
      )}
      <Text> </Text>
      <Text dimColor>Press Enter to continue...</Text>
    </Box>
  );
}
