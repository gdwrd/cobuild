import React from 'react';
import { Box, Text } from 'ink';
import type { FlowLifecyclePhase, FlowWrapperState } from './types.js';

/**
 * FlowWrapper — shared visual wrapper for long-running flows.
 *
 * Provides consistent chrome for the preflight → (start-confirmation) →
 * running → validating → failure/complete lifecycle used by both the
 * current artifact generation flow and the future ralphex execution flow.
 *
 * Non-interactive usage (artifact generation):
 *   <FlowWrapper state={{ phase: 'running', interactive: false }}>
 *     <GenerationScreen ... />
 *   </FlowWrapper>
 *
 * Interactive usage (future ralphex execution):
 *   <FlowWrapper
 *     state={{ phase: 'start-confirmation', interactive: true,
 *              confirmationMessage: 'Begin Phase 3?', metadata: {...} }}
 *     onConfirm={handleConfirm}
 *   >
 *     <ExecutionConsole ... />
 *   </FlowWrapper>
 *
 * The wrapper is intentionally thin — it adds header and footer chrome around
 * the phase-appropriate content, delegating detailed rendering to the child
 * component (GenerationScreen or ExecutionConsole). This keeps both flows
 * independent while sharing a consistent outer frame.
 */

export interface FlowWrapperProps {
  /** Current wrapper state (phase, metadata, interaction flags). */
  state: FlowWrapperState;
  /**
   * Called when the user confirms in 'start-confirmation' phase
   * (interactive flows only). The caller is responsible for advancing
   * state.phase to 'running'.
   */
  onConfirm?: () => void;
  /**
   * Content rendered when phase is 'running'. For generation flows this is
   * <GenerationScreen>; for execution flows this is <ExecutionConsole>.
   * Omitting children is valid for non-running phases.
   */
  children?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Phase-specific header and footer sub-components
// ---------------------------------------------------------------------------

function PreflightHeader() {
  return (
    <Box paddingBottom={1}>
      <Text color="yellow">⠋ </Text>
      <Text color="yellow">Running preflight checks...</Text>
    </Box>
  );
}

function StartConfirmationView({
  state,
  onConfirm,
}: {
  state: FlowWrapperState;
  onConfirm?: () => void;
}) {
  const { metadata, confirmationMessage } = state;
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {metadata && (
        <Box flexDirection="column" paddingBottom={1}>
          <Box>
            <Text dimColor>Plan: </Text>
            <Text color="cyan">{metadata.planFile}</Text>
          </Box>
          <Box>
            <Text dimColor>Task: </Text>
            <Text>{metadata.taskLabel}</Text>
          </Box>
        </Box>
      )}
      <Box paddingBottom={1}>
        <Text color="yellow">{confirmationMessage ?? 'Ready to begin. Continue?'}</Text>
      </Box>
      <Text dimColor>
        Press <Text bold>Enter</Text> to begin
        {onConfirm ? '' : ' (no handler registered)'}
        {', '}
        <Text bold>ctrl+c</Text>
        {' to quit.'}
      </Text>
    </Box>
  );
}

function MetadataHeader({ state }: { state: FlowWrapperState }) {
  const { metadata } = state;
  if (!metadata) return null;
  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Box>
        <Text dimColor>Plan: </Text>
        <Text color="cyan">{metadata.planFile}</Text>
      </Box>
      <Box>
        <Text dimColor>Task: </Text>
        <Text>{metadata.taskLabel}</Text>
      </Box>
    </Box>
  );
}

function ValidatingFooter({ state }: { state: FlowWrapperState }) {
  const { metadata } = state;
  if (!metadata) {
    return (
      <Box marginTop={1}>
        <Text color="yellow">⠋ </Text>
        <Text color="yellow">Running validation...</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color="yellow">⠋ </Text>
        <Text color="yellow">Validating</Text>
        {metadata.currentValidationCommand && (
          <Text color="yellow">: {metadata.currentValidationCommand}</Text>
        )}
      </Box>
      {metadata.exitStatusSummary && (
        <Box paddingLeft={2}>
          <ExitStatusSummaryLine summary={metadata.exitStatusSummary} />
        </Box>
      )}
    </Box>
  );
}

function FailureFooter({ state }: { state: FlowWrapperState }) {
  const { failureReason, metadata } = state;
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box>
        <Text color="red">✕ </Text>
        <Text color="red">Flow failed.</Text>
      </Box>
      {failureReason && (
        <Box paddingLeft={2}>
          <Text dimColor wrap="wrap">
            {failureReason}
          </Text>
        </Box>
      )}
      {metadata?.exitStatusSummary && (
        <Box paddingLeft={2} marginTop={1}>
          <ExitStatusSummaryLine summary={metadata.exitStatusSummary} />
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>
          Press <Text bold>ctrl+c</Text> to quit.
        </Text>
      </Box>
    </Box>
  );
}

function CompletionFooter({ state }: { state: FlowWrapperState }) {
  const { metadata } = state;
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box>
        <Text color="green">✓ </Text>
        <Text color="green">Flow complete.</Text>
      </Box>
      {metadata?.exitStatusSummary && (
        <Box paddingLeft={2}>
          <ExitStatusSummaryLine summary={metadata.exitStatusSummary} />
        </Box>
      )}
    </Box>
  );
}

function ExitStatusSummaryLine({
  summary,
}: {
  summary: NonNullable<import('./types.js').RalphexRunMetadata['exitStatusSummary']>;
}) {
  const { passed, failed, total } = summary;
  return (
    <Text dimColor>
      {total} command{total === 1 ? '' : 's'}:{' '}
      <Text color="green">{passed} passed</Text>
      {failed > 0 && (
        <>
          {', '}
          <Text color="red">{failed} failed</Text>
        </>
      )}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Returns the appropriate content to render for each lifecycle phase.
 * - preflight: spinner header
 * - start-confirmation: metadata + confirmation prompt
 * - running: children (GenerationScreen or ExecutionConsole)
 * - validating: children + validation footer
 * - failure: failure summary
 * - complete: completion summary
 */
function phaseContent(
  phase: FlowLifecyclePhase,
  state: FlowWrapperState,
  children: React.ReactNode | undefined,
  onConfirm: (() => void) | undefined,
): React.ReactNode {
  switch (phase) {
    case 'preflight':
      return <PreflightHeader />;

    case 'start-confirmation':
      return <StartConfirmationView state={state} onConfirm={onConfirm} />;

    case 'running':
      return (
        <Box flexDirection="column">
          <MetadataHeader state={state} />
          {children}
        </Box>
      );

    case 'validating':
      return (
        <Box flexDirection="column">
          <MetadataHeader state={state} />
          {children}
          <ValidatingFooter state={state} />
        </Box>
      );

    case 'failure':
      return <FailureFooter state={state} />;

    case 'complete':
      return <CompletionFooter state={state} />;
  }
}

export function FlowWrapper({ state, onConfirm, children }: FlowWrapperProps) {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {phaseContent(state.phase, state, children, onConfirm)}
    </Box>
  );
}
