const FLAG = 'disable-model-invocation: true';

export function ensureManualOnly(markdown) {
  if (!markdown.startsWith('---')) {
    throw new Error('SKILL.md has no leading frontmatter');
  }
  const eol = markdown.includes('\r\n') ? '\r\n' : '\n';
  const close = markdown.indexOf(eol + '---', 3);
  if (close === -1) {
    throw new Error('SKILL.md has unterminated frontmatter');
  }
  const head = markdown.slice(0, close);
  if (/^disable-model-invocation:\s*true\s*$/m.test(head)) {
    return markdown;
  }
  return head + eol + FLAG + markdown.slice(close);
}
