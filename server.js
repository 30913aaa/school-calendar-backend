const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// 配置資料庫連接
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  optionsSuccessStatus: 200
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// 獲取所有事件
app.get('/api/events', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM events');
    // 將資料格式化為前端期望的結構
    const events = result.rows.map(event => ({
      id: event.id,
      start: event.start,
      end: event.end,
      title: { zh: event.title_zh, en: event.title_en || '' },
      description: { zh: event.desc_zh || '', en: event.desc_en || '' },
      type: event.type,
      grade: event.grade,
      link: event.link || ''
    }));
    res.json(events);
  } catch (err) {
    console.error('無法獲取事件:', err);
    res.status(500).send('伺服器錯誤');
  }
});

// 獲取歷史記錄
app.get('/api/history', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM history');
    // 將資料格式化為前端期望的結構
    const history = result.rows.map(record => ({
      eventId: record.event_id,
      revisions: [{
        date: record.date,
        action: record.action,
        details: record.details
      }]
    }));
    res.json(history);
  } catch (err) {
    console.error('無法獲取歷史記錄:', err);
    res.status(500).send('伺服器錯誤');
  }
});

// 管理平台頁面
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

  if (end && end < start) {
    return res.send('結束日期不能早於開始日期。<br><a href="/admin">返回</a>');
  }

  try {
    // 插入事件到 events 表
    const eventResult = await pool.query(
      'INSERT INTO events (start, end, title_zh, title_en, desc_zh, desc_en, type, grade, link) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
      [start, end || start, title_zh.trim(), title_en || '', desc_zh || '', desc_en || '', type, gradeArray, link || '']
    );
    const eventId = eventResult.rows[0].id;

    // 插入修訂歷史到 history 表
    const revision = {
      date: new Date().toISOString(),
      action: '新增事件',
      details: `新增: ${title_zh}`
    };
    await pool.query(
      'INSERT INTO history (event_id, date, action, details) VALUES ($1, $2, $3, $4)',
      [eventId, revision.date, revision.action, revision.details]
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