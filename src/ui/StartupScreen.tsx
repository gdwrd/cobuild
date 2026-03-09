import { Box, Text } from 'ink';
import type { StartupStep } from '../cli/app-shell.js';

export interface StartupScreenProps {
  version: string;
  steps?: ReadonlyArray<StartupStep>;
}

function stepIcon(status: StartupStep['status']): string {
  switch (status) {
    case 'ok':
      return '✓';
    case 'warning':
      return '⚠';
    case 'failed':
      return '✗';
    case 'running':
      return '⟳';
    case 'pending':
      return '·';
  }
}

function stepColor(status: StartupStep['status']): string {
  switch (status) {
    case 'ok':
      return 'green';
    case 'warning':
      return 'yellow';
    case 'failed':
      return 'red';
    case 'running':
      return 'cyan';
    case 'pending':
      return 'gray';
  }
}

export function StartupScreen({ version, steps }: StartupScreenProps) {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold color="cyan">
        cobuild v{version}
      </Text>
      <Text> </Text>
      {steps && steps.length > 0 ? (
        steps.map((step) => (
          <Box key={step.id} flexDirection="column">
            <Box flexDirection="row" gap={1}>
              <Text color={stepColor(step.status)}>{stepIcon(step.status)}</Text>
              <Text dimColor={step.status === 'pending'}>{step.label}</Text>
              {step.detail && step.status === 'failed' && (
                <Text color="red"> — {step.detail}</Text>
              )}
              {step.detail && step.status === 'warning' && (
                <Text color="yellow"> — {step.detail}</Text>
              )}
              {step.detail && step.status !== 'failed' && step.status !== 'warning' && (
                <Text dimColor> — {step.detail}</Text>
              )}
            </Box>
            {step.actionHint && (
              <Box paddingLeft={3}>
                <Text color="cyan">{'→ '}{step.actionHint}</Text>
              </Box>
            )}
          </Box>
        ))
      ) : (
        <Text dimColor>{'  '}Starting cobuild...</Text>
      )}
    </Box>
  );
}
