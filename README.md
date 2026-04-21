# StandUpReminder - 久坐提醒工具

一个基于 Electron 开发的 Windows 桌面应用，帮助您定时休息，保护腰椎健康。

## 功能特性

- ⏰ **智能监控**: 自动检测用户活动状态，只在真正工作时累计时间
- 🔒 **强制休息**: 全屏锁屏界面，阻止鼠标键盘操作，确保您真正休息
- ⏳ **沙漏动画**: 优雅的倒计时动画，让等待不再枯燥
- 💡 **健康提示**: 随机显示久坐危害和缓解建议
- 🖥️ **系统托盘**: 最小化到托盘，不打扰工作
- ⚙️ **灵活配置**: 自定义工作和休息时长

## 安装运行

### 开发环境运行

```bash
# 进入项目目录
cd F:\my_project\StandUpReminder-dev

# 安装依赖
npm install

# 启动应用
npm start
```

### 打包发布

```bash
# 生成安装包
npm run dist
```

打包后的安装包位于 `dist/` 目录：
- `StandUpReminder Setup 1.0.0.exe` - Windows 安装程序

## 使用说明

1. **启动应用**: 运行 `npm start` 或双击打包后的可执行文件
2. **设置时长**: 
   - 工作时长: 建议 45-60 分钟
   - 休息时长: 建议 5-10 分钟
3. **开始监控**: 点击"开始监控"按钮
4. **正常工作**: 应用会在后台监控您的活动状态
5. **强制休息**: 当累计工作时间达到设定值，会自动弹出全屏锁屏
6. **休息结束**: 倒计时结束后自动解锁，恢复工作

## 技术实现

### 空闲检测

使用 Windows API `GetLastInputInfo` 通过 PowerShell 脚本获取系统空闲时间：

```powershell
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class IdleTime {
  [DllImport("user32.dll")]
  static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  ...
}
'@
[IdleTime]::GetIdleTime()
```

### 时间累计逻辑

- **活跃状态** (空闲 < 1秒): 累计工作时间
- **短暂离开** (1秒 < 空闲 < 30秒): 暂停累计，保持当前进度
- **长时间离开** (空闲 > 30秒): 重置累计时间，视为新工作周期

### 锁屏机制

- 全屏透明窗口，始终置顶
- 阻止所有键盘和鼠标事件
- 显示倒计时和健康提示
- 进度条可视化剩余时间

## 项目结构

```
StandUpReminder-dev/
├── main.js              # 主进程（Electron + 空闲检测）
├── index.html           # 主窗口 UI
├── lockscreen.html      # 锁屏界面
├── package.json         # 项目配置
├── README.md            # 本文件
├── PLAN.md              # 开发计划
├── assets/              # 资源文件夹
└── node_modules/        # 依赖包
```

## 开发计划

- [x] 初始化 Electron 项目
- [x] 实现 Windows 空闲检测
- [x] 创建主窗口 UI
- [x] 创建锁屏界面
- [x] 实现主进程逻辑
- [x] 实现系统托盘
- [ ] 集成测试（需要桌面环境）
- [ ] 打包发布

## 注意事项

1. **Windows 专用**: 空闲检测依赖 Windows API，仅支持 Windows 系统
2. **管理员权限**: 某些系统可能需要管理员权限才能正确检测空闲时间
3. **托盘图标**: 如未提供图标文件，托盘功能将自动禁用

## 健康小贴士

> 久坐1小时，腰椎压力增加40%。建议：站起来伸个懒腰，左右扭腰各5次。

> 久坐会导致臀肌失忆症。建议：做5个深蹲，激活臀部肌肉。

> 眼睛也需要休息。建议：远眺窗外20秒，让睫状肌放松。

## 许可证

MIT License

---

**保护腰椎，从定时休息开始！** 💪
