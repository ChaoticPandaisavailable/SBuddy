import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  resolve: { alias: { '@': root } },
});

try {
  const { parseCampusImport } = await server.ssrLoadModule('/lib/campus-parser.ts');
  const { campusScheduleEvents } = await server.ssrLoadModule('/lib/campus-data.ts');

  const courseCapture = JSON.stringify({
    __niluCampusCapture: true,
    target: 'courses',
    semesterHint: '2026-2027学年第一学期',
    tables: [{
      headers: ['2026-2027学年第一学期个人课表'],
      rows: [
        ['节次', '星期一', '星期二', '星期三', '星期四', '星期五'],
        ['第一大节', '交互设计\n张老师\n教二2302/1-2节/1-16周', '', '人工智能\n李老师\n明德楼/1-2节/1-8周,单周', '', ''],
      ],
    }],
  });
  const courses = parseCampusImport(courseCapture, 'courses', 'shuzhi');
  assert.equal(courses.semester, '2026-2027-1');
  assert.equal(courses.courses.length, 2);
  assert.equal(courses.courses[0].source, 'shuzhi');
  assert.deepEqual(courses.courses[0].periods, [1, 2]);
  assert.equal(courses.courses[0].weeks.length, 16);
  assert.deepEqual(courses.courses[1].weeks, [1, 3, 5, 7]);
  const courseEvents = campusScheduleEvents({
    schemaVersion: 1,
    semesterStart: '2026-09-07',
    activeSemester: '2026-2027-1',
    courses: [{ ...courses.courses[0], weeks: [1] }],
    exams: [],
    todos: [],
  });
  assert.equal(courseEvents[0].date, '2026-09-07');
  assert.equal(courseEvents[0].time, '08:00');

  const examCapture = JSON.stringify({
    __niluCampusCapture: true,
    target: 'exams',
    tables: [{
      headers: ['考试日程查询'],
      rows: [
        ['课程名称', '考试日期', '考试时间', '考场'],
        ['高等数学', '2026-12-28', '09:00-11:00', '公共教学一楼1101'],
      ],
    }],
  });
  const exams = parseCampusImport(examCapture, 'exams', 'shuzhi');
  assert.equal(exams.exams.length, 1);
  assert.equal(exams.exams[0].courseName, '高等数学');
  assert.equal(exams.exams[0].date, '2026-12-28');

  const examGrid = parseCampusImport(JSON.stringify({
    __niluCampusCapture: true,
    target: 'exams',
    tables: [{
      headers: ['场次', '星期一', '星期二'],
      rows: [['上午', '数据库系统\n2026年12月21日 09:00-11:00\n明德楼0301', '']],
    }],
  }), 'exams', 'shuzhi');
  assert.equal(examGrid.exams.length, 1);
  assert.equal(examGrid.exams[0].location, '明德楼0301');

  const gradeCapture = JSON.stringify({
    __niluCampusCapture: true,
    target: 'courses',
    tables: [{ headers: ['课程名称', '成绩'], rows: [['高等数学', '95']] }],
  });
  const ignoredGrades = parseCampusImport(gradeCapture, 'courses', 'shuzhi');
  assert.equal(ignoredGrades.courses.length, 0);
  assert.equal(ignoredGrades.exams.length, 0);

  console.log('Campus parser fixtures passed: courses=2, exams=1, grades=ignored.');
} finally {
  await server.close();
}
