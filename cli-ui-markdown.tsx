import React from 'react';
import { Box, Text } from 'ink';
import { Token, Tokens, lexer } from 'marked';

function renderInline(tokens: Token[]): React.ReactNode[] {
  return tokens.map((token, i) => {
    switch (token.type) {
      case 'strong':
        return <Text bold key={i}>{renderInline((token as Tokens.Strong).tokens)}</Text>;
      case 'em':
        return <Text italic key={i}>{renderInline((token as Tokens.Em).tokens)}</Text>;
      case 'codespan':
        return <Text color="yellow" key={i}>{`\`${(token as Tokens.Codespan).text}\``}</Text>;
      case 'link':
        return (
          <Text color="cyan" underline key={i}>
            {(token as Tokens.Link).text}
          </Text>
        );
      case 'del':
        return <Text dimColor key={i}>{renderInline((token as Tokens.Del).tokens)}</Text>;
      case 'br':
        return <Text key={i}>{'\n'}</Text>;
      case 'text':
        return <React.Fragment key={i}>{(token as Tokens.Text).text}</React.Fragment>;
      case 'image':
        return <Text dimColor key={i}>[{(token as Tokens.Image).text}]</Text>;
      default:
        return null;
    }
  });
}

function renderToken(token: Token, key: number): React.ReactNode {
  switch (token.type) {
    case 'heading': {
      const t = token as Tokens.Heading;
      const color = t.depth === 1 ? 'cyan' : t.depth === 2 ? 'green' : t.depth === 3 ? 'yellow' : 'white';
      return (
        <Box key={key} marginTop={t.depth <= 2 ? 1 : 0} marginBottom={1}>
          <Text bold color={color} underline={t.depth <= 2}>
            {renderInline(t.tokens)}
          </Text>
        </Box>
      );
    }
    case 'paragraph': {
      const t = token as Tokens.Paragraph;
      return (
        <Box key={key} marginBottom={1}>
          <Text wrap="wrap">{renderInline(t.tokens)}</Text>
        </Box>
      );
    }
    case 'code': {
      const t = token as Tokens.Code;
      return (
        <Box key={key} marginY={1} borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
          {t.lang && (
            <Text dimColor>
              {t.lang}
            </Text>
          )}
          {t.text.split('\n').map((line, i) => (
            <Text key={i} color="yellow">
              {line}
            </Text>
          ))}
        </Box>
      );
    }
    case 'list': {
      const t = token as Tokens.List;
      return (
        <Box key={key} marginBottom={1} flexDirection="column">
          {t.items.map((item, i) => (
            <Box key={i} flexDirection="column">
              <Box>
                <Text>
                  {t.ordered ? `  ${(t.start || 1) + i}. ` : '  • '}
                </Text>
                <Text wrap="wrap">{renderInline(item.tokens)}</Text>
              </Box>
              {item.tokens.filter(tok => (tok as Tokens.Generic).type === 'list').length > 0 && (
                <Box paddingLeft={4}>
                  {item.tokens.filter(tok => (tok as Tokens.Generic).type === 'list').map((tok, j) =>
                    renderToken(tok, j)
                  )}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      );
    }
    case 'blockquote': {
      const t = token as Tokens.Blockquote;
      return (
        <Box key={key} marginBottom={1} borderLeft borderColor="gray" paddingLeft={1}>
          <Text wrap="wrap" dimColor>
            {((t.tokens && t.tokens[0] && (t.tokens[0] as Tokens.Generic).type === 'paragraph')
              ? renderInline((t.tokens[0] as Tokens.Paragraph).tokens)
              : t.text) || t.text}
          </Text>
        </Box>
      );
    }
    case 'hr':
      return (
        <Box key={key} marginY={1}>
          <Text dimColor>{'─'.repeat(50)}</Text>
        </Box>
      );
    case 'table': {
      const t = token as Tokens.Table;
      const cols = t.header.length;
      const colW = Math.max(12, Math.floor(72 / cols));
      return (
        <Box key={key} marginBottom={1} flexDirection="column">
          <Box>
            {t.header.map((cell, i) => (
              <Box key={i} width={colW}>
                <Text bold underline>{cell.text}</Text>
              </Box>
            ))}
          </Box>
          {t.rows.map((row, ri) => (
            <Box key={ri}>
              {row.map((cell, ci) => (
                <Box key={ci} width={colW}>
                  <Text>{cell.text}</Text>
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      );
    }
    default:
      return null;
  }
}

export function isMarkdown(text: string): boolean {
  return /(?:^|\n)(#{1,6}\s|\*{3,}|-{3,}|```|>\s|[-*+]\s|\d+\.\s)/.test(text.trim());
}

export function MarkdownRenderer({ content }: { content: string }) {
  const tokens = lexer(content);
  return (
    <Box flexDirection="column" marginBottom={1}>
      {tokens.map((token, i) => renderToken(token, i))}
    </Box>
  );
}
