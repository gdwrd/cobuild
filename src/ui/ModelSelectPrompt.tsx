import { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';

export interface ModelSelectPromptProps {
  models: string[];
  currentModel?: string;
  onSelect?: (model: string) => void;
}

/**
 * ModelSelectPrompt — a keyboard-driven model selection picker shown in the
 * interview screen when the user invokes /model and a list of available models
 * is fetched.
 *
 * Navigation: ↑/↓ arrows move the highlighted selection. Enter confirms the
 * highlighted model. Esc cancels (keeps the current model). The current model
 * is shown for context and pre-selected when it appears in the list.
 */
export function ModelSelectPrompt({ models, currentModel, onSelect }: ModelSelectPromptProps) {
  const { exit } = useApp();
  const initialIndex = currentModel
    ? Math.max(0, models.indexOf(currentModel))
    : 0;
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);

  useInput((char, key) => {
    if (key.ctrl && char === 'c') {
      exit();
      return;
    }

    if (models.length === 0) return;

    if (key.upArrow) {
      setSelectedIndex(prev => (prev - 1 + models.length) % models.length);
      return;
    }

    if (key.downArrow) {
      setSelectedIndex(prev => (prev + 1) % models.length);
      return;
    }

    if (key.return) {
      onSelect?.(models[selectedIndex] ?? '');
      return;
    }

    if (key.escape) {
      onSelect?.('');
      return;
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} marginBottom={1}>
      <Text color="cyan">◆ Select a model:</Text>
      {currentModel && (
        <Box marginTop={1}>
          <Text dimColor>Current: {currentModel}</Text>
        </Box>
      )}
      <Box flexDirection="column" marginTop={1}>
        {models.map((model, i) => {
          const isSelected = i === selectedIndex;
          return (
            <Box key={model}>
              <Text dimColor>{`  ${i + 1}. `}</Text>
              <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
                {isSelected ? '▶ ' : '  '}
                {model}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>↑/↓ to select  Enter to confirm  Esc to keep current</Text>
      </Box>
    </Box>
  );
}
