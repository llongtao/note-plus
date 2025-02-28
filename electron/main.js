import { app, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  })

  // 在开发环境中加载Vite开发服务器
  const isDev = !app.isPackaged
  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    // 在生产环境中加载打包后的index.html
    const indexPath = path.resolve(__dirname, '../dist/index.html')
    console.log('Loading index.html from:', indexPath)
    win.loadFile(indexPath).catch((error) => {
      console.error('Failed to load index.html:', error)
      // 尝试使用相对路径加载
      const relativePath = '../dist/index.html'
      console.log('Trying relative path:', relativePath)
      win.loadFile(relativePath).catch((err) => {
        console.error('Failed to load with relative path:', err)
      })
    })
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})