// components/FileManager.js
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { read, write } from 'nbtify';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'next-i18next';
import { 
  FolderIcon, 
  DocumentIcon, 
  DocumentTextIcon, 
  ArrowUpTrayIcon, 
  ArrowPathIcon, 
  TrashIcon, 
  PencilSquareIcon, 
  ArrowDownTrayIcon,
  HomeIcon,
  FunnelIcon,
  CodeBracketIcon,
  ChevronRightIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  PlusIcon,
  FolderPlusIcon,
  XMarkIcon,
  PencilIcon,
  ArrowRightOnRectangleIcon
} from '@heroicons/react/24/outline';

const getFileIcon = (fileName, isDirectory) => {
  if (isDirectory) return <FolderIcon className="w-6 h-6 text-indigo-400 fill-indigo-50 dark:fill-indigo-900/20" />;
  const ext = fileName.split('.').pop().toLowerCase();
  switch (ext) {
    case 'json': case 'properties': case 'yml': case 'yaml': case 'toml': case 'conf': case 'ini':
      return <CodeBracketIcon className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />;
    case 'log': case 'txt': case 'md':
      return <DocumentTextIcon className="w-6 h-6 text-slate-500 dark:text-slate-400" />;
    case 'jar':
      return <div className="w-6 h-6 flex items-center justify-center font-bold text-xs text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-600 rounded bg-orange-50 dark:bg-orange-900/20">J</div>;
    default:
      return <DocumentIcon className="w-6 h-6 text-gray-400 dark:text-gray-500" />;
  }
};

