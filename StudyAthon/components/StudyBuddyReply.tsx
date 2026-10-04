import { StyleSheet, Text, View } from 'react-native';

type InlinePart = { text: string; math?: boolean };
type ReplyBlock =
  | { type: 'heading' | 'paragraph'; text: string }
  | { type: 'formula'; text: string }
  | { type: 'list'; items: string[] };

function cleanInlineFormatting(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .trim();
}

const mathSymbols: Record<string, string> = {
  '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
  '\\theta': 'θ', '\\lambda': 'λ', '\\mu': 'μ', '\\pi': 'π',
  '\\sigma': 'σ', '\\phi': 'φ', '\\omega': 'ω', '\\Delta': 'Δ',
  '\\Sigma': 'Σ', '\\Omega': 'Ω', '\\times': '×', '\\cdot': '·',
  '\\div': '÷', '\\pm': '±', '\\leq': '≤', '\\le': '≤',
  '\\geq': '≥', '\\ge': '≥', '\\neq': '≠', '\\approx': '≈',
  '\\infty': '∞', '\\to': '→', '\\rightarrow': '→',
  '\\degree': '°', '\\sum': '∑', '\\prod': '∏', '\\int': '∫',
  '\\partial': '∂', '\\nabla': '∇', '\\forall': '∀', '\\exists': '∃',
  '\\in': '∈', '\\notin': '∉', '\\emptyset': '∅', '\\land': '∧',
  '\\lor': '∨', '\\therefore': '∴', '\\because': '∵',
};
const superscripts: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵',
  '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻',
  '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ',
};
const subscripts: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅',
  '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋',
  '=': '₌', '(': '₍', ')': '₎', i: 'ᵢ', n: 'ₙ',
};

function mathText(source: string): string {
  let value = source.trim().replace(/\\left|\\right/g, '');
  // Render fractions in familiar linear notation so they remain clear and
  // readable in a native text run on iOS, Android, and web.
  for (let pass = 0; pass < 8; pass += 1) {
    const next = value.replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1)⁄($2)');
    if (next === value) break;
    value = next;
  }
  value = value.replace(/\\sqrt\s*\{([^{}]+)\}/g, '√($1)');
  value = value.replace(/\^\{([^{}]+)\}|\^([\w+-])/g, (_match, group: string, single: string) =>
    [...(group ?? single)].map((char) => superscripts[char] ?? char).join(''),
  );
  value = value.replace(/_\{([^{}]+)\}|_([\w+-])/g, (_match, group: string, single: string) =>
    [...(group ?? single)].map((char) => subscripts[char] ?? char).join(''),
  );
  value = value.replace(/\\([A-Za-z]+)/g, (command) => mathSymbols[command] ?? command.slice(1));
  return value.replace(/[{}]/g, '').replace(/\\%/g, '%');
}

function inlineParts(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const pattern = /\$([^$]+)\$/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ text: text.slice(cursor, index) });
    parts.push({ text: mathText(match[1]), math: true });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts.length ? parts : [{ text }];
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

  for (const rawLine of text.replace(/\r/g, '').split('\n')) {
    const line = rawLine.trim();
    if (line === '$$') {
      if (displayFormula === null) {
        flushParagraph();
        flushList();
        displayFormula = [];
      } else {
        blocks.push({ type: 'formula', text: mathText(displayFormula.join(' ')) });
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
      blocks.push({ type: 'formula', text: mathText(displayMath[1]) });
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
    blocks.push({ type: 'formula', text: mathText(displayFormula.join(' ')) });
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
          return <Text key={index} accessibilityLabel={`Equation: ${block.text}`} style={styles.formula}>{block.text}</Text>;
        }
        if (block.type === 'list') {
          return (
            <View key={index} style={styles.list}>
              {block.items.map((item, itemIndex) => (
                <View key={`${index}-${itemIndex}`} style={styles.listItem}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={styles.paragraph}>{item}</Text>
                </View>
              ))}
            </View>
          );
        }
        return (
          <Text key={index} style={styles.paragraph}>
            {inlineParts(block.text).map((part, partIndex) => (
              <Text key={partIndex} style={part.math ? styles.inlineMath : undefined}>{part.text}</Text>
            ))}
          </Text>
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
