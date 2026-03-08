import { Box, Text } from 'ink';

export interface ModelSelectPromptProps {
  models: string[];
}

/**
 * ModelSelectPrompt — a focused model selection UI shown in the interview screen
 * when the user invokes /model and a list of available models is fetched.
 *
 * Replaces the old plain-text transcript dump with a structured numbered list
 * so model names are easy to scan and select.
 */
export function ModelSelectPrompt({ models }: ModelSelectPromptProps) {
  return (
    <Box flexDirection="column" paddingX={1} marginBottom={1}>
      <Text color="cyan">◆ Select a model:</Text>
      <Box flexDirection="column" marginTop={1}>
        {models.map((model, i) => (
          <Box key={model}>
            <Text dimColor>{`  ${i + 1}. `}</Text>
            <Text>{model}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Type a number or model name, or press Enter to keep the current model.</Text>
      </Box>
    </Box>
  );
}
