import React, { useMemo, useState } from 'react';
import { Linking, Modal, StyleSheet, Text, TouchableOpacity, View, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { parseHtml, type Block, type Inline } from '../services/richText';
import { Button, TextField } from './forms';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';

/** Renders a message body's HTML natively. */
export function RichText({ html, size = 15 }: { html: string | null | undefined; size?: number }) {
  const blocks = useMemo(() => parseHtml(html), [html]);
  const styles = useThemedStyles(makeStyles);
  if (!blocks.length) return null;
  return (
    <View style={styles.blocks}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} size={size} />
      ))}
    </View>
  );
}

function BlockView({ block, size }: { block: Block; size: number }) {
  const styles = useThemedStyles(makeStyles);
  const base: TextStyle = { fontSize: size, lineHeight: Math.round(size * 1.45) };

  switch (block.type) {
    case 'paragraph':
      return <InlineText inlines={block.inlines} style={[styles.text, base]} />;
    case 'heading':
      return <InlineText inlines={block.inlines} style={[styles.text, base, styles.heading]} />;
    case 'list':
      return (
        <View style={styles.list}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.listItem}>
              <Text style={[styles.text, base, styles.marker]}>{block.ordered ? `${i + 1}.` : '•'}</Text>
              <InlineText inlines={item} style={[styles.text, base, styles.flex]} />
            </View>
          ))}
        </View>
      );
    case 'quote':
      return (
        <View style={styles.quote}>
          {block.blocks.map((inner, i) => (
            <BlockView key={i} block={inner} size={size} />
          ))}
        </View>
      );
    case 'code':
      return (
        <View style={styles.pre}>
          <Text style={[styles.text, styles.mono, { fontSize: size - 1 }]}>{block.text}</Text>
        </View>
      );
    case 'rule':
      return <View style={styles.rule} />;
  }
}

function InlineText({ inlines, style }: { inlines: Inline[]; style: TextStyle | TextStyle[] }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Text style={style}>
      {inlines.map((inline, i) => {
        const marks: TextStyle[] = [];
        if (inline.bold) marks.push(styles.bold);
        if (inline.italic) marks.push(styles.italic);
        if (inline.code) marks.push(styles.mono);
        if (inline.href) marks.push(styles.link);
        const decorations = [inline.underline || inline.href ? 'underline' : null, inline.strike ? 'line-through' : null]
          .filter(Boolean)
          .join(' ');
        if (decorations) marks.push({ textDecorationLine: decorations as TextStyle['textDecorationLine'] });

        return (
          <Text
            key={i}
            style={marks}
            onPress={inline.href ? () => Linking.openURL(inline.href!).catch(() => {}) : undefined}
            accessibilityRole={inline.href ? 'link' : undefined}
          >
            {inline.text}
          </Text>
        );
      })}
    </Text>
  );
}

type Selection = { start: number; end: number };

/**
 * The composer's body field: plain text with markup, plus a toolbar that
 * applies it the way the web editor's toolbar does (bold, italic, strike,
 * links, lists, quotes).
 */
export function MarkupEditor({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [selection, setSelection] = useState<Selection>({ start: value.length, end: value.length });
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');

  const wrap = (marker: string, fallback: string) => {
    const { start, end } = selection;
    const chosen = value.slice(start, end) || fallback;
    onChangeText(`${value.slice(0, start)}${marker}${chosen}${marker}${value.slice(end)}`);
  };

  // Prefixes every line the selection touches.
  const prefixLines = (prefix: (index: number) => string) => {
    const { start, end } = selection;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const nextBreak = value.indexOf('\n', end);
    const lineEnd = nextBreak === -1 ? value.length : nextBreak;
    const lines = value.slice(lineStart, lineEnd).split('\n').map((line, i) => `${prefix(i)}${line}`);
    onChangeText(`${value.slice(0, lineStart)}${lines.join('\n')}${value.slice(lineEnd)}`);
  };

  const insertLink = () => {
    const url = linkUrl.trim();
    setLinkOpen(false);
    if (!/^(https?:|mailto:|tel:)/i.test(url)) return;
    const { start, end } = selection;
    const label = value.slice(start, end) || url;
    onChangeText(`${value.slice(0, start)}[${label}](${url})${value.slice(end)}`);
    setLinkUrl('https://');
  };

  const tools: { icon: keyof typeof Ionicons.glyphMap | null; label: string; text?: string; onPress: () => void }[] = [
    { icon: null, text: 'B', label: 'Bold', onPress: () => wrap('**', 'bold text') },
    { icon: null, text: 'I', label: 'Italic', onPress: () => wrap('_', 'italic text') },
    { icon: null, text: 'S', label: 'Strikethrough', onPress: () => wrap('~~', 'struck text') },
    { icon: 'link', label: 'Link', onPress: () => setLinkOpen(true) },
    { icon: 'list', label: 'Bulleted list', onPress: () => prefixLines(() => '- ') },
    { icon: 'list-circle-outline', label: 'Numbered list', onPress: () => prefixLines(i => `${i + 1}. `) },
    { icon: 'chatbox-ellipses-outline', label: 'Quote', onPress: () => prefixLines(() => '> ') },
  ];

  return (
    <View style={styles.editor}>
      <View style={styles.toolbar}>
        {tools.map(tool => (
          <TouchableOpacity
            key={tool.label}
            style={styles.tool}
            onPress={tool.onPress}
            accessibilityRole="button"
            accessibilityLabel={tool.label}
          >
            {tool.icon ? (
              <Ionicons name={tool.icon} size={18} color={colors.gray[700]} />
            ) : (
              <Text
                style={[
                  styles.toolText,
                  tool.text === 'I' && styles.italic,
                  tool.text === 'S' && { textDecorationLine: 'line-through' },
                ]}
              >
                {tool.text}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
      <TextField
        value={value}
        onChangeText={onChangeText}
        onSelectionChange={e => setSelection(e.nativeEvent.selection)}
        placeholder={placeholder}
        multiline
        style={styles.editorInput}
        autoCapitalize="sentences"
      />
      <Modal visible={linkOpen} transparent animationType="fade" onRequestClose={() => setLinkOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Add a link</Text>
            <TextField
              value={linkUrl}
              onChangeText={setLinkUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              autoFocus
            />
            <View style={styles.dialogActions}>
              <Button title="Cancel" variant="link" onPress={() => setLinkOpen(false)} />
              <Button title="Add link" variant="primary" onPress={insertLink} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  flex: { flex: 1 },
  blocks: { gap: 10 },
  text: { color: colors.gray[800] },
  heading: { fontWeight: '700', color: colors.gray[900] },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  mono: { fontFamily: 'Menlo', backgroundColor: colors.gray[100] },
  link: { color: colors.text.accent },
  list: { gap: 4 },
  listItem: { flexDirection: 'row', gap: 8 },
  marker: { minWidth: 16, color: colors.gray[600] },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.gray[300], paddingLeft: 12, gap: 8 },
  pre: { backgroundColor: colors.gray[100], borderRadius: 8, padding: 10 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.gray[300] },
  editor: { gap: 8 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tool: {
    width: 38,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray[100],
  },
  toolText: { fontSize: 16, fontWeight: '800', color: colors.gray[700] },
  editorInput: { minHeight: 180 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: colors.surface, borderRadius: 16, padding: 18, gap: 12 },
  dialogTitle: { fontSize: 17, fontWeight: '700', color: colors.gray[900] },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
