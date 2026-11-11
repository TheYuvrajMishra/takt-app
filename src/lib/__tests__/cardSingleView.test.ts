// Card guards (fresh, 2026-11-11): the hero card must be ONE full-width
// container — no nested shells. The old Card nested two same-fill views
// (outer ambient shadow + inner contact shadow): the inner shadow drew a
// dark line just inside the edge (glitched look), and the caller's
// alignItems: center made the inner shell shrink-wrap to its content,
// rendering the hero at half width.
// eslint-disable-next-line import/no-unresolved
import CARD_SRC from '../../components/Card.tsx?raw';
// eslint-disable-next-line import/no-unresolved
import TOKENS_SRC from '../../theme/tokens.ts?raw';
import { describe, expect, it } from 'vitest';

describe('card is one view, one shadow', () => {
  it('renders a single root view (no nested shell to shrink-wrap)', () => {
    // Exactly one <View and one <Pressable in the whole file: the
    // pressable variant and the plain variant each return one root.
    expect((CARD_SRC.match(/<View/g) ?? []).length).toBe(1);
    expect((CARD_SRC.match(/<Pressable/g) ?? []).length).toBe(1);
  });

  it('uses one balanced card shadow, not the old ambient/contact pair', () => {
    expect(CARD_SRC).toContain('shadows.card');
    expect(CARD_SRC).not.toContain('shadows.ambient');
    expect(CARD_SRC).not.toContain('shadows.contact');
    // The single card style carries the shadow and the padding.
    const start = CARD_SRC.indexOf('card: {');
    expect(start).toBeGreaterThan(-1);
    const block = CARD_SRC.slice(start, CARD_SRC.indexOf('},', start));
    expect(block).toContain('...shadows.card');
    expect(block).toContain('padding: 20');
  });

  it('defines the card shadow token and drops the nested pair', () => {
    const start = TOKENS_SRC.indexOf('export const shadows = {');
    expect(start).toBeGreaterThan(-1);
    const block = TOKENS_SRC.slice(start, TOKENS_SRC.indexOf('} as const;', start));
    expect(block).toContain('card: {');
    expect(block).not.toContain('ambient: {');
    expect(block).not.toContain('contact: {');
  });
});
