import React from 'react';
import { Box, Text } from 'ink';
import type { StatusHeaderData, FooterHelpData } from './types.js';

/**
 * AppShell — reusable wrapper that renders shared chrome (status bar, notices,
 * errors, footer) around screen-specific content.
 *
 * Every top-level screen in ScreenController mounts inside AppShell so that
 * chrome is consistent across interview, generation, decision, and future
 * execution screens. To add a new screen, implement a focused view component
 * and mount it as children here — no special-casing in AppShell required.
 *
 * Future execution mode: pass `statusBar.resumabilityContext` to surface task
 * progress (e.g. "phase 3/5") in the header, and supply an execution-specific
 * `footer` with terminal controls. No structural changes to AppShell needed.
 */
export interface AppShellProps {
  /** Persistent status bar data rendered above screen content. Optional so
   *  startup and fatal-error screens can omit it before a session is known. */
  statusBar?: StatusHeaderData;
  /** Persistent notice text (e.g. provider unavailable). Uses warning color. */
  notice?: string;
  /** Auto-dismissed transient error text. */
  transientError?: string;
  /** Footer help line with commands and keybindings for the current screen. */
  footer?: FooterHelpData;
  children?: React.ReactNode;
}

export function AppShell({ statusBar, notice, transientError, footer, children }: AppShellProps) {
  return (
    <Box flexDirection="column">
      {statusBar && (
        <Box borderStyle="single" paddingX={1} flexDirection="column">
          {/* Row 1: identity — always compact enough for narrow terminals */}
          <Box flexDirection="row">
            <Text dimColor>
              {'cobuild v'}{statusBar.version}
              {'  '}{statusBar.stage}
              {'  sess:'}{statusBar.sessionId.slice(0, 8)}
            </Text>
          </Box>
          {/* Row 2: provider context and resumability */}
          <Box flexDirection="row">
            <Text dimColor>
              {statusBar.provider}
              {statusBar.model ? `/${statusBar.model}` : ''}
            </Text>
            {!statusBar.providerReady && (
              <Text color="red"> [UNAVAILABLE]</Text>
            )}
            {statusBar.resumabilityContext && (
              <Text dimColor>{'  '}{statusBar.resumabilityContext}</Text>
            )}
          </Box>
        </Box>
      )}

      {notice && (
        <Box paddingX={1}>
          <Text color="yellow">Notice: {notice}</Text>
        </Box>
      )}

      {transientError && (
        <Box paddingX={1}>
          <Text color="red">Error: {transientError}</Text>
        </Box>
      )}

      {children}

      {footer && (footer.commands.length > 0 || footer.keybindings.length > 0) && (
        <Box paddingX={1} flexDirection="row">
          {footer.commands.length > 0 && (
            <Text dimColor>Commands: {footer.commands.join('  ')}</Text>
          )}
          {footer.commands.length > 0 && footer.keybindings.length > 0 && (
            <Text dimColor>{'   '}</Text>
          )}
          {footer.keybindings.length > 0 && (
            <Text dimColor>Keys: {footer.keybindings.join('  ')}</Text>
          )}
        </Box>
      )}
    </Box>
  );
}
