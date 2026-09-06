import assert from 'node:assert/strict';
import { deflateRawSync, crc32 } from 'node:zlib';
export function pptxFixture(slideText = '第一章：学习方法') {
  const entries = [
    [
      'ppt/presentation.xml',
      '<p:presentation><p:sldIdLst><p:sldId r:id="r2"/><p:sldId r:id="r1"/></p:sldIdLst></p:presentation>',
    ],
    [
      'ppt/_rels/presentation.xml.rels',
      '<Relationships><Relationship Id="r1" Target="slides/slide1.xml"/><Relationship Id="r2" Target="slides/slide2.xml"/></Relationships>',
    ],
    [
      'ppt/slides/slide1.xml',
      '<p:sld><a:p><a:r><a:t>第二部分 &amp; 练习</a:t></a:r></a:p></p:sld>',
    ],
    [
      'ppt/slides/slide2.xml',
      `<p:sld><a:p><a:r><a:t>${slideText}</a:t></a:r></a:p><a:p><a:r><a:t>间隔复习有助于长期记忆。</a:t></a:r></a:p></p:sld>`,
    ],
  ];
  let offset = 0;
  const locals = [],
    centrals = [];
  for (const [path, text] of entries) {
    const name = Buffer.from(path),
      raw = Buffer.from(text),
      compressed = deflateRawSync(raw),
      local = Buffer.alloc(30),
      central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(raw), 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, compressed);
    centrals.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(centrals),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
export async function verifyCourseware(server, check, state) {
  const cw = await server.ssrLoadModule('/lib/courseware.ts'),
    files = await server.ssrLoadModule('/lib/courseware-file.ts'),
    nav = await server.ssrLoadModule('/lib/app-navigation.ts');
  check(
    'schedule belongs to daily activities and old bookmarks redirect',
    () => {
      assert.deepEqual(nav.parseNavigation('#tools/schedule'), {
        page: 'daily',
        sub: 'schedule',
      });
      assert.deepEqual(nav.parseNavigation('#daily/schedule'), {
        page: 'daily',
        sub: 'schedule',
      });
      assert.deepEqual(nav.parseNavigation('#tools/courseware'), {
        page: 'tools',
        sub: 'courseware',
      });
      assert.deepEqual(nav.parseNavigation('#daily/courseware'), {
        page: 'daily',
        sub: undefined,
      });
    },
  );
  const extracted = await files.readCoursewareFile(
    new File([pptxFixture()], '课程.pptx'),
  );
  check(
    'PPTX extraction follows presentation order and decodes XML text',
    () => {
      assert.ok(extracted.indexOf('第一章') < extracted.indexOf('第二部分'));
      assert.match(extracted, /第二部分 & 练习/);
      assert.match(extracted, /第 2 页/);
    },
  );
  await assert.rejects(
    files.readCoursewareFile(new File(['broken'], '坏文件.pptx')),
    /损坏/,
  );
  await assert.rejects(
    files.readCoursewareFile(new File(['pdf'], '课件.pdf')),
    /PDF/,
  );
  await assert.rejects(
    files.readCoursewareFile(new File(['x'.repeat(50001)], '过长.txt')),
    /5 万/,
  );
  check('unsupported corrupt and oversized courseware is rejected', () => {});
  const material =
      '第一章 学习方法\n\n间隔复习有助于长期记忆。\n通过练习检验理解。',
    result = cw.localCourseware(material);
  check(
    'local courseware is a labelled extract without fabricated questions',
    () => {
      assert.ok(cw.validCoursewareResult(result));
      assert.equal(result.questions.length, 0);
      assert.ok(result.keyPoints.every((p) => material.includes(p)));
    },
  );
  check('courseware backup is independent of notes and schedule input', () => {
    const d = state.createAppData();
    d.material = '明天上课';
    d.note.transcript = '会议记录';
    d.courseware = {
      title: '学习方法',
      material,
      result,
      source: '本地摘录',
      resultMaterial: material,
    };
    const next = state.validateAppData(JSON.parse(JSON.stringify(d)));
    assert.deepEqual(next.courseware, d.courseware);
    assert.equal(next.note.transcript, '会议记录');
    assert.equal(next.material, '明天上课');
    assert.throws(() =>
      state.validateAppData({
        ...d,
        courseware: { ...d.courseware, result: { summary: 5 } },
      }),
    );
    assert.match(cw.coursewareMarkdown(next.courseware), /## 提纲/);
  });
  const api = await server.ssrLoadModule('/app/api/ai/courseware/route.ts');
  const previous = process.env.OPENAI_API_KEY,
    fetchBefore = globalThis.fetch;
  const request = (body) =>
    new Request('http://localhost/api/ai/courseware', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  try {
    delete process.env.OPENAI_API_KEY;
    const local = await (await api.POST(request({ material }))).json();
    const empty = await api.POST(request({}));
    const large = await api.POST(request({ material: 'x'.repeat(50001) }));
    check('courseware endpoint works without a key and validates input', () => {
      assert.equal(local.source, 'fallback');
      assert.match(local.warning, /本地/);
      assert.equal(empty.status, 400);
      assert.equal(large.status, 413);
    });
    process.env.OPENAI_API_KEY = 'test-only';
    globalThis.fetch = async () => {
      throw new Error('offline');
    };
    const failed = await (await api.POST(request({ material }))).json();
    check(
      'failed courseware service falls back without losing material',
      () => {
        assert.equal(failed.source, 'fallback');
        assert.match(failed.warning, /暂时不可用/);
        assert.ok(cw.validCoursewareResult(failed.result));
      },
    );
    globalThis.fetch = async () =>
      Response.json({
        output_text: JSON.stringify({
          ...result,
          questions: ['如何检验理解？'],
        }),
      });
    const ai = await (await api.POST(request({ material }))).json();
    check(
      'configured courseware endpoint accepts validated structured output',
      () => {
        assert.equal(ai.source, 'ai');
        assert.deepEqual(ai.result.questions, ['如何检验理解？']);
      },
    );
  } finally {
    globalThis.fetch = fetchBefore;
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
}
