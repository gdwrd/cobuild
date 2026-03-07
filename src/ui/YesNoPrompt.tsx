import { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { getLogger } from '../logging/logger.js';

export interface YesNoPromptProps {
  question: string;
  onAnswer: (answer: boolean) => void;
}

export function YesNoPrompt({ question, onAnswer }: YesNoPromptProps) {
  const { exit } = useApp();
  const [selected, setSelected] = useState<boolean>(true); // true = Yes
  const [confirmed, setConfirmed] = useState<boolean>(false);

  useInput((char, key) => {
    if (key.ctrl && char === 'c') {
      exit();
      process.exit(1);
    }

    if (confirmed) return;

    if (char === 'y' || char === 'Y') {
      getLogger().info(`yes/no prompt: user selected Yes for "${question}"`);
      setSelected(true);
      setConfirmed(true);
      onAnswer(true);
      return;
    }

    if (char === 'n' || char === 'N') {
      getLogger().info(`yes/no prompt: user selected No for "${question}"`);
      setSelected(false);
      setConfirmed(true);
      onAnswer(false);
      return;
    }

    if (key.upArrow || key.leftArrow) {
      setSelected(true);
      return;
    }

    if (key.downArrow || key.rightArrow) {
      setSelected(false);
      return;
    }

    if (key.return) {
      getLogger().info(`yes/no prompt: user confirmed ${selected ? 'Yes' : 'No'} for "${question}"`);
      setConfirmed(true);
      onAnswer(selected);
      return;
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold color="cyan">
        cobuild — Next Step
      </Text>
      <Text> </Text>
      <Text>{question}</Text>
      <Text> </Text>
      {confirmed ? (
        <Text color="green">{selected ? 'Yes' : 'No'} — proceeding...</Text>
      ) : (
        <Box gap={2}>
          <Text color={selected ? 'green' : 'white'} bold={selected}>
            {selected ? '▶ Yes' : '  Yes'}
          </Text>
          <Text color={!selected ? 'red' : 'white'} bold={!selected}>
            {!selected ? '▶ No' : '  No'}
          </Text>
        </Box>
      )}
      {!confirmed && (
        <Box marginTop={1}>
          <Text dimColor>y/n  ←/→ select  Enter confirm  ctrl+c quit</Text>
        </Box>
      )}
    </Box>
  );
}
