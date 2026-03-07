import { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export type GenerationStatus = 'generating' | 'success' | 'error';
export type GenerationStage = 'spec' | 'architecture' | 'plan';

export interface CompletedStage {
  label: string;
  filePath: string;
}

export interface GenerationScreenProps {
  status: GenerationStatus;
  filePath?: string;
  errorMessage?: string;
  currentStage?: GenerationStage;
  completedStages?: CompletedStage[];
}

const STAGE_LABELS: Record<GenerationStage, string> = {
  spec: 'Creating project specification...',
  architecture: 'Creating architecture document...',
  plan: 'Creating high-level development plan...',
};

const STAGE_HEADERS: Record<GenerationStage, string> = {
  spec: 'cobuild — Spec Generation',
  architecture: 'cobuild — Architecture Generation',
  plan: 'cobuild — Plan Generation',
};

export function GenerationScreen({
  status,
  filePath,
  errorMessage,
  currentStage = 'spec',
  completedStages = [],
}: GenerationScreenProps) {
  const { exit } = useApp();
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  useEffect(() => {
    if (status !== 'generating') return;
    const interval = setInterval(() => {
      setSpinnerFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (status !== 'success') return;
    const timer = setTimeout(() => exit(), 1500);
    return () => clearTimeout(timer);
  }, [status, exit]);

  useInput((char, key) => {
    if (status === 'error') {
      exit();
      process.exit(1);
    }
    if (key.ctrl && char === 'c') {
      exit();
    }
  });

  const header = status === 'success' && completedStages.length > 0
    ? 'cobuild — Generation Complete'
    : STAGE_HEADERS[currentStage];

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold color="cyan">
        {header}
      </Text>
      <Text> </Text>
      {completedStages.map((stage, i) => (
        <Box key={i} flexDirection="column">
          <Text color="green">{stage.label} done.</Text>
          <Text>
            {'  Saved to: '}
            <Text color="cyan">{stage.filePath}</Text>
          </Text>
        </Box>
      ))}
      {completedStages.length > 0 && status === 'generating' && <Text> </Text>}
      {status === 'generating' && (
        <Box>
          <Text color="yellow">
            {SPINNER_FRAMES[spinnerFrame]}
            {' '}
            {STAGE_LABELS[currentStage]}
          </Text>
        </Box>
      )}
      {status === 'success' && completedStages.length === 0 && (
        <Box flexDirection="column">
          <Text color="green">Specification generated successfully.</Text>
          <Text> </Text>
          <Text>
            {'Saved to: '}
            <Text color="cyan">{filePath}</Text>
          </Text>
        </Box>
      )}
      {status === 'success' && completedStages.length > 0 && (
        <Box flexDirection="column">
          <Text> </Text>
          <Text color="green">All artifacts generated successfully.</Text>
        </Box>
      )}
      {status === 'error' && (
        <Box flexDirection="column">
          <Text color="red">{'Error: '}{errorMessage ?? 'Spec generation failed.'}</Text>
          <Text> </Text>
          <Text dimColor>Press any key to exit.</Text>
        </Box>
      )}
    </Box>
  );
}
