// StandUpReminder - main.js
const { app, BrowserWindow, Tray, Menu, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-software-rasterizer');

// ============ 设置持久化 ============
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      return data;
    }
  } catch (e) {}
  return null;
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (e) {}
}

// ============ 全局状态 ============
let mainWindow = null;
let lockWindow = null;
let preLockWindow = null;
let notificationWindow = null;
let notificationQueue = [];
let notificationIdCounter = 0;
let tray = null;

let isMonitoring = false;
let isPaused = false;
let isOnBreak = false;
let workDuration = 45 * 60 * 1000;
let breakDuration = 5 * 60 * 1000;
let elapsedWork = 0;
let timerInterval = null;
let breakTimeout = null;
let mainWindowDestroyTimer = null;

let preLockWarningTime = 5 * 1000;
let postponeDuration = 5 * 60 * 1000;
let preLockTriggered = false;
let isPostponed = false;
let postponeCount = 0;
let postponeEndTime = 0;

// 自定义提醒（喝水作为第一项，内置默认关闭）
let customReminders = [
  { name: '喝水提醒', interval: 30, postponeMinutes: 5, enabled: false, remaining: 30 * 60 * 1000 }
];

// 全局倒计时定时器
let countdownInterval = null;

const iconRedPath = path.join(__dirname, 'assets', 'icon-red.png');
const iconGreenPath = path.join(__dirname, 'assets', 'icon-green.png');

const healthTips = [
  "久坐1小时，腰椎压力增加40%。站起来伸个懒腰，左右扭腰各5次。",
  "久坐会导致臀肌失忆症。做5个深蹲，激活臀部肌肉。",
  "眼睛也需要休息。远眺窗外20秒，让睫状肌放松。",
  "久坐影响血液循环。原地踏步30秒，促进下肢血液回流。",
  "颈椎长期前伸会导致富贵包。下巴后缩，做5次颈部伸展。",
  "久坐增加心血管疾病风险。深呼吸5次，放松身心。",
  "腰椎间盘最怕久坐。双手叉腰，做5次腰部后仰。",
  "久坐会让代谢变慢。喝一杯水，促进新陈代谢。"
];

const waterTips = [
  "该喝水了！保持身体水分充足，让大脑更清醒。",
  "喝水时间到！一杯温水，促进新陈代谢。",
  "记得喝水哦！身体缺水会让人疲劳。",
  "补水提醒：喝杯水，让皮肤水润有光泽。"
];

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function updateTrayIcon() {
  if (!tray) return;
  try {
    const iconPath = (isMonitoring && !isPaused && !isOnBreak) ? iconRedPath : iconGreenPath;
    if (fs.existsSync(iconPath)) {
      tray.setImage(require('electron').nativeImage.createFromPath(iconPath));
    }
    const tooltip = isOnBreak ? 'StandUp - 休息中'
      : isPaused ? 'StandUp - 已暂停'
      : isMonitoring ? 'StandUp - 监控中'
      : 'StandUp - 已停止';
    tray.setToolTip(tooltip);
  } catch (e) {}
}

function ensureMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  }
  mainWindow.show();
  mainWindow.focus();
}

function updateTrayMenu() {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示主窗口', enabled: !isOnBreak, click: () => { ensureMainWindow(); } },
    { type: 'separator' },
    { label: isMonitoring ? (isPaused ? '继续监控' : '暂停监控') : '开始监控', enabled: !isOnBreak && !isMonitoring,
      click: () => {
        if (!isMonitoring) {
          startMonitoring(workDuration / 60000, breakDuration / 60000);
          _saveCurrentSettings();
        } else if (isPaused) {
          resumeMonitoring();
        } else {
          pauseMonitoring();
        }
      } },
    { label: '停止监控', enabled: !isOnBreak && isMonitoring, click: () => stopMonitoring() },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuiting = true; app.quit(); } }
  ]);
  tray.setContextMenu(contextMenu);
}

