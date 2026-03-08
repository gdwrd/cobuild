import { Box, Text } from 'ink';

export interface ErrorScreenProps {
  message: string;
}

export function ErrorScreen({ message }: ErrorScreenProps) {
  return (
    <Box paddingX={1} paddingY={1}>
      <Text color="red">Error: {message}</Text>
    </Box>
  );
}
