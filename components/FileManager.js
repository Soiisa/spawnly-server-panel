// components/FileManager.js
import { useState, useEffect } from 'react';
import axios from 'axios';
import path from 'path';
import { read, write } from 'nbtify';

export default function FileManager({ server, token, initialPath = '', autoOpenFile = '', setActiveTab }) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState(null);
  const [editingFile, setEditingFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [isNbt, setIsNbt] = useState(false);
  const [nbtName, setNbtName] = useState('');

  const apiBase = `/api/servers/${server.id}`;
  const textFileExtensions = ['.txt', '.json', '.yml', '.yaml', '.xml', '.html', '.css', '.js', '.properties', '.config', '.conf', '.ini', '.log', '.md', '.dat'];

  // List of files and folders to mask (case-insensitive, normalized)
  const maskedItems = [
    'server.jar',
    '.git',
    'eula.txt',
    'file-api.js',
    'metrics-server.js',
    'properties-api.js',
    'status-reporter.js',
    'console-server.js',
    'startup.sh',
    'startup.bat',
    'package.json',
    'package-lock.json',
    'server-installer.jar.log',
    'libraries'
  ].map(item => item.toLowerCase().replace(/\/+$/, '')); // Normalize by removing trailing slashes

  // Special case for server.properties
  const specialFiles = ['server.properties'].map(item => item.toLowerCase());

  useEffect(() => {
    if (!token || !server) return;
    setIsOffline(server.status !== 'Running' || !server.ipv4);
    fetchFiles(currentPath);
  }, [currentPath, token, server]);

  useEffect(() => {
    if (initialPath !== currentPath) {
      setCurrentPath(initialPath);
    }
  }, [initialPath]);

  useEffect(() => {
    if (autoOpenFile && files.length > 0 && !editingFile) {
      const file = files.find(f => f.name === autoOpenFile && !f.isDirectory);
      if (file) {
        console.log('Auto-opening file:', file.name);
        openFileForEditing(file);
      }
    }
  }, [files, autoOpenFile, editingFile]);

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
      // Filter out masked files/folders in the frontend as a fallback
      const filteredFiles = res.data.files.filter(file => {
        const normalizedName = file.name.toLowerCase().replace(/\/+$/, '');
        return !maskedItems.includes(normalizedName) &&
               !maskedItems.some(masked => normalizedName.startsWith(masked + '/'));
      });
      setFiles(filteredFiles);
      setCurrentPath(res.data.path);
    } catch (err) {
      setError(`Failed to load files: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const isTextFile = (fileName) => {
    const extension = fileName.includes('.')
      ? fileName.substring(fileName.lastIndexOf('.')).toLowerCase()
      : '';
    return textFileExtensions.includes(extension);
  };

  const openFileForEditing = async (file) => {
    const normalizedName = file.name.toLowerCase().replace(/\/+$/, '');
    if (maskedItems.includes(normalizedName)) {
      setError('This file is restricted and cannot be edited.');
      return;
    }
    const relPath = currentPath ? `${currentPath}/${file.name}` : file.name;
    let responseType = 'text';
    const extension = path.extname(file.name).toLowerCase();
    if (extension === '.dat') {
      responseType = 'arraybuffer';
    }
    try {
      setLoading(true);
      setError(null);
      console.log(`Fetching file: ${relPath}, responseType: ${responseType}`);
      const res = await axios.get(`${apiBase}/file`, {
        params: { path: relPath },
        headers: { Authorization: `Bearer ${token}` },
        responseType,
      });

      let content = res.data;

      if (extension === '.dat') {
        try {
          const uint8 = new Uint8Array(content);
          if (uint8.length === 0) {
            setError(`File ${file.name} is empty.`);
            setFileContent('');
            setIsNbt(true);
            setNbtName('');
            return;
          }
          const nbt = await read(uint8, { endian: 'big', compression: 'gzip' });
          console.log('Parsed NBT:', JSON.stringify(nbt, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
          // Ensure data is a Compound tag
          if (typeof nbt.data !== 'object' || nbt.data === null || Array.isArray(nbt.data)) {
            setError('Invalid NBT structure: Root tag must be a Compound tag.');
            setFileContent('');
            setIsNbt(true);
            setNbtName(nbt.name || 'Data');
            return;
          }
          // Handle BigInt for display
          const replacer = (key, value) => {
            if (typeof value === 'bigint') {
              return value.toString();
            }
            return value;
          };
          // Use the inner Compound tag (nbt.data.Data) for level.dat
          const dataToDisplay = nbt.data.Data || nbt.data;
          content = JSON.stringify(dataToDisplay, replacer, 2);
          setIsNbt(true);
          setNbtName(nbt.name || 'Data'); // Default to 'Data' for level.dat
        } catch (e) {
          console.error(`NBT parsing error for ${file.name}:`, e);
          setError(`Failed to parse NBT file: ${e.message}. Displaying raw data.`);
          content = new TextDecoder().decode(new Uint8Array(content));
          setIsNbt(false);
          setNbtName('');
        }
      } else {
        if (typeof content !== 'string') {
          try {
            content = JSON.stringify(content, null, 2);
          } catch (e) {
            setError(`Invalid response format for ${file.name}`);
            content = '';
          }
        }
        setIsNbt(false);
        setNbtName('');
      }

      if (content.trim() === '') {
        setError(`File ${file.name} is empty or could not be read.`);
      }

      if (extension === '.json') {
        try {
          const parsed = JSON.parse(content);
          content = JSON.stringify(parsed, null, 2);
        } catch (e) {
          setError(`Invalid JSON in ${file.name}. Displaying raw content.`);
        }
      }

      console.log('Setting fileContent:', content.slice(0, 100) + (content.length > 100 ? '...' : '')); // Truncated log
      setEditingFile(file);
      setFileContent(content);
    } catch (err) {
      console.error(`Error fetching file ${file.name}:`, err);
      setError(`Failed to open file ${file.name}: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const saveFile = async () => {
    if (!editingFile) return;
    const normalizedName = editingFile.name.toLowerCase().replace(/\/+$/, '');
    if (maskedItems.includes(normalizedName)) {
      setError('This file is restricted and cannot be saved.');
      return;
    }
    const relPath = currentPath ? `${currentPath}/${editingFile.name}` : editingFile.name;
    let body;
    let contentType;
    if (isNbt) {
      try {
        // Validate JSON content
        if (!fileContent.trim()) {
          setError('File content is empty. Please provide valid NBT data.');
          return;
        }
        let data;
        try {
          data = JSON.parse(fileContent, (key, value) => {
            const bigintFields = ['RandomSeed', 'Time', 'LastPlayed', 'DayTime', 'BorderSizeLerpTime'];
            if (bigintFields.includes(key) && typeof value === 'string' && /^\d+$/.test(value)) {
              return BigInt(value);
            }
            return value;
          });
        } catch (e) {
          setError(`Invalid JSON format: ${e.message}`);
          return;
        }

        // Ensure data is an object (Compound tag)
        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
          setError('NBT data must be a JSON object (Compound tag), not a string, array, or other type.');
          return;
        }

        // Use the stored nbtName or default to 'Data' for level.dat
        const rootTagName = nbtName || 'Data';
        // Handle BigInt for debug logging
        const replacer = (key, value) => {
          if (typeof value === 'bigint') {
            return value.toString();
          }
          return value;
        };
        console.log(`Saving NBT file: ${relPath}, root tag name: ${rootTagName}, data:`, JSON.stringify(data, replacer, 2));

        // Wrap data in a Data object for level.dat
        const nbtData = { Data: data };
        const nbtBytes = await write(rootTagName, nbtData, { endian: 'big', compression: 'gzip' });
        body = new Blob([nbtBytes]);
        contentType = 'application/octet-stream';
      } catch (e) {
        console.error(`NBT serialization error for ${editingFile.name}:`, e);
        setError(`Failed to serialize NBT: ${e.message}`);
        return;
      }
    } else {
      body = fileContent;
      contentType = 'text/plain';
    }
    try {
      setIsSaving(true);
      setError(null);
      await axios.put(`${apiBase}/files`, body, {
        params: { path: relPath },
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': contentType,
        },
      });
      setEditingFile(null);
      setFileContent('');
      setIsNbt(false);
      setNbtName('');
    } catch (err) {
      console.error(`Error saving file ${editingFile.name}:`, err);
      setError(`Failed to save file: ${err.response?.data?.error || err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteFileOrFolder = async (file) => {
    const normalizedName = file.name.toLowerCase().replace(/\/+$/, '');
    if (maskedItems.includes(normalizedName) || 
        maskedItems.some(masked => normalizedName.startsWith(masked + '/')) ||
        specialFiles.includes(normalizedName)) {
      setError('This file or folder is restricted and cannot be deleted.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete ${file.name}?`)) return;
    const relPath = currentPath ? `${currentPath}/${file.name}` : file.name;
    try {
      setLoading(true);
      setError(null);
      await axios.delete(`${apiBase}/files`, {
        params: { path: relPath },
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchFiles(currentPath);
    } catch (err) {
      setError(`Failed to delete ${file.name}: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const navigateToFolder = (folderName) => {
    const normalizedName = folderName.toLowerCase().replace(/\/+$/, '');
    if (maskedItems.includes(normalizedName) || 
        maskedItems.some(masked => normalizedName.startsWith(masked + '/'))) {
      setError('This folder is restricted and cannot be accessed.');
      return;
    }
    setCurrentPath((prev) => (prev ? `${prev}/${folderName}` : folderName));
  };

  const handleFileClick = (file) => {
    const normalizedName = file.name.toLowerCase().replace(/\/+$/, '');
    if (specialFiles.includes(normalizedName)) {
      setActiveTab('properties');
      return;
    }
    if (file.isDirectory) {
      navigateToFolder(file.name);
    } else if (isTextFile(file.name)) {
      openFileForEditing(file);
    } else {
      download(file);
    }
  };

  const download = async (file) => {
    const normalizedName = file.name.toLowerCase().replace(/\/+$/, '');
    if (maskedItems.includes(normalizedName) || specialFiles.includes(normalizedName)) {
      setError('This file is restricted and cannot be downloaded.');
      return;
    }
    const relPath = currentPath ? `${currentPath}/${file.name}` : file.name;
    try {
      setError(null);
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
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Download failed: ${err.response?.data?.error || err.message}`);
    }
  };

  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const normalizedName = file.name.toLowerCase().replace(/\/+$/, '');
    if (maskedItems.includes(normalizedName) || specialFiles.includes(normalizedName)) {
      setError('Uploading this file is restricted.');
      return;
    }
    setSelectedFile(file);
    setUploadProgress(0);
    setError(null);
    const formData = new FormData();
    formData.append('fileName', file.name);
    formData.append('fileContent', file);
    try {
      await axios.post(`${apiBase}/files?path=${currentPath}`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        },
      });
      e.target.value = '';
      setSelectedFile(null);
      setUploadProgress(0);
      fetchFiles(currentPath);
    } catch (err) {
      setError(`Upload failed: ${err.response?.data?.error || err.message}`);
      setSelectedFile(null);
      setUploadProgress(0);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const breadcrumbs = currentPath.split('/').filter((part) => part !== '');

  return (
    <div className="file-manager-container bg-white rounded-lg shadow-md p-4">
      {/* File Editor Modal */}
      {editingFile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900">Editing: {editingFile.name}</h3>
              <div className="flex space-x-2">
                <button
                  onClick={saveFile}
                  disabled={isSaving}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded flex items-center"
                >
                  {isSaving ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Save'
                  )}
                </button>
                <button
                  onClick={() => {
                    setEditingFile(null);
                    setFileContent('');
                    setIsNbt(false);
                    setNbtName('');
                  }}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <textarea
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                className="w-full h-full p-4 font-mono text-sm border-none outline-none resize-none"
                spellCheck="false"
                style={{ minHeight: '400px' }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">
          File Manager {isOffline && <span className="text-sm text-yellow-600">(Offline Mode)</span>}
        </h2>
        <button
          onClick={() => fetchFiles(currentPath)}
          className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded flex items-center"
          disabled={loading}
        >
          {loading ? (
            <span className="flex items-center">
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Loading...
            </span>
          ) : (
            'Refresh'
          )}
        </button>
      </div>

      <div className="breadcrumbs flex items-center mb-4 text-sm">
        <button onClick={() => setCurrentPath('')} className="text-blue-500 hover:text-blue-700">
          Root
        </button>
        {breadcrumbs.map((part, index) => (
          <span key={index} className="flex items-center">
            <span className="mx-2 text-gray-400">/</span>
            <button
              onClick={() => {
                const newPath = breadcrumbs.slice(0, index + 1).join('/');
                setCurrentPath(newPath);
              }}
              className="text-blue-500 hover:text-blue-700"
            >
              {part}
            </button>
          </span>
        ))}
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>
      )}

      <div className="upload-section mb-4 p-4 bg-gray-50 rounded-lg">
        <label className="block text-sm font-medium text-gray-700 mb-2">Upload File</label>
        <div className="flex items-center">
          <label
            className="flex-1 cursor-pointer bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <span>Choose file</span>
            <input type="file" className="sr-only" onChange={upload} />
          </label>
          {selectedFile && <span className="ml-3 text-sm text-gray-500">{selectedFile.name}</span>}
        </div>

        {uploadProgress > 0 && (
          <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${uploadProgress}%` }}></div>
            </div>
            <div className="text-xs text-gray-500 mt-1">{uploadProgress}% uploaded</div>
          </div>
        )}
      </div>

      <div className="file-list border border-gray-200 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Size
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Modified
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {files.length === 0 ? (
              <tr>
                <td colSpan="4" className="px-6 py-4 text-center text-sm text-gray-500">
                  {loading ? 'Loading files...' : 'No files found'}
                </td>
              </tr>
            ) : (
              files.map((file) => (
                <tr key={file.name} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-6 w-6 text-gray-400">
                        {file.isDirectory ? (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                            />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                          </svg>
                        )}
                      </div>
                      <div className="ml-4">
                        <div
                          className="text-sm font-medium text-gray-900 cursor-pointer hover:text-blue-600"
                          onClick={() => handleFileClick(file)}
                        >
                          {file.name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {file.isDirectory ? '—' : formatFileSize(file.size)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(file.modified)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {file.isDirectory ? (
                      <>
                        <button
                          onClick={() => navigateToFolder(file.name)}
                          className="text-blue-600 hover:text-blue-900 mr-2"
                        >
                          Open
                        </button>
                        <button
                          onClick={() => deleteFileOrFolder(file)}
                          className="text-red-600 hover:text-red-900 mr-2"
                        >
                          Delete
                        </button>
                      </>
                    ) : (
                      <>
                        {specialFiles.includes(file.name.toLowerCase()) ? (
                          <button
                            onClick={() => handleFileClick(file)}
                            className="text-blue-600 hover:text-blue-900 mr-2"
                          >
                            Open in Properties
                          </button>
                        ) : (
                          <>
                            <button onClick={() => download(file)} className="text-green-600 hover:text-green-900 mr-2">
                              Download
                            </button>
                            {isTextFile(file.name) && (
                              <button
                                onClick={() => openFileForEditing(file)}
                                className="text-purple-600 hover:text-purple-900 mr-2"
                              >
                                Edit
                              </button>
                            )}
                            <button
                              onClick={() => deleteFileOrFolder(file)}
                              className="text-red-600 hover:text-red-900 mr-2"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}