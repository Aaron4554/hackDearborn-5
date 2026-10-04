import { StyleSheet, Text, View } from 'react-native';
import MathText, { formatMathText } from '@/components/MathText';

type ReplyBlock =
  | { type: 'heading' | 'paragraph'; text: string }
  | { type: 'formula'; text: string }
  | { type: 'list'; items: string[] };

function cleanInlineFormatting(text: string): string {
  // Protect math blocks ($...$, $$...$$, \(...\), \[...\]) from being altered by markdown strip regexes
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^\$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g);
  return parts
    .map((part, index) => {
      if (index % 2 === 1) {
        // Math block: keep underscores and asterisks untouched
        return part;
      }
      return part
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/_(.*?)_/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/~~(.*?)~~/g, '$1');
    })
    .join('')
    .trim();
}

function parseReply(text: string): ReplyBlock[] {
  const blocks: ReplyBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let displayFormula: string[] | null = null;

  const flushParagraph = () => {
    const content = cleanInlineFormatting(paragraph.join(' '));
    if (content) blocks.push({ type: 'paragraph', text: content });
    paragraph = [];
  };

  const flushList = () => {
    if (list.length) blocks.push({ type: 'list', items: list });
    list = [];
  };

  const rawLines = text.replace(/\r/g, '').split('\n');
  for (let i = 0; i < rawLines.length; i += 1) {
    let line = rawLines[i].trim();

    // If an isolated bullet is on its own line, merge with the next line
    if (/^[-*•]$/.test(line) && i + 1 < rawLines.length && rawLines[i + 1].trim()) {
      i += 1;
      line = `• ${rawLines[i].trim()}`;
    }

    if (line === '$$') {
      if (displayFormula === null) {
        flushParagraph();
        flushList();
        displayFormula = [];
      } else {
        blocks.push({ type: 'formula', text: formatMathText(displayFormula.join(' ')) });
        displayFormula = null;
      }
      continue;
    }
    if (displayFormula !== null) {
      displayFormula.push(line);
      continue;
    }
    const displayMath = line.match(/^\$\$(.+?)\$\$$/);
    if (displayMath) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'formula', text: formatMathText(displayMath[1]) });
      continue;
    }
    if (!line || /^```/.test(line)) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^#{1,6}\s+(.+)$/) ?? line.match(/^(.{1,60}:)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'heading', text: cleanInlineFormatting(heading[1]) });
      continue;
    }

    const item = line.match(/^(?:[-*•]\s+|\d+[.)]\s+)(.+)$/);
    if (item) {
      flushParagraph();
      list.push(cleanInlineFormatting(item[1]));
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  if (displayFormula !== null) {
    blocks.push({ type: 'formula', text: formatMathText(displayFormula.join(' ')) });
  }
  flushParagraph();
  flushList();
  return blocks;
}

export default function StudyBuddyReply({ text }: { text: string }) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.container}>
      {parseReply(text).map((block, index) => {
        if (block.type === 'heading') {
          return <Text key={index} style={styles.heading}>{block.text}</Text>;
        }
        if (block.type === 'formula') {
          return (
            <Text
              key={index}
              accessibilityLabel={`Equation: ${block.text}`}
              style={styles.formula}>
              {block.text}
            </Text>
          );
        }
        if (block.type === 'list') {
          return (
            <View key={index} style={styles.list}>
              {block.items.map((item, itemIndex) => (
                <View key={`${index}-${itemIndex}`} style={styles.listItem}>
                  <Text style={styles.bullet}>•</Text>
                  <MathText style={styles.paragraph} mathStyle={styles.inlineMath}>
                    {item}
                  </MathText>
                </View>
              ))}
            </View>
          );
        }
        return (
          <MathText key={index} style={styles.paragraph} mathStyle={styles.inlineMath}>
            {block.text}
          </MathText>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 9 },
  heading: { color: '#2E4435', fontSize: 14, fontWeight: '700', lineHeight: 20 },
  paragraph: { flexShrink: 1, color: '#3C5142', fontSize: 14, lineHeight: 21 },
  inlineMath: { color: '#2E4435', fontFamily: 'serif', fontSize: 15 },
  formula: {
    alignSelf: 'stretch',
    overflow: 'hidden',
    borderRadius: 10,
    backgroundColor: '#F2F6F0',
    color: '#26392D',
    fontFamily: 'serif',
    fontSize: 19,
    lineHeight: 30,
    paddingHorizontal: 14,
    paddingVertical: 9,
    textAlign: 'center',
  },
  list: { gap: 6 },
  listItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bullet: { color: '#477B5B', fontSize: 15, lineHeight: 21 },
});
