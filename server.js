const express = require('express');
const mysql   = require('mysql2/promise');
const path    = require('path');
const session = require('express-session');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 세션 설정
app.use(session({
  secret: 'quotation-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8시간
}));

// DB 연결
const db = mysql.createPool({
  host    : '127.0.0.1',
  user    : 'root',
  password: '02010110',
  database: 'quotations',
  charset : 'utf8mb4'
});

// ── 로그인 체크 미들웨어
function authCheck(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  if (req.path === '/login' || req.path === '/api/login' || req.path === '/login.html') return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
  res.redirect('/login.html');
}
app.use(authCheck);

// 정적 파일 (미들웨어 이후)
app.use(express.static(path.join(__dirname, 'public')));

// ── 로그인 API
app.post('/api/login', (req, res) => {
  const { id, password } = req.body;
  if (id === 'latenews' && password === '02010110Icando%') {
    req.session.loggedIn = true;
    req.session.userId   = id;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
  }
});

// ── 로그아웃 API
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// ── GET / → 메인 페이지
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── GET /api/quotes → 목록 조회
app.get('/api/quotes', async (req, res) => {
  const { numbers } = req.query;
  try {
    let sql = 'SELECT * FROM quotes';
    const params = [];
    if (numbers) { sql += ' WHERE Numbers LIKE ?'; params.push(`%${numbers}%`); }
    sql += ' ORDER BY Quot_id DESC';
    const [rows] = await db.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get("/api/quotes/next-number", async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const [rows] = await db.query("SELECT MAX(Quot_id) as maxId FROM quotes");
    const maxId  = rows[0].maxId || 0;
    const nextNumber = `Q-${year}-${String(maxId + 1).padStart(4, "0")}`;
    res.json({ success: true, nextNumber });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/quotes/search → 날짜 필터 조회
app.get('/api/quotes/search', async (req, res) => {
  const { from, to } = req.query;
  try {
    let sql = 'SELECT * FROM quotes WHERE 1=1';
    const params = [];
    if (from) { sql += ' AND `Date` >= ?'; params.push(from); }
    if (to)   { sql += ' AND `Date` <= ?'; params.push(to); }
    sql += ' ORDER BY Quot_id DESC';
    const [rows] = await db.query(sql, params);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/quotes/:id → 단건 조회
app.get('/api/quotes/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM quotes WHERE Quot_id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: '견적을 찾을 수 없습니다.' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── POST /api/quotes → 등록
app.post('/api/quotes', async (req, res) => {
  const { Numbers, Reference, Date, Due_date, Sales_Rep } = req.body;
  if (!Numbers || !Date || !Due_date)
    return res.status(400).json({ success: false, message: 'Numbers, Date, Due_date는 필수입니다.' });
  try {
    const [result] = await db.query(
      'INSERT INTO quotes (Numbers, Reference, `Date`, Due_date, Sales_Rep) VALUES (?, ?, ?, ?, ?)',
      [Numbers, Reference || null, Date, Due_date, Sales_Rep || null]
    );
    res.json({ success: true, message: '등록 완료', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ success: false, message: `견적 번호 "${Numbers}"가 이미 존재합니다.` });
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/quotes/:id → 수정
app.put('/api/quotes/:id', async (req, res) => {
  const { Numbers, Reference, Date, Due_date, Sales_Rep } = req.body;
  if (!Numbers || !Date || !Due_date)
    return res.status(400).json({ success: false, message: 'Numbers, Date, Due_date는 필수입니다.' });
  try {
    const [result] = await db.query(
      'UPDATE quotes SET Numbers=?, Reference=?, `Date`=?, Due_date=?, Sales_Rep=? WHERE Quot_id=?',
      [Numbers, Reference || null, Date, Due_date, Sales_Rep || null, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '견적을 찾을 수 없습니다.' });
    res.json({ success: true, message: '수정 완료' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── DELETE /api/quotes/:id → 삭제
app.delete('/api/quotes/:id', async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM quotes WHERE Quot_id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '견적을 찾을 수 없습니다.' });
    res.json({ success: true, message: '삭제 완료' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── RECEIVER API ──────────────────────────────────────────────
app.get('/api/receiver', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM receiver ORDER BY receiver_id DESC');
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/receiver/search', async (req, res) => {
  const { name } = req.query;
  try {
    const [rows] = await db.query(
      'SELECT * FROM receiver WHERE company_name LIKE ? ORDER BY receiver_id DESC',
      [`%${name}%`]
    );
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/receiver/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM receiver WHERE receiver_id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: '수신자를 찾을 수 없습니다.' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/receiver', async (req, res) => {
  const { company_name, vat_no, address1, address2, postal_code } = req.body;
  if (!company_name) return res.status(400).json({ success: false, message: 'company_name은 필수입니다.' });
  try {
    const [result] = await db.query(
      'INSERT INTO receiver (company_name, vat_no, address1, address2, postal_code) VALUES (?, ?, ?, ?, ?)',
      [company_name, vat_no||null, address1||null, address2||null, postal_code||null]
    );
    res.json({ success: true, message: '등록 완료', id: result.insertId });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.put('/api/receiver/:id', async (req, res) => {
  const { company_name, vat_no, address1, address2, postal_code } = req.body;
  if (!company_name) return res.status(400).json({ success: false, message: 'company_name은 필수입니다.' });
  try {
    const [result] = await db.query(
      'UPDATE receiver SET company_name=?, vat_no=?, address1=?, address2=?, postal_code=? WHERE receiver_id=?',
      [company_name, vat_no||null, address1||null, address2||null, postal_code||null, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '수신자를 찾을 수 없습니다.' });
    res.json({ success: true, message: '수정 완료' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.delete('/api/receiver/:id', async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM receiver WHERE receiver_id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: '수신자를 찾을 수 없습니다.' });
    res.json({ success: true, message: '삭제 완료' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── QUOTE_RECEIVER API ────────────────────────────────────────
app.get('/api/quote-receiver', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT qr.id, qr.quote_id, qr.receiver_id,
             q.Numbers, q.Date, q.Due_date, q.Sales_Rep,
             r.company_name, r.address1, r.address2, r.postal_code
      FROM quote_receiver qr
      JOIN quotes q   ON q.Quot_id     = qr.quote_id
      JOIN receiver r ON r.receiver_id = qr.receiver_id
      ORDER BY qr.id DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.get('/api/quote-receiver/receiver/:receiver_id', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT qr.id, qr.quote_id, qr.receiver_id,
             q.Numbers, q.Date, q.Due_date, q.Sales_Rep
      FROM quote_receiver qr
      JOIN quotes q ON q.Quot_id = qr.quote_id
      WHERE qr.receiver_id = ?
      ORDER BY qr.id DESC
    `, [req.params.receiver_id]);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post('/api/quote-receiver', async (req, res) => {
  const { quote_id, receiver_id } = req.body;
  if (!quote_id || !receiver_id)
    return res.status(400).json({ success: false, message: 'quote_id, receiver_id는 필수입니다.' });
  try {
    const [result] = await db.query(
      'INSERT INTO quote_receiver (quote_id, receiver_id) VALUES (?, ?)',
      [quote_id, receiver_id]
    );
    res.json({ success: true, message: '연결 완료', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ success: false, message: '이미 연결된 견적입니다.' });
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/quote-receiver/:id', async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM quote_receiver WHERE id = ?', [req.params.id]);
    if (!result.affectedRows)
      return res.status(404).json({ success: false, message: '연결을 찾을 수 없습니다.' });
    res.json({ success: true, message: '삭제 완료' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

const PORT = 8080;
app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중: http://localhost:${PORT}`);
});
