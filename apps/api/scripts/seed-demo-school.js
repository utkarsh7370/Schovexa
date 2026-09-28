#!/usr/bin/env node
// Creates one fully-populated demo school through the real HTTP API (not
// direct DB writes) — every row this produces went through the same
// validation, hashing, and authorization checks a real user's clicks
// would. Safe to read start to finish; nothing here talks to git.
//
// Usage:
//   cd apps/api
//   node scripts/seed-demo-school.js
//
// Requires the API server already running (npm run dev, or node
// dist/main.js) and reachable at API_URL below.
//
// Env vars (all optional):
//   API_URL      default http://localhost:4000/api/v1
//   WEB_ORIGIN   default http://localhost:3000 (must match the API's own
//                WEB_ORIGIN env — required by the Origin-check middleware
//                on every non-GET request)
//   DEMO_SUFFIX  default '' — append to appended to the school name and
//                every generated email, so you can run this more than
//                once against the same database without an
//                "account already exists" conflict, e.g.:
//                  DEMO_SUFFIX=2 node scripts/seed-demo-school.js

const API_URL = process.env.API_URL || 'http://localhost:4000/api/v1';
const WEB_ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:3000';
const SUFFIX = process.env.DEMO_SUFFIX || '';

function makeSession() {
  let cookie = '';
  return {
    async call(method, path, body) {
      const headers = { 'Content-Type': 'application/json' };
      if (cookie) headers['Cookie'] = cookie;
      if (method !== 'GET') headers['Origin'] = WEB_ORIGIN;

      const res = await fetch(`${API_URL}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      const setCookies =
        typeof res.headers.getSetCookie === 'function'
          ? res.headers.getSetCookie()
          : res.headers.get('set-cookie')
            ? [res.headers.get('set-cookie')]
            : [];
      if (setCookies.length) cookie = setCookies.map((c) => c.split(';')[0]).join('; ');

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) {
        const err = new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    },
  };
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

const BOY_NAMES = ['Aarav', 'Vihaan', 'Reyansh', 'Krishna', 'Ishaan', 'Arjun', 'Sai', 'Aryan', 'Kabir', 'Vivaan', 'Rohan', 'Aditya'];
const GIRL_NAMES = ['Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Myra', 'Anika', 'Riya', 'Ira', 'Kavya', 'Navya', 'Meera', 'Priya'];
const LAST_NAMES = ['Sharma', 'Verma', 'Gupta', 'Kumar', 'Singh', 'Rao', 'Reddy', 'Nair', 'Iyer', 'Joshi', 'Mehta', 'Kapoor', 'Patel', 'Chopra', 'Bhatt'];
const ADULT_NAMES = ['Ramesh', 'Sunita', 'Vinod', 'Lakshmi', 'Deepak', 'Anjali', 'Rajesh', 'Kavita', 'Suresh', 'Geeta'];
const TEACHER_NAMES = [
  ['Priya', 'Nair'],
  ['Rahul', 'Verma'],
  ['Sneha', 'Iyer'],
  ['Amit', 'Kapoor'],
  ['Kavita', 'Joshi'],
  ['Vikram', 'Rao'],
  ['Pooja', 'Mehta'],
  ['Suresh', 'Patel'],
  ['Neha', 'Chopra'],
  ['Manoj', 'Bhatt'],
];
const CLASS_NAMES = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5'];
const SECTION_NAMES = ['A', 'B'];
const SUBJECT_NAMES = ['Mathematics', 'Science', 'English', 'Social Studies', 'Hindi', 'Computer Science'];

const DIRECTOR_PASSWORD = 'Director@12345';
const TEACHER_PASSWORD = 'Teacher@12345';
const STAFF_PASSWORD = 'Staff@12345';
const PARENT_PASSWORD = 'Parent@12345';

async function main() {
  console.log('== Schovexa demo school seeder ==');
  console.log(`API: ${API_URL}  (Origin header: ${WEB_ORIGIN})\n`);

  const director = makeSession();
  const credentials = [];

  // 1. School + Director ----------------------------------------------------
  const schoolName = `Sunrise Public School${SUFFIX ? ` ${SUFFIX}` : ''}`;
  const directorEmail = `director${SUFFIX}@demo.school`;
  console.log(`[1/12] Registering "${schoolName}"...`);
  let reg;
  try {
    reg = await director.call('POST', '/schools/register', {
      schoolName,
      directorFirstName: 'Asha',
      directorLastName: 'Rao',
      email: directorEmail,
      password: DIRECTOR_PASSWORD,
    });
  } catch (err) {
    if (err.status === 409) {
      console.error(`\nAn account with email ${directorEmail} already exists.`);
      console.error('Either drop/reset your dev database, or re-run with a different suffix:');
      console.error('  DEMO_SUFFIX=2 node scripts/seed-demo-school.js\n');
      process.exit(1);
    }
    throw err;
  }
  const schoolId = reg.schoolId;
  credentials.push({ role: 'Director', name: 'Asha Rao', email: directorEmail, password: DIRECTOR_PASSWORD });
  console.log(`   School ID: ${schoolId}`);

  const roles = await director.call('GET', '/roles');
  const roleIdByName = Object.fromEntries(roles.map((r) => [r.name, r.id]));

  // 2. Academic year ----------------------------------------------------------
  console.log('[2/12] Academic year 2025-26...');
  const ay = await director.call('POST', '/academic-years', {
    name: '2025-26',
    startDate: '2025-04-01',
    endDate: '2026-03-31',
  });

  // 3. Classes + sections -------------------------------------------------------
  console.log('[3/12] Classes and sections...');
  const classes = [];
  const sections = []; // { id, name, classId, className }
  for (let i = 0; i < CLASS_NAMES.length; i++) {
    const klass = await director.call('POST', '/classes', { academicYearId: ay.id, name: CLASS_NAMES[i], order: i + 1 });
    classes.push(klass);
    for (const sName of SECTION_NAMES) {
      const section = await director.call('POST', `/classes/${klass.id}/sections`, { name: sName });
      sections.push({ ...section, className: klass.name });
    }
  }
  console.log(`   ${classes.length} classes, ${sections.length} sections`);

  // 4. Subjects -----------------------------------------------------------------
  console.log('[4/12] Subjects...');
  const subjects = [];
  for (const name of SUBJECT_NAMES) {
    subjects.push(await director.call('POST', '/subjects', { name }));
  }

  // 5. Teachers (10) — invite, accept, profile, class-teacher, 2 subjects each --
  console.log('[5/12] Teachers (10)...');
  const teachers = [];
  for (let i = 0; i < 10; i++) {
    const [first, last] = TEACHER_NAMES[i];
    const email = `teacher${i + 1}${SUFFIX}@demo.school`;
    const invite = await director.call('POST', '/memberships/invitations', {
      email,
      firstName: first,
      lastName: last,
      roleId: roleIdByName['Teacher'],
    });
    await director.call('POST', '/auth/accept-invite', { token: invite.inviteToken, password: TEACHER_PASSWORD });
    const profile = await director.call('POST', '/teachers', {
      userId: invite.userId,
      employeeCode: `EMP-${String(i + 1).padStart(3, '0')}`,
    });
    const section = sections[i]; // 10 teachers <-> 10 sections, one each
    await director.call('PATCH', `/sections/${section.id}`, { classTeacherId: profile.id });
    const subj1 = subjects[i % subjects.length];
    const subj2 = subjects[(i + 1) % subjects.length];
    await director.call('POST', `/teachers/${profile.id}/assignments`, { sectionId: section.id, subjectId: subj1.id });
    await director.call('POST', `/teachers/${profile.id}/assignments`, { sectionId: section.id, subjectId: subj2.id });
    teachers.push({ id: profile.id, userId: invite.userId, email, sectionId: section.id });
    credentials.push({ role: 'Teacher', name: `${first} ${last}`, email, password: TEACHER_PASSWORD });
  }
  console.log(`   ${teachers.length} teachers — each is class teacher of one section and teaches 2 subjects there`);

  // 6. Other staff roles ----------------------------------------------------------
  console.log('[6/12] Additional staff (Accountant, Receptionist)...');
  const staffDefs = [
    { role: 'Accountant', first: 'Meera', last: 'Iyer' },
    { role: 'Receptionist', first: 'Karan', last: 'Bhatt' },
  ];
  for (const s of staffDefs) {
    const email = `${s.role.toLowerCase()}${SUFFIX}@demo.school`;
    const invite = await director.call('POST', '/memberships/invitations', {
      email,
      firstName: s.first,
      lastName: s.last,
      roleId: roleIdByName[s.role],
    });
    await director.call('POST', '/auth/accept-invite', { token: invite.inviteToken, password: STAFF_PASSWORD });
    credentials.push({ role: s.role, name: `${s.first} ${s.last}`, email, password: STAFF_PASSWORD });
  }

  // 7. Students (3 per section = 30) -----------------------------------------------
  console.log('[7/12] Students (30)...');
  const students = [];
  let admNo = 1;
  for (const section of sections) {
    for (let k = 0; k < 3; k++) {
      const isBoy = (admNo + k) % 2 === 0;
      const first = isBoy ? BOY_NAMES[admNo % BOY_NAMES.length] : GIRL_NAMES[admNo % GIRL_NAMES.length];
      const last = LAST_NAMES[admNo % LAST_NAMES.length];
      const student = await director.call('POST', '/students', {
        admissionNo: `ADM-${String(admNo).padStart(4, '0')}`,
        firstName: first,
        lastName: last,
        gender: isBoy ? 'Male' : 'Female',
        sectionId: section.id,
      });
      students.push({ ...student, sectionId: section.id, lastName: last });
      admNo++;
    }
  }
  console.log(`   ${students.length} students admitted, 3 per section`);

  // 8. Parents — link some students, invite a few to the portal --------------------
  console.log('[8/12] Parents...');
  const linkPlan = [[0, 1], [2, 3]]; // two sibling pairs sharing one parent
  for (let i = 4; i < 20; i++) linkPlan.push([i]); // remaining 16 get one parent each
  const invitePortalAt = new Set([0, 1, 2]); // first 3 parent groups get a real portal login
  let parentPortalCount = 0;
  for (let g = 0; g < linkPlan.length; g++) {
    const group = linkPlan[g];
    const relation = g % 2 === 0 ? 'Mother' : 'Father';
    const parentFirst = ADULT_NAMES[g % ADULT_NAMES.length];
    const parentLast = students[group[0]].lastName;
    const parent = await director.call('POST', '/parents', {
      firstName: parentFirst,
      lastName: parentLast,
      phone: `+91-9${String(100000000 + g).slice(-9)}`,
    });
    for (const idx of group) {
      await director.call('POST', `/students/${students[idx].id}/parents`, {
        parentId: parent.id,
        relation,
        isPrimary: true,
      });
    }
    if (invitePortalAt.has(g)) {
      parentPortalCount++;
      const email = `parent${parentPortalCount}${SUFFIX}@demo.school`;
      const invite = await director.call('POST', `/parents/${parent.id}/invite`, { email });
      await director.call('POST', '/auth/accept-invite', { token: invite.inviteToken, password: PARENT_PASSWORD });
      credentials.push({ role: 'Parent', name: `${parentFirst} ${parentLast}`, email, password: PARENT_PASSWORD });
    }
  }
  console.log(`   ${linkPlan.length} parents created and linked, ${parentPortalCount} given a portal login`);

  // 9. Attendance — mark 2 days, then correct a few records -----------------------
  console.log('[9/12] Attendance (today + yesterday, with a few corrections)...');
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const dates = [isoDate(yesterday), isoDate(today)];
  const todaysFirstRecordBySection = [];
  for (const date of dates) {
    for (const section of sections) {
      const sectionStudents = students.filter((s) => s.sectionId === section.id);
      const records = sectionStudents.map((s, idx) => {
        let status = 'PRESENT';
        if (idx % 5 === 4) status = 'ABSENT';
        else if (idx % 7 === 3) status = 'LATE';
        return { studentId: s.id, status };
      });
      const roster = await director.call('POST', '/attendance', { sectionId: section.id, date, records });
      if (date === dates[1]) todaysFirstRecordBySection.push(roster[0]);
    }
  }
  let corrected = 0;
  for (const record of todaysFirstRecordBySection.slice(0, 3)) {
    await director.call('PATCH', `/attendance/${record.attendanceId}`, {
      status: 'LATE',
      remarks: 'Corrected: arrived 20 minutes late.',
    });
    corrected++;
  }
  console.log(`   Marked attendance for 2 days across ${sections.length} sections, corrected ${corrected} record(s)`);

  // 10. Notices — one of each audience type ---------------------------------------
  console.log('[10/12] Notices (one of each audience type)...');
  async function createAndPublish(payload) {
    const notice = await director.call('POST', '/notices', payload);
    await director.call('POST', `/notices/${notice.id}/publish`);
    return notice;
  }
  await createAndPublish({
    title: 'Republic Day Holiday',
    body: 'The school will remain closed on January 26th for Republic Day.',
    audienceType: 'ALL_SCHOOL',
  });
  await createAndPublish({
    title: `${classes[2].name} Annual Function Rehearsal`,
    body: 'Rehearsals begin this Monday after school hours in the main hall.',
    audienceType: 'CLASS',
    audienceRefId: classes[2].id,
  });
  const grade1A = sections.find((s) => s.className === 'Grade 1' && s.name === 'A');
  await createAndPublish({
    title: 'Field Trip Permission Slip',
    body: 'Please submit the signed permission slip by Friday.',
    audienceType: 'SECTION',
    audienceRefId: grade1A.id,
  });
  await createAndPublish({
    title: 'Staff Meeting Reminder',
    body: 'Please join the staff meeting in the staff room at 4 PM today.',
    audienceType: 'INDIVIDUAL',
    audienceRefId: teachers[0].userId,
  });

  // 11. Fee categories + one structure per frequency type --------------------------
  console.log('[11/12] Fee structures (one per frequency type)...');
  const tuitionCat = await director.call('POST', '/fee-categories', { name: 'Tuition Fee' });
  const admissionCat = await director.call('POST', '/fee-categories', { name: 'Admission Fee' });
  const examCat = await director.call('POST', '/fee-categories', { name: 'Examination Fee' });
  const annualCat = await director.call('POST', '/fee-categories', { name: 'Annual Day Fund' });

  const tuitionStruct = await director.call('POST', '/fee-structures', {
    feeCategoryId: tuitionCat.id,
    academicYearId: ay.id,
    classId: classes[0].id, // Grade 1 only — demonstrates class-scoped structures
    amountMinor: 250000, // ₹2,500
    frequency: 'MONTHLY',
  });
  const admissionStruct = await director.call('POST', '/fee-structures', {
    feeCategoryId: admissionCat.id,
    academicYearId: ay.id,
    amountMinor: 1000000, // ₹10,000
    frequency: 'ONE_TIME',
  });
  const examStruct = await director.call('POST', '/fee-structures', {
    feeCategoryId: examCat.id,
    academicYearId: ay.id,
    amountMinor: 150000, // ₹1,500
    frequency: 'QUARTERLY',
  });
  const annualStruct = await director.call('POST', '/fee-structures', {
    feeCategoryId: annualCat.id,
    academicYearId: ay.id,
    amountMinor: 50000, // ₹500
    frequency: 'ANNUAL',
  });

  for (const structure of [tuitionStruct, admissionStruct, examStruct, annualStruct]) {
    await director.call('POST', `/fee-structures/${structure.id}/assign`);
  }
  console.log('   Tuition -> Grade 1 only; Admission/Examination/Annual Day -> every student');

  // 12. Record some payments so there's a real due amount to look at ---------------
  console.log('[12/12] Recording some payments (so there is a real due amount)...');
  let paidFull = 0;
  let paidPartial = 0;
  for (let i = 0; i < 12; i++) {
    const fees = await director.call('GET', `/students/${students[i].id}/fees`);
    const examFee = fees.find((f) => f.feeCategory.name === 'Examination Fee');
    if (!examFee) continue;
    if (i % 3 === 0) {
      await director.call('POST', `/student-fees/${examFee.id}/payments`, { amountMinor: examFee.amountDueMinor, method: 'CASH' });
      paidFull++;
    } else if (i % 3 === 1) {
      await director.call('POST', `/student-fees/${examFee.id}/payments`, {
        amountMinor: Math.round(examFee.amountDueMinor * 0.6),
        method: 'ONLINE',
      });
      paidPartial++;
    }
    // i % 3 === 2: left fully PENDING on purpose
  }
  const grade1Students = students.filter((s) => s.sectionId === sections[0].id || s.sectionId === sections[1].id).slice(0, 2);
  for (const student of grade1Students) {
    const fees = await director.call('GET', `/students/${student.id}/fees`);
    const tuitionFee = fees.find((f) => f.feeCategory.name === 'Tuition Fee');
    if (tuitionFee) {
      await director.call('POST', `/student-fees/${tuitionFee.id}/payments`, {
        amountMinor: Math.round(tuitionFee.amountDueMinor * 0.5),
        method: 'BANK_TRANSFER',
      });
    }
  }
  console.log(`   ${paidFull} fee(s) paid in full, ${paidPartial} paid partially, the rest left outstanding`);

  // Summary --------------------------------------------------------------------------
  console.log('\n================ DONE ================');
  console.log(`School: ${schoolName}`);
  console.log(`School ID: ${schoolId}`);
  console.log(`Log in at: ${WEB_ORIGIN}/login\n`);
  console.log('Credentials:');
  const grouped = credentials.reduce((acc, c) => {
    (acc[c.role] ??= []).push(c);
    return acc;
  }, {});
  for (const [role, list] of Object.entries(grouped)) {
    console.log(`\n  ${role}${list.length > 1 ? ` (${list.length})` : ''}:`);
    for (const c of list) {
      console.log(`    ${c.name.padEnd(16)} ${c.email.padEnd(28)} ${c.password}`);
    }
  }
  console.log('\n(Teachers 4-10 share the same password as Teacher 1-3 above.)');
  console.log('=======================================\n');
}

main().catch((err) => {
  console.error('\nSeeding failed:', err.message);
  if (err.data) console.error(JSON.stringify(err.data, null, 2));
  process.exit(1);
});
