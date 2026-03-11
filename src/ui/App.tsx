import { useReducer, useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp, useStdin } from 'ink';
import type { InterviewMessage } from '../session/session.js';
import { ModelSelectPrompt } from './ModelSelectPrompt.js';
import { InterviewLogo } from './InterviewLogo.js';
import { filterCommands } from '../interview/commands.js';
import type { CommandMetadata } from '../interview/commands.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

// ---------------------------------------------------------------------------
// Input state reducer — pure, tested editing logic
// ---------------------------------------------------------------------------

/** Combined value + cursor state for the interview input buffer. */
export interface InputState {
  value: string;
  /** Cursor position as an index into value (0 = before first char). */
  cursorPos: number;
}

/** Discrete editing operations dispatched from the keyboard handler. */
export type InputAction =
  | { type: 'insert'; char: string }
  | { type: 'backspace' }
  | { type: 'delete' }
  | { type: 'left' }
  | { type: 'right' }
  | { type: 'home' }
  | { type: 'end' }
  | { type: 'clear' };

const INITIAL_INPUT_STATE: InputState = { value: '', cursorPos: 0 };

type InkInputKey = {
  backspace?: boolean;
  delete?: boolean;
};

/**
 * Normalize terminal-specific backspace encodings so editing behavior remains
 * consistent across terminals and shell configurations.
 */
export function isBackspaceKey(char: string, key: InkInputKey): boolean {
  return Boolean(key.backspace || char === '\x7f' || char === '\b');
}

/**
 * Ink parses raw DEL (\x7f) as "delete", even though many terminals emit it
 * for the Backspace key. Use the raw sequence to keep forward-delete intact.
 */
export function isDeleteKey(rawSequence: string | undefined, key: InkInputKey): boolean {
  if (!key.delete) return false;
  return rawSequence !== '\x7f' && rawSequence !== '\x1b\x7f';
}

/**
 * Pure reducer for interview input editing.
 *
 * Each action operates on the committed state it receives, so chained
 * React dispatches (rapid keypresses before a re-render) always see the
 * correct buffer and cursor rather than a stale snapshot.
 */
export function inputReducer(state: InputState, action: InputAction): InputState {
  const { value, cursorPos } = state;
  switch (action.type) {
    case 'insert':
      return {
        value: value.slice(0, cursorPos) + action.char + value.slice(cursorPos),
        cursorPos: cursorPos + 1,
      };
    case 'backspace':
      if (cursorPos === 0) return state;
      return {
        value: value.slice(0, cursorPos - 1) + value.slice(cursorPos),
        cursorPos: cursorPos - 1,
      };
    case 'delete':
      if (cursorPos >= value.length) return state;
      return {
        value: value.slice(0, cursorPos) + value.slice(cursorPos + 1),
        cursorPos,
      };
    case 'left':
      return { value, cursorPos: Math.max(0, cursorPos - 1) };
    case 'right':
      return { value, cursorPos: Math.min(value.length, cursorPos + 1) };
    case 'home':
      return { value, cursorPos: 0 };
    case 'end':
      return { value, cursorPos: value.length };
    case 'clear':
      return INITIAL_INPUT_STATE;
  }
}

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
// CommandAutocomplete — slash command suggestion list
// ---------------------------------------------------------------------------

/** Props for the CommandAutocomplete sub-component. */
export interface CommandAutocompleteProps {
  /** Filtered command suggestions to display. */
  items: CommandMetadata[];
  /** Index of the currently highlighted suggestion (0-based). */
  selectedIndex: number;
}

/**
 * CommandAutocomplete — renders a command palette suggestion list above the
 * interview input when the user starts typing a slash command.
 *
 * Navigation and selection are handled by the parent App; this component is
 * purely a display layer.
 */
