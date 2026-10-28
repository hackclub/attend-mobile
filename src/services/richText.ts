// Message bodies are HTML: the web composer is a rich-text editor, and the
// server sanitizes what it stores down to a small set of tags (Message#
// sanitize_html). The app has no web view, so this module does two jobs:
//
//   1. parseHtml turns that HTML into blocks a native view can render.
//   2. htmlToMarkup / markupToHtml convert between it and a plain-text markup
//      the composer edits: **bold**, _italic_, ~~strike~~, `code`,
//      [label](https://link), "- " and "1. " lists, "> " quotes, and a blank
//      line between paragraphs.
//
// Both directions only ever produce tags the server keeps, so a body written
// on a phone renders the same in email, Slack and the web inbox.

export interface Inline {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  underline?: boolean;
  code?: boolean;
  href?: string;
}

export type Block =
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'quote'; blocks: Block[] }
  | { type: 'code'; text: string }
  | { type: 'heading'; inlines: Inline[] }
  | { type: 'rule' };

interface Node {
  tag: string;
  attrs: Record<string, string>;
  children: (Node | string)[];
}

const VOID_TAGS = new Set(['br', 'hr', 'img']);
const BLOCK_TAGS = new Set(['p', 'div', 'ul', 'ol', 'li', 'blockquote', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr']);

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

// A forgiving tree builder: unknown tags keep their children, stray closing
// tags are ignored, and anything left open closes at the end.
function buildTree(html: string): Node {
  const root: Node = { tag: '#root', attrs: {}, children: [] };
  const stack: Node[] = [root];
  const pattern = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html))) {
    if (match.index > last) {
      stack[stack.length - 1].children.push(decodeEntities(html.slice(last, match.index)));
    }
    last = pattern.lastIndex;
    if (match[0].startsWith('<!--')) continue;

    const tag = match[1].toLowerCase();
    if (match[0][1] === '/') {
      const at = stack.map(n => n.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      continue;
    }

    // A new list item or paragraph closes an open one, as browsers do.
    if (tag === 'li' || tag === 'p') {
      const open = stack.map(n => n.tag).lastIndexOf(tag);
      const blocker = Math.max(stack.map(n => n.tag).lastIndexOf('ul'), stack.map(n => n.tag).lastIndexOf('ol'));
      if (open > 0 && (tag === 'p' || open > blocker)) stack.length = open;
    }

    const node: Node = { tag, attrs: parseAttrs(match[2]), children: [] };
    stack[stack.length - 1].children.push(node);
    if (!VOID_TAGS.has(tag) && !match[2].trim().endsWith('/')) stack.push(node);
  }
  if (last < html.length) stack[stack.length - 1].children.push(decodeEntities(html.slice(last)));
  return root;
}

type Marks = Omit<Inline, 'text'>;

function marksFor(tag: string, attrs: Record<string, string>, marks: Marks): Marks {
  switch (tag) {
    case 'strong':
    case 'b':
      return { ...marks, bold: true };
    case 'em':
    case 'i':
      return { ...marks, italic: true };
    case 's':
    case 'strike':
    case 'del':
      return { ...marks, strike: true };
    case 'u':
      return { ...marks, underline: true };
    case 'code':
      return { ...marks, code: true };
    case 'a':
      return attrs.href ? { ...marks, href: attrs.href } : marks;
    default:
      return marks;
  }
}

function sameMarks(a: Inline, b: Inline): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.strike === b.strike
    && a.underline === b.underline && a.code === b.code && a.href === b.href;
}

function pushInline(out: Inline[], text: string, marks: Marks) {
  if (!text) return;
  const prev = out[out.length - 1];
  const next = { text, ...marks };
  if (prev && sameMarks(prev, next)) prev.text += text;
  else out.push(next);
}

// Whitespace in HTML source collapses to single spaces; <br> is the only
// line break inside a block.
function collectInlines(children: (Node | string)[], marks: Marks = {}, out: Inline[] = []): Inline[] {
  for (const child of children) {
    if (typeof child === 'string') {
      pushInline(out, child.replace(/\s+/g, ' '), marks);
    } else if (child.tag === 'br') {
      pushInline(out, '\n', marks);
    } else {
      collectInlines(child.children, marksFor(child.tag, child.attrs, marks), out);
    }
  }
  return out;
}

function trimInlines(inlines: Inline[]): Inline[] {
  const out = inlines.map(i => ({ ...i }));
  while (out.length && !out[0].text.replace(/^[ \t]+/, '')) out.shift();
  if (out.length) out[0].text = out[0].text.replace(/^[ \t]+/, '');
  while (out.length && !out[out.length - 1].text.replace(/[ \t\n]+$/, '')) out.pop();
  if (out.length) out[out.length - 1].text = out[out.length - 1].text.replace(/[ \t\n]+$/, '');
  return out.map(i => ({ ...i, text: i.text.replace(/ *\n */g, '\n') }));
}

function textOf(node: Node | string): string {
  if (typeof node === 'string') return node;
  if (node.tag === 'br') return '\n';
  return node.children.map(textOf).join('');
}

