import React, { useMemo } from 'react';
import { StyleSheet, Text, TextStyle, StyleProp } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import type { Theme } from '@/constants/theme';

const mathSymbols: Record<string, string> = {
  '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
  '\\epsilon': 'ε', '\\varepsilon': 'ε', '\\zeta': 'ζ', '\\eta': 'η',
  '\\theta': 'θ', '\\vartheta': 'θ', '\\iota': 'ι', '\\kappa': 'κ',
  '\\lambda': 'λ', '\\mu': 'μ', '\\nu': 'ν', '\\xi': 'ξ',
  '\\pi': 'π', '\\varpi': 'π', '\\rho': 'ρ', '\\varrho': 'ρ',
  '\\sigma': 'σ', '\\varsigma': 'ς', '\\tau': 'τ', '\\upsilon': 'υ',
  '\\phi': 'φ', '\\varphi': 'ϕ', '\\chi': 'χ', '\\psi': 'ψ', '\\omega': 'ω',
  '\\Delta': 'Δ', '\\Gamma': 'Γ', '\\Lambda': 'Λ', '\\Sigma': 'Σ',
  '\\Phi': 'Φ', '\\Psi': 'Ψ', '\\Omega': 'Ω', '\\Theta': 'Θ',
  '\\Xi': 'Ξ', '\\Pi': 'Π', '\\Upsilon': 'Υ',
  '\\times': '×', '\\cdot': '·', '\\div': '÷', '\\pm': '±', '\\mp': '∓',
  '\\ast': '∗', '\\star': '⋆', '\\circ': '°', '\\bullet': '•',
  '\\leq': '≤', '\\le': '≤', '\\geq': '≥', '\\ge': '≥', '\\neq': '≠', '\\ne': '≠',
  '\\approx': '≈', '\\equiv': '≡', '\\sim': '∼', '\\simeq': '≃', '\\cong': '≅',
  '\\propto': '∝', '\\infty': '∞',
  '\\to': '→', '\\rightarrow': '→', '\\leftarrow': '←', '\\gets': '←',
  '\\Rightarrow': '⇒', '\\Leftarrow': '⇐', '\\implies': '⇒', '\\impliedby': '⇐',
  '\\leftrightarrow': '↔', '\\Leftrightarrow': '⇔', '\\iff': '⇔',
  '\\degree': '°', '\\deg': '°', '\\angle': '∠', '\\measuredangle': '∡',
  '\\perp': '⊥', '\\parallel': '∥',
  '\\sum': '∑', '\\prod': '∏', '\\coprod': '∐',
  '\\int': '∫', '\\iint': '∬', '\\iiint': '∭', '\\oint': '∮',
  '\\partial': '∂', '\\nabla': '∇',
  '\\forall': '∀', '\\exists': '∃', '\\nexists': '∄',
  '\\in': '∈', '\\notin': '∉', '\\ni': '∋',
  '\\subset': '⊂', '\\subseteq': '⊆', '\\supset': '⊃', '\\supseteq': '⊇',
  '\\cup': '∪', '\\cap': '∩', '\\setminus': '∖',
  '\\emptyset': '∅', '\\varnothing': '∅',
  '\\land': '∧', '\\lor': '∨', '\\neg': '¬', '\\lnot': '¬',
  '\\therefore': '∴', '\\because': '∵',
};

const superscripts: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵',
  '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻',
  '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', a: 'ᵃ', b: 'ᵇ',
  c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ', h: 'ʰ', j: 'ʲ', k: 'ᵏ',
  l: 'ˡ', m: 'ᵐ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ', t: 'ᵗ', u: 'ᵘ',
  v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ',
};

const subscripts: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅',
  '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋',
  '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ',
  j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ',
  s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ',
};

