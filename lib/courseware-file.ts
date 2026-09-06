const MAX_FILE = 10 * 1024 * 1024,
  MAX_TEXT = 50000,
  MAX_XML = 2 * 1024 * 1024;
const decodeXml = (s: string) =>
  s.replace(/&(?:lt|gt|amp|quot|apos|#\d+|#x[\da-f]+);/gi, (v) => {
    const named: Record<string, string> = {
      '&lt;': '<',
      '&gt;': '>',
      '&amp;': '&',
      '&quot;': '"',
      '&apos;': "'",
    };
    if (named[v]) return named[v];
    const code = v.startsWith('&#x')
      ? parseInt(v.slice(3, -1), 16)
      : Number(v.slice(2, -1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
export async function readCoursewareFile(file: File): Promise<string> {
  try {
    return await readFileContent(file);
  } catch (error) {
    if (error instanceof RangeError)
      throw new Error('课件文件损坏，请重新导出。');
    if (error instanceof TypeError)
      throw new Error('无法读取此课件，请重新导出或复制文字后粘贴。');
    throw error;
  }
}
async function readFileContent(file: File): Promise<string> {
  if (file.size > MAX_FILE) throw new Error('请选择 10 MB 以内的课件。');
  if (/\.(txt|md)$/i.test(file.name)) {
    const text = await file.text();
    if (text.includes('\0')) throw new Error('文件不是可读取的文本。');
    return checkText(text);
  }
  if (!/\.pptx$/i.test(file.name))
    throw new Error(
      '支持 PPTX、TXT 和 Markdown。PDF 或旧版 PPT 请复制文字后粘贴。',
    );
  const buffer = await file.arrayBuffer(),
    view = new DataView(buffer),
    bytes = new Uint8Array(buffer);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error('PPTX 文件损坏或已加密，请重新导出。');
  const count = view.getUint16(end + 10, true),
    offset = view.getUint32(end + 16, true);
  if (count > 10000) throw new Error('课件内容过多，请分章导出。');
  const entries = new Map<
    string,
    { offset: number; size: number; raw: number; method: number }
  >();
  let pos = offset;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > bytes.length || view.getUint32(pos, true) !== 0x02014b50)
      throw new Error('PPTX 目录损坏。');
    const nameLength = view.getUint16(pos + 28, true),
      extra = view.getUint16(pos + 30, true),
      comment = view.getUint16(pos + 32, true);
    const name = new TextDecoder().decode(
      bytes.subarray(pos + 46, pos + 46 + nameLength),
    );
    if (
      /^ppt\/(slides\/slide\d+\.xml|presentation\.xml|_rels\/presentation\.xml\.rels)$/.test(
        name,
      )
    ) {
      if (view.getUint16(pos + 8, true) & 1)
        throw new Error('请先移除课件密码。');
      entries.set(name, {
        offset: view.getUint32(pos + 42, true),
        size: view.getUint32(pos + 20, true),
        raw: view.getUint32(pos + 24, true),
        method: view.getUint16(pos + 10, true),
      });
    }
    pos += 46 + nameLength + extra + comment;
  }
  let total = 0;
  const read = async (name: string) => {
    const e = entries.get(name);
    if (!e) throw new Error('课件缺少幻灯片内容。');
    if (
      e.raw > MAX_XML ||
      e.offset + 30 > bytes.length ||
      view.getUint32(e.offset, true) !== 0x04034b50
    )
      throw new Error('课件内容异常或过大。');
    const start =
      e.offset +
      30 +
      view.getUint16(e.offset + 26, true) +
      view.getUint16(e.offset + 28, true);
    if (start + e.size > bytes.length) throw new Error('课件内容不完整。');
    let out: Uint8Array;
    if (e.method === 0) out = bytes.slice(start, start + e.size);
    else if (e.method === 8) {
      const reader = new Blob([bytes.slice(start, start + e.size)])
        .stream()
        .pipeThrough(new DecompressionStream('deflate-raw'))
        .getReader();
      const parts: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > MAX_XML) {
          await reader.cancel();
          throw new Error('单页课件过大，请拆分后导入。');
        }
        parts.push(part.value);
      }
      out = new Uint8Array(size);
      let p = 0;
      for (const part of parts) {
        out.set(part, p);
        p += part.length;
      }
    } else throw new Error('不支持此课件的压缩格式，请重新另存为 PPTX。');
    total += out.length;
    if (out.length !== e.raw || total > 8 * 1024 * 1024)
      throw new Error('课件内容异常或过大。');
    return new TextDecoder().decode(out);
  };
  const presentation = await read('ppt/presentation.xml'),
    rels = await read('ppt/_rels/presentation.xml.rels');
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*\/?\s*>/g)) {
    const id = m[0].match(/\bId="([^"]+)"/)?.[1],
      target = m[0].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) {
      const path = target.startsWith('/')
        ? target.slice(1)
        : 'ppt/' + target.replace(/^\.\//, '');
      if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) targets.set(id, path);
    }
  }
  const ordered = [
    ...presentation.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g),
  ].map((m) => targets.get(m[1]));
  if (!ordered.length || ordered.length > 300 || ordered.some((p) => !p))
    throw new Error('无法读取幻灯片顺序，或课件超过 300 页。');
  const pages: string[] = [];
  let textLength = 0;
  for (const [index, name] of ordered.entries()) {
    const xml = await read(name!),
      text = [...xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)]
        .map((p) =>
          [...p[1].matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)]
            .map((m) => decodeXml(m[1]))
            .join(''),
        )
        .filter(Boolean)
        .join('\n');
    if (text) {
      const page = `第 ${index + 1} 页\n${text}`;
      textLength += page.length;
      if (textLength > MAX_TEXT)
        throw new Error('文字超过 5 万字，请按章节拆分。');
      pages.push(page);
    }
  }
  if (!pages.length)
    throw new Error(
      '课件未包含可提取的文字。图片或扫描课件请先识别文字后粘贴。',
    );
  return checkText(pages.join('\n\n'));
}
function checkText(text: string) {
  if (!text.trim()) throw new Error('文件中没有可整理的文字。');
  if (text.length > MAX_TEXT)
    throw new Error('文字超过 5 万字，请按章节拆分。');
  return text.trim();
}
