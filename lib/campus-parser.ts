import {
  newCampusId,
  periodSpan,
  type CampusCourse,
  type CampusDataSource,
  type CampusExam,
} from '@/lib/campus-data';

export type CampusImportTarget = 'courses' | 'exams';

export type CampusCaptureTable = {
  headers: string[];
  rows: string[][];
};

export type CampusCapture = {
  __niluCampusCapture?: true;
  target?: CampusImportTarget;
  url?: string;
  title?: string;
  semesterHint?: string;
  text?: string;
  tables?: CampusCaptureTable[];
};

export type CampusParseResult = {
  target: CampusImportTarget;
  semester?: string;
  courses: CampusCourse[];
  exams: CampusExam[];
  warning?: string;
};

export const RUC_CAMPUS_ROUTES = {
  courses: 'https://jw.ruc.edu.cn/Njw2017/index.html#/student/student-course-list/',
  exams: 'https://jw.ruc.edu.cn/Njw2017/index.html#/student/test-arrange-search/',
} as const;

export function parseCampusImport(
  raw: string,
  requestedTarget: CampusImportTarget,
  source: CampusDataSource = 'manual',
): CampusParseResult {
  const capture = decodeCapture(raw, requestedTarget);
  const target = capture.target ?? inferTarget(capture) ?? requestedTarget;
  const effectiveSource: CampusDataSource = capture.__niluCampusCapture ? 'shuzhi' : source;
  const semester = normalizeSemester(capture.semesterHint ?? capture.text ?? raw);
  const tables = capture.tables?.length ? capture.tables : tablesFromHtmlOrText(raw);
  if (target === 'courses') {
    const courses = parseCourseTables(tables, semester ?? '', effectiveSource);
    return {
      target,
      semester,
      courses,
      exams: [],
      warning: courses.length ? undefined : '没有识别到课表。请确认包含星期表头、课程名、节次和周次。',
    };
  }
  const exams = parseExamTables(tables, capture.text ?? raw, effectiveSource);
  return {
    target,
    semester,
    courses: [],
    exams,
    warning: exams.length ? undefined : '没有识别到考试。请确认包含课程名、日期、时间或考场。',
  };
}

export function bridgeCollectorScript(origin: string): string {
  const targetOrigin = JSON.stringify(origin);
  return `javascript:(()=>{const url=location.href;const target=url.includes('test-arrange-search')?'exams':url.includes('student-course-list')?'courses':'';if(!target){alert('请只在“课表查看”或“考试日程查询”页面使用采集桥。');return}const c=(v)=>String(v||'').replace(/[ \\t]+/g,' ').trim();const rows=(t)=>Array.from(t.querySelectorAll('tr')).map(r=>Array.from(r.querySelectorAll('th,td')).map(x=>c(x.innerText)));const tables=Array.from(document.querySelectorAll('table')).map(t=>{const r=rows(t);return{headers:r[0]||[],rows:r.slice(1)}}).filter(t=>t.headers.length||t.rows.length);const text=(document.body&&document.body.innerText||'').slice(0,200000);const payload={__niluCampusCapture:true,target,url,title:document.title,semesterHint:(text.match(/\\d{4}\\s*[-—–年]\\s*\\d{4}[^\\n]{0,12}(?:第一|第二|1|2)学期/)||[])[0]||'',text,tables};if(window.opener&&!window.opener.closed){window.opener.postMessage(payload,${targetOrigin});alert('已发送给学习搭子，可返回查看预览。')}else{navigator.clipboard.writeText(JSON.stringify(payload)).then(()=>alert('采集结果已复制，请回到学习搭子粘贴导入。'))}})()`;
}

export function isCampusCaptureMessage(value: unknown): value is CampusCapture {
  return Boolean(value && typeof value === 'object' && (value as CampusCapture).__niluCampusCapture === true);
}

