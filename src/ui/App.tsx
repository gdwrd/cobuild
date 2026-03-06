import { useState } from 'react';
import { Box, Text, useInput, useApp } from 'ink';

export interface AppProps {
  sessionId: string;
  version: string;
}

export interface Message {
  role: 'system' | 'user';
  content: string;
}

export function App({ sessionId, version }: AppProps) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([
    { role: 'system', content: 'What would you like to build today?' },
  ]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState('ready');

  useInput((char, key) => {
    if (key.ctrl && char === 'c') {
      exit();
      return;
    }

    if (key.return) {
      const trimmed = input.trim();
      if (trimmed) {
        setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
        setInput('');
        setStatus('processing');
        setTimeout(() => setStatus('ready'), 500);
      }
      return;
    }

    if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
      return;
    }

    if (!key.ctrl && !key.meta && char) {
      setInput(prev => prev + char);
    }
  });

  return (
    <Box flexDirection="column">
      {/* Transcript area */}
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        {messages.map((msg, i) => (
          <Box key={i} marginBottom={1}>
            <Text color={msg.role === 'system' ? 'cyan' : 'white'}>
              {msg.role === 'system' ? '◆ ' : '▶ '}
              {msg.content}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Status bar */}
      <Box borderStyle="single" paddingX={1}>
        <Text color={status === 'ready' ? 'green' : 'yellow'}>
          {'['}
          {status}
          {']'}
        </Text>
        <Text dimColor>
          {'  cobuild v'}
          {version}
          {'  session: '}
          {sessionId.slice(0, 8)}
        </Text>
      </Box>

      {/* Input prompt area */}
      <Box paddingX={1} paddingY={1}>
        <Text bold color="cyan">
          {'▶ '}
        </Text>
        <Text>{input}</Text>
        <Text>{'█'}</Text>
      </Box>

      {/* Footer command area */}
      <Box paddingX={1}>
        <Text dimColor>ctrl+c: quit  enter: submit</Text>
      </Box>
    </Box>
  );
}
