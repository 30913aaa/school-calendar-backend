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

    res.send(`<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>後端管理平台 - 事件管理</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .container { max-width: 1200px; margin: auto; }
          .event-list { margin-top: 20px; }
          .event-item { border: 1px solid #ddd; padding: 10px; margin-bottom: 10px; border-radius: 5px; }
          .event-item h3 { margin: 0 0 10px; }
          .event-item p { margin: 5px 0; }
          .actions { margin-top: 10px; }
          .actions button { padding: 5px 10px; margin-right: 10px; cursor: pointer; }
          .delete-btn { background-color: #dc3545; color: white; border: none; }
          .edit-btn { background-color: #007bff; color: white; border: none; }
          .delete-btn:hover { background-color: #c82333; }
          .edit-btn:hover { background-color: #0056b3; }
          .form-container { display: none; margin-top: 20px; }
          .form-container.active { display: block; }
          label { display: block; margin-top: 10px; }
          input, textarea, select { width: 100%; padding: 8px; margin-top: 5px; }
          button[type="submit"] { margin-top: 15px; padding: 10px; background-color: #007bff; color: white; border: none; cursor: pointer; }
          button[type="submit"]:hover { background-color: #0056b3; }
          .cancel-btn { background-color: #6c757d; color: white; margin-left: 10px; }
          .cancel-btn:hover { background-color: #5a6268; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>後端管理平台 - 事件管理</h1>
          <form action="/admin/add" method="POST" id="addForm">
            <h2>新增事件</h2>
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

          <div class="event-list">
            <h2>現有事件</h2>
            ${events.map(event => `
              <div class="event-item">
                <h3>${event.title_zh} (${event.title_en || '無'})</h3>
                <p><strong>開始日期:</strong> ${event.start}</p>
                <p><strong>結束日期:</strong> ${event.end_date || '無'}</p>
                <p><strong>類型:</strong> ${event.type}</p>
                <p><strong>年級:</strong> ${event.grade}</p>
                <p><strong>描述 (中文):</strong> ${event.description_zh}</p>
                <p><strong>描述 (英文):</strong> ${event.description_en}</p>
                <p><strong>連結:</strong> <a href="${event.link}" target="_blank">${event.link || '無'}</a></p>
                <div class="actions">
                  <form action="/admin/delete" method="POST" style="display:inline;" onsubmit="return confirm('確定要刪除此事件嗎？');">
                    <input type="hidden" name="id" value="${event.id}">
                    <button type="submit" class="delete-btn">刪除</button>
                  </form>
                  <button class="edit-btn" onclick="showEditForm(${event.id}, '${event.start}', '${event.end_date || ''}', '${event.title_zh}', '${event.title_en}', '${event.description_zh}', '${event.description_en}', '${event.type}', '${event.grade}', '${event.link || ''}')">修改</button>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="form-container" id="editFormContainer">
            <h2>修改事件</h2>
            <form action="/admin/update" method="POST" id="editForm">
              <input type="hidden" id="editId" name="id">
              <label for="editStart">開始日期 (YYYY-MM-DD):</label>
              <input type="date" id="editStart" name="start" required>

              <label for="editEnd">結束日期 (YYYY-MM-DD，可選):</label>
              <input type="date" id="editEnd" name="end">

              <label for="editTitle_zh">標題（中文）:</label>
              <input type="text" id="editTitle_zh" name="title_zh" required>

              <label for="editTitle_en">標題（英文）:</label>
              <input type="text" id="editTitle_en" name="title_en">

              <label for="editDescription_zh">描述（中文）:</label>
              <textarea id="editDescription_zh" name="description_zh"></textarea>

              <label for="editDescription_en">描述（英文）:</label>
              <textarea id="editDescription_en" name="description_en"></textarea>

              <label for="editType">事件類型:</label>
              <select id="editType" name="type">
                <option value="important-exam">重要考試</option>
                <option value="school-activity">學校活動</option>
                <option value="announcement">公告</option>
                <option value="holiday">假期</option>
              </select>

              <label for="editGrade">年級標籤:</label>
              <select id="editGrade" name="grade" multiple>
                <option value="grade-1">高一</option>
                <option value="grade-2">高二</option>
                <option value="grade-3">高三</option>
                <option value="all-grades">全年級</option>
              </select>

              <label for="editLink">超連結 (可選):</label>
              <input type="url" id="editLink" name="link" placeholder="https://example.com">

              <button type="submit">儲存修改</button>
              <button type="button" class="cancel-btn" onclick="hideEditForm()">取消</button>
            </form>
          </div>

          <script>
            function showEditForm(id, start, end, title_zh, title_en, description_zh, description_en, type, grade, link) {
              document.getElementById('editId').value = id;
              document.getElementById('editStart').value = start;
              document.getElementById('editEnd').value = end;
              document.getElementById('editTitle_zh').value = title_zh;
              document.getElementById('editTitle_en').value = title_en;
              document.getElementById('editDescription_zh').value = description_zh;
              document.getElementById('editDescription_en').value = description_en;
              document.getElementById('editType').value = type;
              document.getElementById('editGrade').value = grade.split(',').filter(g => g);
              document.getElementById('editLink').value = link;
              document.getElementById('editFormContainer').classList.add('active');
            }

            function hideEditForm() {
              document.getElementById('editFormContainer').classList.remove('active');
            }
          </script>
        </div>
      </body>
      </html>`);
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