function decodeCapture(raw: string, requestedTarget: CampusImportTarget): CampusCapture {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as CampusCapture & {
        courses?: Array<Partial<CampusCourse>>;
        exams?: Array<Partial<CampusExam>>;
      };
      if (parsed.tables || parsed.text || parsed.__niluCampusCapture) return parsed;
      if (requestedTarget === 'courses' && Array.isArray(parsed.courses)) {
        return {
          target: 'courses',
          semesterHint: parsed.semesterHint,
          tables: [{
            headers: ['课程', '教师', '地点', '星期', '节次', '周次'],
            rows: parsed.courses.map((course) => [
              course.courseName ?? '', course.teacher ?? '', course.location ?? '',
              String(course.weekday ?? ''), (course.periods ?? []).join(','), (course.weeks ?? []).join(','),
            ]),
          }],
        };
      }
      if (requestedTarget === 'exams' && Array.isArray(parsed.exams)) {
        return {
          target: 'exams',
          tables: [{
            headers: ['课程', '日期', '时间', '地点'],
            rows: parsed.exams.map((exam) => [exam.courseName ?? '', exam.date ?? '', exam.time ?? '', exam.location ?? '']),
          }],
        };
      }
    } catch {
      // Continue with HTML/text parsing.
    }
  }
  return { target: requestedTarget, text: raw };
}

function inferTarget(capture: CampusCapture): CampusImportTarget | undefined {
  const identity = `${capture.url ?? ''} ${capture.title ?? ''} ${capture.text?.slice(0, 800) ?? ''}`;
  if (/test-arrange-search|考试日程|考试安排/.test(identity)) return 'exams';
  if (/student-course-list|课表查看|我的课表/.test(identity)) return 'courses';
  return undefined;
}

function tablesFromHtmlOrText(raw: string): CampusCaptureTable[] {
  if (typeof DOMParser !== 'undefined' && /<table[\s>]/i.test(raw)) {
    const document = new DOMParser().parseFromString(raw, 'text/html');
    return [...document.querySelectorAll('table')].map((table) => {
      const rows = [...table.querySelectorAll('tr')].map((row) =>
        [...row.querySelectorAll('th,td')].map((cell) => clean(cell.textContent ?? '')),
      );
      const headerIndex = rows.findIndex((row) => row.some(Boolean));
      return {
        headers: headerIndex >= 0 ? rows[headerIndex] : [],
        rows: headerIndex >= 0 ? rows.slice(headerIndex + 1) : [],
      };
    });
  }
  const rows = raw.split(/\r?\n/).map((line) => splitDelimited(line)).filter((row) => row.some(Boolean));
  if (!rows.length) return [];
  const headerIndex = rows.findIndex((row) => row.some((cell) => /课程|星期|日期|考试/.test(cell)));
  const index = headerIndex >= 0 ? headerIndex : 0;
  return [{ headers: rows[index], rows: rows.slice(index + 1) }];
}

function parseCourseTables(tables: CampusCaptureTable[], semester: string, source: CampusDataSource): CampusCourse[] {
  const result: CampusCourse[] = [];
  for (const table of tables) {
    const allRows = [table.headers, ...table.rows].filter((row) => row.some((cell) => clean(cell)));
    const headerIndex = allRows.findIndex((row) =>
      row.filter((cell) => weekdayOf(cell)).length >= 2 || row.some((cell) => /课程名称|课程名/.test(clean(cell))),
    );
    if (headerIndex < 0) continue;
    const header = allRows[headerIndex].map(clean);
    const dataRows = allRows.slice(headerIndex + 1);
    const weekdays = new Map<number, number>();
    header.forEach((cell, index) => {
      const weekday = weekdayOf(cell);
      if (weekday) weekdays.set(index, weekday);
    });
    if (weekdays.size >= 2) {
      for (const row of dataRows) {
        for (const [column, weekday] of weekdays) {
          const cell = row[column];
          if (!cell) continue;
          const course = courseFromCell(cell, weekday, semester, source);
          if (course) result.push(course);
        }
      }
      continue;
    }

    const indexes = headerIndexes(header);
    if (indexes.course < 0) continue;
    for (const row of dataRows) {
      const name = clean(row[indexes.course] ?? '');
      if (!name || /课程名称|暂无|未找到/.test(name)) continue;
      const weekday = weekdayOf(row[indexes.weekday] ?? '') ?? Number(row[indexes.weekday] ?? 0);
      if (!weekday || weekday < 1 || weekday > 7) continue;
      const periodsText = row[indexes.periods] ?? '';
      const weeksText = row[indexes.weeks] ?? '';
      const periods = periodsOf(periodsText);
      const weeks = weeksOf(weeksText);
      const [startMinutes, endMinutes] = periodSpan(periods);
      result.push({
        id: newCampusId('course'), semester, courseName: name,
        teacher: clean(row[indexes.teacher] ?? '') || undefined,
        location: clean(row[indexes.location] ?? '') || undefined,
        weekday, periods, weeks, startMinutes, endMinutes,
        raw: row.join('|'), source,
      });
    }
  }
  return mergeCourseBlocks(uniqueBy(result, courseIdentity));
}

