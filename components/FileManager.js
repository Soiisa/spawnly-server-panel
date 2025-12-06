// components/FileManager.js
import { useState, useEffect } from 'react';
import axios from 'axios';
import { read, write } from 'nbtify';

export default function FileManager({ server, token, setActiveTab }) {
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

  const apiBase = `/api/servers/${server.id}`; // Always use backend
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

  // Custom JSON replacer to handle BigInt
  const bigIntReplacer = (key, value) => {
    if (typeof value === 'bigint') {
      return value.toString(); // Convert BigInt to string
    }
    return value;
  };

  // Custom JSON reviver to convert stringified BigInt back to BigInt
  const bigIntReviver = (key, value) => {
    // Check if the value is a string that represents a number too large for JavaScript Number
    if (typeof value === 'string' && /^-?\d+$/.test(value)) {
      try {
        return BigInt(value);
      } catch (e) {
        return value; // Return as string if BigInt conversion fails
      }
    }
    return value;
  };

  useEffect(() => {
    if (!token || !server) return;
    // Set offline only when server status is explicitly 'Stopped'
    setIsOffline(server.status === 'Stopped');
    fetchFiles(currentPath);
  }, [currentPath, token, server]);

  // Re-apply client-side filter when toggled or when we have a fresh listing
  useEffect(() => {
    const applyFilter = (filesArray) => {
      if (!filterEnabled) return filesArray || [];
      return (filesArray || []).filter(file => {
        const normalizedName = file.name.toLowerCase().replace(/\/+$/, '');
        return !maskedItems.includes(normalizedName) &&
               !maskedItems.some(masked => normalizedName.startsWith(masked + '/'));
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
      // Keep the full list so toggling the filter can re-apply client-side
      setAllFiles(res.data.files || []);
      const applyFilterToFiles = (filesArray) => {
        if (!filterEnabled) return filesArray;
        return (filesArray || []).filter(file => {
          const normalizedName = file.name.toLowerCase().replace(/\/+$/, '');
          return !maskedItems.includes(normalizedName) &&
                 !maskedItems.some(masked => normalizedName.startsWith(masked + '/'));
        });
      };

      setFiles(applyFilterToFiles(res.data.files || []));
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

  const isNbtFile = (fileName) => fileName.toLowerCase().endsWith('.dat');

  const openFileForEditing = async (file) => {
    const normalizedName = file.name.toLowerCase().replace(/\/+$/, '');
    if (maskedItems.includes(normalizedName)) {
      setError('This file is restricted and cannot be edited.');
      return;
    }
    const relPath = currentPath ? `${currentPath}/${file.name}` : file.name;
    try {
      setLoading(true);
      setError(null);
      const responseType = isNbtFile(file.name) ? 'arraybuffer' : 'text';
      const res = await axios.get(`${apiBase}/file`, {
        params: { path: relPath },
        headers: { Authorization: `Bearer ${token}` },
        responseType,
      });

      let content = res.data;

      // Debug: Log the raw response to inspect its type and value
      console.log(`Raw response for ${file.name}:`, content, `Type: ${typeof content}`);

      if (isNbtFile(file.name)) {
        try {
          const nbtData = await read(new Uint8Array(content), { compression: 'gzip', endian: 'big' });
          content = JSON.stringify(nbtData.data, bigIntReplacer, 2);
        } catch (parseErr) {
          console.error(`Failed to read NBT in ${file.name}:`, parseErr);
          setError(`File ${file.name} contains invalid NBT data. Cannot edit.`);
          return;
        }
      } else {
        // Handle non-string responses (e.g., parsed JSON object)
        if (typeof content !== 'string') {
          try {
            // Convert object to formatted JSON string
            content = JSON.stringify(content, bigIntReplacer, 2);
          } catch (e) {
            setError(`File ${file.name} could not be read: Invalid response format (expected text or valid JSON, got ${typeof content}).`);
            setEditingFile(file);
            setFileContent('');
            return;
          }
        }

        // Check if content is empty
        if (content.trim() === '') {
          setError(`File ${file.name} is empty or could not be read.`);
          setEditingFile(file);
          setFileContent('');
          return;
        }

        // If the file is a JSON file, try to parse and re-stringify for pretty printing
        if (file.name.toLowerCase().endsWith('.json')) {
          try {
            // Parse the text to ensure it's valid JSON
            const parsed = JSON.parse(content);
            // Stringify with indentation for pretty printing
            content = JSON.stringify(parsed, bigIntReplacer, 2);
          } catch (e) {
            console.warn(`Failed to parse JSON in ${file.name}:`, e);
            setError(`File ${file.name} contains invalid JSON. Displaying raw content.`);
            // Display raw content if JSON is invalid
          }
        }
      }

      setEditingFile(file);
      setFileContent(content);
    } catch (err) {
      setError(`Failed to open file ${file.name}: ${err.response?.data?.error || err.message}`);
      console.error(`Error fetching file ${file.name}:`, err);
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
    try {
      setIsSaving(true);
      setError(null);

      let body = fileContent;
      let contentType = 'text/plain';

      if (isNbtFile(editingFile.name)) {
        let parsedJson;
        try {
          parsedJson = JSON.parse(fileContent, bigIntReviver);
        } catch (parseErr) {
          console.error('Invalid JSON for NBT:', parseErr);
          setError('Invalid JSON format for NBT data.');
          return;
        }
        try {
          const nbtBuffer = await write(parsedJson, { compression: 'gzip', endian: 'big', name: '' });
          body = nbtBuffer;
          contentType = 'application/octet-stream';
        } catch (writeErr) {
          console.error('Failed to write NBT data:', writeErr);
          setError('Failed to convert JSON to NBT format.');
          return;
        }
      }

      await axios.put(`${apiBase}/files`, body, {
        params: { path: relPath },
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': contentType,
        },
      });
      setEditingFile(null);
      setFileContent('');
    } catch (err) {
      setError(`Failed to save file: ${err.response?.data?.error || err.message}`);
      console.error(`Error saving file ${editingFile.name}:`, err);
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
        <div className="flex items-center gap-2">
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

          <button
            onClick={() => setFilterEnabled((v) => !v)}
            className={`px-3 py-1 rounded border text-sm ${filterEnabled ? 'bg-green-100 border-green-300 text-green-800' : 'bg-gray-100 border-gray-300 text-gray-800'}`}
            title={filterEnabled ? 'File filter is ON. Click to show all files.' : 'File filter is OFF. Click to hide masked files.'}
          >
            {filterEnabled ? 'Filter: On' : 'Filter: Off'}
          </button>
        </div>
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