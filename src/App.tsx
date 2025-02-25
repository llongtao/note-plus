import { useState, useEffect, useCallback } from 'react';
import { Box, AppBar, Toolbar, Typography, IconButton, Container, Tabs, Tab, Snackbar, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Menu, MenuItem } from '@mui/material';
import { Save as SaveIcon, FolderOpen as FolderOpenIcon, NoteAdd as NoteAddIcon, Close as CloseIcon, GitHub as GiteeIcon, CloudUpload as SyncIcon, CloudDownload as PullIcon, Settings as SettingsIcon } from '@mui/icons-material';
import { CircularProgress } from '@mui/material';
import axios from 'axios';
import Editor from '@monaco-editor/react';

interface FileTab {
  id: string;
  name: string;
  content: string;
  isDirty: boolean;
  lastModified: number;
}

interface GiteeConfig {
  accessToken: string;
  username: string;
  repo: string;
}

interface Settings {
  autoSaveInterval: number;
  giteeConfig: GiteeConfig | null;
}

function App() {
  const [files, setFiles] = useState<FileTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string>('');
  const [giteeConfig, setGiteeConfig] = useState<GiteeConfig | null>(null);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    autoSaveInterval: 10,
    giteeConfig: null
  });
  const [giteeFormData, setGiteeFormData] = useState({
    accessToken: '',
    username: '',
    repo: ''
  });
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [isPulling, setIsPulling] = useState(false);
  const [isGiteeDialogOpen, setIsGiteeDialogOpen] = useState(false);
  const [closedFiles, setClosedFiles] = useState<FileTab[]>([]);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // 从localStorage加载已关闭的文件
  useEffect(() => {
    const savedClosedFiles = localStorage.getItem('noteplus_closed_files');
    if (savedClosedFiles) {
      setClosedFiles(JSON.parse(savedClosedFiles));
    }
  }, []);

  const handleOpenMenuClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
  };

  const reopenFile = (file: FileTab) => {
    setFiles([...files, file]);
    setActiveTab(file.id);
    setClosedFiles(closedFiles.filter(f => f.id !== file.id));
    localStorage.setItem('noteplus_closed_files', JSON.stringify(closedFiles.filter(f => f.id !== file.id)));
    handleCloseMenu();
  };

  const closeFile = (fileId: string) => {
    const fileToClose = files.find(file => file.id === fileId);
    if (fileToClose) {
      if (fileToClose.isDirty) {
        saveFiles();
      }
      // 将关闭的文件添加到已关闭列表
      setClosedFiles([fileToClose, ...closedFiles.slice(0, 9)]); // 只保留最近10个
      localStorage.setItem('noteplus_closed_files', JSON.stringify([fileToClose, ...closedFiles.slice(0, 9)]));
      
      const newFiles = files.filter(file => file.id !== fileId);
      setFiles(newFiles);
      if (activeTab === fileId && newFiles.length > 0) {
        setActiveTab(newFiles[0].id);
      }
    }
  };

  const handlePullFromGitee = async () => {
    if (!giteeConfig || isPulling) return;
    setIsPulling(true);
    setSyncMessage('');

    try {
      // 获取notes目录下的所有文件
      const response = await axios.get(
        `https://gitee.com/api/v5/repos/${giteeConfig.username}/${giteeConfig.repo}/contents/notes`,
        {
          params: {
            access_token: giteeConfig.accessToken,
            ref: 'main'
          }
        }
      );

      const recoveredFiles: FileTab[] = [];

      // 遍历并获取每个文件的内容
      for (const file of response.data) {
        if (file.type === 'file' && file.name.endsWith('.json')) {
          try {
            // 使用contents API获取文件内容
            const fileContentResponse = await axios.get(
              `https://gitee.com/api/v5/repos/${giteeConfig.username}/${giteeConfig.repo}/contents/notes/${file.name}`,
              {
                params: {
                  access_token: giteeConfig.accessToken,
                  ref: 'main'
                }
              }
            );

            // 解码Base64内容
            const content = decodeURIComponent(escape(atob(fileContentResponse.data.content)));
            const fileData = JSON.parse(content);
            recoveredFiles.push(fileData);
          } catch (error) {
            console.error(`Failed to fetch file ${file.name}:`, error);
          }
        }
      }

      if (recoveredFiles.length > 0) {
        setFiles(recoveredFiles);
        setActiveTab(recoveredFiles[0].id);
        localStorage.setItem('noteplus_files', JSON.stringify(recoveredFiles));
        setSyncMessage(`从云端恢复成功，共恢复 ${recoveredFiles.length} 个文件`);

      } else {
        setSyncMessage('未找到可恢复的文件');
      }
    } catch (error: any) {
      console.error('Failed to pull from Gitee:', error);
      setSyncMessage('从云端恢复失败，请检查网络或仓库权限');
    } finally {
      setIsPulling(false);
    }
  };



  const handleManualSync = async () => {
    if (!giteeConfig || isSyncing) return;
    setIsSyncing(true);
    setSyncMessage('');

    try {
      const timestamp = new Date().toISOString();
      let successCount = 0;

      // 为每个文件创建或更新备份
      for (const file of files) {
        const filePath = `notes/${file.id}.json`;
        try {
          // 尝试获取现有文件的SHA
          const getFileResponse = await axios.get(
            `https://gitee.com/api/v5/repos/${giteeConfig.username}/${giteeConfig.repo}/contents/${filePath}`,
            {
              params: {
                access_token: giteeConfig.accessToken,
                ref: 'main'
              }
            }
          ).catch(() => null);

          const content = JSON.stringify(file, null, 2);
          const base64Content = btoa(unescape(encodeURIComponent(content)));

          if (getFileResponse?.data?.sha) {
            // 更新现有文件
            await axios.put(
              `https://gitee.com/api/v5/repos/${giteeConfig.username}/${giteeConfig.repo}/contents/${filePath}`,
              {
                access_token: giteeConfig.accessToken,
                content: base64Content,
                message: `Update note: ${file.name} - ${timestamp}`,
                sha: getFileResponse.data.sha,
                branch: 'main'
              }
            );
          } else {
            // 创建新文件
            await axios.post(
              `https://gitee.com/api/v5/repos/${giteeConfig.username}/${giteeConfig.repo}/contents/${filePath}`,
              {
                access_token: giteeConfig.accessToken,
                content: base64Content,
                message: `Create note: ${file.name} - ${timestamp}`,
                branch: 'main'
              }
            );
          }
          successCount++;
        } catch (error) {
          console.error(`Failed to sync file ${file.name}:`, error);
        }
      }

      if (successCount === files.length) {
        const now = new Date().toLocaleString();
        setLastSyncTime(now);
        setSyncMessage('同步成功');
        // 将所有文件标记为已同步
        setFiles(files.map(file => ({ ...file, isDirty: false })));
      } else if (successCount > 0) {
        setSyncMessage(`部分同步成功: ${successCount}/${files.length} 个文件已同步`);
      } else {
        setSyncMessage('同步失败');
      }
    } catch (error: any) {
      console.error('Failed to sync to Gitee:', error);
      setSyncMessage('同步失败，请检查网络或仓库权限');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleGiteeFormSubmit = () => {
    const { accessToken, username, repo } = giteeFormData;
    if (accessToken && username && repo) {
      const newGiteeConfig = { accessToken, username, repo };
      setGiteeConfig(newGiteeConfig);
      setSettings({ ...settings, giteeConfig: newGiteeConfig });
      localStorage.setItem('noteplus_settings', JSON.stringify({ ...settings, giteeConfig: newGiteeConfig }));
      setIsSettingsDialogOpen(false);
    }
  };

  // 从localStorage加载保存的文件
  useEffect(() => {
    console.log('初始化：从localStorage加载文件');
    const savedFiles = localStorage.getItem('noteplus_files');
    const savedActiveTab = localStorage.getItem('noteplus_active_tab');
    const savedClosedFiles = localStorage.getItem('noteplus_closed_files');
    const closedFileIds = savedClosedFiles ? new Set(JSON.parse(savedClosedFiles).map(file => file.id)) : new Set();

    if (savedFiles) {
      const parsedFiles = JSON.parse(savedFiles).filter(file => !closedFileIds.has(file.id));
      console.log('已加载的文件:', parsedFiles);
      setFiles(parsedFiles);
      if (savedActiveTab && parsedFiles.some(file => file.id === savedActiveTab)) {
        setActiveTab(savedActiveTab);
        console.log('恢复活动标签为:', savedActiveTab);
      } else if (parsedFiles.length > 0) {
        setActiveTab(parsedFiles[0].id);
        console.log('设置活动标签为:', parsedFiles[0].id);
      }
    } else {
      console.log('localStorage中没有保存的文件');
    }
  }, []);

  // 从localStorage加载保存的配置信息
  useEffect(() => {
    const savedSettings = localStorage.getItem('noteplus_settings');
    if (savedSettings) {
      const parsedSettings = JSON.parse(savedSettings);
      setSettings(parsedSettings);
      if (parsedSettings.giteeConfig) {
        setGiteeConfig(parsedSettings.giteeConfig);
        setGiteeFormData({
          accessToken: parsedSettings.giteeConfig.accessToken,
          username: parsedSettings.giteeConfig.username,
          repo: parsedSettings.giteeConfig.repo
        });
      }
    }
  }, []);

  // 保存文件到localStorage
  const saveFiles = useCallback(() => {
    localStorage.setItem('noteplus_files', JSON.stringify(files));
    setFiles(files.map(file => ({ ...file, isDirty: false })));
    setSaveStatus('已保存');
    // console.log('文件保存完成');
  }, [files]);


  var handleEditorBlur = () => {
    console.log("blur")
  }

  // 定时自动保存
  useEffect(() => {
    
    if (settings.autoSaveInterval > 0) {

      const timer = setInterval(() => {
      
        const hasUnsavedChanges = files.some(file => file.isDirty);
        if (hasUnsavedChanges) {
          
          console.log('检测到未保存的更改，执行自动保存');
          saveFiles();
        }
      }, settings.autoSaveInterval * 1000);

      return () => {
        clearInterval(timer);
      };
    }
  }, [settings.autoSaveInterval, files, saveFiles]);

  // const handleEditorBlur = useCallback(() => {
  //   console.log('编辑器失焦事件监听器触发');
  //   console.log('当前files状态:', JSON.stringify(files, null, 2));
  //   console.log('当前activeTab:', activeTab);
  //   const currentActiveFile = files.find(file => file.id === activeTab);

  //   console.log('当前活动文件:', currentActiveFile);
  //   if (currentActiveFile?.isDirty) {
  //     console.log('检测到文件已修改，调用保存');
  //     saveFiles();
  //   } else {
  //     console.log('文件未修改，跳过保存');
  //   }
  // }, [files, activeTab, saveFiles]);

  const handleEditorChange = (value: string | undefined) => {
    // console.log('编辑器内容变更');
    if (value !== undefined && activeTab) {
      // console.log('更新文件内容，标记为已修改');
      setFiles(files.map(file =>
        file.id === activeTab ? { ...file, content: value, isDirty: true } : file
      ));
    }
  };

  const createNewFile = () => {
    // 获取所有已使用的序号
    const usedNumbers = new Set(
      [...files, ...closedFiles]
        .map(file => {
          const match = file.name.match(/未命名-(\d+)/);
          return match ? parseInt(match[1]) : 0;
        })
    );
  
    // 找到最小的未使用序号
    let newNumber = 1;
    while (usedNumbers.has(newNumber)) {
      newNumber++;
    }
  
    const newFile: FileTab = {
      id: `file_${Date.now()}`,
      name: `未命名-${newNumber}`,
      content: '',
      isDirty: false,
      lastModified: Date.now()
    };
    setFiles([...files, newFile]);
    setActiveTab(newFile.id);
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue);
    localStorage.setItem('noteplus_active_tab', newValue);
  };

  const currentFile = files.find(file => file.id === activeTab);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Note+
          </Typography>
          <IconButton color="inherit" title="未命名" onClick={createNewFile}>
            <NoteAddIcon />
          </IconButton>
          <IconButton 
            color="inherit" 
            title="打开文件"
            onClick={handleOpenMenuClick}
            sx={{ position: 'relative' }}
          >
            <FolderOpenIcon />
            {closedFiles.length > 0 && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  backgroundColor: '#1976d2',
                  color: 'white',
                  borderRadius: '50%',
                  width: '16px',
                  height: '16px',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {closedFiles.length}
              </Box>
            )}
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleCloseMenu}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
          >
            {closedFiles.length > 0 ? (
              closedFiles.map(file => (
                <MenuItem key={file.id} onClick={() => reopenFile(file)}>
                  {file.name}
                </MenuItem>
              ))
            ) : (
              <MenuItem disabled>没有最近关闭的文件</MenuItem>
            )}
          </Menu>
          <IconButton
            color="inherit"
            title="同步到Gitee"
            onClick={handleManualSync}
            disabled={!giteeConfig || isSyncing}
            sx={{ position: 'relative' }}
          >
            {isSyncing ? <CircularProgress size={24} color="inherit" /> : <SyncIcon />}
            <Box
              sx={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: isSyncing ? '#1976d2' :
                  !giteeConfig ? '#bdbdbd' :
                    files.some(f => f.isDirty) ? '#ffc107' :
                      syncMessage?.includes('失败') ? '#f44336' : '#4caf50',
              }}
            />
          </IconButton>
          <IconButton
            color="inherit"
            title="设置"
            onClick={() => {
              if (giteeConfig) {
                setGiteeFormData({
                  accessToken: giteeConfig.accessToken,
                  username: giteeConfig.username,
                  repo: giteeConfig.repo
                });
              }
              setIsSettingsDialogOpen(true);
            }}
            sx={{ ml: 1 }}
          >
            <SettingsIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Dialog open={isSettingsDialogOpen} onClose={() => setIsSettingsDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>设置</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>本地保存设置</Typography>
            <TextField
              margin="dense"
              label="自动保存间隔（秒）"
              type="number"
              fullWidth
              value={settings.autoSaveInterval}
              onChange={(e) => setSettings({ ...settings, autoSaveInterval: Number(e.target.value) })}
            />
          </Box>
          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>Gitee设置</Typography>
            <TextField
              margin="dense"
              label="Access Token"
              type="password"
              fullWidth
              value={giteeFormData.accessToken}
              onChange={(e) => setGiteeFormData({ ...giteeFormData, accessToken: e.target.value })}
            />
            <TextField
              margin="dense"
              label="用户名"
              fullWidth
              value={giteeFormData.username}
              onChange={(e) => setGiteeFormData({ ...giteeFormData, username: e.target.value })}
            />
            <TextField
              margin="dense"
              label="仓库名"
              fullWidth
              value={giteeFormData.repo}
              onChange={(e) => setGiteeFormData({ ...giteeFormData, repo: e.target.value })}
            />
            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                onClick={handleManualSync}
                disabled={!giteeConfig || isSyncing}
                startIcon={<SyncIcon />}
              >
                {isSyncing ? '同步中...' : '手动同步'}
              </Button>
              <Button
                variant="outlined"
                onClick={handlePullFromGitee}
                disabled={!giteeConfig || isPulling}
                startIcon={<PullIcon />}
              >
                {isPulling ? '恢复中...' : '从Gitee恢复'}
              </Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsSettingsDialogOpen(false)}>取消</Button>
          <Button onClick={handleGiteeFormSubmit}>保存</Button>
        </DialogActions>
      </Dialog>
      <Box sx={{ width: '100%', bgcolor: '#f5f5f5', borderBottom: '1px solid #e0e0e0' }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: '32px',
            position: 'relative',
            '& .MuiTabs-indicator': {
              backgroundColor: '#1976d2',
              height: '2px'
            },
            '& .MuiTab-root': {
              minHeight: '32px',
              padding: '4px 16px',
              color: 'rgba(0, 0, 0, 0.7)',
              '&.Mui-selected': {
                color: '#1976d2',
                backgroundColor: '#fff',
                borderRadius: '4px 4px 0 0',
                borderLeft: '1px solid #e0e0e0',
                borderRight: '1px solid #e0e0e0',
                borderTop: '1px solid #e0e0e0',
                marginBottom: '-1px',
                boxShadow: '0 -2px 4px rgba(0,0,0,0.03)'
              }
            },
            '& .MuiTabScrollButton-root': {
              width: '28px',
              display: 'flex !important',
              opacity: '1 !important',
              visibility: 'visible !important',
              '& svg': {
                fontSize: '1.2rem'
              }
            }
          }}
        >
          {files.map(file => (
            <Tab
              key={file.id}
              value={file.id}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Box
                    component="span"
                    sx={{
                      display: 'inline-block',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: file.isDirty ? '#9e9e9e' : '#4caf50',
                      mr: 1
                    }}
                  />
                  {file.name}
                  <Box
                    component="span"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeFile(file.id);
                    }}
                    sx={{
                      ml: 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      cursor: 'pointer',
                      '&:hover': {
                        opacity: 0.7
                      }
                    }}
                  >
                    <CloseIcon fontSize="small" />
                  </Box>
                </Box>
              }
            />
          ))}
        </Tabs>
      </Box>
      <Container disableGutters maxWidth={false} sx={{ height: 'calc(100vh - 112px)', width: '100%', p: 0 }}>
        <Editor
          height="100%"
          width="100%"
          defaultLanguage="plaintext"
          value={currentFile?.content || ''}
          onChange={handleEditorChange}
          onMount={(editor) => {
            console.log('编辑器挂载完成');
            editor.onDidBlurEditorWidget(handleEditorBlur);
          }}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            wordWrap: 'on',
            automaticLayout: true
          }}
        />

        {syncMessage && (
          <Snackbar
            open
            autoHideDuration={3000}
            onClose={() => setSyncMessage('')}
            message={syncMessage}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            sx={{ '& .MuiSnackbarContent-root': { bgcolor: syncMessage?.includes('失败') ? '#f44336' : '#1976d2' } }}
          />
        )}
      </Container>
    </Box>
  );
}

export default App;
