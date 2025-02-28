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
  isCloudDirty: boolean;
  lastModified: number;
  fileSize: number;
  language: string;
}

interface GiteeConfig {
  accessToken: string;
  username: string;
  repo: string;
}

interface Settings {
  autoSaveInterval: number;
  autoSyncInterval: number; // 添加自动同步间隔配置
  giteeConfig: GiteeConfig | null;
}

function App() {
  const [files, setFiles] = useState<FileTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [giteeConfig, setGiteeConfig] = useState<GiteeConfig | null>(null);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    autoSaveInterval: 5,
    autoSyncInterval: 0, // 默认关闭自动同步
    giteeConfig: null
  });
  const [giteeFormData, setGiteeFormData] = useState({
    accessToken: '',
    username: '',
    repo: ''
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [isPulling, setIsPulling] = useState(false);
  const [isPullConfirmOpen, setIsPullConfirmOpen] = useState(false);
  const [closedFiles, setClosedFiles] = useState<FileTab[]>([]);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingFileName, setEditingFileName] = useState<string>('');
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [pullSnackbarOpen, setPullSnackbarOpen] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  const getLanguageFromFileName = (fileName: string): string => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'js':
        return 'javascript';
      case 'ts':
        return 'typescript';
      case 'jsx':
        return 'javascript';
      case 'tsx':
        return 'typescript';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      case 'json':
        return 'json';
      case 'md':
        return 'markdown';
      case 'py':
        return 'python';
      case 'java':
        return 'java';
      case 'c':
        return 'c';
      case 'cpp':
        return 'cpp';
      case 'go':
        return 'go';
      case 'rs':
        return 'rust';
      case 'sql':
        return 'sql';
      case 'xml':
        return 'xml';
      case 'yaml':
      case 'yml':
        return 'yaml';
      case 'txt':
      case 'text':
        return 'plaintext';
      default:
        return 'markdown';
    }
  };

  // 从localStorage加载已关闭的文件
  useEffect(() => {
    const savedClosedFiles = localStorage.getItem('noteplus_closed_files');
    if (savedClosedFiles) {
      const parsedClosedFiles = JSON.parse(savedClosedFiles);
      parsedClosedFiles.forEach((file: FileTab) => {
        const content = localStorage.getItem(`noteplus_content_${file.id}`);
        if (content !== null) {
          file.content = content;
        }
      });
      setClosedFiles(parsedClosedFiles);
    }
  }, []);

  const handleOpenMenuClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
  };

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  const handleDeleteClosedFile = (fileId: string) => {
    setFileToDelete(fileId);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (fileToDelete) {
      const updatedClosedFiles = closedFiles.filter(f => f.id !== fileToDelete);
      // 先更新本地存储
      localStorage.removeItem(`noteplus_content_${fileToDelete}`);
      localStorage.setItem('noteplus_closed_files', JSON.stringify(updatedClosedFiles));
      // 再更新状态
      setClosedFiles(updatedClosedFiles);
      setDeleteConfirmOpen(false);
      setFileToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false);
    setFileToDelete(null);
  };

  const reopenFile = (file: FileTab) => {
    const newFiles = [...files, file]
    const newClosedFiles = closedFiles.filter(f => f.id !== file.id)
    setFiles(newFiles);
    setActiveTab(file.id);
    setClosedFiles(newClosedFiles);
    const newClosedFilesMetadata = newClosedFiles.map(({ content, ...metadata }) => metadata);
    localStorage.setItem('noteplus_closed_files', JSON.stringify(newClosedFilesMetadata));
    const newFilesMetadata = newFiles.map(({ content, ...metadata }) => metadata);
    localStorage.setItem('noteplus_files', JSON.stringify(newFilesMetadata));
    handleCloseMenu();
  };

  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatLastModified = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const closeFile = (fileId: string) => {
    const fileToClose = files.find(file => file.id === fileId);
    if (fileToClose) {
      if (fileToClose.isDirty) {
        saveFiles();
      }
      // 将关闭的文件添加到已关闭列表，更新最后修改时间和文件大小
      const updatedFileToClose = {
        ...fileToClose,
        lastModified: Date.now(),
        fileSize: new Blob([fileToClose.content]).size
      };
      const updatedClosedFiles = [updatedFileToClose, ...closedFiles];
      setClosedFiles(updatedClosedFiles);
      // 保存关闭文件的内容
      localStorage.setItem(`noteplus_content_${fileId}`, fileToClose.content);
      // 保存关闭文件的元数据，排除content字段
      const closedMetadata = updatedClosedFiles.map(({ content, ...metadata }) => metadata);
      localStorage.setItem('noteplus_closed_files', JSON.stringify(closedMetadata));

      const newFiles = files.filter(file => file.id !== fileId);
      // 立即更新noteplus_files的本地存储
      const newFilesMetadata = newFiles.map(({ content, ...metadata }) => metadata);
      localStorage.setItem('noteplus_files', JSON.stringify(newFilesMetadata));

      setFiles(newFiles);
      if (activeTab === fileId && newFiles.length > 0) {
        // 选择最后一个标签页
        setActiveTab(newFiles[newFiles.length - 1].id);
      }
    }
  };

  const handlePullFromGitee = async () => {
    if (!giteeConfig) {
      setIsSettingsDialogOpen(true);
      return;
    }
    setIsPullConfirmOpen(true);
  };

  const executePullFromGitee = async () => {
    if (isPulling || !giteeConfig) return;
    setIsPulling(true);
    setSyncMessage('');
    setIsPullConfirmOpen(false);
    setPullSnackbarOpen(true);

    try {
      // 获取metadata.json文件
      const metadataResponse = await axios.get(
        `https://gitee.com/api/v5/repos/${giteeConfig.username}/${giteeConfig.repo}/contents/notes/metadata.json`,
        {
          params: {
            access_token: giteeConfig.accessToken,
            ref: 'main'
          }
        }
      );

      // 解码metadata内容
      const metadataContent = decodeURIComponent(escape(atob(metadataResponse.data.content)));
      const metadata = JSON.parse(metadataContent);

      const openFiles: FileTab[] = [];
      const closedFiles: FileTab[] = [];

      // 处理打开的文件
      for (const fileMetadata of metadata.openFiles) {
        try {
          const contentResponse = await axios.get(
            `https://gitee.com/api/v5/repos/${giteeConfig.username}/${giteeConfig.repo}/contents/notes/content/${fileMetadata.id}.txt`,
            {
              params: {
                access_token: giteeConfig.accessToken,
                ref: 'main'
              }
            }
          );

          const content = decodeURIComponent(escape(atob(contentResponse.data.content)));
          const fileData = { ...fileMetadata, content };
          openFiles.push(fileData);
          localStorage.setItem(`noteplus_content_${fileData.id}`, content);
        } catch (error) {
          console.error(`Failed to fetch content for file ${fileMetadata.id}:`, error);
        }
      }

      // 处理已关闭的文件
      for (const fileMetadata of metadata.closedFiles) {
        try {
          const contentResponse = await axios.get(
            `https://gitee.com/api/v5/repos/${giteeConfig.username}/${giteeConfig.repo}/contents/notes/content/${fileMetadata.id}.txt`,
            {
              params: {
                access_token: giteeConfig.accessToken,
                ref: 'main'
              }
            }
          );

          const content = decodeURIComponent(escape(atob(contentResponse.data.content)));
          const fileData = { ...fileMetadata, content };
          closedFiles.push(fileData);
          localStorage.setItem(`noteplus_content_${fileData.id}`, content);
        } catch (error) {
          console.error(`Failed to fetch content for file ${fileMetadata.id}:`, error);
        }
      }

      if (openFiles.length > 0 || closedFiles.length > 0) {
        // 将所有文件标记为已同步
        const markedOpenFiles = openFiles.map(file => ({ ...file, isCloudDirty: false, isDirty: false }));
        const markedClosedFiles = closedFiles.map(file => ({ ...file, isCloudDirty: false, isDirty: false }));
        setFiles(markedOpenFiles);
        setClosedFiles(markedClosedFiles);
        const now = new Date().toLocaleString();
        setLastSyncTime(now);

        // 保存文件元数据，排除content字段
        const openMetadata = markedOpenFiles.map(({ content, ...metadata }) => metadata);
        const closedMetadata = markedClosedFiles.map(({ content, ...metadata }) => metadata);
        localStorage.setItem('noteplus_files', JSON.stringify(openMetadata));
        localStorage.setItem('noteplus_closed_files', JSON.stringify(closedMetadata));
        setSyncMessage(`从云端恢复成功，共恢复 ${openFiles.length} 个打开的文件和 ${closedFiles.length} 个已关闭的文件`);
      } else {
        setSyncMessage('未找到可恢复的文件');
      }
    } catch (error: any) {
      console.error('Failed to pull from Gitee:', error);
      setSyncMessage('从云端恢复失败，请检查网络或仓库权限');
    } finally {
      setIsPulling(false);
      setPullSnackbarOpen(false);
    }
  };



  const handleManualSync = async () => {
    if (!giteeConfig || isSyncing) return;
    setIsSyncing(true);
    setSyncMessage('');

    try {
      const timestamp = new Date().toISOString();
      let successCount = 0;
      const totalFiles = files.length + closedFiles.length;

      // 准备元数据列表
      const metadata = {
        openFiles: files.map(({ content, ...metadata }) => ({ ...metadata, type: 'open' })),
        closedFiles: closedFiles.map(({ content, ...metadata }) => ({ ...metadata, type: 'closed' }))
      };

      // 同步元数据文件
      try {
        const metadataPath = 'notes/metadata.json';
        const metadataContent = JSON.stringify(metadata, null, 2);
        const metadataBase64 = btoa(unescape(encodeURIComponent(metadataContent)));

        const getMetadataResponse = await axios.get(
          `https://gitee.com/api/v5/repos/${giteeConfig.username}/${giteeConfig.repo}/contents/${metadataPath}`,
          {
            params: {
              access_token: giteeConfig.accessToken,
              ref: 'main'
            }
          }
        ).catch(() => null);

        if (getMetadataResponse?.data?.sha) {
          await axios.put(
            `https://gitee.com/api/v5/repos/${giteeConfig.username}/${giteeConfig.repo}/contents/${metadataPath}`,
            {
              access_token: giteeConfig.accessToken,
              content: metadataBase64,
              message: `Update metadata - ${timestamp}`,
              sha: getMetadataResponse.data.sha,
              branch: 'main'
            }
          );
        } else {
          await axios.post(
            `https://gitee.com/api/v5/repos/${giteeConfig.username}/${giteeConfig.repo}/contents/${metadataPath}`,
            {
              access_token: giteeConfig.accessToken,
              content: metadataBase64,
              message: `Create metadata - ${timestamp}`,
              branch: 'main'
            }
          );
        }
      } catch (error) {
        console.error('Failed to sync metadata:', error);
        throw error;
      }

      // 同步文件内容
      const allFiles = [...files, ...closedFiles];
      for (const file of allFiles) {
        const filePath = `notes/content/${file.id}.txt`;
        try {
          const getFileResponse = await axios.get(
            `https://gitee.com/api/v5/repos/${giteeConfig.username}/${giteeConfig.repo}/contents/${filePath}`,
            {
              params: {
                access_token: giteeConfig.accessToken,
                ref: 'main'
              }
            }
          ).catch(() => null);

          const base64Content = btoa(unescape(encodeURIComponent(file.content)));

          if (getFileResponse?.data?.sha) {
            await axios.put(
              `https://gitee.com/api/v5/repos/${giteeConfig.username}/${giteeConfig.repo}/contents/${filePath}`,
              {
                access_token: giteeConfig.accessToken,
                content: base64Content || '',
                message: `Update content: ${file.name} - ${timestamp}`,
                sha: getFileResponse.data.sha,
                branch: 'main'
              }
            );
          } else {
            await axios.post(
              `https://gitee.com/api/v5/repos/${giteeConfig.username}/${giteeConfig.repo}/contents/${filePath}`,
              {
                access_token: giteeConfig.accessToken,
                content: base64Content || '',
                message: `Create content: ${file.name} - ${timestamp}`,
                branch: 'main'
              }
            );
          }
          successCount++;
        } catch (error) {
          console.error(`Failed to sync file ${file.name}:`, error);
        }
      }

      if (successCount === totalFiles) {
        const now = new Date().toLocaleString();
        setLastSyncTime(now);
        setSyncMessage('同步成功');
        // 将所有文件标记为已同步
        setFiles(files.map(file => ({ ...file, isDirty: false, isCloudDirty: false })));
        setClosedFiles(closedFiles.map(file => ({ ...file, isDirty: false, isCloudDirty: false })));
      } else if (successCount > 0) {
        setSyncMessage(`部分同步成功: ${successCount}/${totalFiles} 个文件已同步`);
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
    const closedFileIds = savedClosedFiles ? new Set(JSON.parse(savedClosedFiles).map((file: FileTab) => file.id)) : new Set();

    if (savedFiles) {
      const parsedFiles = JSON.parse(savedFiles).filter((file: FileTab) => !closedFileIds.has(file.id));
      parsedFiles.forEach((file: FileTab) => {
        const content = localStorage.getItem(`noteplus_content_${file.id}`);
        if (content !== null) {
          file.content = content;
        }
      });
      console.log('已加载的文件:', parsedFiles);
      setFiles(parsedFiles);
      if (savedActiveTab && parsedFiles.some((file: FileTab) => file.id === savedActiveTab)) {
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
    // 分别保存每个文件的内容
    files.forEach(file => {
      localStorage.setItem(`noteplus_content_${file.id}`, file.content);
    });
    // 保存文件元数据，不包含content
    const metadataFiles = files.map(({ content, ...metadata }) => metadata);
    localStorage.setItem('noteplus_files', JSON.stringify(metadataFiles));
    // 只更新isDirty状态，保持isCloudDirty状态不变
    setFiles(files.map(file => ({ ...file, isDirty: false })));
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


  // 定时自动同步到云端
  useEffect(() => {
    if (settings.autoSyncInterval > 0 && giteeConfig) {
      const timer = setInterval(() => {
        const hasCloudDirtyFiles = files.some(file => file.isCloudDirty);
        if (hasCloudDirtyFiles) {
          console.log('检测到需要同步的更改，执行自动同步');
          handleManualSync();
        }
      }, settings.autoSyncInterval * 60 * 1000);

      return () => {
        clearInterval(timer);
      };
    }
  }, [settings.autoSyncInterval, files, giteeConfig, handleManualSync]);


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
        file.id === activeTab ? { ...file, content: value, isDirty: true, isCloudDirty: true } : file
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
      isDirty: true,
      fileSize: 0,
      isCloudDirty: true,
      lastModified: Date.now(),
      language: "markdown"
    };
    setFiles([...files, newFile]);
    setActiveTab(newFile.id);
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: string) => {
    setActiveTab(newValue);
    localStorage.setItem('noteplus_active_tab', newValue);
  };

  const handleFileNameDoubleClick = (fileId: string, fileName: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setEditingFileId(fileId);
    setEditingFileName(fileName);
  };

  const handleFileNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setEditingFileName(event.target.value);
  };

  const handleFileNameSave = () => {
    if (editingFileId && editingFileName) {
      const newLanguage = getLanguageFromFileName(editingFileName);
      const updatedFiles = files.map(file =>
        file.id === editingFileId ? { ...file, name: editingFileName, language: newLanguage } : file
      );
      setFiles(updatedFiles);
      localStorage.setItem('noteplus_files', JSON.stringify(updatedFiles));
    }
    setEditingFileId(null);
    setEditingFileName('');
  };

  const handleFileNameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleFileNameSave();
    } else if (event.key === 'Escape') {
      setEditingFileId(null);
      setEditingFileName('');
    }
  };

  const currentFile = files.find(file => file.id === activeTab);

  const renderWelcomePage = () => {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          p: 3,
          textAlign: 'center'
        }}
      >
        <Typography variant="h4" gutterBottom>
          欢迎使用 Note+
        </Typography>
        <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 4 }}>
          开始记录您的想法
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            startIcon={<PullIcon />}
            onClick={handlePullFromGitee}
            disabled={isPulling}
          >
            从Gitee恢复
          </Button>
          <Button
            variant="contained"
            startIcon={<NoteAddIcon />}
            onClick={createNewFile}
          >
            新建文件
          </Button>
        </Box>
      </Box>
    );
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Note+
          </Typography>
          <IconButton color="inherit" title="未命名" onClick={e=>{e.currentTarget.blur(); createNewFile()}}>
            <NoteAddIcon />
          </IconButton>
          <IconButton
            color="inherit"
            title="打开文件"
            onClick={e=>{e.currentTarget.blur(); handleOpenMenuClick(e)}}
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
            sx={{
              '& .MuiPaper-root': {
                minWidth: '400px',
                maxHeight: '80vh'
              }
            }}
          >
            <MenuItem sx={{ p: 2, flexDirection: 'column', alignItems: 'stretch' }}>
              <TextField
                size="small"
                placeholder="搜索已关闭的文件..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                sx={{ mb: 2 }}
                fullWidth
              />
              {closedFiles
                .filter(file => file.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(file => (
                  <Box
                    key={file.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      py: 1,
                      borderBottom: '1px solid rgba(0, 0, 0, 0.12)'
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0, mr: 2 }}>
                      <Typography noWrap title={file.name}>{file.name}</Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {formatFileSize(file.fileSize)} · {formatLastModified(file.lastModified)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Button size="small" onClick={() => reopenFile(file)}>打开</Button>
                      <Button size="small" color="error" onClick={() => handleDeleteClosedFile(file.id)}>删除</Button>
                    </Box>
                  </Box>
                ))}
            </MenuItem>
          </Menu>
          <IconButton
            color="inherit"
            title="同步到Gitee"
            onClick={e=>{e.currentTarget.blur(); handleManualSync()}}
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
                    files.some(f => f.isCloudDirty) || closedFiles.some(f => f.isCloudDirty) ? '#ffc107' :
                      syncMessage?.includes('失败') ? '#f44336' :
                        lastSyncTime && !files.some(f => f.lastModified > new Date(lastSyncTime).getTime()) && !closedFiles.some(f => f.lastModified > new Date(lastSyncTime).getTime()) ? '#4caf50' : '#ffc107',
              }}
            />
          </IconButton>
          <IconButton
            color="inherit"
            title="设置"
            onClick={(e) => {
              e.currentTarget.blur(); 
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
              label="自动保存间隔（秒，0表示关闭）"
              type="number"
              fullWidth
              value={settings.autoSaveInterval}
              onChange={(e) => setSettings({ ...settings, autoSaveInterval: Number(e.target.value) })}
              size="small"
              sx={{ mb: 2 }}
            />
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Box>
              <Typography variant="h6" gutterBottom>Gitee 云端存储</Typography>
              <TextField
                margin="dense"
                label="自动同步间隔（分钟，0表示关闭）"
                type="number"
                fullWidth
                value={settings.autoSyncInterval || 0}
                onChange={(e) => setSettings({ ...settings, autoSyncInterval: Number(e.target.value) })}
                size="small"
                sx={{ mb: 2 }}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <TextField
                  label="访问令牌（创建时请确保勾选 projects 权限）"
                  value={giteeFormData.accessToken}
                  onChange={(e) => setGiteeFormData({ ...giteeFormData, accessToken: e.target.value })}
                  fullWidth
                  size="small"
                  type='password'
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => window.open('https://gitee.com/profile/personal_access_tokens/new', '_blank')}
                >
                  获取
                </Button>
              </Box>
              <TextField
                label="用户名"
                value={giteeFormData.username}
                onChange={(e) => setGiteeFormData({ ...giteeFormData, username: e.target.value })}
                fullWidth
                size="small"
                sx={{ mb: 2 }}
              />
              <TextField
                label="仓库名"
                value={giteeFormData.repo}
                onChange={(e) => setGiteeFormData({ ...giteeFormData, repo: e.target.value })}
                fullWidth
                size="small"
                sx={{ mb: 2 }}
              />
              <Button
                variant="contained"
                onClick={() => {
                  const { accessToken, username, repo } = giteeFormData;
                  if (!accessToken || !username || !repo) {
                    setSyncMessage('请先填写完整的Gitee配置信息');
                    return;
                  }
                  handleGiteeFormSubmit();
                  handlePullFromGitee();
                }}
                disabled={isPulling}
                startIcon={isPulling ? <CircularProgress size={20} color="inherit" /> : <PullIcon />}
                fullWidth
              >
                从Gitee恢复
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
            '& .MuiTabs-indicator': {
              height: '2px'
            },
            '& .MuiTab-root': {
              minHeight: '32px',
              padding: '4px 12px',
              fontSize: '0.875rem'
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
                  {editingFileId === file.id ? (
                    <input
                      type="text"
                      value={editingFileName}
                      onChange={handleFileNameChange}
                      onBlur={handleFileNameSave}
                      onKeyPress={(e) => e.key === 'Enter' && handleFileNameSave()}
                      autoFocus
                    />
                  ) : (
                    <span
                      onDoubleClick={(e) => handleFileNameDoubleClick(file.id, file.name, e)}
                      style={{ cursor: 'text' }}
                    >
                      {file.name}
                    </span>
                  )}
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
      <Container disableGutters maxWidth={false} sx={{ height: 'calc(100vh )', width: '100%', p: 0 }}>
        {files.length === 0 ? (
          renderWelcomePage()
        ) : (
          <Editor
            height="100%"
            width="100%"
            defaultLanguage={currentFile?.language || 'markdown'}
            language={currentFile?.language || 'markdown'}
            value={currentFile?.content || ''}
            onChange={handleEditorChange}
            onMount={(e: any) => {
              console.log('编辑器挂载完成');
              e.onDidBlurEditorWidget(handleEditorBlur);
            }}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: 'on',
              automaticLayout: true
            }}
          />
        )}

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
      <Snackbar
        open={pullSnackbarOpen}
        message={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={20} color="inherit" />
            <span>正在从Gitee恢复...</span>
          </Box>
        }
      />
      <Dialog
        open={deleteConfirmOpen}
        onClose={handleCancelDelete}
        aria-labelledby="delete-confirm-dialog-title"
        aria-describedby="delete-confirm-dialog-description"
      >
        <DialogTitle id="delete-confirm-dialog-title">确认删除</DialogTitle>
        <DialogContent>
          <Typography>确定要删除这个文件吗？此操作无法撤销。</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete}>取消</Button>
          <Button onClick={handleConfirmDelete} color="error" autoFocus>
            删除
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={isPullConfirmOpen}
        onClose={() => setIsPullConfirmOpen(false)}
        aria-labelledby="pull-confirm-dialog-title"
        aria-describedby="pull-confirm-dialog-description"
      >
        <DialogTitle id="pull-confirm-dialog-title">
          确认从Gitee恢复？
        </DialogTitle>
        <DialogContent>
          <Typography id="pull-confirm-dialog-description">
            此操作将从Gitee仓库恢复文件，这会覆盖当前所有本地文件。是否继续？
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsPullConfirmOpen(false)}>取消</Button>
          <Button onClick={executePullFromGitee} color="primary" variant="contained">
            确认恢复
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default App;