// ============ 创建主窗口（820×662，原生标题栏） ============
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 820,
    height: 662,
    minWidth: 700,
    minHeight: 540,
    resizable: true,
    backgroundColor: '#f8f9fc',
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false,
      spellcheck: false,
      webgl: false,
      sandbox: false
    }
  });
  mainWindow.loadFile('index.html');
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', (e) => {
    if (!app.isQuiting) { e.preventDefault(); mainWindow.hide(); }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.on('hide', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.setBackgroundThrottling(true);
    }
    if (mainWindowDestroyTimer) clearTimeout(mainWindowDestroyTimer);
    mainWindowDestroyTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
        mainWindow.destroy();
        mainWindow = null;
      }
    }, 5 * 60 * 1000);
  });
  mainWindow.on('show', () => {
    if (mainWindowDestroyTimer) { clearTimeout(mainWindowDestroyTimer); mainWindowDestroyTimer = null; }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.setBackgroundThrottling(false);
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    sendToRenderer('custom-reminders-updated', customReminders);
    sendToRenderer('load-settings', {
      workMinutes: workDuration / 60000,
      breakMinutes: breakDuration / 60000,
      preLockWarningTime: preLockWarningTime / 1000,
      postponeDuration: postponeDuration / 60000
    });
  });
}

// ============ 预警窗口 ============
function createPreLockWindow() {
  if (preLockWindow) return;
  showPreLockNotification();
  preLockWindow = true;
  setTimeout(() => {
    if (preLockWindow && !isPostponed) {
      closePreLockWindow();
      showLockScreen();
    }
  }, preLockWarningTime);
}

function closePreLockWindow() {
  if (preLockWindow) {
    notificationQueue = notificationQueue.filter(n => !n.isPreLock);
    if (notificationQueue.length === 0) {
      if (notificationWindow && !notificationWindow.isDestroyed()) {
        notificationWindow.close();
      }
      notificationWindow = null;
    } else if (notificationWindow && !notificationWindow.isDestroyed()) {
      notificationWindow.webContents.send('render-queue', buildQueueData());
    }
    preLockWindow = null;
  }
}

// ============ 通知窗口（堆叠式） ============
function ensureNotificationWindow() {
  if (notificationWindow && !notificationWindow.isDestroyed()) return;
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const w = 320, h = 400;
  notificationWindow = new BrowserWindow({
    width: w, height: h,
    x: sw - w - 8, y: sh - h - 8,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    transparent: true,
    focusable: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, spellcheck: false, sandbox: false }
  });
  notificationWindow.loadFile('notification.html');
  notificationWindow.on('closed', () => { notificationWindow = null; });
  notificationWindow.webContents.on('did-finish-load', () => {
    if (notificationQueue.length > 0) {
      notificationWindow.webContents.send('render-queue', buildQueueData());
    }
  });
}

function buildQueueData() {
  const maxVisible = 3;
  const items = notificationQueue.map(n => ({
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    canPostpone: n.canPostpone,
    isPreLock: n.isPreLock
  }));
  const visible = items.slice(-maxVisible);
  visible.sort((a, b) => {
    if (a.isPreLock && !b.isPreLock) return -1;
    if (!a.isPreLock && b.isPreLock) return 1;
    return 0;
  });
  const hiddenCount = Math.max(0, items.length - maxVisible);
  return { visible, hiddenCount };
}

function showNotification(title, message, type, postponeCallback) {
  const id = ++notificationIdCounter;
  notificationQueue.push({
    id, title, message, type,
    canPostpone: !!postponeCallback,
    isPreLock: false,
    postponeCallback
  });
  ensureNotificationWindow();
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    notificationWindow.webContents.send('render-queue', buildQueueData());
  }
  setTimeout(() => dismissNotification(id), 5000);
}

function showPreLockNotification() {
  const id = ++notificationIdCounter;
  notificationQueue.push({
    id,
    title: '久坐提醒',
    message: postponeCount >= 2 ? '已推迟2次，工作时长即将结束，即将锁屏休息' : '工作时长即将结束，即将锁屏休息',
    type: 'prelock',
    canPostpone: postponeCount < 2,
    isPreLock: true
  });
  ensureNotificationWindow();
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    notificationWindow.webContents.send('render-queue', buildQueueData());
  }
}

function dismissNotification(id) {
  notificationQueue = notificationQueue.filter(n => n.id !== id);
  if (notificationQueue.length === 0) {
    if (notificationWindow && !notificationWindow.isDestroyed()) {
      notificationWindow.close();
    }
    notificationWindow = null;
  } else if (notificationWindow && !notificationWindow.isDestroyed()) {
    notificationWindow.webContents.send('render-queue', buildQueueData());
  }
}

