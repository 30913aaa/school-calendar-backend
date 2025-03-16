const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;
const eventsFile = path.join(__dirname, 'events.json');
const historyFile = path.join(__dirname, 'history.json');

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  optionsSuccessStatus: 200
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

if (!fs.existsSync(eventsFile)) {
  fs.writeFileSync(eventsFile, JSON.stringify([]), 'utf-8');
}
if (!fs.existsSync(historyFile)) {
  fs.writeFileSync(historyFile, JSON.stringify([]), 'utf-8');
}

let events = JSON.parse(fs.readFileSync(eventsFile, 'utf-8'));
let history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));

app.get('/api/events', (req, res) => {
  res.json(events);
});

app.get('/api/history', (req, res) => {
  res.json(history);
});

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

app.post('/admin/add', (req, res) => {
  const { start, end, title_zh, title_en, desc_zh, desc_en, type, grade, link } = req.body;
  if (!start || !title_zh) {
    return res.send('請提供必要的開始日期與中文標題。<br><a href="/admin">返回</a>');
  }

  // 確保 grade 是一個陣列
  const gradeArray = Array.isArray(grade) ? grade : (grade ? [grade] : ['all-grades']);

  const newEvent = {
    id: events.length,
    start,
    end: end || start,
    title: { zh: title_zh.trim(), en: title_en || "" },
    description: { zh: desc_zh || "", en: desc_en || "" },
    type,
    grade: gradeArray,
    link: link || "",
    revisionHistory: []
  };

  if (newEvent.end < newEvent.start) {
    return res.send('結束日期不能早於開始日期。<br><a href="/admin">返回</a>');
  }

  events.push(newEvent);
  fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2), 'utf-8');

  const revision = {
    date: new Date().toISOString(),
    action: '新增事件',
    details: `新增: ${title_zh}`
  };
  newEvent.revisionHistory.push(revision);
  history.push({ eventId: newEvent.id, revisions: [revision] });
  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf-8');

  console.log('新增的事件：', newEvent);
  res.send('事件新增成功！請重新整理頁面以查看更新。<br><a href="/admin">返回管理平台</a>');
});
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// 測試資料庫連接
pool.connect((err, client, release) => {
  if (err) {
    return console.error('資料庫連接失敗:', err.stack);
  }
  console.log('成功連接到 PostgreSQL 資料庫');
  release();
});
app.listen(port, () => {
  console.log(`伺服器運行於 http://localhost:${port}`);
});