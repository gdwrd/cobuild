import { Box, Text } from 'ink';

/**
 * ASCII art lines for the cobuild logo.
 * Rendered in 4-line figlet "standard" style, ~42 chars wide.
 * Visible on the interview screen only when the transcript is empty (welcome state).
 */
export const LOGO_LINES = [
  '  ___  ___  ___  _   _ ___ _    ___',
  ' / __|/ _ \\| _ )| | | |_ _|| |  |   \\',
  '| (__ | (_) | _ \\| |_| || | | |__| |) |',
  ' \\___| \\___/|___/ \\___/|___||____|___/',
];

export const LOGO_TAGLINE = '    \u2699  build software with AI  \u2699';

/**
 * InterviewLogo — branded ASCII art logo shown above the interview screen.
 *
 * Displays the cobuild name in large ASCII art letters with a gear/tool motif.
 * This component is intentionally isolated from interview transcript and input
 * logic so it can be tested independently and swapped out without side effects.
 *
 * Rendered only on the main interview screen (via App.tsx) and only when the
 * conversation has not yet started, keeping the logo out of the way during
 * active sessions, model selection, and all other screen types.
 */
export function InterviewLogo() {
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {LOGO_LINES.map((line, i) => (
        <Box key={i}>
          <Text color="cyan">{line}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor>{LOGO_TAGLINE}</Text>
      </Box>
    </Box>
  );
}