function courseFromCell(
  cell: string,
  weekday: number,
  semester: string,
  source: CampusDataSource,
): CampusCourse | undefined {
  const raw = cell.trim();
  if (!raw || /暂无|未找到|星期/.test(raw)) return undefined;
  const periods = periodsOf(raw);
  if (!periods.length) return undefined;
  const weeks = weeksOf(raw);
  const lines = raw.split(/[\r\n]+|\s{2,}/).map(clean).filter(Boolean);
  const timeIndex = lines.findIndex((line) => /\d[^\n]*节/.test(line));
  const prefix = timeIndex >= 0 ? lines.slice(0, timeIndex) : lines;
  let courseName = clean(prefix[0] ?? raw.split('/')[0]);
  courseName = courseName.replace(/^(课程名称|课程)[:：]?/, '').trim();
  if (courseName.length < 2 || /\d+节/.test(courseName)) return undefined;
  const teacher = clean(prefix[1] ?? '').replace(/^教师[:：]?/, '') || undefined;
  let location = clean(prefix.at(-1) ?? '').replace(/^地点[:：]?/, '');
  if (location === courseName || location === teacher) location = '';
  const slashLocation = raw.match(/(?:^|\n|\/)([^/\n]{2,24})\s*\/\s*\d[\d,，、\-–—至到]*节/);
  if (slashLocation) location = clean(slashLocation[1]);
  const [startMinutes, endMinutes] = periodSpan(periods);
  return {
    id: newCampusId('course'), semester, courseName, teacher,
    location: location || undefined, weekday, periods, weeks,
    startMinutes, endMinutes, raw, source,
  };
}

function parseExamTables(tables: CampusCaptureTable[], fallbackText: string, source: CampusDataSource): CampusExam[] {
  const result: CampusExam[] = [];
  for (const table of tables) {
    const allRows = [table.headers, ...table.rows].filter((row) => row.some((cell) => clean(cell)));
    const headerIndex = allRows.findIndex((row) => {
      const joined = row.join('');
      return (/课程|科目/.test(joined) && /日期|时间|考场|考试/.test(joined)) || row.filter((cell) => weekdayOf(cell)).length >= 2;
    });
    if (headerIndex < 0) continue;
    const header = allRows[headerIndex].map(clean);
    const dataRows = allRows.slice(headerIndex + 1);
    const weekdayColumns = header.map((cell, index) => weekdayOf(cell) ? index : -1).filter((index) => index >= 0);
    if (weekdayColumns.length >= 2) {
      for (const row of dataRows) {
        for (const column of weekdayColumns) {
          const exam = examFromCell(row[column] ?? '', source);
          if (exam) result.push(exam);
        }
      }
      continue;
    }
    const indexes = headerIndexes(header);
    for (const row of dataRows) {
      const joined = row.join(' ');
      const date = normalizeExamDate(indexes.date >= 0 ? row[indexes.date] : joined);
      if (!date) continue;
      const courseName = clean(indexes.course >= 0 ? row[indexes.course] : examNameFromText(joined));
      if (!courseName || /课程名称|暂无|未找到/.test(courseName)) continue;
      result.push({
        id: newCampusId('exam'), courseName, date,
        time: examTimeOf(indexes.time >= 0 ? row[indexes.time] : joined),
        location: clean(indexes.location >= 0 ? row[indexes.location] : examLocationFromText(joined)) || undefined,
        source,
      });
    }
  }
  if (!result.length) {
    for (const line of fallbackText.split(/\r?\n/).map(clean).filter(Boolean)) {
      const date = normalizeExamDate(line);
      if (!date) continue;
      const courseName = examNameFromText(line);
      if (courseName.length < 2) continue;
      result.push({
        id: newCampusId('exam'), courseName, date,
        time: examTimeOf(line), location: examLocationFromText(line) || undefined, source,
      });
    }
  }
  return uniqueBy(result, (exam) => `${exam.courseName}|${exam.date}|${exam.time}`).slice(0, 80);
}

