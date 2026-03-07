import { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export type GenerationStatus = 'generating' | 'success' | 'error';

export interface GenerationScreenProps {
  status: GenerationStatus;
  filePath?: string;
  errorMessage?: string;
}

export function GenerationScreen({ status, filePath, errorMessage }: GenerationScreenProps) {
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
    if (key.ctrl && char === 'c') {
      exit();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold color="cyan">
        cobuild — Spec Generation
      </Text>
      <Text> </Text>
      {status === 'generating' && (
        <Box>
          <Text color="yellow">
            {SPINNER_FRAMES[spinnerFrame]}
            {' Creating project specification...'}
          </Text>
        </Box>
      )}
      {status === 'success' && (
        <Box flexDirection="column">
          <Text color="green">Specification generated successfully.</Text>
          <Text> </Text>
          <Text>
            {'Saved to: '}
            <Text color="cyan">{filePath}</Text>
          </Text>
        </Box>
      )}
      {status === 'error' && (
        <Box flexDirection="column">
          <Text color="red">{'Error: '}{errorMessage ?? 'Spec generation failed.'}</Text>
          <Text dimColor>Press ctrl+c to exit.</Text>
        </Box>
      )}
    </Box>
  );
}
