import { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { InterviewMessage } from '../session/session.js';
import { ModelSelectPrompt } from './ModelSelectPrompt.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Maximum number of transcript messages to display at once. */
export const MAX_VISIBLE_MESSAGES = 10;

/** Number of messages to scroll per PageUp/PageDown key press. */
const SCROLL_STEP = 3;

// ---------------------------------------------------------------------------
// TranscriptView — bounded viewport over the interview message history
// ---------------------------------------------------------------------------

/**
 * Props for the TranscriptView sub-component.
 * Owns only display concerns; all state lives in the parent App.
 */
export interface TranscriptViewProps {
  transcript: InterviewMessage[];
  isThinking: boolean;
  spinnerFrame: number;
  /**
   * Number of messages to offset from the bottom of the transcript.
   * 0 = auto-follow (show the latest messages).
   * N = show messages ending N positions before the last message.
   */
  scrollOffset: number;
}

/**
 * TranscriptView — renders a bounded window over the interview transcript.
 *
 * When the transcript exceeds MAX_VISIBLE_MESSAGES, only the relevant slice is
 * shown. The user can scroll back through history using PageUp/PageDown. When
 * scrollOffset is 0, the viewport auto-follows new messages as they arrive.
 *
 * Indicators are shown above and below when content is hidden:
 *   ↑ N earlier messages — PgUp/PgDn to scroll
 *   ↓ N newer messages — PgDn to follow
 */
export function TranscriptView({
  transcript,
  isThinking,
  spinnerFrame,
  scrollOffset,
}: TranscriptViewProps) {
  // Clamp scrollOffset so we never go past the beginning of the transcript.
  const maxScrollBack = Math.max(0, transcript.length - MAX_VISIBLE_MESSAGES);
  const effectiveOffset = Math.min(scrollOffset, maxScrollBack);

  const endIdx = transcript.length - effectiveOffset;
  const startIdx = Math.max(0, endIdx - MAX_VISIBLE_MESSAGES);
  const visibleMessages = transcript.slice(startIdx, endIdx);

  const hiddenAbove = startIdx;
  const hiddenBelow = effectiveOffset;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {hiddenAbove > 0 && (
        <Box>
          <Text dimColor>
            {'↑ '}
            {hiddenAbove}
            {hiddenAbove === 1 ? ' earlier message' : ' earlier messages'}
            {' — PgUp/PgDn to scroll'}
          </Text>
        </Box>
      )}

      {visibleMessages.map((msg, i) =>
        msg.role === 'assistant' ? (
          <Box key={startIdx + i} flexDirection="column" marginBottom={1}>
            <Text color="cyan">{'◆ assistant'}</Text>
            <Box marginLeft={2}>
              <Text wrap="wrap">{msg.content}</Text>
            </Box>
          </Box>
        ) : (
          <Box key={startIdx + i} flexDirection="row" marginBottom={1}>
            <Text dimColor>{'▶ '}</Text>
            <Text wrap="wrap">{msg.content}</Text>
          </Box>
        ),
      )}

      {isThinking && effectiveOffset === 0 && (
        <Box>
          <Text color="cyan">
            {SPINNER_FRAMES[spinnerFrame]}
            {' thinking...'}
          </Text>
        </Box>
      )}

      {hiddenBelow > 0 && (
        <Box>
          <Text dimColor>
            {'↓ '}
            {hiddenBelow}
            {hiddenBelow === 1 ? ' newer message' : ' newer messages'}
            {' — PgDn to follow'}
          </Text>
        </Box>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// InterviewInput — cursor-aware input display
// ---------------------------------------------------------------------------

/**
 * Props for the InterviewInput sub-component.
 * Owns only display concerns; all editing state lives in the parent App.
 */
export interface InterviewInputProps {
  /** Current value of the input buffer. */
  value: string;
  /** Cursor position as an index into value (0 = before first char). */
  cursorPos: number;
  /** When true, the input is disabled and shown in dim style. */
  isThinking: boolean;
}

/**
 * InterviewInput — renders the current user input with a visible cursor.
 *
 * The cursor is shown as an inverse-highlighted character when positioned
 * inside existing text, or as a block (█) when at the end of the buffer.
 * When the buffer is empty and not thinking, a hint guides the user to type
 * a message or enter /help.
 *
 * Input editing keys are handled by the parent App component; this component
 * is purely a display layer.
 */
export function InterviewInput({ value, cursorPos, isThinking }: InterviewInputProps) {
  const before = value.slice(0, cursorPos);
  const atCursor = value[cursorPos] ?? '';
  const after = value.slice(cursorPos + 1);
  const isEmpty = value.length === 0;

  return (
    <Box paddingX={1} paddingY={1} flexDirection="column">
      {isEmpty && !isThinking && (
        <Box>
          <Text dimColor>{'Type a message, or /help for commands'}</Text>
        </Box>
      )}
      <Box flexDirection="row">
        <Text bold color="cyan">{'▶ '}</Text>
        {isThinking ? (
          <Text dimColor>{value}</Text>
        ) : (
          <>
            <Text>{before}</Text>
            {atCursor ? (
              <>
                <Text inverse>{atCursor}</Text>
                <Text>{after}</Text>
              </>
            ) : (
              <Text>{'█'}</Text>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// App — interview screen orchestrator
// ---------------------------------------------------------------------------

/**
 * App — the interview (main) screen view.
 *
 * Composes TranscriptView and InterviewInput, managing their shared state:
 *   - input buffer and cursor position (edited via keyboard)
 *   - transcript scroll offset (PageUp / PageDown)
 *   - spinner frame for the thinking indicator
 *
 * Shared chrome (status bar, notices, footer) is provided by the surrounding
 * AppShell in ScreenController; this component renders only interview content.
 *
 * Supported editing keys:
 *   ← / →       move cursor left / right
 *   ctrl+a      move cursor to start of line
 *   ctrl+e      move cursor to end of line
 *   Backspace   delete character before cursor
 *   Delete      delete character at cursor
 *   Enter       submit input (trims whitespace)
 *   PgUp        scroll transcript back SCROLL_STEP messages
 *   PgDn        scroll transcript forward SCROLL_STEP messages (toward bottom)
 *   ctrl+c      quit
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
  /** Active model name, passed to ModelSelectPrompt for current-model context. */
  currentModel?: string;
  onSubmit?: (input: string) => void;
}

export function App({
  transcript = [],
  isThinking = false,
  isComplete = false,
  fatalErrorMessage = null,
  allowEmptySubmit = false,
  modelSelectOptions,
  currentModel,
  onSubmit,
}: AppProps) {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  // cursorPosRef mirrors cursorPos so useInput handlers always read the latest
  // value even when a second keystroke fires before the next re-render.
  const cursorPosRef = useRef(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  // Keep cursorPosRef in sync with cursorPos state after every render so that
  // rapid keystrokes handled before a re-render still read the correct position.
  useEffect(() => {
    cursorPosRef.current = cursorPos;
  });

  useEffect(() => {
    if (!isThinking) return;
    const interval = setInterval(() => {
      setSpinnerFrame(f => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, [isThinking]);

  // Auto-scroll to bottom when the model finishes thinking so the new response
  // is visible even if the user scrolled back during the wait.
  const prevIsThinkingRef = useRef(false);
  useEffect(() => {
    if (prevIsThinkingRef.current && !isThinking) {
      setScrollOffset(0);
    }
    prevIsThinkingRef.current = isThinking;
  }, [isThinking]);

  useInput((char, key) => {
    if (key.ctrl && char === 'c') {
      exit();
      return;
    }

    // While model selection is active, ModelSelectPrompt handles all input.
    const isModelSelecting = Boolean(modelSelectOptions && modelSelectOptions.length > 0);
    if (isModelSelecting) return;

    // Transcript scrollback
    if (key.pageUp) {
      setScrollOffset(prev => {
        const maxScrollBack = Math.max(0, transcript.length - MAX_VISIBLE_MESSAGES);
        return Math.min(prev + SCROLL_STEP, maxScrollBack);
      });
      return;
    }
    if (key.pageDown) {
      setScrollOffset(prev => Math.max(0, prev - SCROLL_STEP));
      return;
    }

    // Submit
    if (key.return) {
      const trimmed = input.trim();
      if ((trimmed || allowEmptySubmit) && !isThinking) {
        onSubmit?.(trimmed);
        setInput('');
        setCursorPos(0);
        cursorPosRef.current = 0;
        setScrollOffset(0);
      }
      return;
    }

    // Cursor movement
    if (key.leftArrow) {
      const newPos = Math.max(0, cursorPosRef.current - 1);
      setCursorPos(newPos);
      cursorPosRef.current = newPos;
      return;
    }
    if (key.rightArrow) {
      const newPos = Math.min(input.length, cursorPosRef.current + 1);
      setCursorPos(newPos);
      cursorPosRef.current = newPos;
      return;
    }

    // ctrl+a / ctrl+e: POSIX readline home / end
    if (key.ctrl && char === 'a') {
      setCursorPos(0);
      cursorPosRef.current = 0;
      return;
    }
    if (key.ctrl && char === 'e') {
      setCursorPos(input.length);
      cursorPosRef.current = input.length;
      return;
    }

    // Backspace: delete character before cursor
    if (key.backspace) {
      const pos = cursorPosRef.current;
      if (pos > 0) {
        setInput(prev => prev.slice(0, pos - 1) + prev.slice(pos));
        setCursorPos(pos - 1);
        cursorPosRef.current = pos - 1;
      }
      return;
    }

    // Delete: delete character at cursor (forward delete)
    if (key.delete) {
      const pos = cursorPosRef.current;
      setInput(prev => (pos < prev.length ? prev.slice(0, pos) + prev.slice(pos + 1) : prev));
      // cursorPos stays the same
      return;
    }

    // Insert character at cursor position
    if (!key.ctrl && !key.meta && char) {
      const pos = cursorPosRef.current;
      setInput(prev => prev.slice(0, pos) + char + prev.slice(pos));
      setCursorPos(pos + 1);
      cursorPosRef.current = pos + 1;
    }
  });

  return (
    <Box flexDirection="column">
      <TranscriptView
        transcript={transcript}
        isThinking={isThinking}
        spinnerFrame={spinnerFrame}
        scrollOffset={scrollOffset}
      />

      {modelSelectOptions && modelSelectOptions.length > 0 && (
        <ModelSelectPrompt
          models={modelSelectOptions}
          currentModel={currentModel}
          onSelect={onSubmit}
        />
      )}

      {fatalErrorMessage ? (
        <Box paddingX={1} paddingY={1} flexDirection="column">
          <Text color="red">Fatal error: {fatalErrorMessage}</Text>
        </Box>
      ) : isComplete ? (
        <Box paddingX={1} paddingY={1}>
          <Text color="magenta">Interview complete.</Text>
        </Box>
      ) : modelSelectOptions && modelSelectOptions.length > 0 ? null : (
        <InterviewInput value={input} cursorPos={cursorPos} isThinking={isThinking} />
      )}
    </Box>
  );
}