function examFromCell(cell: string, source: CampusDataSource): CampusExam | undefined {
  const raw = cell.trim();
  const date = normalizeExamDate(raw);
  if (!date || /暂无|未找到|无记录/.test(raw)) return undefined;
  const lines = raw.split(/[\r\n]+/).map(clean).filter(Boolean);
  const courseName = lines.find((line) =>
    line.length >= 2 && !normalizeExamDate(line) && !examTimeOf(line) && !/考场|座位|地点/.test(line),
  ) ?? examNameFromText(raw);
  if (courseName.length < 2) return undefined;
  const location = lines.find((line) => /楼|室|厅|阶|教室|考场|线上/.test(line)) ?? examLocationFromText(raw);
  return {
    id: newCampusId('exam'), courseName, date, time: examTimeOf(raw),
    location: clean(location).replace(/^(考场|地点)[:：]?/, '') || undefined,
    source,
  };
}

function headerIndexes(headers: string[]) {
  const find = (pattern: RegExp) => headers.findIndex((header) => pattern.test(header));
  return {
    course: find(/课程|科目|名称/), teacher: find(/教师|老师/), location: find(/地点|教室|考场/),
    weekday: find(/星期|周几/), periods: find(/节次|上课时间|时间地点/), weeks: find(/周次|教学周/),
    date: find(/日期|考试日/), time: find(/时间|场次/),
  };
}

function mergeCourseBlocks(courses: CampusCourse[]): CampusCourse[] {
  const merged: CampusCourse[] = [];
  for (const course of courses) {
    const existing = merged.find((item) =>
      item.semester === course.semester && item.courseName === course.courseName && item.weekday === course.weekday
      && item.teacher === course.teacher && item.location === course.location && item.weeks.join(',') === course.weeks.join(','),
    );
    if (!existing) {
      merged.push(course);
      continue;
    }
    const periods = [...new Set([...existing.periods, ...course.periods])].sort((a, b) => a - b);
    const [startMinutes, endMinutes] = periodSpan(periods);
    existing.periods = periods;
    existing.startMinutes = startMinutes;
    existing.endMinutes = endMinutes;
  }
  return merged;
}

function periodsOf(text: string): number[] {
  const range = text.match(/(\d{1,2})\s*[-—–~～至到]\s*(\d{1,2})\s*节/);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index).filter((value) => value <= 14);
  }
  const labelled = [...text.matchAll(/(\d{1,2})\s*节/g)].map((match) => Number(match[1]));
  if (labelled.length) return [...new Set(labelled)].filter((value) => value >= 1 && value <= 14);
  if (/^\s*\d{1,2}(?:\s*[,，、]\s*\d{1,2})*\s*$/.test(text)) {
    return [...new Set(text.split(/[,，、]/).map(Number))].filter((value) => value >= 1 && value <= 14);
  }
  const loose = text.match(/(?:节次|periods?)[:：\s]*([\d,，、\s]+)/i)?.[1];
  return loose ? loose.split(/[,，、\s]+/).map(Number).filter((value) => value >= 1 && value <= 14) : [];
}

