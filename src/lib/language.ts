import { franc } from 'franc';

export type Language = 'pt' | 'en' | 'other';

/**
 * Two-class language detector restricted to Portuguese and English (the v1
 * conviction corpus is bilingual). Falls back to 'other' for very short
 * strings or anything that isn't clearly PT or EN.
 */
export function detectLanguage(text: string): Language {
  const stripped = text.replace(/```[\s\S]*?```/g, ' ').trim();
  if (stripped.length < 10) return 'other';
  const code = franc(stripped, { only: ['por', 'eng'] });
  if (code === 'por') return 'pt';
  if (code === 'eng') return 'en';
  return 'other';
}
