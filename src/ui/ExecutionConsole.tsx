import { Box, Text } from 'ink';
import type { ExecutionState, ExecutionUserAction, ValidationCommandProgress } from './types.js';

/**
 * ExecutionConsole — terminal output pane for long-running subprocess execution.
 *
 * This component is intentionally dormant: it is fully implemented and tested,
 * but no ScreenController code transitions to the 'execution' screen yet.
 * When a ralphex runner is wired in, add 'execution' to ScreenController's
 * render switch and supply:
 *   - executionState (driven by applyExecutionEvent reducer)
 *   - onUserAction handler for retry / continue / inspect-logs
 *
 * The component does NOT assume ralphex specifically — any subprocess runner
 * that emits ExecutionEvent values can drive it.
 */

/** Maximum number of output lines shown in the console pane. */
const MAX_VISIBLE_LINES = 20;

export interface ExecutionConsoleProps {
  /** Current execution state, typically managed via useReducer(applyExecutionEvent, ...). */
  state: ExecutionState;
  /** Called when the user triggers a wrapper action (retry, continue, inspect-logs). */
  onUserAction?: (action: ExecutionUserAction) => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TaskHeader({ state }: { state: ExecutionState }) {
  if (!state.currentTask) {
    if (state.phase === 'preflight') {
      return (
        <Box paddingBottom={1}>
          <Text color="yellow">Running preflight checks...</Text>
        </Box>
      );
    }
    if (state.phase === 'idle') {
      return (
        <Box paddingBottom={1}>
          <Text dimColor>Execution ready. Waiting to start.</Text>
        </Box>
      );
    }
    return null;
  }

  const { label, phaseNumber, phaseTitle, planFile } = state.currentTask;
  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Box>
        <Text bold>{label || `Phase ${phaseNumber}: ${phaseTitle}`}</Text>
      </Box>
      <Box>
        <Text dimColor>Plan: </Text>
        <Text color="cyan">{planFile}</Text>
      </Box>
    </Box>
  );
}

function OutputPane({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  const visible = lines.slice(-MAX_VISIBLE_LINES);
  const truncated = lines.length - visible.length;
  return (
    <Box flexDirection="column" borderStyle="single" paddingX={1} paddingY={0}>
      {truncated > 0 && (
        <Text dimColor>{`... ${truncated} earlier line${truncated === 1 ? '' : 's'} hidden`}</Text>
      )}
      {visible.map((line, i) => (
        <Text key={i} wrap="wrap">
          {line}
        </Text>
      ))}
    </Box>
  );
}

function ValidationRow({ entry }: { entry: ValidationCommandProgress }) {
  const icon =
    entry.status === 'passed'
      ? { char: '✓', color: 'green' as const }
      : entry.status === 'failed'
        ? { char: '✕', color: 'red' as const }
        : entry.status === 'running'
          ? { char: '⠋', color: 'yellow' as const }
          : { char: '○', color: undefined as undefined };

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={icon.color}>{icon.char} </Text>
        <Text>{entry.command}</Text>
        {entry.exitCode !== undefined && entry.exitCode !== 0 && (
          <Text color="red"> (exit {entry.exitCode})</Text>
        )}
      </Box>
      {entry.status === 'failed' && entry.output && (
        <Box paddingLeft={2}>
          <Text dimColor wrap="wrap">
            {entry.output}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function ValidationSection({ progress }: { progress: ValidationCommandProgress[] }) {
  if (progress.length === 0) return null;
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text dimColor>Validation:</Text>
      {progress.map((entry, i) => (
        <ValidationRow key={i} entry={entry} />
      ))}
    </Box>
  );
}

function StatusFooter({
  state,
  onUserAction,
}: {
  state: ExecutionState;
  onUserAction?: (action: ExecutionUserAction) => void;
}) {
  if (state.phase === 'complete') {
    return (
      <Box marginTop={1}>
        <Text color="green">Execution complete.</Text>
      </Box>
    );
  }

  if (state.phase === 'failed') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="red">Execution failed.</Text>
        {state.failureReason && <Text dimColor>{state.failureReason}</Text>}
        <Box marginTop={1}>
          <Text dimColor>
            Press{' '}
            <Text bold>R</Text>
            {' to retry, '}
            <Text bold>L</Text>
            {' to inspect logs, or '}
            <Text bold>ctrl+c</Text>
            {' to quit.'}
          </Text>
        </Box>
      </Box>
    );
  }

  if (state.phase === 'awaiting-confirmation') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text color="yellow">{state.confirmationMessage ?? 'Continue?'}</Text>
        <Text dimColor>
          Press <Text bold>y</Text> to continue or <Text bold>ctrl+c</Text> to quit.
        </Text>
      </Box>
    );
  }

  // Suppress unused variable warning — onUserAction is part of the component contract
  void onUserAction;
  return null;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ExecutionConsole({ state, onUserAction }: ExecutionConsoleProps) {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <TaskHeader state={state} />
      <OutputPane lines={state.outputLines} />
      <ValidationSection progress={state.validationProgress} />
      <StatusFooter state={state} onUserAction={onUserAction} />
    </Box>
  );
}
