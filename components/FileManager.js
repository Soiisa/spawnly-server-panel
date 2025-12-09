// components/FileManager.js
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { read, write } from 'nbtify';
import { motion, AnimatePresence } from 'framer-motion';
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
  CheckCircleIcon
} from '@heroicons/react/24/outline';

// File type icon helper
const getFileIcon = (fileName, isDirectory) => {
  if (isDirectory) return <FolderIcon className="w-6 h-6 text-indigo-400 fill-indigo-50" />;
  const ext = fileName.split('.').pop().toLowerCase();
  switch (ext) {
    case 'json':
    case 'properties':
    case 'yml':
    case 'yaml':
    case 'toml':
    case 'conf':
    case 'ini':
      return <CodeBracketIcon className="w-6 h-6 text-emerald-500" />;
    case 'log':
    case 'txt':
    case 'md':
      return <DocumentTextIcon className="w-6 h-6 text-slate-500" />;
    case 'jar':
      return <div className="w-6 h-6 flex items-center justify-center font-bold text-xs text-orange-600 border border-orange-200 rounded bg-orange-50">J</div>;
    default:
      return <DocumentIcon className="w-6 h-6 text-gray-400" />;
  }
};

export default function FileManager({ server, token, setActiveTab }) {
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
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef(null);
  const apiBase = `/api/servers/${server.id}`;
  const textFileExtensions = ['.txt', '.json', '.yml', '.yaml', '.xml', '.html', '.css', '.js', '.properties', '.config', '.conf', '.ini', '.log', '.md', '.dat', '.toml'];

  // Masked/Special lists
  const maskedItems = [
    'server.jar', '.git', 'eula.txt', 'file-api.js', 'metrics-server.js', 
    'properties-api.js', 'status-reporter.js', 'console-server.js', 
    'startup.sh', 'startup.bat', 'package.json', 'package-lock.json', 
    'server-installer.jar.log', 'libraries'
  ].map(item => item.toLowerCase());

  const specialFiles = ['server.properties'].map(item => item.toLowerCase());

  // --- Logic Helpers ---
  const bigIntReplacer = (key, value) => typeof value === 'bigint' ? value.toString() : value;
  const bigIntReviver = (key, value) => (typeof value === 'string' && /^-?\d+$/.test(value)) ? BigInt(value) : value;

  useEffect(() => {
    if (!token || !server) return;
    setIsOffline(server.status === 'Stopped');
    fetchFiles(currentPath);
  }, [currentPath, token, server]);

  useEffect(() => {
    const applyFilter = (list) => {
      if (!filterEnabled) return list || [];
      return (list || []).filter(file => {
        const name = file.name.toLowerCase().replace(/\/+$/, '');
        // Hide masked items and dotfiles (except explicit ones if needed)
        return !maskedItems.includes(name) && 
               !maskedItems.some(masked => name.startsWith(masked + '/'));
      });
    };
    setFiles(applyFilter(allFiles));
  }, [filterEnabled, allFiles]);

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
      
      // Sort: Folders first, then files alphabetically
      const sorted = (res.data.files || []).sort((a, b) => {
        if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
        return a.isDirectory ? -1 : 1;
      });

      setAllFiles(sorted);
      setCurrentPath(res.data.path);
    } catch (err) {
      setError(`Failed to load files: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const isTextFile = (name) => textFileExtensions.some(ext => name.toLowerCase().endsWith(ext));
  const isNbtFile = (name) => name.toLowerCase().endsWith('.dat');

  // --- Actions ---

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
        } catch (e) {
          throw new Error('Invalid NBT data');
        }
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
      setError(`Failed to save: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteFile = async (file) => {
    if (!window.confirm(`Delete ${file.name}? This cannot be undone.`)) return;
    try {
      const relPath = currentPath ? `${currentPath}/${file.name}` : file.name;
      await axios.delete(`${apiBase}/files`, {
        params: { path: relPath },
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchFiles(currentPath);
    } catch (err) {
      setError(`Delete failed: ${err.message}`);
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
    } catch (err) {
      setError('Download failed');
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
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
    } catch (err) {
      setError('Upload failed');
    } finally {
      setSelectedFile(null);
      setUploadProgress(0);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // --- Render ---

  const breadcrumbs = currentPath.split('/').filter(Boolean);

  return (
    <div className="min-h-[500px] flex flex-col">
      
      {/* Editor Modal */}
      <AnimatePresence>
        {editingFile && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white rounded-lg border border-gray-200 shadow-sm">
                    {getFileIcon(editingFile.name, false)}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{editingFile.name}</h3>
                    <p className="text-xs text-gray-500 font-mono">{currentPath}/{editingFile.name}</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => { setEditingFile(null); setFileContent(''); }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={saveFile}
                    disabled={isSaving}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm flex items-center gap-2 transition-all disabled:opacity-50"
                  >
                    {isSaving ? <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> : <CheckCircleIcon className="w-4 h-4" />}
                    Save Changes
                  </button>
                </div>
              </div>
              
              {/* Editor Content */}
              <div className="flex-1 relative bg-slate-900">
                <textarea
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  className="w-full h-full p-6 font-mono text-sm bg-transparent text-slate-300 border-none outline-none resize-none leading-relaxed"
                  spellCheck="false"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toolbar & Breadcrumbs */}
      <div className="bg-white rounded-t-2xl border border-gray-200 p-4 border-b-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          
          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 text-sm overflow-x-auto scrollbar-hide">
            <button 
              onClick={() => setCurrentPath('')}
              className={`p-1.5 rounded-md transition-colors ${!currentPath ? 'text-indigo-600 bg-indigo-50 font-semibold' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}`}
            >
              <HomeIcon className="w-5 h-5" />
            </button>
            {breadcrumbs.map((part, index) => (
              <div key={index} className="flex items-center">
                <ChevronRightIcon className="w-4 h-4 text-gray-300 flex-shrink-0" />
                <button
                  onClick={() => setCurrentPath(breadcrumbs.slice(0, index + 1).join('/'))}
                  className={`px-2 py-1 rounded-md transition-colors whitespace-nowrap ${
                    index === breadcrumbs.length - 1 
                      ? 'text-indigo-600 bg-indigo-50 font-semibold' 
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {part}
                </button>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterEnabled(!filterEnabled)}
              className={`p-2 rounded-lg border transition-colors ${filterEnabled ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}
              title="Toggle masked files"
            >
              <FunnelIcon className="w-5 h-5" />
            </button>
            
            <button
              onClick={() => fetchFiles(currentPath)}
              disabled={loading}
              className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <div className="relative group">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm shadow-sm transition-all"
              >
                <ArrowUpTrayIcon className="w-4 h-4" />
                Upload
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleUpload} 
              />
            </div>
          </div>
        </div>

        {/* Upload Progress Bar */}
        {uploadProgress > 0 && (
          <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden mb-4">
            <motion.div 
              initial={{ width: 0 }} 
              animate={{ width: `${uploadProgress}%` }} 
              className="h-full bg-indigo-500" 
            />
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2">
            <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* File List Table */}
      <div className="flex-1 bg-white border border-gray-200 border-t-0 rounded-b-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                <th className="px-6 py-4 w-1/2">Name</th>
                <th className="px-6 py-4 w-1/6">Size</th>
                <th className="px-6 py-4 w-1/6">Modified</th>
                <th className="px-6 py-4 w-1/6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && files.length === 0 ? (
                // Loading Skeleton
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-3/4"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-1/2"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-1/2"></div></td>
                    <td className="px-6 py-4"></td>
                  </tr>
                ))
              ) : files.length === 0 ? (
                // Empty State
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center">
                    <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                      <FolderIcon className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-gray-500 font-medium">This folder is empty</p>
                  </td>
                </tr>
              ) : (
                // File Rows
                files.map((file) => (
                  <tr 
                    key={file.name} 
                    className="group hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={(e) => {
                      // Prevent navigation if clicking action buttons
                      if (e.target.closest('button')) return;
                      handleFileClick(file);
                    }}
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 transition-transform group-hover:scale-110 duration-200">
                          {getFileIcon(file.name, file.isDirectory)}
                        </div>
                        <span className="text-sm font-medium text-gray-900 group-hover:text-indigo-700 transition-colors">
                          {file.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500 font-mono">
                      {file.isDirectory ? '—' : formatSize(file.size)}
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500">
                      {new Date(file.modified).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        
                        {!file.isDirectory && !specialFiles.includes(file.name.toLowerCase()) && !maskedItems.includes(file.name.toLowerCase()) && (
                          <button
                            onClick={() => download(file)}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                            title="Download"
                          >
                            <ArrowDownTrayIcon className="w-4 h-4" />
                          </button>
                        )}

                        {isTextFile(file.name) && (
                          <button
                            onClick={() => openFileForEditing(file)}
                            className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
                            title="Edit"
                          >
                            <PencilSquareIcon className="w-4 h-4" />
                          </button>
                        )}

                        {/* Special handling for Server Properties */}
                        {specialFiles.includes(file.name.toLowerCase()) && (
                          <button
                            onClick={() => setActiveTab('properties')}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                            title="Open Properties Editor"
                          >
                            <CodeBracketIcon className="w-4 h-4" />
                          </button>
                        )}

                        <button
                          onClick={() => deleteFile(file)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                          title="Delete"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
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