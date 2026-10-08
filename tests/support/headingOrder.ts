/**
 * Heading-outline assertions for rendered surfaces.
 *
 * Screen readers navigate by heading level, so a jump from h2 to h4 hides the
 * h4 from anyone stepping through "next h3". jsdom renders the real markup, so
 * the outline can be checked in a component test without a browser.
 */

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

/**
 * Every place a heading sits more than one level below the heading before it,
 * as `h2 -> h4 "GPU not detected"`. Empty when the outline is unbroken.
 */
export function skippedHeadingLevels(root: ParentNode = document): string[] {
  const skips: string[] = [];
  let previous = 0;

  for (const heading of root.querySelectorAll(HEADING_SELECTOR)) {
    const level = Number(heading.tagName.slice(1));
    if (previous > 0 && level > previous + 1) {
      skips.push(`h${previous} -> h${level} "${heading.textContent?.trim() ?? ''}"`);
    }
    previous = level;
  }

  return skips;
}
