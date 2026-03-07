import { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { InterviewMessage } from '../session/session.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SLASH_COMMANDS = ['/finish-now', '/model', '/provider'];
const ERROR_DISPLAY_MS = 5000;

export interface AppProps {
  sessionId: string;
  version: string;
  transcript?: InterviewMessage[];
  isThinking?: boolean;
  isComplete?: boolean;
  errorMessage?: string | null;
  fatalErrorMessage?: string | null;
  allowEmptySubmit?: boolean;
  onSubmit?: (input: string) => void;
}

export function App({
  sessionId,
  version,
  transcript = [],
  isThinking = false,
  isComplete = false,
  errorMessage = null,
  fatalErrorMessage = null,
  allowEmptySubmit = false,
  onSubmit,
}: AppProps) {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [visibleError, setVisibleError] = useState<string | null>(null);

  useEffect(() => {
    if (!isThinking) return;
    const interval = setInterval(() => {
      setSpinnerFrame(f => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, [isThinking]);

  useEffect(() => {
    if (!errorMessage) return;
    setVisibleError(errorMessage);
    const timer = setTimeout(() => setVisibleError(null), ERROR_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  useInput((char, key) => {
    if (key.ctrl && char === 'c') {
      exit();
      return;
    }

    if (key.return) {
      const trimmed = input.trim();
      if ((trimmed || allowEmptySubmit) && !isThinking) {
        onSubmit?.(trimmed);
        setInput('');
      }
      return;
    }

    if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
      return;
    }

    if (!key.ctrl && !key.meta && char) {
      setInput(prev => prev + char);
    }
  });

  return (
    <Box flexDirection="column">
      {/* Transcript area */}
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        {transcript.map((msg, i) => (
          <Box key={i} marginBottom={1}>
            <Text color={msg.role === 'assistant' ? 'cyan' : 'white'}>
              {msg.role === 'assistant' ? '◆ ' : '▶ '}
              {msg.content}
            </Text>
          </Box>
        ))}
        {isThinking && (
          <Box>
            <Text color="cyan">
              {SPINNER_FRAMES[spinnerFrame]}
              {' thinking...'}
            </Text>
          </Box>
        )}
      </Box>

      {/* Transient error */}
      {visibleError && (
        <Box paddingX={1} marginBottom={1}>
          <Text color="red">{'Error: '}{visibleError}</Text>
        </Box>
      )}

      {/* Status bar */}
      <Box borderStyle="single" paddingX={1}>
        <Text color={isComplete ? 'magenta' : isThinking ? 'yellow' : 'green'}>
          {isComplete ? '[complete]' : isThinking ? '[thinking]' : '[ready]'}
        </Text>
        <Text dimColor>
          {'  cobuild v'}
          {version}
          {'  session: '}
          {sessionId.slice(0, 8)}
        </Text>
      </Box>

      {fatalErrorMessage ? (
        <Box paddingX={1} paddingY={1} flexDirection="column">
          <Text color="red">Fatal error: {fatalErrorMessage}</Text>
          <Text dimColor>Press ctrl+c to exit.</Text>
        </Box>
      ) : isComplete ? (
        <Box paddingX={1} paddingY={1}>
          <Text color="magenta">Interview complete. Press ctrl+c to exit.</Text>
        </Box>
      ) : (
        <>
          {/* Input prompt area */}
          <Box paddingX={1} paddingY={1}>
            <Text bold color="cyan">
              {'▶ '}
            </Text>
            <Text>{input}</Text>
            {!isThinking && <Text>{'█'}</Text>}
          </Box>

          {/* Footer: slash commands */}
          <Box paddingX={1}>
            <Text dimColor>
              {SLASH_COMMANDS.join('  ')}
              {'  ctrl+c: quit'}
            </Text>
          </Box>
        </>
      )}
    </Box>
  );
}
