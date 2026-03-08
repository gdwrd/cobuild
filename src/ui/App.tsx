import { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { InterviewMessage } from '../session/session.js';
import { ModelSelectPrompt } from './ModelSelectPrompt.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * App — the interview (main) screen view.
 *
 * Renders only interview-specific content: transcript, thinking spinner, input
 * prompt, and fatal-error state. Shared chrome (status bar, notices, footer)
 * is provided by the surrounding AppShell in ScreenController.
 *
 * Transcript layout:
 *   - Assistant turns: leading ◆ in cyan, content below with left indent
 *   - User turns: leading ▶ in white/dim, content inline
 *   - Turns separated by a blank line for easy scanning
 *
 * When modelSelectOptions is provided, a ModelSelectPrompt is shown above
 * the input area instead of appending a plain-text list to the transcript.
 */
export interface AppProps {
  transcript?: InterviewMessage[];
  isThinking?: boolean;
  isComplete?: boolean;
  fatalErrorMessage?: string | null;
  allowEmptySubmit?: boolean;
  /** When set, show a dedicated model selection UI instead of a transcript message. */
  modelSelectOptions?: string[];
  onSubmit?: (input: string) => void;
}

export function App({
  transcript = [],
  isThinking = false,
  isComplete = false,
  fatalErrorMessage = null,
  allowEmptySubmit = false,
  modelSelectOptions,
  onSubmit,
}: AppProps) {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  useEffect(() => {
    if (!isThinking) return;
    const interval = setInterval(() => {
      setSpinnerFrame(f => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, [isThinking]);

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
        {transcript.map((msg, i) =>
          msg.role === 'assistant' ? (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <Text color="cyan">{'◆ assistant'}</Text>
              <Box marginLeft={2}>
                <Text wrap="wrap">{msg.content}</Text>
              </Box>
            </Box>
          ) : (
            <Box key={i} flexDirection="row" marginBottom={1}>
              <Text dimColor>{'▶ '}</Text>
              <Text wrap="wrap">{msg.content}</Text>
            </Box>
          ),
        )}
        {isThinking && (
          <Box>
            <Text color="cyan">
              {SPINNER_FRAMES[spinnerFrame]}
              {' thinking...'}
            </Text>
          </Box>
        )}
      </Box>

      {/* Model selection prompt — shown instead of transcript message when selecting */}
      {modelSelectOptions && modelSelectOptions.length > 0 && (
        <ModelSelectPrompt models={modelSelectOptions} />
      )}

      {/* Interview state / input area */}
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
        <Box paddingX={1} paddingY={1}>
          <Text bold color="cyan">
            {'▶ '}
          </Text>
          <Text>{input}</Text>
          {!isThinking && <Text>{'█'}</Text>}
        </Box>
      )}
    </Box>
  );
}
