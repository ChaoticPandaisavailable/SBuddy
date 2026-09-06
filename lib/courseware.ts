export type CoursewareResult = {
  summary: string;
  outline: { title: string; points: string[] }[];
  keyPoints: string[];
  questions: string[];
};
export type Courseware = {
  title: string;
  material: string;
  result?: CoursewareResult;
  source?: string;
  resultMaterial?: string;
};
export function localCourseware(material: string): CoursewareResult {
  const paragraphs = material
    .split(/\n\s*\n|(?=^第\s*\d+\s*页)/m)
    .map((s) => s.trim())
    .filter(Boolean);
  const chunks =
    paragraphs.length > 1
      ? paragraphs
      : material
          .split(/\n/)
          .map((s) => s.trim())
          .filter(Boolean);
  const outline = chunks.slice(0, 20).map((text, i) => {
    const lines = text
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      title:
        lines.length > 1
          ? lines[0].replace(/^#+\s*/, '').slice(0, 100)
          : `要点 ${i + 1}`,
      points: (lines.length > 1 ? lines.slice(1) : lines)
        .map((s) => s.slice(0, 500))
        .slice(0, 8),
    };
  });
  const sentences = material
    .split(/\n|(?<=[。！？])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5 && !/^第\s*\d+\s*页$/.test(s));
  return {
    summary: sentences.slice(0, 2).join('\n').slice(0, 600),
    outline,
    keyPoints: [...new Set(sentences)].slice(0, 8).map((s) => s.slice(0, 300)),
    questions: [],
  };
}
export function validCoursewareResult(
  value: unknown,
): value is CoursewareResult {
  const r = value as CoursewareResult;
  const strings = (v: unknown, limit: number) =>
    Array.isArray(v) &&
    v.length <= limit &&
    v.every((s) => typeof s === 'string' && s.length <= 1000);
  return (
    !!r &&
    typeof r.summary === 'string' &&
    r.summary.length <= 2000 &&
    Array.isArray(r.outline) &&
    r.outline.length <= 30 &&
    r.outline.every(
      (s) =>
        s &&
        typeof s.title === 'string' &&
        s.title.length <= 200 &&
        strings(s.points, 12),
    ) &&
    strings(r.keyPoints, 15) &&
    strings(r.questions, 12)
  );
}
export function coursewareMarkdown(courseware: Courseware): string {
  const r = courseware.result;
  if (!r) return '';
  return [
    `# ${courseware.title || '课件整理'}`,
    courseware.source ?? '',
    r.summary,
    '## 提纲',
    ...r.outline.map(
      (s) => `### ${s.title}\n${s.points.map((p) => '- ' + p).join('\n')}`,
    ),
    '## 重点',
    ...r.keyPoints.map((p) => '- ' + p),
    ...(r.questions.length
      ? ['## 自测问题', ...r.questions.map((p, i) => `${i + 1}. ${p}`)]
      : []),
  ].join('\n\n');
}