function closeAllNotifications() {
  notificationQueue = [];
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    notificationWindow.close();
  }
  notificationWindow = null;
}

// ============ 锁屏 ============
function createLockWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;
  isOnBreak = true;
  updateTrayIcon();
  updateTrayMenu();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
  closeAllNotifications();
  lockWindow = new BrowserWindow({
    width, height, x: 0, y: 0,
    frame: false,
    backgroundColor: '#1a1a2e',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    focusable: true,
    skipTaskbar: true,
    hasShadow: false,
    type: 'panel',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      spellcheck: false,
      sandbox: false
    }
  });
  lockWindow.setAlwaysOnTop(true, 'screen-saver');
  lockWindow.setVisibleOnAllWorkspaces(true);
  lockWindow.setPosition(0, 0);
  lockWindow.setSize(width, height);
  lockWindow.loadFile('lockscreen.html');
  lockWindow.focus();
  lockWindow.moveTop();
  lockWindow.on('focus', () => {
    if (lockWindow && !lockWindow.isDestroyed()) {
      lockWindow.moveTop();
    }
  });
}

// ============ 计时 ============
function startMonitoring(workMinutes, breakMinutes, settings) {
  workDuration = workMinutes * 60 * 1000;
  breakDuration = breakMinutes * 60 * 1000;
  if (settings) {
    if (settings.preLockWarningTime) preLockWarningTime = settings.preLockWarningTime * 1000;
    if (settings.postponeDuration) postponeDuration = settings.postponeDuration * 60 * 1000;
  }

  isMonitoring = true;
  isPaused = false;
  isOnBreak = false;
  preLockTriggered = false;
  isPostponed = false;
  postponeCount = 0;
  postponeEndTime = 0;
  elapsedWork = 0;

  updateTrayIcon();
  updateTrayMenu();

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tickWork, 1000);

  if (!countdownInterval) {
    startCountdowns();
  }

  sendToRenderer('monitoring-started', {
    workDuration, breakDuration,
    preLockWarningTime: preLockWarningTime / 1000,
    postponeDuration: postponeDuration / 60000
  });
  sendToRenderer('postpone-status', { count: postponeCount });
}

function tickWork() {
  if (isPaused || !isMonitoring || isOnBreak) return;
  elapsedWork += 1000;
  const effectiveDuration = postponeEndTime > 0 ? postponeEndTime : workDuration;
  const remaining = effectiveDuration - elapsedWork;

  if (remaining <= preLockWarningTime && !preLockTriggered && !isPostponed && postponeCount < 2) {
    preLockTriggered = true;
    createPreLockWindow();
  }

  if (elapsedWork >= effectiveDuration) {
    preLockTriggered = false;
    isPostponed = false;
    postponeCount = 0;
    postponeEndTime = 0;
    sendToRenderer('postpone-status', { count: postponeCount });
    showLockScreen();
  } else {
    sendToRenderer('update-status', {
      elapsed: elapsedWork,
      remaining,
      progress: (elapsedWork / effectiveDuration) * 100,
      postponeCount
    });
  }
}

function pauseMonitoring() {
  isPaused = true;
  updateTrayIcon();
  updateTrayMenu();
  sendToRenderer('monitoring-paused');
}

function resumeMonitoring() {
  if (isMonitoring && isPaused) {
    isPaused = false;
    updateTrayIcon();
    updateTrayMenu();
    sendToRenderer('monitoring-resumed');
  }
}

function stopMonitoring() {
  isMonitoring = false; isPaused = false; isOnBreak = false;
  preLockTriggered = false; isPostponed = false; postponeCount = 0; postponeEndTime = 0;
  elapsedWork = 0;
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (breakTimeout) { clearTimeout(breakTimeout); breakTimeout = null; }
  stopCountdowns();
  closePreLockWindow();
  closeAllNotifications();
  updateTrayIcon();
  updateTrayMenu();
  sendToRenderer('monitoring-stopped');
  sendToRenderer('postpone-status', { count: postponeCount });
}