function weeksOf(text: string): number[] {
  const weeks = new Set<number>();
  const region = text.match(/([\d,，、\-—–~～至到单双]+)\s*周/)?.[1]
    ?? (/^\s*\d+(?:\s*[,，、]\s*\d+)*\s*$/.test(text) ? text : '');
  for (const token of region.split(/[,，、]/)) {
    const range = token.match(/(\d+)\s*[-—–~～至到]\s*(\d+)/);
    if (range) {
      for (let week = Number(range[1]); week <= Number(range[2]) && week <= 30; week += 1) weeks.add(week);
    } else {
      const value = Number(token.match(/\d+/)?.[0]);
      if (value >= 1 && value <= 30) weeks.add(value);
    }
  }
  let result = [...weeks].sort((a, b) => a - b);
  if (/单周|单数周/.test(text)) result = result.filter((week) => week % 2 === 1);
  if (/双周|双数周/.test(text)) result = result.filter((week) => week % 2 === 0);
  return result;
}

function weekdayOf(text: string): number | undefined {
  const compact = clean(text);
  const chinese = compact.match(/(?:星期|周)([一二三四五六日天])/);
  if (chinese) return '一二三四五六日天'.indexOf(chinese[1]) % 7 + 1;
  const number = compact.match(/(?:星期|周)?([1-7])/);
  return number ? Number(number[1]) : undefined;
}

function normalizeSemester(text: string): string | undefined {
  const full = text.match(/(20\d{2})\s*[-—–年]\s*(20\d{2}).{0,16}?(?:第\s*)?([12一二])\s*学期/);
  if (full) return `${full[1]}-${full[2]}-${/[1一]/.test(full[3]) ? 1 : 2}`;
  const compact = text.match(/(20\d{2})\s*[-—–]\s*(20\d{2})\s*[-—–]\s*([12])/);
  return compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : undefined;
}

function normalizeExamDate(text: string): string | undefined {
  const match = text.match(/(?:(20\d{2})\s*[-./年]\s*(\d{1,2})\s*[-./月]\s*(\d{1,2})\s*日?)|(?:(\d{1,2})\s*月\s*(\d{1,2})\s*日)/);
  if (!match) return undefined;
  const year = Number(match[1] ?? new Date().getFullYear());
  const month = Number(match[2] ?? match[4]);
  const day = Number(match[3] ?? match[5]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${year}-${two(month)}-${two(day)}`;
}

function examTimeOf(text: string): string {
  const match = text.match(/(\d{1,2})\s*[:：时]\s*(\d{2})?(?:\s*分)?(?:\s*[-–—~至到]\s*(\d{1,2})\s*[:：时]\s*(\d{2})?)?/);
  if (!match) return '';
  const start = `${two(Number(match[1]))}:${two(Number(match[2] ?? 0))}`;
  return match[3] ? `${start}-${two(Number(match[3]))}:${two(Number(match[4] ?? 0))}` : start;
}

function examNameFromText(text: string): string {
  return clean(text
    .replace(/(?:(?:20\d{2})\s*[-./年]\s*)?\d{1,2}\s*[-./月]\s*\d{1,2}\s*日?/g, ' ')
    .replace(/\d{1,2}\s*[:：时]\s*\d{0,2}(?:\s*[-–—~至到]\s*\d{1,2}\s*[:：时]\s*\d{0,2})?/g, ' ')
    .replace(/(考试日程|考试安排|考试信息|查询|座位号?[:：]?\s*\d+)/g, ' ')
    .split(/\s{2,}|\|/)[0]);
}

function examLocationFromText(text: string): string {
  const candidates = text.split(/\s+|\|/).map(clean).filter(Boolean);
  return candidates.find((token) => /楼|室|厅|阶|教室|考场|线上/.test(token) && token.length <= 24) ?? '';
}

function courseIdentity(course: CampusCourse): string {
  return `${course.semester}|${course.courseName}|${course.weekday}|${course.periods.join(',')}|${course.weeks.join(',')}`;
}

function uniqueBy<T>(items: T[], identity: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = identity(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function splitDelimited(line: string): string[] {
  const delimiter = line.includes('\t') ? /\t/ : line.includes('|') ? /\|/ : /\s{2,}/;
  return line.split(delimiter).map(clean);
}

function clean(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
}

function two(value: number): string {
  return Math.round(value).toString().padStart(2, '0');
}
