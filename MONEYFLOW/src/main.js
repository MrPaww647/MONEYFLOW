const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let db;
function initDb() {
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  db = new Database(path.join(dir, 'moneyflow.sqlite'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS bank_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_configured',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('income','expense')),
      amount REAL NOT NULL CHECK(amount > 0),
      category TEXT NOT NULL,
      description TEXT DEFAULT '',
      date TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category_date ON transactions(category, date);
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL UNIQUE,
      limit_amount REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target REAL NOT NULL,
      saved REAL NOT NULL DEFAULT 0,
      deadline TEXT DEFAULT ''
    );
  `);
}
function createAutomaticBackup() {
  try {
    const dir = path.join(app.getPath('userData'), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    db.pragma('wal_checkpoint(FULL)');
    const target = path.join(dir, `moneyflow-auto-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
    fs.copyFileSync(path.join(app.getPath('userData'), 'moneyflow.sqlite'), target);
    const backups = fs.readdirSync(dir).filter(x => x.endsWith('.sqlite')).sort().reverse();
    backups.slice(10).forEach(name => fs.unlinkSync(path.join(dir, name)));
  } catch (err) {
    console.error('Automatic backup failed:', err);
  }
}
function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1100, minHeight: 720,
    backgroundColor: '#0b0d12',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}
