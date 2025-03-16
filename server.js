const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;

// 檢查必要的環境變數
const requiredEnvVars = ['DB_USER', 'DB_HOST', 'DB_NAME', 'DB_PASSWORD', 'DB_PORT'];
requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    console.error(`缺少必要的環境變數: ${envVar}`);
    process.exit(1);
  }
});

// 配置資料庫連線
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false // Render 的 PostgreSQL 所需
  }
});

// 記錄使用的配置
console.log('嘗試以以下配置連線:', {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT
});

// 啟動時測試資料庫連線
(async () => {
  try {
    const client = await pool.connect();
    console.log('成功連接到 PostgreSQL 資料庫');
    const res = await client.query('SELECT NOW()');
    console.log('資料庫的當前時間:', res.rows[0]);
    client.release();
  } catch (err) {
    console.error('無法連接到 PostgreSQL 資料庫:', err.stack);
  }
})();

// 初始化資料庫表格
async function initializeDatabase() {
  try {
    const client = await pool.connect();

    // 檢查並創建 events 表
    await client.query(`
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
      )
    `);
    console.log('Events 表格已創建或已存在');

    // 檢查並創建 history 表
    await client.query(`
      CREATE TABLE IF NOT EXISTS history (
        id SERIAL PRIMARY KEY,
        event_id INTEGER REFERENCES events(id),
        revisions JSONB
      )
    `);
    console.log('History 表格已創建或已存在');

    client.release();
  } catch (err) {
    console.error('初始化資料庫時發生錯誤:', err.stack);
  }
}

initializeDatabase();

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
    const events = result.rows.map(event => ({
      id: event.id,
      start: event.start.toISOString().split('T')[0],
      end: event.end_date ? event.end_date.toISOString().split('T')[0] : null,
      title: { zh: event.title_zh, en: event.title_en || '' },
      description: { zh: event.description_zh || '', en: event.description_en || '' },
      type: event.type,
      grade: event.grade ? event.grade.split(',') : [],
      link: event.link || ''
    }));
    res.json(events);
  } catch (err) {
    console.error('無法獲取事件:', err.stack);
    res.status(500).send('伺服器錯誤: 無法獲取事件資料');
  }
});

// 獲取歷史記錄
app.get('/api/history', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM history');
    const history = result.rows.map(record => ({
      eventId: record.event_id,
      revisions: record.revisions || [] // 確保 revisions 為陣列
    }));
    res.json(history);
  } catch (err) {
    console.error('無法獲取歷史記錄:', err.stack);
    res.status(500).send('伺服器錯誤: 無法獲取歷史記錄');
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

        <label for="description_zh">描述（中文）:</label>
        <textarea id="description_zh" name="description_zh"></textarea>

        <label for="description_en">描述（英文）:</label>
        <textarea id="description_en" name="description_en"></textarea>

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
  const { start, end, title_zh, title_en, description_zh, description_en, type, grade, link } = req.body;
  if (!start || !title_zh) {
    return res.status(400).send('請提供必要的開始日期與中文標題。<br><a href="/admin">返回</a>');
  }

  const gradeArray = Array.isArray(grade) ? grade : (grade ? [grade] : ['all-grades']);
  const gradeString = gradeArray.join(',');

  if (end && end < start) {
    return res.status(400).send('結束日期不能早於開始日期。<br><a href="/admin">返回</a>');
  }

  try {
    const eventResult = await pool.query(
      'INSERT INTO events (start, end_date, title_zh, title_en, description_zh, description_en, type, grade, link) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
      [start, end || start, title_zh.trim(), title_en || '', description_zh || '', description_en || '', type, gradeString, link || '']
    );
    const eventId = eventResult.rows[0].id;

    // 獲取現有的 revisions
    const historyResult = await pool.query('SELECT revisions FROM history WHERE event_id = $1', [eventId]);
    let revisions = historyResult.rows.length > 0 ? historyResult.rows[0].revisions || [] : [];

    // 添加新的修訂記錄
    const revision = {
      date: new Date().toISOString(),
      action: '新增事件',
      details: `新增: ${title_zh}`
    };
    revisions.push(revision);

    // 將 revisions 序列化為 JSON 字串
    const revisionsJson = JSON.stringify(revisions);

    // 更新或插入 history 表
    if (historyResult.rows.length > 0) {
      await pool.query(
        'UPDATE history SET revisions = $1 WHERE event_id = $2',
        [revisionsJson, eventId]
      );
    } else {
      await pool.query(
        'INSERT INTO history (event_id, revisions) VALUES ($1, $2)',
        [eventId, revisionsJson]
      );
    }

    res.status(201).send('事件新增成功！請重新整理頁面以查看更新。<br><a href="/admin">返回</a>');
  } catch (err) {
    console.error('新增事件失敗:', err.stack);
    res.status(500).send('伺服器錯誤: 無法新增事件');
  }
});

app.listen(port, () => {
  console.log(`伺服器運行於 http://localhost:${port}`);
});