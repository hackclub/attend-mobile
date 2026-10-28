import {
  hasUnsupportedFormatting,
  htmlToMarkup,
  markupToHtml,
  parseHtml,
} from '../richText';

describe('parseHtml', () => {
  it('splits paragraphs and keeps inline marks and links', () => {
    expect(parseHtml('<p>Hello <strong>there</strong></p><p>See <a href="https://hackclub.com">site</a></p>')).toEqual([
      { type: 'paragraph', inlines: [{ text: 'Hello ' }, { text: 'there', bold: true }] },
      { type: 'paragraph', inlines: [{ text: 'See ' }, { text: 'site', href: 'https://hackclub.com' }] },
    ]);
  });

  it('reads lists, quotes and line breaks', () => {
    expect(parseHtml('<ul><li>One</li><li><em>Two</em></li></ul><blockquote><p>Quoted</p></blockquote><p>a<br>b</p>')).toEqual([
      { type: 'list', ordered: false, items: [[{ text: 'One' }], [{ text: 'Two', italic: true }]] },
      { type: 'quote', blocks: [{ type: 'paragraph', inlines: [{ text: 'Quoted' }] }] },
      { type: 'paragraph', inlines: [{ text: 'a\nb' }] },
    ]);
  });

  it('decodes entities and tolerates unclosed and stray tags', () => {
    expect(parseHtml('<p>Fish &amp; chips</b><p>Next &#8212; on')).toEqual([
      { type: 'paragraph', inlines: [{ text: 'Fish & chips' }] },
      { type: 'paragraph', inlines: [{ text: 'Next — on' }] },
    ]);
  });

  it('treats a plain-text body as one paragraph', () => {
    expect(parseHtml('Just text')).toEqual([{ type: 'paragraph', inlines: [{ text: 'Just text' }] }]);
  });
});

describe('markup round trip', () => {
  const cases = [
    'Hello **there**',
    'A _quiet_ word and ~~struck~~ and `code`',
    'Read [the docs](https://hackclub.com/docs)',
    '- One\n- Two',
    '1. First\n2. Second',
    '> Quoted line',
    'Line one\nLine two\n\nNew paragraph',
  ];

  it.each(cases)('keeps %j through HTML and back', markup => {
    expect(htmlToMarkup(markupToHtml(markup))).toBe(markup);
  });

  it('writes only tags the server keeps', () => {
    expect(markupToHtml('**Bus** at _9_\n\n- [Map](https://maps.example.com)')).toBe(
      '<p><strong>Bus</strong> at <em>9</em></p><ul><li><a href="https://maps.example.com">Map</a></li></ul>'
    );
  });

  it('escapes HTML typed into the composer', () => {
    expect(markupToHtml('1 < 2 & <script>')).toBe('<p>1 &lt; 2 &amp; &lt;script&gt;</p>');
  });

  it('refuses links that are not web, mail or phone', () => {
    expect(markupToHtml('[x](javascript:alert(1))')).not.toContain('<a');
  });

  it('leaves snake_case words alone', () => {
    expect(markupToHtml('use some_variable_name')).toBe('<p>use some_variable_name</p>');
  });
});

describe('hasUnsupportedFormatting', () => {
  it('flags tags the composer would drop', () => {
    expect(hasUnsupportedFormatting('<p><u>under</u></p>')).toBe(true);
    expect(hasUnsupportedFormatting('<p><strong>fine</strong></p>')).toBe(false);
  });
});