const allTransactions = () => db.prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC').all();
ipcMain.handle('transactions:list', () => allTransactions());
ipcMain.handle('transactions:add', (_e, tx) => {
  if (!['income','expense'].includes(tx.type) || !(Number(tx.amount) > 0) || !tx.category || !tx.date) throw new Error('Проверьте тип, сумму, категорию и дату.');
  const info = db.prepare('INSERT INTO transactions(type,amount,category,description,date) VALUES(?,?,?,?,?)')
    .run(tx.type, Number(tx.amount), String(tx.category), String(tx.description || ''), String(tx.date));
  return db.prepare('SELECT * FROM transactions WHERE id=?').get(info.lastInsertRowid);
});
ipcMain.handle('transactions:delete', (_e, id) => db.prepare('DELETE FROM transactions WHERE id=?').run(Number(id)).changes > 0);
ipcMain.handle('transactions:import', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'CSV', extensions: ['csv'] }] });
  if (result.canceled || !result.filePaths[0]) return { imported: 0 };
  const raw = fs.readFileSync(result.filePaths[0], 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { imported: 0 };
  const delim = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delim).map(x => x.trim().toLowerCase());
  const find = (...names) => names.map(n => headers.indexOf(n)).find(i => i >= 0) ?? -1;
  const ixDate = find('date','дата'), ixType = find('type','тип'), ixAmount = find('amount','сумма'), ixCat = find('category','категория'), ixDesc = find('description','описание','комментарий');
  if ([ixDate,ixType,ixAmount,ixCat].some(i => i < 0)) throw new Error('CSV должен содержать колонки: date,type,amount,category (или русские аналоги).');
  const insert = db.prepare('INSERT INTO transactions(type,amount,category,description,date) VALUES(?,?,?,?,?)');
  let count = 0;
  const run = db.transaction(() => {
    for (const line of lines.slice(1)) {
      const c = line.split(delim).map(x => x.trim().replace(/^"|"$/g,''));
      const typeRaw = c[ixType].toLowerCase();
      const type = ['income','доход','поступление'].includes(typeRaw) ? 'income' : ['expense','расход','списание'].includes(typeRaw) ? 'expense' : null;
      const amount = Number(c[ixAmount].replace(/\s/g,'').replace(',','.'));
      const date = c[ixDate];
      if (!type || !(amount > 0) || !c[ixCat] || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      insert.run(type, amount, c[ixCat], ixDesc >= 0 ? c[ixDesc] : '', date); count++;
    }
  });
  run();
  return { imported: count };
});
ipcMain.handle('budgets:list', () => db.prepare('SELECT * FROM budgets ORDER BY category').all());
ipcMain.handle('budgets:save', (_e, item) => {
  db.prepare('INSERT INTO budgets(category,limit_amount) VALUES(?,?) ON CONFLICT(category) DO UPDATE SET limit_amount=excluded.limit_amount')
    .run(item.category, Number(item.limit_amount));
  return db.prepare('SELECT * FROM budgets WHERE category=?').get(item.category);
});
ipcMain.handle('goals:list', () => db.prepare('SELECT * FROM goals ORDER BY id DESC').all());
ipcMain.handle('goals:add', (_e, g) => {
  db.prepare('INSERT INTO goals(name,target,saved,deadline) VALUES(?,?,?,?)').run(g.name, Number(g.target), Number(g.saved || 0), g.deadline || '');
  return db.prepare('SELECT * FROM goals ORDER BY id DESC LIMIT 1').get();
});
ipcMain.handle('goals:delete', (_e, id) => db.prepare('DELETE FROM goals WHERE id=?').run(Number(id)).changes > 0);
ipcMain.handle('data:export', async () => {
  const result = await dialog.showSaveDialog({ defaultPath: 'moneyflow-transactions.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
  if (result.canceled || !result.filePath) return false;
  const rows = allTransactions();
  const q = v => '"' + String(v ?? '').replace(/"/g,'""') + '"';
  const csv = ['date,type,amount,category,description', ...rows.map(r => [r.date,r.type,r.amount,r.category,r.description].map(q).join(','))].join('\n');
  fs.writeFileSync(result.filePath, '\uFEFF' + csv, 'utf8');
  return true;
});
ipcMain.handle('recurring:detect', () => {
  const rows = allTransactions();
  const groups = new Map();
  const normalize = s => String(s || '').toLowerCase().replace(/[^a-zа-яё0-9]+/gi, ' ').trim();
  for (const row of rows) {
    const key = [row.type, row.category, normalize(row.description)].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const found = [];
  for (const items of groups.values()) {
    if (items.length < 2) continue;
    items.sort((a,b) => a.date.localeCompare(b.date));
    const gaps = [];
    for (let i=1;i<items.length;i++) {
      gaps.push((new Date(items[i].date+'T12:00:00')-new Date(items[i-1].date+'T12:00:00'))/86400000);
    }
    const avg = gaps.reduce((a,b)=>a+b,0)/gaps.length;
    const variance = gaps.every(x => Math.abs(x-avg) <= Math.max(5, avg*0.22));
    let cadence = null, days = null;
    if (variance && avg >= 6 && avg <= 9) { cadence='Еженедельно'; days=7; }
    else if (variance && avg >= 26 && avg <= 35) { cadence='Ежемесячно'; days=30; }
    else if (variance && avg >= 350 && avg <= 380) { cadence='Ежегодно'; days=365; }
    if (!cadence) continue;
    const last = items[items.length-1];
    const next = new Date(last.date+'T12:00:00'); next.setDate(next.getDate()+days);
    found.push({
      type:last.type, category:last.category, description:last.description,
      amount: items.reduce((a,x)=>a+Number(x.amount),0)/items.length,
      occurrences:items.length, cadence, last_date:last.date,
      next_date:next.toISOString().slice(0,10)
    });
  }
  return found.sort((a,b)=>a.next_date.localeCompare(b.next_date));
});
ipcMain.handle('backup:create', async () => {
  const result = await dialog.showSaveDialog({ defaultPath: `MONEYFLOW-backup-${new Date().toISOString().slice(0,10)}.sqlite`, filters:[{name:'SQLite backup',extensions:['sqlite']}] });
  if (result.canceled || !result.filePath) return { saved:false };
  db.pragma('wal_checkpoint(FULL)');
  fs.copyFileSync(path.join(app.getPath('userData'),'moneyflow.sqlite'), result.filePath);
  return { saved:true, path:result.filePath };
});
ipcMain.handle('backup:restore', async () => {
  const result = await dialog.showOpenDialog({ properties:['openFile'], filters:[{name:'SQLite backup',extensions:['sqlite','db']}] });
  if (result.canceled || !result.filePaths[0]) return { restored:false };
  const source = result.filePaths[0];
  const current = path.join(app.getPath('userData'),'moneyflow.sqlite');
  db.pragma('wal_checkpoint(FULL)');
  db.close();
  try {
    fs.copyFileSync(source, current);
    db = new Database(current);
    db.pragma('journal_mode = WAL');
    return { restored:true };
  } catch (err) {
    db = new Database(current);
    db.pragma('journal_mode = WAL');
    throw err;
  }
});
ipcMain.handle('banks:providers', () => [
  { id:'open_banking_generic', name:'Официальный Open Banking API', status:'not_configured', note:'Требуются страна, банк и поддерживаемый лицензированный провайдер.' }
]);
ipcMain.handle('analytics:year', (_e, year) => {
  const y = String(Number(year));
  const rows = db.prepare("SELECT strftime('%m', date) AS month, type, SUM(amount) AS total FROM transactions WHERE strftime('%Y', date)=? GROUP BY month,type ORDER BY month").all(y);
  return rows;
});
app.whenReady().then(() => { initDb(); createAutomaticBackup(); createWindow(); });
