const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const port = 3000;
const eventsFile = path.join(__dirname, 'events.json');

app.use(cors()); // 啟用 CORS
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

let events = fs.existsSync(eventsFile) ? JSON.parse(fs.readFileSync(eventsFile, 'utf-8')) : [];

app.get('/api/events', (req, res) => {
  res.json(events);
});

app.get('/admin', (req, res) => {
  res.send(`<!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>後端管理平台 - 新增事件</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        form { max-width: 500px; margin: auto; }
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
          <option value="activity">活動</option>
          <option value="announcement">公告</option>
          <option value="holiday">假期</option>
        </select>

        <button type="submit">新增事件</button>
      </form>
    </body>
    </html>`);
});

app.post('/admin/add', (req, res) => {
  const { start, end, title_zh, title_en, desc_zh, desc_en, type } = req.body;
  if (!start || !title_zh) {
    return res.send('請提供必要的開始日期與中文標題。<br><a href="/admin">返回</a>');
  }

  const newEvent = {
    start,
    end: end || start, // 如果 end 為空，則與 start 相同
    title: { zh: title_zh, en: title_en || "" },
    description: { zh: desc_zh || "", en: desc_en || "" },
    type
  };

  // 驗證結束日期是否晚於開始日期
  if (newEvent.end < newEvent.start) {
    return res.send('結束日期不能早於開始日期。<br><a href="/admin">返回</a>');
  }

  events.push(newEvent);
  fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2), 'utf-8');

  console.log('新增的事件：', newEvent); // 添加日誌
  res.send('事件新增成功！請重新整理頁面以查看更新。<br><a href="/admin">返回管理平台</a>');
});

app.listen(port, () => {
  console.log(`伺服器運行於 http://localhost:${port}`);
});