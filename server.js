const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;
const path = require('path');

// 服務當前目錄下的靜態檔案
app.use(express.static(__dirname));
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

// 管理平台頁面
      app.get('/admin', async (req, res) => {
        try {
          const result = await pool.query('SELECT * FROM events');
          const events = result.rows.map(event => ({
            id: event.id,
            start: event.start.toISOString().split('T')[0],
            end: event.end_date ? event.end_date.toISOString().split('T')[0] : null,
            title_zh: event.title_zh,
            title_en: event.title_en || '',
            description_zh: event.description_zh || '',
            description_en: event.description_en || '',
            type: event.type,
            grade: event.grade,
            link: event.link || ''
          })).sort((a, b) => a.start.localeCompare(b.start));
      
          res.send(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>後端管理平台 - 事件管理</title>
              <link rel="stylesheet" href="/styles.css">
            </head>
            <body>
              <header>
                <div class="container header-content">
                  <h1 class="site-title">事件管理系統</h1>
                  <nav class="nav-menu">
                    <a href="/admin">首頁</a>
                    <a href="#" id="exportDataBtn">匯出資料</a>
                    <a href="#" id="printBtn">列印</a>
                  </nav>
                </div>
              </header>
      
              <div class="container" id="mainContent">
                <div id="statusMessages"></div>
      
                <div class="filters">
                  <h2>搜尋與篩選</h2>
                  <div class="filter-row">
                    <div class="search-input">
                      <label for="searchInput">搜尋關鍵字:</label>
                      <input type="text" id="searchInput" placeholder="輸入標題、描述關鍵字...">
                    </div>
                    <div class="form-group">
                      <label for="filterType">事件類型:</label>
                      <select id="filterType">
                        <option value="">全部類型</option>
                        <option value="important-exam">重要考試</option>
                        <option value="school-activity">學校活動</option>
                        <option value="announcement">公告</option>
                        <option value="holiday">假期</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label for="filterGrade">年級:</label>
                      <select id="filterGrade">
                        <option value="">全部年級</option>
                        <option value="grade-1">高一</option>
                        <option value="grade-2">高二</option>
                        <option value="grade-3">高三</option>
                        <option value="all-grades">全年級</option>
                      </select>
                    </div>
                  </div>
                  <div class="filter-row">
                    <div class="form-group">
                      <label for="filterDateStart">開始日期:</label>
                      <input type="date" id="filterDateStart">
                    </div>
                    <div class="form-group">
                      <label for="filterDateEnd">結束日期:</label>
                      <input type="date" id="filterDateEnd">
                    </div>
                    <div class="form-group" style="align-self: flex-end;">
                      <button id="filterBtn" class="filter-button">套用篩選</button>
                      <button id="resetFilterBtn" class="filter-reset">重設</button>
                    </div>
                  </div>
                </div>
      
                <form action="/admin/add" method="POST" id="addForm" class="add-event-form">
                  <h2>新增事件</h2>
                  <div class="form-row">
                    <div class="form-group">
                      <label for="start">開始日期 (YYYY-MM-DD):</label>
                      <input type="date" id="start" name="start" required>
                    </div>
                    <div class="form-group">
                      <label for="end">結束日期 (YYYY-MM-DD，可選):</label>
                      <input type="date" id="end" name="end">
                    </div>
                  </div>
      
                  <div class="form-row">
                    <div class="form-group">
                      <label for="title_zh">標題（中文）:</label>
                      <input type="text" id="title_zh" name="title_zh" required>
                    </div>
                    <div class="form-group">
                      <label for="title_en">標題（英文）:</label>
                      <input type="text" id="title_en" name="title_en">
                    </div>
                  </div>
      
                  <div class="form-row">
                    <div class="form-group">
                      <label for="description_zh">描述（中文）:</label>
                      <textarea id="description_zh" name="description_zh"></textarea>
                    </div>
                    <div class="form-group">
                      <label for="description_en">描述（英文）:</label>
                      <textarea id="description_en" name="description_en"></textarea>
                    </div>
                  </div>
      
                  <div class="form-row">
                    <div class="form-group">
                      <label for="type">事件類型:</label>
                      <select id="type" name="type">
                        <option value="important-exam">重要考試</option>
                        <option value="school-activity">學校活動</option>
                        <option value="announcement">公告</option>
                        <option value="holiday">假期</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label for="grade">年級標籤:</label>
                      <select id="grade" name="grade" multiple>
                        <option value="grade-1">高一</option>
                        <option value="grade-2">高二</option>
                        <option value="grade-3">高三</option>
                        <option value="all-grades">全年級</option>
                      </select>
                      <small>按住 Ctrl (Windows) 或 Command (Mac) 可多選</small>
                    </div>
                  </div>
      
                  <div class="form-row">
                    <div class="form-group">
                      <label for="link">超連結 (可選):</label>
                      <input type="url" id="link" name="link" placeholder="https://example.com">
                    </div>
                  </div>
      
                  <button type="submit">新增事件</button>
                </form>
      
                <div class="event-list">
                  <h2>現有事件 <span id="eventCount" class="event-count">(${events.length})</span></h2>
                  <div id="eventContainer">
                    ${events.length === 0 ? '<p>目前沒有事件。</p>' : events.map(event => `
                      <div class="event-item">
                        <h3>${event.title_zh}</h3>
                        <p>日期: ${event.start}${event.end ? ` - ${event.end}` : ''}</p>
                        <p>類型: ${event.type}</p>
                        <p>年級: ${event.grade}</p>
                        <p>描述: ${event.description_zh}</p>
                        <form action="/admin/delete" method="POST" style="display:inline;">
                          <input type="hidden" name="id" value="${event.id}">
                          <button type="submit">刪除</button>
                        </form>
                        <form action="/admin/update" method="POST" style="display:inline;">
                          <input type="hidden" name="id" value="${event.id}">
                          <input type="hidden" name="start" value="${event.start}">
                          <input type="hidden" name="end" value="${event.end || ''}">
                          <input type="hidden" name="title_zh" value="${event.title_zh}">
                          <input type="hidden" name="title_en" value="${event.title_en}">
                          <input type="hidden" name="description_zh" value="${event.description_zh}">
                          <input type="hidden" name="description_en" value="${event.description_en}">
                          <input type="hidden" name="type" value="${event.type}">
                          <input type="hidden" name="grade" value="${event.grade}">
                          <input type="hidden" name="link" value="${event.link}">
                          <button type="submit">編輯</button>
                        </form>
                      </div>
                    `).join('')}
                  </div>
                  <div class="pagination" id="pagination"></div>
                </div>
              </div>
            </body>
            </html>
          `);
        } catch (err) {
          console.error('獲取事件失敗:', err.stack);
          res.status(500).send('伺服器錯誤: 無法加載事件資料');
        }
      });

// 新增事件
app.post('/admin/add', async (req, res) => {
  const { start, end, title_zh, title_en, description_zh, description_en, type, grade, link } = req.body;
  if (!start || !title_zh) {
    return res.status(400).send('請提供必要的開始日期與中文標題。<br><a href="/admin">返回管理平台</a>');
  }

  const gradeArray = Array.isArray(grade) ? grade : (grade ? [grade] : ['all-grades']);
  const gradeString = gradeArray.join(',');

  if (end && end < start) {
    return res.status(400).send('結束日期不能早於開始日期。<br><a href="/admin">返回管理平台</a>');
  }

  try {
    await pool.query(
      'INSERT INTO events (start, end_date, title_zh, title_en, description_zh, description_en, type, grade, link) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
      [start, end || start, title_zh.trim(), title_en || '', description_zh || '', description_en || '', type, gradeString, link || '']
    );
    res.status(201).send('事件新增成功！<br><a href="/admin">返回管理平台</a>');
  } catch (err) {
    console.error('新增事件失敗:', err.stack);
    res.status(500).send('伺服器錯誤: 無法新增事件');
  }
});

// 刪除事件
app.post('/admin/delete', async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).send('請提供事件 ID。<br><a href="/admin">返回管理平台</a>');
  }

  try {
    await pool.query('DELETE FROM events WHERE id = $1', [id]);
    res.status(200).send('事件刪除成功！<br><a href="/admin">返回管理平台</a>');
  } catch (err) {
    console.error('刪除事件失敗:', err.stack);
    res.status(500).send('伺服器錯誤: 無法刪除事件');
  }
});

// 修改事件
app.post('/admin/update', async (req, res) => {
  const { id, start, end, title_zh, title_en, description_zh, description_en, type, grade, link } = req.body;
  if (!id || !start || !title_zh) {
    return res.status(400).send('請提供必要的 ID、開始日期與中文標題。<br><a href="/admin">返回管理平台</a>');
  }

  const gradeArray = Array.isArray(grade) ? grade : (grade ? [grade] : ['all-grades']);
  const gradeString = gradeArray.join(',');

  if (end && end < start) {
    return res.status(400).send('結束日期不能早於開始日期。<br><a href="/admin">返回管理平台</a>');
  }

  try {
    const eventResult = await pool.query(
      'UPDATE events SET start = $1, end_date = $2, title_zh = $3, title_en = $4, description_zh = $5, description_en = $6, type = $7, grade = $8, link = $9 WHERE id = $10',
      [start, end || null, title_zh.trim(), title_en || '', description_zh || '', description_en || '', type, gradeString, link || '', id]
    );

    if (eventResult.rowCount === 0) {
      return res.status(404).send('事件未找到。<br><a href="/admin">返回管理平台</a>');
    }

    res.status(200).send('事件修改成功！<br><a href="/admin">返回管理平台</a>');
  } catch (err) {
    console.error('修改事件失敗:', err.stack);
    res.status(500).send('伺服器錯誤: 無法修改事件');
  }
});

// 清空資料端點
app.post('/admin/clear', async (req, res) => {
  try {
    await pool.query('DELETE FROM events');
    await pool.query('ALTER SEQUENCE events_id_seq RESTART WITH 1');
    res.status(200).send('所有事件資料已清空！<br><a href="/admin">返回管理平台</a>');
  } catch (err) {
    console.error('清空資料失敗:', err.stack);
    res.status(500).send('伺服器錯誤: 無法清空資料');
  }
});

app.listen(port, () => {
  console.log(`伺服器運行於 http://localhost:${port}`);
});