import { useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { getLogger } from '../logging/logger.js';

export interface RestoredSessionProps {
  sessionId: string;
  stage?: 'interview' | 'spec' | 'architecture' | 'plan' | 'dev-plans';
  provider?: string;
  model?: string;
  providerReady?: boolean;
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

function nextActionLabel(
  stage: 'interview' | 'spec' | 'architecture' | 'plan' | 'dev-plans',
  devPlanProgress?: { completed: number; total: number },
  providerReady?: boolean,
): string {
  if (providerReady === false) {
    return 'Provider unavailable — use /provider to switch before continuing';
  }
  switch (stage) {
    case 'interview':
      return 'Resume interview';
    case 'spec':
    case 'architecture':
    case 'plan':
      return 'Resume artifact generation';
    case 'dev-plans': {
      if (devPlanProgress) {
        const remaining = devPlanProgress.total - devPlanProgress.completed;
        return `Resume dev plan generation (${remaining} phase${remaining === 1 ? '' : 's'} remaining)`;
      }
      return 'Resume dev plan generation';
    }
  }
}

export function RestoredSession({
  sessionId,
  stage = 'interview',
  provider,
  model,
  providerReady,
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

  const providerIsReady = providerReady !== false;
  const nextAction = nextActionLabel(stage, devPlanProgress, providerReady);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text>Resuming previous session:</Text>
      <Text dimColor>{'  Session:  '}{sessionId.slice(0, 8)}</Text>
      <Text dimColor>{'  Stage:    '}{stageLabel(stage)}</Text>
      {provider && (
        <Box flexDirection="row">
          <Text dimColor>{'  Provider: '}{provider}</Text>
          {!providerIsReady && (
            <Text color="yellow"> (unavailable)</Text>
          )}
        </Box>
      )}
      {model && (
        <Text dimColor>{'  Model:    '}{model}</Text>
      )}
      {devPlanProgress !== undefined && (
        <Text dimColor>
          {'  Progress: '}
          {devPlanProgress.completed} of {devPlanProgress.total} phases complete
        </Text>
      )}
      <Text> </Text>
      <Box flexDirection="row">
        <Text dimColor>Next: </Text>
        <Text color={providerIsReady ? 'green' : 'yellow'}>{nextAction}</Text>
      </Box>
    </Box>
  );
}
