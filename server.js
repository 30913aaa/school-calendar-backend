const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// 設置 PostgreSQL 連接
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Render 要求啟用 SSL
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  optionsSuccessStatus: 200
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// 創建資料表（如果尚未存在）
pool.query(`
  CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    start DATE NOT NULL,
    end_date DATE,
    title_zh VARCHAR(255) NOT NULL,
    title_en VARCHAR(255),
    description_zh TEXT,
    description_en TEXT,
    type VARCHAR(50) NOT NULL,
    grade VARCHAR(255) NOT NULL,
    link VARCHAR(255),
    revision_history JSONB
  );
  CREATE TABLE IF NOT EXISTS history (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES events(id),
    revisions JSONB
  );
`).then(() => console.log('資料表創建成功'))
  .catch(err => console.error('創建資料表失敗:', err));

// 獲取所有事件
app.get('/api/events', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM events');
    res.json(result.rows);
  } catch (err) {
    console.error('查詢事件失敗:', err);
    res.status(500).send('伺服器錯誤');
  }
});

// 獲取歷史記錄
app.get('/api/history', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM history');
    res.json(result.rows);
  } catch (err) {
    console.error('查詢歷史記錄失敗:', err);
    res.status(500).send('伺服器錯誤');
  }
});

// 管理介面頁面
app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>後端管理平台 - 新增事件</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        form { max-width: 600px; margin: auto; }
        label { display: block; margin-top: 10px; }
        input, textarea, select { width: 100%; padding: 8px; margin-top: 5px; }
        button { margin-top: 15px; padding: 10px; background-color: #007bff; color: white; border: none; cursor: pointer; }
        button:hover { background-color: #0056b3; }
      </style>
    </head>
    <body>
      <h1>後端管理平台 - 新增事件</h1>
      <form action="/admin/add" method="POST">
        <label for="start">開始日期 (YYYY-MM-DD):</label>
        <input type="date" id="start" name="start" required>
        <label for="end">結束日期 (YYYY-MM-DD，可選):</label>
        <input type="date" id="end" name="end">
        <label for="title_zh">標題（中文）:</label>
        <input type="text" id="title_zh" name="title_zh" required>
        <label for="title_en">標題（英文）:</label>
        <input type="text" id="title_en" name="title_en">
        <label for="desc_zh">描述（中文）:</label>
        <textarea id="desc_zh" name="desc_zh"></textarea>
        <label for="desc_en">描述（英文）:</label>
        <textarea id="desc_en" name="desc_en"></textarea>
        <label for="type">事件類型:</label>
        <select id="type" name="type">
          <option value="important-exam">重要考試</option>
          <option value="school-activity">學校活動</option>
          <option value="announcement">公告</option>
          <option value="holiday">假期</option>
        </select>
        <label for="grade">年級標籤:</label>
        <select id="grade" name="grade" multiple>
          <option value="grade-1">高一</option>
          <option value="grade-2">高二</option>
          <option value="grade-3">高三</option>
          <option value="all-grades">全年級</option>
        </select>
        <label for="link">超連結 (可選):</label>
        <input type="url" id="link" name="link" placeholder="https://example.com">
        <button type="submit">新增事件</button>
      </form>
    </body>
    </html>`);
});

// 新增事件
app.post('/admin/add', async (req, res) => {
  const { start, end, title_zh, title_en, desc_zh, desc_en, type, grade, link } = req.body;
  if (!start || !title_zh) {
    return res.send('請提供必要的開始日期與中文標題。<br><a href="/admin">返回</a>');
  }

  const gradeArray = Array.isArray(grade) ? grade : (grade ? [grade] : ['all-grades']);
  const revision = {
    date: new Date().toISOString(),
    action: '新增事件',
    details: `新增: ${title_zh}`
  };

  try {
    const result = await pool.query(
      'INSERT INTO events (start, end_date, title_zh, title_en, description_zh, description_en, type, grade, link, revision_history) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
      [start, end || start, title_zh.trim(), title_en || "", desc_zh || "", desc_en || "", type, gradeArray.join(','), link || "", [revision]]
    );
    const eventId = result.rows[0].id;

    await pool.query(
      'INSERT INTO history (event_id, revisions) VALUES ($1, $2)',
      [eventId, [revision]]
    );

    res.send('事件新增成功！請重新整理頁面以查看更新。<br><a href="/admin">返回管理平台</a>');
  } catch (err) {
    console.error('新增事件失敗:', err);
    res.status(500).send('伺服器錯誤');
  }
});

app.listen(port, () => {
  console.log(`伺服器運行於 http://localhost:${port}`);
});