export function CommandAutocomplete({ items, selectedIndex }: CommandAutocompleteProps) {
  if (items.length === 0) return null;

  const clampedIndex = Math.min(selectedIndex, items.length - 1);

  return (
    <Box flexDirection="column" paddingX={1} marginBottom={1}>
      {items.map((item, i) => {
        const isSelected = i === clampedIndex;
        return (
          <Box key={item.name} flexDirection="row">
            <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
              {isSelected ? '▶ ' : '  '}
              {item.usage.padEnd(28)}
            </Text>
            <Text dimColor>{item.description}</Text>
          </Box>
        );
      })}
      <Box marginTop={1}>
        <Text dimColor>{'↑/↓ navigate  Enter run  Esc cancel'}</Text>
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
 * Composes TranscriptView, CommandAutocomplete, and InterviewInput, managing
 * their shared state:
 *   - input buffer and cursor position (edited via keyboard)
 *   - autocomplete suggestions and selected index (active when typing '/')
 *   - transcript scroll offset (PageUp / PageDown)
 *   - spinner frame for the thinking indicator
 *
 * Shared chrome (status bar, notices, footer) is provided by the surrounding
 * AppShell in ScreenController; this component renders only interview content.
 *
 * Supported editing keys:
 *   ← / →       move cursor left / right
 *   ↑ / ↓       navigate autocomplete suggestions (when open)
 *   ctrl+a      move cursor to start of line
 *   ctrl+e      move cursor to end of line
 *   Backspace   delete character before cursor
 *   Delete      delete character at cursor
 *   Enter       submit input, or execute highlighted autocomplete suggestion
 *   Esc         cancel autocomplete (clears the input buffer)
 *   PgUp        scroll transcript back SCROLL_STEP messages
 *   PgDn        scroll transcript forward SCROLL_STEP messages (toward bottom)
 *   ctrl+c      quit
 *
 * Autocomplete activates automatically when the buffer starts with '/' and
 * contains no spaces. It filters COMMAND_DEFINITIONS by the typed prefix and
 * shows matching suggestions with usage text and a brief description.
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
  const { internal_eventEmitter } = useStdin();
  const [inputState, dispatch] = useReducer(inputReducer, INITIAL_INPUT_STATE);
  // inputStateRef mirrors the committed inputState so the submit handler always
  // reads the latest value even when a keystroke fires before the next re-render.
  const inputStateRef = useRef(INITIAL_INPUT_STATE);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  // Autocomplete selection index — kept in both state (for rendering) and ref
  // (for reading inside useInput without stale-closure issues).
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const autocompleteIndexRef = useRef(0);
  const lastRawInputRef = useRef('');

  // isThinkingRef mirrors the isThinking prop so that useInput always reads
  // the latest value without stale-closure issues (Ink batches subscriptions).
  const isThinkingRef = useRef(isThinking);

  // Keep refs in sync with committed state after every render.
  useEffect(() => {
    inputStateRef.current = inputState;
    isThinkingRef.current = isThinking;
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

  // Reset autocomplete selection index whenever the input value or thinking state
  // changes so that newly filtered results always start highlighted at the first item.
  useEffect(() => {
    autocompleteIndexRef.current = 0;
    setAutocompleteIndex(0);
  }, [inputState.value, isThinking]);

  useEffect(() => {
    const handleRawInput = (data: string | Buffer) => {
      lastRawInputRef.current = typeof data === 'string' ? data : data.toString('utf8');
    };

    internal_eventEmitter?.on('input', handleRawInput);
    return () => {
      internal_eventEmitter?.removeListener('input', handleRawInput);
    };
  }, [internal_eventEmitter]);

  useInput((char, key) => {
    if (key.ctrl && char === 'c') {
      exit();
      return;
    }

    // While model selection is active, ModelSelectPrompt handles all input.
    const isModelSelecting = Boolean(modelSelectOptions && modelSelectOptions.length > 0);
    if (isModelSelecting) return;

    // Compute current autocomplete state once from the latest refs so all key
    // handlers below see a consistent snapshot without stale-closure issues.
    const currentValue = inputStateRef.current.value;
    const currentlyThinking = isThinkingRef.current;
    const autocompleteActive =
      !currentlyThinking && currentValue.startsWith('/') && !currentValue.includes(' ');
    const items = autocompleteActive ? filterCommands(currentValue) : [];

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

    // Up/Down: navigate autocomplete suggestions when the palette is open.
    if (key.upArrow) {
      if (items.length > 0) {
        const next = Math.max(0, autocompleteIndexRef.current - 1);
        autocompleteIndexRef.current = next;
        setAutocompleteIndex(next);
        return;
      }
    }
    if (key.downArrow) {
      if (items.length > 0) {
        const next = Math.min(items.length - 1, autocompleteIndexRef.current + 1);
        autocompleteIndexRef.current = next;
        setAutocompleteIndex(next);
        return;
      }
    }

    // Escape: cancel autocomplete by clearing the input buffer whenever it
    // starts with '/', regardless of whether suggestions are currently visible.
    if (key.escape) {
      if (currentValue.startsWith('/')) {
        dispatch({ type: 'clear' });
      }
      return;
    }

    // Submit — execute the highlighted autocomplete suggestion when the palette
    // is open; otherwise submit the raw input as normal.
    if (key.return) {
      if (items.length > 0 && !currentlyThinking) {
        const selected = items[Math.min(autocompleteIndexRef.current, items.length - 1)];
        if (selected) {
          onSubmit?.(selected.name);
          dispatch({ type: 'clear' });
          setScrollOffset(0);
        }
        return;
      }

      // Normal submit — read latest value via ref so a character typed just before
      // Enter is not lost to a stale state snapshot.
      const trimmed = inputStateRef.current.value.trim();
      if ((trimmed || allowEmptySubmit) && !currentlyThinking) {
        onSubmit?.(trimmed);
        dispatch({ type: 'clear' });
        setScrollOffset(0);
      }
      return;
    }

    // Cursor movement
    if (key.leftArrow) {
      dispatch({ type: 'left' });
      return;
    }
    if (key.rightArrow) {
      dispatch({ type: 'right' });
      return;
    }

    // ctrl+a / ctrl+e: POSIX readline home / end
    if (key.ctrl && char === 'a') {
      dispatch({ type: 'home' });
      return;
    }
    if (key.ctrl && char === 'e') {
      dispatch({ type: 'end' });
      return;
    }

    // Normalize common terminal backspace encodings before checking delete.
    // Many terminals send DEL (\x7f) or BS (\x08 / ctrl+h) for Backspace.
    if (isBackspaceKey(char, key) || (key.delete && lastRawInputRef.current === '\x7f')) {
      dispatch({ type: 'backspace' });
      return;
    }

    // Delete: delete character at cursor (forward delete)
    if (isDeleteKey(lastRawInputRef.current, key)) {
      dispatch({ type: 'delete' });
      return;
    }

    // Insert character at cursor position
    if (!key.ctrl && !key.meta && char) {
      dispatch({ type: 'insert', char });
    }
  });

  // Derive current autocomplete items for rendering.
  const isModelSelecting = Boolean(modelSelectOptions && modelSelectOptions.length > 0);
  const autocompleteItems: CommandMetadata[] = (() => {
    const v = inputState.value;
    if (isThinking || isModelSelecting || !v.startsWith('/') || v.includes(' ')) return [];
    return filterCommands(v);
  })();

  // Show the logo only on the welcome/empty state: no messages yet, not thinking,
  // not complete, not selecting a model, and no fatal error.
  const showLogo =
    transcript.length === 0 &&
    !isThinking &&
    !isComplete &&
    !fatalErrorMessage &&
    !(modelSelectOptions && modelSelectOptions.length > 0);

  return (
    <Box flexDirection="column">
      {showLogo && <InterviewLogo />}
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
        <>
          {autocompleteItems.length > 0 && (
            <CommandAutocomplete items={autocompleteItems} selectedIndex={autocompleteIndex} />
          )}
          <InterviewInput value={inputState.value} cursorPos={inputState.cursorPos} isThinking={isThinking} />
        </>
      )}
    </Box>
  );
}