export function formatMathText(source: string): string {
  let value = source.trim()
    .replace(/\\left\(|\\right\)/g, (m) => m.includes('(') ? '(' : ')')
    .replace(/\\left\[|\\right\]/g, (m) => m.includes('[') ? '[' : ']')
    .replace(/\\left\\\{|\\right\\\}/g, (m) => m.includes('{') ? '{' : '}')
    .replace(/\\left\||\\right\|/g, '|')
    .replace(/\\left\.|\\right\./g, '')
    .replace(/\\left|\\right/g, '');

  // 1. Text wrappers: \text{...}, \mathrm{...}, \mathbf{...}, \operatorname{...}
  value = value.replace(/\\(?:text|mathrm|mathbf|mathit|mathsf|mathtt|operatorname|textnormal)\s*\{([^{}]+)\}/g, '$1');

  // 2. Fractions
  for (let pass = 0; pass < 8; pass += 1) {
    const next = value.replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1)⁄($2)');
    if (next === value) break;
    value = next;
  }

  // 3. Roots
  value = value.replace(/\\sqrt\[([^{}]+)\]\s*\{([^{}]+)\}/g, '$1√($2)');
  value = value.replace(/\\sqrt\s*\{([^{}]+)\}/g, '√($1)');

  // 4. Superscripts & exponents
  value = value.replace(/\^\{([^{}]+)\}|\^([\w+-])/g, (_match, group: string, single: string) =>
    [...(group ?? single)].map((char) => superscripts[char] ?? char).join(''),
  );

  // 5. Subscripts (e.g. _{12}, _2)
  value = value.replace(/_\{([^{}]+)\}|_([\w+-])/g, (_match, group: string, single: string) =>
    [...(group ?? single)].map((char) => subscripts[char] ?? char).join(''),
  );

  // 6. LaTeX math functions (sin, cos, tan, log, ln, lim, etc.)
  value = value.replace(/\\(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|exp|lim|max|min|det|gcd|deg)\b/g, '$1');

  // 7. LaTeX math symbols & Greek letters
  value = value.replace(/\\([A-Za-z]+)/g, (match, command) => {
    const fullCmd = '\\' + command;
    return mathSymbols[fullCmd] ?? command;
  });

  // 8. Clean spacing, percent, and braces
  return value
    .replace(/\\,/g, ' ')
    .replace(/\\;/g, ' ')
    .replace(/\\:/g, ' ')
    .replace(/\\quad/g, '  ')
    .replace(/\\qquad/g, '    ')
    .replace(/\\!/g, '')
    .replace(/\\%/g, '%')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/[{}]/g, '')
    .trim();
}

export type InlinePart = { text: string; math?: boolean };

export function parseInlineMath(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  // Match $...$, $$...$$, \(...\), \[...\]
  const pattern = /(\$\$[\s\S]+?\$\$|\$[^\$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\])/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      parts.push({ text: text.slice(cursor, index) });
    }
    const raw = match[0];
    let mathInner = raw;
    if (raw.startsWith('$$') && raw.endsWith('$$')) {
      mathInner = raw.slice(2, -2);
    } else if (raw.startsWith('$') && raw.endsWith('$')) {
      mathInner = raw.slice(1, -1);
    } else if (raw.startsWith('\\(') && raw.endsWith('\\)')) {
      mathInner = raw.slice(2, -2);
    } else if (raw.startsWith('\\[') && raw.endsWith('\\]')) {
      mathInner = raw.slice(2, -2);
    }
    parts.push({ text: formatMathText(mathInner), math: true });
    cursor = index + raw.length;
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor) });
  }
  return parts.length ? parts : [{ text }];
}

type MathTextProps = {
  children: string;
  style?: StyleProp<TextStyle>;
  mathStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

export default function MathText({
  children,
  style,
  mathStyle,
  numberOfLines,
}: MathTextProps) {
  const theme = useTheme();
  const styles = useMemo(() => buildStyles(theme), [theme]);

  if (!children) return null;
  const parts = parseInlineMath(children);

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, idx) => (
        <Text
          key={idx}
          style={part.math ? [styles.inlineMath, mathStyle] : undefined}>
          {part.text}
        </Text>
      ))}
    </Text>
  );
}

function buildStyles(theme: Theme) {
  return StyleSheet.create({
  inlineMath: {
    fontFamily: 'serif',
    fontWeight: '600',
  },

  });
}