// --- CHANGED: Added isAdmin prop ---
export default function FileManager({ server, token, setActiveTab, isAdmin }) {
  const { t } = useTranslation('server');
  
  // --- State ---
  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [editingFile, setEditingFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [filterEnabled, setFilterEnabled] = useState(true);
  const [allFiles, setAllFiles] = useState([]);
  
  // Drag State
  const [dragActive, setDragActive] = useState(false); 
  const [internalDragFile, setInternalDragFile] = useState(null); 
  const [dropTarget, setDropTarget] = useState(null); 
  const [breadcrumbDropTarget, setBreadcrumbDropTarget] = useState(null);

  // Modals
  const [createModal, setCreateModal] = useState({ open: false, type: 'file' }); 
  const [actionModal, setActionModal] = useState({ open: false, file: null, type: 'rename' });
  const [newItemName, setNewItemName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const fileInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const actionInputRef = useRef(null);

  const apiBase = `/api/servers/${server.id}`;
  const textFileExtensions = ['.txt', '.json', '.yml', '.yaml', '.xml', '.html', '.css', '.js', '.properties', '.config', '.conf', '.ini', '.log', '.md', '.dat', '.toml'];
  const maskedItems = ['server.jar', '.git', 'eula.txt', 'file-api.js', 'metrics-server.js', 'properties-api.js', 'status-reporter.js', 'console-server.js', 'startup.sh', 'startup.bat', 'package.json', 'package-lock.json', 'server-installer.jar.log', 'libraries', 'node_modules', 'server-wrapper.js', '.server_status', 'packed-data.zip', 'run.bat', 'run.sh', 'startserver.sh', 'startserver.bat', 'user_jvm_args.txt'].map(item => item.toLowerCase());
  const specialFiles = ['server.properties'].map(item => item.toLowerCase());

  const bigIntReplacer = (key, value) => typeof value === 'bigint' ? value.toString() : value;
  const bigIntReviver = (key, value) => (typeof value === 'string' && /^-?\d+$/.test(value)) ? BigInt(value) : value;

  useEffect(() => {
    if (!token || !server) return;
    setIsOffline(server.status === 'Stopped');
    fetchFiles(currentPath);
  }, [currentPath, token, server]);

  useEffect(() => {
    const applyFilter = (list) => {
      // If not admin, always enforce filter
      if (!filterEnabled && !isAdmin) return list || []; 
      
      if (!filterEnabled && isAdmin) return list || [];

      return (list || []).filter(file => {
        const name = file.name.toLowerCase().replace(/\/+$/, '');
        return !maskedItems.includes(name) && !maskedItems.some(masked => name.startsWith(masked + '/'));
      });
    };
    setFiles(applyFilter(allFiles));
  }, [filterEnabled, allFiles, isAdmin]);

  useEffect(() => { if (createModal.open && nameInputRef.current) setTimeout(() => nameInputRef.current.focus(), 100); }, [createModal.open]);
  useEffect(() => { 
      if (actionModal.open && actionInputRef.current) {
          setTimeout(() => {
              actionInputRef.current.focus();
              if (actionModal.type === 'rename') actionInputRef.current.select();
          }, 100);
      }
  }, [actionModal.open]);

  const fetchFiles = async (path) => {
    setLoading(true);
    setError(null);
    try {
      const effectivePath = path || '';
      const res = await axios.get(`${apiBase}/files`, {
        params: { path: effectivePath },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000,
      });
      const sorted = (res.data.files || []).sort((a, b) => {
        if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
        return a.isDirectory ? -1 : 1;
      });
      setAllFiles(sorted);
      
      // FIX: Normalize backslashes to forward slashes to fix Breadcrumb issue
      const normalizedPath = (res.data.path || '').replace(/\\/g, '/');
      setCurrentPath(normalizedPath);
      
    } catch (err) {
      setError(`${t('files.load_fail')}: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const isTextFile = (name) => textFileExtensions.some(ext => name.toLowerCase().endsWith(ext));
  const isNbtFile = (name) => name.toLowerCase().endsWith('.dat');

  const handleFileClick = (file) => {
    const name = file.name.toLowerCase();
    if (specialFiles.includes(name)) return setActiveTab('properties');
    if (file.isDirectory) return navigateToFolder(file.name);
    if (isTextFile(file.name)) return openFileForEditing(file);
    download(file);
  };

  const navigateToFolder = (folderName) => {
    setCurrentPath(prev => prev ? `${prev}/${folderName}` : folderName);
  };

  const openFileForEditing = async (file) => {
    try {
      setLoading(true);
      setError(null);
      const relPath = currentPath ? `${currentPath}/${file.name}` : file.name;
      const responseType = isNbtFile(file.name) ? 'arraybuffer' : 'text';
      const res = await axios.get(`${apiBase}/file`, {
        params: { path: relPath },
        headers: { Authorization: `Bearer ${token}` },
        responseType,
      });
      let content = res.data;
      if (isNbtFile(file.name)) {
        try {
          const nbtData = await read(new Uint8Array(content), { compression: 'gzip', endian: 'big' });
          content = JSON.stringify(nbtData.data, bigIntReplacer, 2);
        } catch (e) { throw new Error('Invalid NBT data'); }
      } else if (typeof content !== 'string') {
        content = JSON.stringify(content, bigIntReplacer, 2);
      }
      setEditingFile(file);
      setFileContent(content);
    } catch (err) {
      setError(`Could not open file: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const saveFile = async () => {
    if (!editingFile) return;
    try {
      setIsSaving(true);
      const relPath = currentPath ? `${currentPath}/${editingFile.name}` : editingFile.name;
      let body = fileContent;
      let contentType = 'text/plain';
      if (isNbtFile(editingFile.name)) {
        const parsed = JSON.parse(fileContent, bigIntReviver);
        body = await write(parsed, { compression: 'gzip', endian: 'big', name: '' });
        contentType = 'application/octet-stream';
      }
      await axios.put(`${apiBase}/files`, body, {
        params: { path: relPath },
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
      });
      setEditingFile(null);
      setFileContent('');
    } catch (err) {
      setError(`${t('files.save_fail')}: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteFile = async (file) => {
    if (!window.confirm(t('files.delete_confirm', { name: file.name }))) return;
    try {
      const relPath = currentPath ? `${currentPath}/${file.name}` : file.name;
      await axios.delete(`${apiBase}/files`, {
        params: { path: relPath },
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchFiles(currentPath);
    } catch (err) {
      setError(`${t('files.delete_fail')}: ${err.message}`);
    }
  };

  const download = async (file) => {
    try {
      const relPath = currentPath ? `${currentPath}/${file.name}` : file.name;
      const res = await axios.get(`${apiBase}/file`, {
        params: { path: relPath },
        responseType: 'blob',
        headers: { Authorization: `Bearer ${token}` },
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) { setError(t('files.download_fail')); }
  };

  // --- External Upload Drag Handlers ---
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files') && !e.dataTransfer.types.includes('application/x-spawnly-internal')) {
        if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
        else if (e.type === 'dragleave') setDragActive(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await performUpload(file);
    }
  };

  const handleUploadClick = (e) => {
    const file = e.target.files[0];
    if (file) performUpload(file);
  };

  const performUpload = async (file) => {
    setUploadProgress(1);
    setSelectedFile(file);
    const formData = new FormData();
    formData.append('fileName', file.name);
    formData.append('fileContent', file);
    try {
      await axios.post(`${apiBase}/files?path=${currentPath}`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (ev) => setUploadProgress(Math.round((ev.loaded * 100) / ev.total)),
      });
      fetchFiles(currentPath);
    } catch (err) { setError(t('files.upload_fail')); } 
    finally { setSelectedFile(null); setUploadProgress(0); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  // --- Internal Row Drag Handlers ---
  const handleRowDragStart = (e, file) => {
      setInternalDragFile(file);
      e.dataTransfer.setData('application/x-spawnly-internal', file.name);
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleRowDragOver = (e, targetFolder) => {
      e.preventDefault();
      if (internalDragFile && targetFolder.isDirectory && internalDragFile.name !== targetFolder.name) {
          setDropTarget(targetFolder.name);
          e.dataTransfer.dropEffect = 'move';
      }
  };

  const handleRowDragLeave = () => setDropTarget(null);

  const handleRowDrop = async (e, targetFolder) => {
      e.preventDefault(); e.stopPropagation();
      setDropTarget(null);
      if (!internalDragFile || !targetFolder.isDirectory || internalDragFile.name === targetFolder.name) return;
      
      const oldPath = currentPath ? `${currentPath}/${internalDragFile.name}` : internalDragFile.name;
      const newPath = currentPath ? `${currentPath}/${targetFolder.name}/${internalDragFile.name}` : `${targetFolder.name}/${internalDragFile.name}`;
      await executeMove(oldPath, newPath);
  };

  // --- Breadcrumb Drag Handlers ---
  const handleBreadcrumbDragOver = (e, path) => {
      e.preventDefault();
      if (internalDragFile && path !== currentPath) {
          setBreadcrumbDropTarget(path);
          e.dataTransfer.dropEffect = 'move';
      }
  };

  const handleBreadcrumbDragLeave = () => setBreadcrumbDropTarget(null);

  const handleBreadcrumbDrop = async (e, targetPath) => {
      e.preventDefault(); e.stopPropagation();
      setBreadcrumbDropTarget(null);
      if (!internalDragFile || targetPath === currentPath) return;

      const oldPath = currentPath ? `${currentPath}/${internalDragFile.name}` : internalDragFile.name;
      const newPath = targetPath ? `${targetPath}/${internalDragFile.name}` : internalDragFile.name;
      await executeMove(oldPath, newPath);
  };

  const executeMove = async (oldPath, newPath) => {
      try {
          await axios.patch(`${apiBase}/files`, { oldPath, newPath }, { headers: { Authorization: `Bearer ${token}` } });
          setInternalDragFile(null);
          fetchFiles(currentPath);
      } catch (err) { setError(t('files.errors.move_fail', { defaultValue: 'Move failed' })); }
  };

  // --- Create/Action Handlers ---
  const openCreateModal = (type) => { setCreateModal({ open: true, type }); setNewItemName(''); setError(null); };
  const handleCreateSubmit = async (e) => {
    e?.preventDefault(); if (!newItemName.trim() || isProcessing) return; setIsProcessing(true);
    const name = newItemName.trim();
    try {
      if (createModal.type === 'folder') await axios.post(`${apiBase}/files`, { type: 'directory', path: currentPath ? `${currentPath}/${name}` : name }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
      else await axios.put(`${apiBase}/files`, '', { params: { path: currentPath ? `${currentPath}/${name}` : name }, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' } });
      setCreateModal({ open: false, type: 'file' }); setNewItemName(''); fetchFiles(currentPath);
    } catch (err) { setError(t('files.errors.create_fail')); } finally { setIsProcessing(false); }
  };

  const openActionModal = (file, type, e) => {
    e.stopPropagation(); setActionModal({ open: true, file, type }); setError(null);
    if (type === 'rename') setNewItemName(file.name); else setNewItemName(currentPath ? `${currentPath}/${file.name}` : file.name);
  };

  const handleActionSubmit = async (e) => {
    e?.preventDefault(); if (!newItemName.trim() || !actionModal.file || isProcessing) return; setIsProcessing(true);
    const oldPath = currentPath ? `${currentPath}/${actionModal.file.name}` : actionModal.file.name;
    const newPath = (actionModal.type === 'rename') ? (currentPath ? `${currentPath}/${newItemName.trim()}` : newItemName.trim()) : newItemName.trim();
    await executeMove(oldPath, newPath);
    setActionModal({ open: false, file: null, type: 'rename' }); setNewItemName(''); setIsProcessing(false);
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // FIX: Ensure breadcrumbs always use forward slashes for display splitting
  const breadcrumbs = currentPath.replace(/\\/g, '/').split('/').filter(Boolean);

  return (
    <div className="min-h-[500px] flex flex-col relative" onDragEnter={handleDrag}>
      {dragActive && (<div className="absolute inset-0 z-50 bg-indigo-500/10 backdrop-blur-sm border-2 border-indigo-500 border-dashed rounded-xl flex flex-col items-center justify-center pointer-events-none"><ArrowUpTrayIcon className="w-16 h-16 text-indigo-600 animate-bounce" /><p className="text-xl font-bold text-indigo-700 mt-4">{t('files.drop_to_upload')}</p></div>)}
      {dragActive && (<div className="absolute inset-0 z-50" onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop} />)}

      <AnimatePresence>
        {actionModal.open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.9, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 10 }} className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center"><h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">{actionModal.type === 'rename' ? <PencilIcon className="w-5 h-5 text-indigo-500" /> : <ArrowRightOnRectangleIcon className="w-5 h-5 text-indigo-500" />}{actionModal.type === 'rename' ? t('files.actions.rename', {defaultValue: 'Rename'}) : t('files.actions.move', {defaultValue: 'Move'})}</h3><button onClick={() => setActionModal({ ...actionModal, open: false })}><XMarkIcon className="w-5 h-5 text-gray-400" /></button></div>
              <form onSubmit={handleActionSubmit} className="p-6"><input ref={actionInputRef} type="text" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg dark:text-white mb-4" /><div className="flex justify-end gap-2"><button type="button" onClick={() => setActionModal({ ...actionModal, open: false })} className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 rounded-lg">{t('actions.cancel')}</button><button type="submit" disabled={isProcessing} className="px-4 py-2 text-white bg-indigo-600 rounded-lg">{t('actions.save')}</button></div></form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{createModal.open && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"><motion.div initial={{ scale: 0.9, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 10 }} className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-sm overflow-hidden"><div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center"><h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">{createModal.type === 'folder' ? <FolderPlusIcon className="w-5 h-5 text-indigo-500" /> : <PlusIcon className="w-5 h-5 text-indigo-500" />}{createModal.type === 'folder' ? t('files.create_folder') : t('files.create_file')}</h3><button onClick={() => setCreateModal({ ...createModal, open: false })}><XMarkIcon className="w-5 h-5 text-gray-400" /></button></div><form onSubmit={handleCreateSubmit} className="p-6"><input ref={nameInputRef} type="text" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 rounded-lg dark:text-white mb-4" /><div className="flex justify-end gap-2"><button type="button" onClick={() => setCreateModal({ ...createModal, open: false })} className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 rounded-lg">{t('actions.cancel')}</button><button type="submit" disabled={isProcessing} className="px-4 py-2 text-white bg-indigo-600 rounded-lg">{t('actions.create')}</button></div></form></motion.div></motion.div>)}</AnimatePresence>
      <AnimatePresence>{editingFile && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"><motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden"><div className="bg-gray-50 dark:bg-slate-700 px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center"><div className="flex items-center gap-3"><div className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-600 shadow-sm">{getFileIcon(editingFile.name, false)}</div><div><h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{editingFile.name}</h3><p className="text-xs text-gray-500 dark:text-gray-300 font-mono">{currentPath}/{editingFile.name}</p></div></div><div className="flex gap-3"><button onClick={() => { setEditingFile(null); setFileContent(''); }} className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-600 rounded-lg">{t('actions.cancel')}</button><button onClick={saveFile} disabled={isSaving} className="px-4 py-2 text-white bg-indigo-600 rounded-lg">{t('files.editor.save_changes')}</button></div></div><div className="flex-1 relative bg-slate-900"><textarea value={fileContent} onChange={(e) => setFileContent(e.target.value)} className="w-full h-full p-6 font-mono text-sm bg-transparent text-slate-300 border-none outline-none resize-none" spellCheck="false" /></div></motion.div></motion.div>)}</AnimatePresence>

      <div className="bg-white dark:bg-slate-800 rounded-t-2xl border border-gray-200 dark:border-slate-700 p-4 border-b-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-1 text-sm overflow-x-auto scrollbar-hide">
            
            {/* HOME BREADCRUMB (DROP TARGET) */}
            <button 
                onClick={() => setCurrentPath('')} 
                onDragOver={(e) => handleBreadcrumbDragOver(e, '')}
                onDragLeave={handleBreadcrumbDragLeave}
                onDrop={(e) => handleBreadcrumbDrop(e, '')}
                className={`p-1.5 rounded-md transition-colors ${
                    breadcrumbDropTarget === '' ? 'bg-indigo-200 dark:bg-indigo-700 ring-2 ring-indigo-500' : ''
                } ${!currentPath ? 'text-indigo-600 bg-indigo-50 font-semibold' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
            >
                <HomeIcon className="w-5 h-5" />
            </button>

            {breadcrumbs.map((part, index) => {
               const path = breadcrumbs.slice(0, index + 1).join('/');
               return (
                <div key={index} className="flex items-center">
                    <ChevronRightIcon className="w-4 h-4 text-gray-300 dark:text-slate-500 flex-shrink-0" />
                    {/* FOLDER BREADCRUMB (DROP TARGET) */}
                    <button 
                        onClick={() => setCurrentPath(path)} 
                        onDragOver={(e) => handleBreadcrumbDragOver(e, path)}
                        onDragLeave={handleBreadcrumbDragLeave}
                        onDrop={(e) => handleBreadcrumbDrop(e, path)}
                        className={`px-2 py-1 rounded-md transition-colors whitespace-nowrap ${
                           breadcrumbDropTarget === path ? 'bg-indigo-200 dark:bg-indigo-700 ring-2 ring-indigo-500' : ''
                        } ${index === breadcrumbs.length - 1 ? 'text-indigo-600 bg-indigo-50 font-semibold' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'}`}
                    >
                        {part}
                    </button>
                </div>
               );
            })}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-gray-100 dark:bg-slate-700 rounded-lg p-1 mr-2"><button onClick={() => openCreateModal('file')} className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-indigo-600 hover:bg-white dark:hover:bg-slate-600 rounded-md"><PlusIcon className="w-5 h-5" /></button><div className="w-px h-4 bg-gray-300 dark:bg-slate-600 mx-1"></div><button onClick={() => openCreateModal('folder')} className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-indigo-600 hover:bg-white dark:hover:bg-slate-600 rounded-md"><FolderPlusIcon className="w-5 h-5" /></button></div>
            {/* --- CHANGED: Only show filter toggle if Admin --- */}
            {isAdmin && (
              <button onClick={() => setFilterEnabled(!filterEnabled)} className={`p-2 rounded-lg border ${filterEnabled ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-gray-200 text-gray-500'}`}><FunnelIcon className="w-5 h-5" /></button>
            )}
            <button onClick={() => fetchFiles(currentPath)} disabled={loading} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"><ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} /></button>
            <div className="relative group"><button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm"><ArrowUpTrayIcon className="w-4 h-4" />{t('files.upload')}</button><input type="file" ref={fileInputRef} className="hidden" onChange={handleUploadClick} /></div>
          </div>
        </div>
        {uploadProgress > 0 && (<div className="h-1 w-full bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden mb-4"><motion.div initial={{ width: 0 }} animate={{ width: `${uploadProgress}%` }} className="h-full bg-indigo-500" /></div>)}
        {error && (<div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2"><ExclamationCircleIcon className="w-5 h-5" />{error}</div>)}
      </div>

      <div className="flex-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 border-t-0 rounded-b-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead><tr className="bg-gray-50 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-700 text-xs uppercase text-gray-500 dark:text-gray-300 font-semibold tracking-wider"><th className="px-6 py-4 w-1/2">{t('files.columns.name')}</th><th className="px-6 py-4 w-1/6">{t('files.columns.size')}</th><th className="px-6 py-4 w-1/6">{t('files.columns.modified')}</th><th className="px-6 py-4 w-1/6 text-right">{t('files.columns.actions')}</th></tr></thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {loading && files.length === 0 ? ([...Array(5)].map((_, i) => (<tr key={i} className="animate-pulse"><td className="px-6 py-4"><div className="h-4 bg-gray-200 w-3/4"></div></td><td className="px-6 py-4"><div className="h-4 bg-gray-200 w-1/2"></div></td><td className="px-6 py-4"><div className="h-4 bg-gray-200 w-1/2"></div></td><td className="px-6 py-4"></td></tr>))) : files.length === 0 ? (<tr><td colSpan="4" className="px-6 py-12 text-center"><FolderIcon className="w-6 h-6 text-gray-400 mx-auto mb-3" /><p className="text-gray-500">{t('files.empty')}</p></td></tr>) : (
                files.map((file) => (
                  <tr key={file.name} draggable={!file.isDirectory || true} onDragStart={(e) => handleRowDragStart(e, file)} onDragOver={(e) => file.isDirectory ? handleRowDragOver(e, file) : null} onDragLeave={handleRowDragLeave} onDrop={(e) => file.isDirectory ? handleRowDrop(e, file) : null} className={`group hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer ${dropTarget === file.name ? 'bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-500' : ''}`} onClick={(e) => { if (e.target.closest('button')) return; handleFileClick(file); }}>
                    <td className="px-6 py-3"><div className="flex items-center gap-3"><div className="flex-shrink-0 transition-transform group-hover:scale-110">{getFileIcon(file.name, file.isDirectory)}</div><span className="text-sm font-medium text-gray-900 dark:text-gray-100">{file.name}</span></div></td>
                    <td className="px-6 py-3 text-sm text-gray-500 font-mono">{file.isDirectory ? '—' : formatSize(file.size)}</td>
                    <td className="px-6 py-3 text-sm text-gray-500">{new Date(file.modified).toLocaleDateString()}</td>
                    <td className="px-6 py-3 text-right"><div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {!file.isDirectory && !specialFiles.includes(file.name.toLowerCase()) && !maskedItems.includes(file.name.toLowerCase()) && (<button onClick={() => download(file)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md"><ArrowDownTrayIcon className="w-4 h-4" /></button>)}
                        {!specialFiles.includes(file.name.toLowerCase()) && !maskedItems.includes(file.name.toLowerCase()) && (<><button onClick={(e) => openActionModal(file, 'rename', e)} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-md"><PencilIcon className="w-4 h-4" /></button><button onClick={(e) => openActionModal(file, 'move', e)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md"><ArrowRightOnRectangleIcon className="w-4 h-4" /></button></>)}
                        {isTextFile(file.name) && (<button onClick={() => openFileForEditing(file)} className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md"><PencilSquareIcon className="w-4 h-4" /></button>)}
                        <button onClick={() => deleteFile(file)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md"><TrashIcon className="w-4 h-4" /></button>
                    </div></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}