function postponeLock() {
  isPostponed = false;
  preLockTriggered = false;
  closePreLockWindow();
  postponeCount++;
  const currentEffective = postponeEndTime > 0 ? postponeEndTime : workDuration;
  const currentRemaining = currentEffective - elapsedWork;
  postponeEndTime = elapsedWork + currentRemaining + postponeDuration;
  const effectiveDuration = postponeEndTime;
  sendToRenderer('update-status', {
    elapsed: elapsedWork,
    remaining: effectiveDuration - elapsedWork,
    progress: (elapsedWork / effectiveDuration) * 100,
    postponeCount
  });
  sendToRenderer('postpone-status', { count: postponeCount });
  sendToRenderer('postponed', { minutes: postponeDuration / 60000, count: postponeCount });
}

function showLockScreen() {
  if (lockWindow) return;
  closePreLockWindow();
  createLockWindow();
  const randomTip = healthTips[Math.floor(Math.random() * healthTips.length)];
  lockWindow.webContents.on('did-finish-load', () => {
    lockWindow.webContents.send('start-break', { duration: breakDuration, tip: randomTip });
  });
  breakTimeout = setTimeout(() => {
    closeLockScreen();
    startMonitoring(workDuration / 60000, breakDuration / 60000);
  }, breakDuration);
}

function closeLockScreen() {
  if (lockWindow) { lockWindow.destroy(); lockWindow = null; }
  if (breakTimeout) { clearTimeout(breakTimeout); breakTimeout = null; }
  isOnBreak = false;
  updateTrayIcon();
  ensureMainWindow();
}

// ============ 自定义提醒 + 倒计时系统 ============
function startCountdowns() {
  stopCountdowns();
  countdownInterval = setInterval(() => {
    if (isPaused || isOnBreak) return;
    let updated = false;
    customReminders.forEach(r => {
      if (r.enabled && r.interval > 0) {
        r.remaining -= 1000;
        if (r.remaining <= 0) {
          const tips = r.name === '喝水提醒' ? waterTips : [`该${r.name}了！`];
          const tip = tips[Math.floor(Math.random() * tips.length)];
          showNotification(r.name, tip, 'custom', () => r.postponeMinutes || 5);
          r.remaining = r.interval * 60 * 1000;
        }
        updated = true;
      }
    });
    if (updated) {
      sendToRenderer('countdown-updated', customReminders.map(r => ({
        name: r.name,
        remaining: r.remaining,
        enabled: r.enabled
      })));
    }
  }, 1000);
}

function stopCountdowns() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
}

function resetAllReminders() {
  customReminders.forEach(r => {
    r.remaining = r.interval * 60 * 1000;
  });
}

function _saveCurrentSettings() {
  saveSettings({
    workMinutes: workDuration/60000,
    breakMinutes: breakDuration/60000,
    preLockWarningTime: preLockWarningTime/1000,
    postponeDuration: postponeDuration/60000,
    customReminders
  });
}

function addCustomReminder(name, intervalMinutes, postponeMinutes = 5) {
  if (customReminders.find(r => r.name === name)) return;
  customReminders.push({
    name,
    interval: intervalMinutes,
    postponeMinutes,
    enabled: true,
    remaining: intervalMinutes * 60 * 1000
  });
  sendToRenderer('custom-reminders-updated', customReminders);
  _saveCurrentSettings();
}

function removeCustomReminder(name) {
  customReminders = customReminders.filter(r => r.name !== name);
  sendToRenderer('custom-reminders-updated', customReminders);
  _saveCurrentSettings();
}

function toggleCustomReminder(name, enabled) {
  const r = customReminders.find(r => r.name === name);
  if (r) {
    r.enabled = enabled;
    if (enabled) {
      r.remaining = r.interval * 60 * 1000;
    }
    sendToRenderer('custom-reminders-updated', customReminders);
    _saveCurrentSettings();
  }
}

function updateCustomReminder(name, field, value) {
  const r = customReminders.find(r => r.name === name);
  if (r) {
    r[field] = value;
    if (field === 'interval') {
      r.remaining = value * 60 * 1000;
    }
    sendToRenderer('custom-reminders-updated', customReminders);
    _saveCurrentSettings();
  }
}

function renameCustomReminder(oldName, newName) {
  const r = customReminders.find(r => r.name === oldName);
  if (r && newName.trim()) {
    r.name = newName.trim();
    sendToRenderer('custom-reminders-updated', customReminders);
    _saveCurrentSettings();
  }
}

function resetReminder(name) {
  const r = customReminders.find(r => r.name === name);
  if (r) {
    r.remaining = r.interval * 60 * 1000;
    sendToRenderer('custom-reminders-updated', customReminders);
  }
}