function blocksFrom(children: (Node | string)[]): Block[] {
  const blocks: Block[] = [];
  let loose: (Node | string)[] = [];

  const flushLoose = () => {
    const inlines = trimInlines(collectInlines(loose));
    if (inlines.length) blocks.push({ type: 'paragraph', inlines });
    loose = [];
  };

  for (const child of children) {
    if (typeof child === 'string' || !BLOCK_TAGS.has(child.tag)) {
      loose.push(child);
      continue;
    }
    flushLoose();
    switch (child.tag) {
      case 'ul':
      case 'ol': {
        const items = child.children
          .filter((c): c is Node => typeof c !== 'string' && c.tag === 'li')
          .map(li => trimInlines(collectInlines(li.children)))
          .filter(item => item.length > 0);
        if (items.length) blocks.push({ type: 'list', ordered: child.tag === 'ol', items });
        break;
      }
      case 'blockquote': {
        const inner = blocksFrom(child.children);
        if (inner.length) blocks.push({ type: 'quote', blocks: inner });
        break;
      }
      case 'pre': {
        const text = textOf(child).replace(/^\n+|\n+$/g, '');
        if (text) blocks.push({ type: 'code', text });
        break;
      }
      case 'hr':
        blocks.push({ type: 'rule' });
        break;
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        const inlines = trimInlines(collectInlines(child.children));
        if (inlines.length) blocks.push({ type: 'heading', inlines });
        break;
      }
      default:
        // p, div, and a stray li outside a list.
        blocks.push(...blocksFrom(child.children));
    }
  }
  flushLoose();
  return blocks;
}

export function parseHtml(html: string | null | undefined): Block[] {
  if (!html) return [];
  return blocksFrom(buildTree(html).children);
}

/** Whether an HTML body holds formatting the composer's markup can't carry. */
export function hasUnsupportedFormatting(html: string | null | undefined): boolean {
  if (!html) return false;
  return /<(u|pre|h[1-6]|hr|img|table)\b/i.test(html);
}

// --- HTML -> markup ----------------------------------------------------------

function inlinesToMarkup(inlines: Inline[]): string {
  return inlines
    .map(inline => {
      if (inline.text === '\n') return '\n';
      let text = inline.text;
      if (inline.code) text = `\`${text}\``;
      if (inline.bold) text = `**${text}**`;
      if (inline.italic) text = `_${text}_`;
      if (inline.strike) text = `~~${text}~~`;
      if (inline.href) text = `[${text}](${inline.href})`;
      return text;
    })
    .join('');
}

function blockToMarkup(block: Block): string {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
      return inlinesToMarkup(block.inlines);
    case 'list':
      return block.items
        .map((item, i) => `${block.ordered ? `${i + 1}.` : '-'} ${inlinesToMarkup(item).replace(/\n/g, ' ')}`)
        .join('\n');
    case 'quote':
      return block.blocks
        .map(blockToMarkup)
        .join('\n\n')
        .split('\n')
        .map(line => (line ? `> ${line}` : '>'))
        .join('\n');
    case 'code':
      return block.text;
    case 'rule':
      return '';
  }
}

export function htmlToMarkup(html: string | null | undefined): string {
  return parseHtml(html)
    .map(blockToMarkup)
    .filter(Boolean)
    .join('\n\n');
}

// --- markup -> HTML ----------------------------------------------------------

const INLINE_PATTERN = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^\n]+?)\*\*|~~([^\n]+?)~~|`([^`\n]+)`|(^|[^\w])_([^\n_]+?)_(?=[^\w]|$)/;

function safeHref(href: string): string | null {
  return /^(https?:|mailto:|tel:)/i.test(href) ? href : null;
}

export function inlineMarkupToHtml(text: string): string {
  let out = '';
  let rest = text;
  let match: RegExpExecArray | null;

  while ((match = INLINE_PATTERN.exec(rest))) {
    out += escapeHtml(rest.slice(0, match.index));
    const [whole, label, href, bold, strike, code, lead, italic] = match;
    if (label !== undefined) {
      const url = safeHref(href);
      out += url ? `<a href="${escapeHtml(url)}">${inlineMarkupToHtml(label)}</a>` : escapeHtml(whole);
    } else if (bold !== undefined) {
      out += `<strong>${inlineMarkupToHtml(bold)}</strong>`;
    } else if (strike !== undefined) {
      out += `<s>${inlineMarkupToHtml(strike)}</s>`;
    } else if (code !== undefined) {
      out += `<code>${escapeHtml(code)}</code>`;
    } else {
      out += `${escapeHtml(lead)}<em>${inlineMarkupToHtml(italic)}</em>`;
    }
    rest = rest.slice(match.index + whole.length);
  }
  return out + escapeHtml(rest);
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;

export function markupToHtml(markup: string): string {
  const lines = markup.replace(/\r\n?/g, '\n').split('\n');
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const list = BULLET.test(line) ? BULLET : NUMBERED.test(line) ? NUMBERED : null;
    if (list) {
      const items: string[] = [];
      while (i < lines.length && list.test(lines[i])) {
        items.push(`<li>${inlineMarkupToHtml(lines[i].match(list)![1].trim())}</li>`);
        i += 1;
      }
      const tag = list === BULLET ? 'ul' : 'ol';
      html.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push(lines[i].match(QUOTE)![1]);
        i += 1;
      }
      html.push(`<blockquote>${markupToHtml(quoted.join('\n'))}</blockquote>`);
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !BULLET.test(lines[i]) && !NUMBERED.test(lines[i]) && !QUOTE.test(lines[i])) {
      paragraph.push(inlineMarkupToHtml(lines[i].trim()));
      i += 1;
    }
    html.push(`<p>${paragraph.join('<br>')}</p>`);
  }
  return html.join('');
}
