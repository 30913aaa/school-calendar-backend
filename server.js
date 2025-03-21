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

// 獲取所有事件（支持篩選）
app.get('/api/events', async (req, res) => {
  try {
    const { search, type, grade, start, end } = req.query;

    let query = 'SELECT * FROM events';
    const conditions = [];
    const values = [];

    // 關鍵字搜尋（標題和描述）
    if (search) {
      conditions.push(
        `(LOWER(title_zh) LIKE $${values.length + 1} OR LOWER(title_en) LIKE $${values.length + 1} OR LOWER(description_zh) LIKE $${values.length + 1} OR LOWER(description_en) LIKE $${values.length + 1})`
      );
      values.push(`%${search.toLowerCase()}%`);
    }

    // 類型篩選
    if (type) {
      conditions.push(`type = $${values.length + 1}`);
      values.push(type);
    }

    // 年級篩選
    if (grade) {
      conditions.push(`grade LIKE $${values.length + 1}`);
      values.push(`%${grade}%`);
    }

    // 日期範圍篩選
    if (start) {
      conditions.push(`start >= $${values.length + 1}`);
      values.push(start);
    }
    if (end) {
      conditions.push(`(end_date <= $${values.length + 1} OR (end_date IS NULL AND start <= $${values.length + 1}))`);
      values.push(end);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY start ASC';

    const result = await pool.query(query, values);
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
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>後端管理平台 - 事件管理</title>
      <link rel="stylesheet" href="/styles.css">
      <style>
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header-content { display: flex; justify-content: space-between; align-items: center; }
        .site-title { font-size: 24px; font-weight: bold; }
        .nav-menu a { margin-left: 15px; color: #007bff; text-decoration: none; }
        .nav-menu a:hover { text-decoration: underline; }
        .filters { margin-bottom: 20px; padding: 15px; background: #f9f9f9; border-radius: 8px; }
        .filter-row { display: flex; gap: 15px; margin-bottom: 10px; flex-wrap: wrap; }
        .search-input { flex: 1; min-width: 200px; }
        .form-group { display: flex; flex-direction: column; min-width: 150px; }
        .form-group label { margin-bottom: 5px; font-weight: bold; }
        .form-group input, .form-group select, .form-group textarea { padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        .form-group textarea { resize: vertical; }
        .filter-button, .filter-reset { padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer; }
        .filter-button { background: #007bff; color: white; }
        .filter-reset { background: #dc3545; color: white; margin-left: 10px; }
        .add-event-form { margin-bottom: 20px; padding: 15px; background: #f1f1f1; border-radius: 8px; }
        .form-row { display: flex; gap: 15px; margin-bottom: 10px; flex-wrap: wrap; }
        .add-event-form button { padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .event-list { margin-top: 20px; }
        .event-item { padding: 15px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 10px; }
        .event-item h3 { margin: 0 0 10px; font-size: 18px; }
        .event-item p { margin: 5px 0; }
        .event-item button { padding: 5px 10px; margin-right: 5px; border: none; border-radius: 4px; cursor: pointer; }
        .event-item button:first-of-type { background: #dc3545; color: white; }
        .event-item button:last-of-type { background: #007bff; color: white; }
        .event-count { font-size: 14px; color: #666; }
        .pagination { display: flex; justify-content: center; gap: 10px; margin-top: 20px; }
        .pagination button { padding: 5px 10px; border: 1px solid #ddd; border-radius: 4px; background: #f9f9f9; cursor: pointer; }
        .pagination button:disabled { background: #ddd; cursor: not-allowed; }
        .pagination button.active { background: #007bff; color: white; border-color: #007bff; }
      </style>
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
                <option value="meeting">會議</option>
                <option value="exam">檢定/測驗</option>
                <option value="lecture">課程/講座</option>
                <option value="uniform-inspection">服儀定期檢查</option>
                <option value="other">其他</option>
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
              <label for="description_zh">描述（中文，可選）:</label>
              <textarea id="description_zh" name="description_zh" rows="3"></textarea>
            </div>
            <div class="form-group">
              <label for="description_en">描述（英文，可選）:</label>
              <textarea id="description_en" name="description_en" rows="3"></textarea>
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
                <option value="meeting">會議</option>
                <option value="exam">檢定/測驗</option>
                <option value="lecture">課程/講座</option>
                <option value="uniform-inspection">服儀定期檢查</option>
                <option value="other">其他</option>
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
          <h2>現有事件 <span id="eventCount" class="event-count"></span></h2>
          <div id="eventContainer"></div>
          <div class="pagination" id="pagination"></div>
        </div>
      </div>

      <script>
        let currentPage = 1;
        const itemsPerPage = 10;
        let allEvents = [];
        let totalPages = 1;

        // 獲取事件數據
        async function fetchEvents(params = {}) {
          const query = new URLSearchParams(params).toString();
          const response = await fetch(\`/api/events?\${query}\`);
          const events = await response.json();
          return events.map(event => ({
            id: event.id,
            start: event.start,
            end: event.end,
            title_zh: event.title.zh,
            title_en: event.title.en,
            description_zh: event.description.zh,
            description_en: event.description.en,
            type: event.type,
            grade: event.grade.join(','),
            link: event.link
          }));
        }

        // 渲染事件列表
        function renderEvents(events, page = 1) {
          const eventContainer = document.getElementById('eventContainer');
          const eventCount = document.getElementById('eventCount');
          
          // 計算分頁
          totalPages = Math.ceil(events.length / itemsPerPage);
          const startIndex = (page - 1) * itemsPerPage;
          const endIndex = startIndex + itemsPerPage;
          const paginatedEvents = events.slice(startIndex, endIndex);

          if (paginatedEvents.length === 0) {
            eventContainer.innerHTML = '<p>目前沒有事件。</p>';
            eventCount.textContent = '(0)';
          } else {
            eventContainer.innerHTML = paginatedEvents.map(event => \`
              <div class="event-item">
                <h3>\${event.title_zh}</h3>
                <p>日期: \${event.start}\${event.end ? \` - \${event.end}\` : ''}</p>
                <p>類型: \${event.type}</p>
                <p>年級: \${event.grade}</p>
                <p>描述（中文）: \${event.description_zh || '無'}</p>
                <p>描述（英文）: \${event.description_en || '無'}</p>
                <form action="/admin/delete" method="POST" style="display:inline;">
                  <input type="hidden" name="id" value="\${event.id}">
                  <button type="submit">刪除</button>
                </form>
                <form action="/admin/update" method="POST" style="display:inline;">
                  <input type="hidden" name="id" value="\${event.id}">
                  <button type="submit">編輯</button>
                </form>
              </div>
            \`).join('');
            eventCount.textContent = \`(\${events.length})\`;
          }

          renderPagination(events.length, page);
        }

        // 渲染分頁導航
        function renderPagination(totalItems, currentPage) {
          const pagination = document.getElementById('pagination');
          totalPages = Math.ceil(totalItems / itemsPerPage);
          let paginationHTML = '';

          // 上一頁
          paginationHTML += \`
            <button \${currentPage === 1 ? 'disabled' : ''} onclick="changePage(\${currentPage - 1})">上一頁</button>
          \`;

          // 頁碼按鈕
          for (let i = 1; i <= totalPages; i++) {
            paginationHTML += \`
              <button class="\${i === currentPage ? 'active' : ''}" onclick="changePage(\${i})">\${i}</button>
            \`;
          }

          // 下一頁
          paginationHTML += \`
            <button \${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(\${currentPage + 1})">下一頁</button>
          \`;

          pagination.innerHTML = paginationHTML;
        }

        // 切換頁碼
        function changePage(page) {
          currentPage = page;
          renderEvents(allEvents, currentPage);
        }

        // 初始加載事件
        async function loadEvents() {
          allEvents = await fetchEvents();
          renderEvents(allEvents, currentPage);
        }

        // 篩選事件
        async function filterEvents() {
          const searchInput = document.getElementById('searchInput').value;
          const filterType = document.getElementById('filterType').value;
          const filterGrade = document.getElementById('filterGrade').value;
          const filterDateStart = document.getElementById('filterDateStart').value;
          const filterDateEnd = document.getElementById('filterDateEnd').value;

          const params = {};
          if (searchInput) params.search = searchInput;
          if (filterType) params.type = filterType;
          if (filterGrade) params.grade = filterGrade;
          if (filterDateStart) params.start = filterDateStart;
          if (filterDateEnd) params.end = filterDateEnd;

          allEvents = await fetchEvents(params);
          currentPage = 1; // 重置頁碼
          renderEvents(allEvents, currentPage);
        }

        // 即時搜尋
        document.getElementById('searchInput').addEventListener('input', () => {
          filterEvents();
        });

        // 套用篩選
        document.getElementById('filterBtn').addEventListener('click', () => {
          filterEvents();
        });

        // 重設篩選
        document.getElementById('resetFilterBtn').addEventListener('click', () => {
          document.getElementById('searchInput').value = '';
          document.getElementById('filterType').value = '';
          document.getElementById('filterGrade').value = '';
          document.getElementById('filterDateStart').value = '';
          document.getElementById('filterDateEnd').value = '';
          loadEvents();
        });

        // 匯出資料功能
        document.getElementById('exportDataBtn').addEventListener('click', async () => {
          const events = await fetchEvents();
          const csvContent = [
            ['ID', 'Start', 'End', 'Title (ZH)', 'Title (EN)', 'Description (ZH)', 'Description (EN)', 'Type', 'Grade', 'Link'],
            ...events.map(event => [
              event.id,
              event.start,
              event.end || '',
              event.title_zh,
              event.title_en,
              event.description_zh || '',
              event.description_en || '',
              event.type,
              event.grade,
              event.link
            ])
          ].map(row => row.join(',')).join('\\n');

          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', 'events.csv');
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        });

        // 列印功能
        document.getElementById('printBtn').addEventListener('click', () => {
          window.print();
        });

        // 初始加載
        loadEvents();
      </script>
    </body>
    </html>
  `);
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

// 修改事件（顯示編輯表單）
app.post('/admin/update', async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).send('請提供事件 ID。<br><a href="/admin">返回管理平台</a>');
  }

  try {
    const result = await pool.query('SELECT * FROM events WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).send('事件未找到。<br><a href="/admin">返回管理平台</a>');
    }

    const event = result.rows[0];
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>後端管理平台 - 編輯事件</title>
        <link rel="stylesheet" href="/styles.css">
        <style>
          .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
          .header-content { display: flex; justify-content: space-between; align-items: center; }
          .site-title { font-size: 24px; font-weight: bold; }
          .nav-menu a { margin-left: 15px; color: #007bff; text-decoration: none; }
          .nav-menu a:hover { text-decoration: underline; }
          .edit-event-form { margin-bottom: 20px; padding: 15px; background: #f1f1f1; border-radius: 8px; }
          .form-row { display: flex; gap: 15px; margin-bottom: 10px; flex-wrap: wrap; }
          .form-group { display: flex; flex-direction: column; min-width: 200px; }
          .form-group label { margin-bottom: 5px; font-weight: bold; }
          .form-group input, .form-group select, .form-group textarea { padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
          .form-group textarea { resize: vertical; }
          .edit-event-form button { padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; }
        </style>
      </head>
      <body>
        <header>
          <div class="container header-content">
            <h1 class="site-title">事件管理系統</h1>
            <nav class="nav-menu">
              <a href="/admin">返回管理平台</a>
            </nav>
          </div>
        </header>

        <div class="container">
          <form action="/admin/update/save" method="POST" class="edit-event-form">
            <h2>編輯事件</h2>
            <input type="hidden" name="id" value="${event.id}">
            <div class="form-row">
              <div class="form-group">
                <label for="start">開始日期 (YYYY-MM-DD):</label>
                <input type="date" id="start" name="start" value="${event.start.toISOString().split('T')[0]}" required>
              </div>
              <div class="form-group">
                <label for="end">結束日期 (YYYY-MM-DD，可選):</label>
                <input type="date" id="end" name="end" value="${event.end_date ? event.end_date.toISOString().split('T')[0] : ''}">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="title_zh">標題（中文）:</label>
                <input type="text" id="title_zh" name="title_zh" value="${event.title_zh}" required>
              </div>
              <div class="form-group">
                <label for="title_en">標題（英文）:</label>
                <input type="text" id="title_en" name="title_en" value="${event.title_en || ''}">
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="description_zh">描述（中文，可選）:</label>
                <textarea id="description_zh" name="description_zh" rows="3">${event.description_zh || ''}</textarea>
              </div>
              <div class="form-group">
                <label for="description_en">描述（英文，可選）:</label>
                <textarea id="description_en" name="description_en" rows="3">${event.description_en || ''}</textarea>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="type">事件類型:</label>
                <select id="type" name="type">
                  <option value="important-exam" ${event.type === 'important-exam' ? 'selected' : ''}>重要考試</option>
                  <option value="school-activity" ${event.type === 'school-activity' ? 'selected' : ''}>學校活動</option>
                  <option value="announcement" ${event.type === 'announcement' ? 'selected' : ''}>公告</option>
                  <option value="holiday" ${event.type === 'holiday' ? 'selected' : ''}>假期</option>
                  <option value="meeting" ${event.type === 'meeting' ? 'selected' : ''}>會議</option>
                  <option value="exam" ${event.type === 'exam' ? 'selected' : ''}>檢定/測驗</option>
                  <option value="lecture" ${event.type === 'lecture' ? 'selected' : ''}>課程/講座</option>
                  <option value="uniform-inspection" ${event.type === 'uniform-inspection' ? 'selected' : ''}>服儀定期檢查</option>
                  <option value="other" ${event.type === 'other' ? 'selected' : ''}>其他</option>
                </select>
              </div>
              <div class="form-group">
                <label for="grade">年級標籤:</label>
                <select id="grade" name="grade" multiple>
                  <option value="grade-1" ${event.grade.includes('grade-1') ? 'selected' : ''}>高一</option>
                  <option value="grade-2" ${event.grade.includes('grade-2') ? 'selected' : ''}>高二</option>
                  <option value="grade-3" ${event.grade.includes('grade-3') ? 'selected' : ''}>高三</option>
                  <option value="all-grades" ${event.grade.includes('all-grades') ? 'selected' : ''}>全年級</option>
                </select>
                <small>按住 Ctrl (Windows) 或 Command (Mac) 可多選</small>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label for="link">超連結 (可選):</label>
                <input type="url" id="link" name="link" value="${event.link || ''}" placeholder="https://example.com">
              </div>
            </div>

            <button type="submit">保存更改</button>
          </form>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('獲取事件失敗:', err.stack);
    res.status(500).send('伺服器錯誤: 無法加載事件資料');
  }
});

// 保存修改後的事件
app.post('/admin/update/save', async (req, res) => {
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