// ============ 托盘 ============
function createTray() {
  try {
    const iconPath = fs.existsSync(iconGreenPath) ? iconGreenPath : iconRedPath;
    tray = new Tray(require('electron').nativeImage.createFromPath(iconPath));
  } catch (e) {
    tray = new Tray(require('electron').nativeImage.createEmpty());
  }
  updateTrayMenu();
  updateTrayIcon();
  tray.on('double-click', () => { ensureMainWindow(); });
}

// ============ IPC ============
ipcMain.on('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => { if (mainWindow) mainWindow.hide(); });

ipcMain.on('start-monitoring', (e, data) => {
  startMonitoring(data.workMinutes, data.breakMinutes, data.settings);
  _saveCurrentSettings();
});

ipcMain.on('save-settings', (e, data) => {
  if (data.workMinutes !== undefined) workDuration = data.workMinutes * 60000;
  if (data.breakMinutes !== undefined) breakDuration = data.breakMinutes * 60000;
  if (data.preLockWarningTime !== undefined) preLockWarningTime = data.preLockWarningTime * 1000;
  if (data.postponeDuration !== undefined) postponeDuration = data.postponeDuration * 60000;
  _saveCurrentSettings();
});
ipcMain.on('pause-monitoring', () => pauseMonitoring());
ipcMain.on('resume-monitoring', () => resumeMonitoring());
ipcMain.on('stop-monitoring', () => stopMonitoring());

ipcMain.on('postpone-lock', () => postponeLock());
ipcMain.on('confirm-lock', () => { closePreLockWindow(); showLockScreen(); });

ipcMain.on('notification-dismiss', (e, id) => {
  if (id !== undefined && id !== null) {
    const item = notificationQueue.find(n => n.id === id);
    if (item) {
      dismissNotification(id);
      return;
    }
  }
  closeAllNotifications();
});

ipcMain.on('notification-postpone', () => {
  if (notificationWindow) {
    notificationWindow.destroy();
    notificationWindow = null;
  }
  notificationQueue = [];
});

ipcMain.on('notification-postpone-lock', () => {
  notificationQueue = notificationQueue.filter(n => !n.isPreLock);
  if (notificationQueue.length === 0) {
    if (notificationWindow && !notificationWindow.isDestroyed()) {
      notificationWindow.close();
    }
    notificationWindow = null;
  } else if (notificationWindow && !notificationWindow.isDestroyed()) {
    notificationWindow.webContents.send('render-queue', buildQueueData());
  }
  postponeLock();
});

ipcMain.on('resize-notification', (e, data) => {
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    const w = 320;
    const h = data.height;
    notificationWindow.setBounds({
      x: sw - w - 8,
      y: sh - h - 8,
      width: w,
      height: h
    });
  }
});

ipcMain.on('navigate', (e, page) => navigateTo(page));

ipcMain.on('add-reminder', (e, data) => addCustomReminder(data.name, data.interval, data.postpone));
ipcMain.on('remove-reminder', (e, data) => removeCustomReminder(data.name));
ipcMain.on('toggle-reminder', (e, data) => toggleCustomReminder(data.name, data.enabled));
ipcMain.on('update-reminder', (e, data) => updateCustomReminder(data.name, data.field, data.value));
ipcMain.on('rename-reminder', (e, data) => renameCustomReminder(data.oldName, data.newName));
ipcMain.on('reset-reminder', (e, data) => resetReminder(data.name));

// ============ 生命周期 ============
app.whenReady().then(() => {
  const saved = loadSettings();
  if (saved) {
    if (saved.workMinutes) workDuration = saved.workMinutes * 60 * 1000;
    if (saved.breakMinutes) breakDuration = saved.breakMinutes * 60 * 1000;
    if (saved.preLockWarningTime) preLockWarningTime = saved.preLockWarningTime * 1000;
    if (saved.postponeDuration) postponeDuration = saved.postponeDuration * 60 * 1000;
    if (saved.customReminders && Array.isArray(saved.customReminders)) {
      customReminders = saved.customReminders;
    }
  }

  Menu.setApplicationMenu(null);
  createTray();
  createMainWindow();
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => {
  app.isQuiting = true;
  stopMonitoring();
  stopCountdowns();
  [lockWindow, preLockWindow, notificationWindow].forEach(w => { if (w && w.destroy) w.destroy(); });
});
