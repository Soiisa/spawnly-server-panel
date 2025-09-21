// components/PlayersTab.js
import { useState, useEffect } from 'react';
import md5 from 'md5';

export default function PlayersTab({ server, token }) {
  const [activeSubTab, setActiveSubTab] = useState('whitelist');
  const [whitelist, setWhitelist] = useState([]);
  const [ops, setOps] = useState([]);
  const [bannedPlayers, setBannedPlayers] = useState([]);
  const [bannedIps, setBannedIps] = useState([]);
  const [userCache, setUserCache] = useState([]);
  const [onlinePlayers, setOnlinePlayers] = useState([]);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerIp, setNewPlayerIp] = useState('');
  const [newPlayerReason, setNewPlayerReason] = useState('Banned by an operator.');
  const [newPlayerExpires, setNewPlayerExpires] = useState('forever');
  const [newOpLevel, setNewOpLevel] = useState(4);
  const [newOpBypasses, setNewOpBypasses] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const isRunning = server.status === 'Running';
  const API_URL = `https://${server.subdomain}.spawnly.net/api`;

  useEffect(() => {
    console.log('PlayersTab mounted with server:', server.id, 'token:', token);
    fetchAllData();
    const interval = setInterval(fetchOnlinePlayers, 30000);
    return () => clearInterval(interval);
  }, [server.id, token, isRunning]);

  const showError = (message) => {
    setError(message);
    setTimeout(() => setError(null), 5000);
  };

  const showSuccess = (message) => {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 5000);
  };

  const fetchJsonFile = async (filePath, retries = 5, delay = 2000) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`Fetching file: ${filePath} (attempt ${attempt}/${retries})`);
        const res = await fetch(`${API_URL}/file?path=${filePath}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (!res.ok) {
          const errorText = await res.text().catch(() => '');
          console.error(`Fetch ${filePath} failed: ${res.status} ${errorText}`);
          if (res.status === 404) return [];
          throw new Error(`Failed to fetch ${filePath}: ${res.status} ${errorText}`);
        }
        
        const text = await res.text();
        console.log('Raw file content:', text);
        let data;
        try {
          const trimmedText = text.trim();
          if (!trimmedText) {
            console.warn(`Empty file: ${filePath}, returning empty array`);
            return [];
          }
          data = JSON.parse(trimmedText);
        } catch (parseErr) {
          console.error(`JSON parse failed for ${filePath}:`, parseErr, 'Raw text:', text);
          try {
            const fixedJson = text
              .replace(/,\s*}/g, '}')
              .replace(/,\s*]/g, ']')
              .replace(/\/\/.*$/gm, '')
              .replace(/\/\*[\s\S]*?\*\//g, '');
            data = JSON.parse(fixedJson);
            console.log(`Fixed JSON for ${filePath}`);
          } catch (secondParseErr) {
            console.error(`Second JSON parse attempt also failed for ${filePath}:`, secondParseErr);
            throw new Error(`Invalid JSON in ${filePath}: ${parseErr.message}`);
          }
        }
        
        console.log(`Fetched ${filePath}:`, data);
        return Array.isArray(data) ? data : [data];
      } catch (err) {
        console.error(`Error fetching ${filePath} (attempt ${attempt}/${retries}):`, err);
        if (attempt === retries) {
          showError(`Failed to load ${filePath}: ${err.message}`);
          return [];
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  };

  const saveJsonFile = async (filePath, data) => {
    try {
      setLoading(true);
      try {
        JSON.parse(JSON.stringify(data));
      } catch (jsonErr) {
        console.error('Invalid JSON data:', jsonErr);
        showError('Cannot save: Invalid JSON data');
        return false;
      }
      console.log(`Saving file: ${filePath}`, { data: JSON.stringify(data, null, 2) });
      
      const res = await fetch(`${API_URL}/files?path=${filePath}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data, null, 2),
      });
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.error(`Save ${filePath} failed: ${res.status} ${errorText}`);
        throw new Error(`Failed to save ${filePath}: ${res.status} ${errorText}`);
      }
      
      console.log(`Successfully saved ${filePath}`);
      setError(null);
      return true;
    } catch (err) {
      console.error(`Error saving ${filePath}:`, err);
      showError(`Failed to save ${filePath}: ${err.message}`);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const sendRconCommand = async (command) => {
    try {
      const res = await fetch(`${API_URL}/rcon`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ command }),
      });
      
      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`Failed to execute command: ${errorText}`);
      }
      
      const { output } = await res.json();
      console.log('RCON response:', output);
      return output;
    } catch (err) {
      console.error('RCON command failed:', err);
      throw err;
    }
  };

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const [wl, op, bp, bi, uc] = await Promise.all([
        fetchJsonFile('whitelist.json'),
        fetchJsonFile('ops.json'),
        fetchJsonFile('banned-players.json'),
        fetchJsonFile('banned-ips.json'),
        fetchJsonFile('usercache.json'),
      ]);
      
      setWhitelist(wl);
      setOps(op);
      setBannedPlayers(bp);
      setBannedIps(bi);
      setUserCache(uc);
      console.log('Fetched all data:', { whitelist: wl, ops: op, bannedPlayers: bp, bannedIps: bi, userCache: uc });
      
      if (isRunning) {
        await fetchOnlinePlayers();
      }
      
      showSuccess('Data refreshed successfully');
    } catch (err) {
      console.error('Error fetching all data:', err);
      showError('Failed to load server data');
    } finally {
      setLoading(false);
    }
  };

  const fetchOnlinePlayers = async () => {
    if (!isRunning) {
      setOnlinePlayers([]);
      return;
    }
    
    try {
      console.log('Fetching online players for server:', server.id);
      const response = await sendRconCommand('list');
      const match = response.match(/There are (\d+) of a max of (\d+) players online: (.*)/) || 
                   response.match(/players online: (.*)/);
      
      const players = match && match[3] ? 
        match[3].split(', ').filter(Boolean) : 
        (match && match[1] ? match[1].split(', ').filter(Boolean) : []);
      
      setOnlinePlayers(players);
      console.log('Online players:', players);
    } catch (err) {
      console.error('Error fetching online players:', err);
      setOnlinePlayers([]);
      showError(`Failed to fetch online players: ${err.message}`);
    }
  };

  const getOfflineUuid = (name) => {
    if (!name || typeof name !== 'string') {
      showError('Invalid player name');
      return null;
    }
    
    const input = `OfflinePlayer:${name.trim()}`;
    const hash = md5(input);
    const uuid = [
      hash.slice(0, 8),
      hash.slice(8, 12),
      (parseInt(hash.slice(12, 16), 16) & 0x0fff) | 0x3000,
      (parseInt(hash.slice(16, 20), 16) & 0x3fff) | 0x8000,
      hash.slice(20, 32),
    ]
      .map((part, i) => (i < 2 ? part : part.toString(16).padStart(4, '0')))
      .join('-');
    
    console.log(`Generated UUID for ${name}: ${uuid}`);
    return uuid;
  };

  const addToList = async () => {
    if (!newPlayerName && activeSubTab !== 'banned-ips') {
      showError('Player name is required');
      return;
    }
    
    if (!newPlayerIp && activeSubTab === 'banned-ips') {
      showError('IP address is required');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    let file, setList;
    switch (activeSubTab) {
      case 'whitelist':
        setList = setWhitelist;
        file = 'whitelist.json';
        break;
      case 'ops':
        setList = setOps;
        file = 'ops.json';
        break;
      case 'banned-players':
        setList = setBannedPlayers;
        file = 'banned-players.json';
        break;
      case 'banned-ips':
        setList = setBannedIps;
        file = 'banned-ips.json';
        break;
      default:
        showError('Invalid tab selected');
        setLoading(false);
        return;
    }
    
    let entry;
    if (activeSubTab === 'banned-ips') {
      entry = {
        ip: newPlayerIp,
        created: new Date().toISOString(),
        source: 'Server',
        expires: newPlayerExpires === 'forever' ? 'forever' : new Date(newPlayerExpires).toISOString(),
        reason: newPlayerReason,
      };
    } else {
      const uuid = getOfflineUuid(newPlayerName);
      if (!uuid) {
        setLoading(false);
        return;
      }
      
      if (activeSubTab === 'whitelist') {
        entry = { uuid, name: newPlayerName };
      } else if (activeSubTab === 'ops') {
        entry = { uuid, name: newPlayerName, level: newOpLevel, bypassesPlayerLimit: newOpBypasses };
      } else if (activeSubTab === 'banned-players') {
        entry = {
          uuid,
          name: newPlayerName,
          created: new Date().toISOString(),
          source: 'Server',
          expires: newPlayerExpires === 'forever' ? 'forever' : new Date(newPlayerExpires).toISOString(),
          reason: newPlayerReason,
        };
      }
    }
    
    if (isRunning) {
      let command = null;
      if (activeSubTab === 'whitelist') {
        command = `whitelist add ${newPlayerName}`;
      } else if (activeSubTab === 'ops') {
        command = `op ${newPlayerName}`;
      } else if (activeSubTab === 'banned-players') {
        command = newPlayerExpires === 'forever' 
          ? `ban ${newPlayerName} ${newPlayerReason}`
          : null; // Temporary bans not supported via RCON
      } else if (activeSubTab === 'banned-ips') {
        command = newPlayerExpires === 'forever' 
          ? `ban-ip ${newPlayerIp} ${newPlayerReason}`
          : null; // Temporary bans not supported via RCON
      }
      
      if (command) {
        try {
          const response = await sendRconCommand(command);
          showSuccess(`Successfully added to ${activeSubTab}. Response: ${response}`);
          await fetchAllData();
          setNewPlayerName('');
          setNewPlayerIp('');
          setNewPlayerReason('Banned by an operator.');
          setNewPlayerExpires('forever');
          setNewOpLevel(4);
          setNewOpBypasses(false);
          setLoading(false);
          return;
        } catch (err) {
          showError(`Failed to add to ${activeSubTab}: ${err.message}`);
          setLoading(false);
          return;
        }
      }
    }
    
    // Fallback to JSON edit when server is offline or RCON command not applicable
    const latestList = await fetchJsonFile(file);
    const exists = activeSubTab === 'banned-ips'
      ? latestList.some(item => item.ip === newPlayerIp)
      : latestList.some(item => item.name?.toLowerCase() === newPlayerName.toLowerCase());
    if (exists) {
      showError('This player or IP is already in the list');
      setLoading(false);
      return;
    }
    
    const newList = [...latestList, entry];
    console.log(`Updating ${file} with new list:`, JSON.stringify(newList, null, 2));
    try {
      const success = await saveJsonFile(file, newList);
      if (success) {
        setList(newList);
        showSuccess(`Successfully added to ${activeSubTab}${isRunning ? '. Restart server to apply.' : ''}`);
        if (!isRunning) {
          await fetchAllData();
        }
        setNewPlayerName('');
        setNewPlayerIp('');
        setNewPlayerReason('Banned by an operator.');
        setNewPlayerExpires('forever');
        setNewOpLevel(4);
        setNewOpBypasses(false);
      }
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setLoading(false);
    }
  };

  const removeFromList = async (index, identifier) => {
    let setList, file;
    switch (activeSubTab) {
      case 'whitelist':
        setList = setWhitelist;
        file = 'whitelist.json';
        break;
      case 'ops':
        setList = setOps;
        file = 'ops.json';
        break;
      case 'banned-players':
        setList = setBannedPlayers;
        file = 'banned-players.json';
        break;
      case 'banned-ips':
        setList = setBannedIps;
        file = 'banned-ips.json';
        break;
      default:
        showError('Invalid tab selected');
        return;
    }
    
    if (isRunning) {
      let command = null;
      if (activeSubTab === 'whitelist') {
        command = `whitelist remove ${identifier}`;
      } else if (activeSubTab === 'ops') {
        command = `deop ${identifier}`;
      } else if (activeSubTab === 'banned-players') {
        command = `pardon ${identifier}`;
      } else if (activeSubTab === 'banned-ips') {
        command = `pardon-ip ${identifier}`;
      }
      
      if (command) {
        try {
          const response = await sendRconCommand(command);
          showSuccess(`Successfully removed from ${activeSubTab}. Response: ${response}`);
          await fetchAllData();
          return;
        } catch (err) {
          showError(`Failed to remove from ${activeSubTab}: ${err.message}`);
          return;
        }
      }
    }
    
    // Fallback to JSON edit
    const latestList = await fetchJsonFile(file);
    const removeIndex = latestList.findIndex(item => 
      activeSubTab === 'banned-ips' ? item.ip === identifier : item.name === identifier
    );
    if (removeIndex === -1) {
      showError('Entry not found in latest list');
      return;
    }
    const newList = latestList.filter((_, i) => i !== removeIndex);
    console.log(`Removing entry from ${file}:`, identifier);
    try {
      const success = await saveJsonFile(file, newList);
      if (success) {
        setList(newList);
        showSuccess(`Successfully removed from ${activeSubTab}${isRunning ? '. Restart server to apply.' : ''}`);
        if (!isRunning) {
          await fetchAllData();
        }
      }
    } catch (err) {
      console.error('Failed to remove:', err);
    }
  };

  const offlinePlayers = userCache.filter((user) => 
    !onlinePlayers.some(online => online.toLowerCase() === user.name.toLowerCase())
  );

  const formatDate = (dateString) => {
    if (dateString === 'forever') return 'Never';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch (e) {
      return dateString;
    }
  };

  return (
    <div className="bg-white p-4 rounded shadow">
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-700 font-bold">×</button>
        </div>
      )}
      
      {success && (
        <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-md flex justify-between items-center">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="text-green-700 font-bold">×</button>
        </div>
      )}
      
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">Player Management</h2>
        <button
          onClick={fetchAllData}
          disabled={loading}
          className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-2 rounded text-sm transition-colors flex items-center"
        >
          {loading ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-800" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Refreshing...
            </>
          ) : 'Refresh Data'}
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <h3 className="text-lg font-semibold mb-2">Online Players ({onlinePlayers.length})</h3>
          <ul className="bg-gray-50 p-4 rounded-md max-h-40 overflow-y-auto">
            {onlinePlayers.map((player, i) => (
              <li key={i} className="py-1 flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                {player}
              </li>
            ))}
            {onlinePlayers.length === 0 && <li className="text-gray-500">No players online</li>}
          </ul>
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-2">Offline Players ({offlinePlayers.length})</h3>
          <ul className="bg-gray-50 p-4 rounded-md max-h-40 overflow-y-auto">
            {offlinePlayers.map((player, i) => (
              <li key={i} className="py-1 flex items-center">
                <span className="w-2 h-2 bg-gray-400 rounded-full mr-2"></span>
                {player.name}
              </li>
            ))}
            {offlinePlayers.length === 0 && <li className="text-gray-500">No offline players</li>}
          </ul>
        </div>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-4">
          {['whitelist', 'ops', 'banned-players', 'banned-ips'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveSubTab(tab)}
              className={`py-2 px-3 text-sm font-medium ${
                activeSubTab === tab 
                  ? 'border-b-2 border-indigo-500 text-indigo-600' 
                  : 'text-gray-600 hover:text-indigo-600'
              }`}
            >
              {tab.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
            </button>
          ))}
        </nav>
      </div>

      <div>
        {activeSubTab === 'whitelist' && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Whitelist</h3>
            {whitelist.length === 0 ? (
              <p className="text-gray-500 mb-4">No players in whitelist</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr>
                      <th className="py-2 px-4 border-b">Name</th>
                      <th className="py-2 px-4 border-b">UUID</th>
                      <th className="py-2 px-4 border-b">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {whitelist.map((player, index) => (
                      <tr key={index}>
                        <td className="py-2 px-4 border-b">{player.name}</td>
                        <td className="py-2 px-4 border-b text-xs font-mono">{player.uuid}</td>
                        <td className="py-2 px-4 border-b">
                          <button 
                            onClick={() => removeFromList(index, player.name)}
                            className="text-red-600 hover:text-red-800 px-2 py-1 rounded hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <input
                type="text"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                placeholder="Player name"
                className="border border-gray-300 rounded px-3 py-2 flex-grow"
                disabled={loading}
              />
              <button 
                onClick={addToList} 
                disabled={loading || !newPlayerName}
                className="bg-indigo-600 text-white px-4 py-2 rounded disabled:bg-indigo-400 flex items-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Adding...
                  </>
                ) : 'Add to Whitelist'}
              </button>
            </div>
          </div>
        )}

        {activeSubTab === 'ops' && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Operators</h3>
            {ops.length === 0 ? (
              <p className="text-gray-500 mb-4">No operators</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr>
                      <th className="py-2 px-4 border-b">Name</th>
                      <th className="py-2 px-4 border-b">UUID</th>
                      <th className="py-2 px-4 border-b">Level</th>
                      <th className="py-2 px-4 border-b">Bypasses Limit</th>
                      <th className="py-2 px-4 border-b">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ops.map((player, index) => (
                      <tr key={index}>
                        <td className="py-2 px-4 border-b">{player.name}</td>
                        <td className="py-2 px-4 border-b text-xs font-mono">{player.uuid}</td>
                        <td className="py-2 px-4 border-b">{player.level}</td>
                        <td className="py-2 px-4 border-b">{player.bypassesPlayerLimit ? 'Yes' : 'No'}</td>
                        <td className="py-2 px-4 border-b">
                          <button 
                            onClick={() => removeFromList(index, player.name)}
                            className="text-red-600 hover:text-red-800 px-2 py-1 rounded hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <input
                  type="text"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder="Player name"
                  className="border border-gray-300 rounded px-3 py-2 flex-grow"
                  disabled={loading}
                />
                <select
                  value={newOpLevel}
                  onChange={(e) => setNewOpLevel(parseInt(e.target.value))}
                  className="border border-gray-300 rounded px-3 py-2"
                  disabled={loading}
                >
                  <option value={1}>Level 1</option>
                  <option value={2}>Level 2</option>
                  <option value={3}>Level 3</option>
                  <option value={4}>Level 4</option>
                </select>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="bypassesLimit"
                  checked={newOpBypasses}
                  onChange={(e) => setNewOpBypasses(e.target.checked)}
                  className="mr-2"
                  disabled={loading}
                />
                <label htmlFor="bypassesLimit">Bypasses Player Limit</label>
              </div>
              <button 
                onClick={addToList} 
                disabled={loading || !newPlayerName}
                className="bg-indigo-600 text-white px-4 py-2 rounded disabled:bg-indigo-400 flex items-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Adding...
                  </>
                ) : 'Add Operator'}
              </button>
            </div>
          </div>
        )}

        {activeSubTab === 'banned-players' && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Banned Players</h3>
            {bannedPlayers.length === 0 ? (
              <p className="text-gray-500 mb-4">No banned players</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr>
                      <th className="py-2 px-4 border-b">Name</th>
                      <th className="py-2 px-4 border-b">UUID</th>
                      <th className="py-2 px-4 border-b">Reason</th>
                      <th className="py-2 px-4 border-b">Expires</th>
                      <th className="py-2 px-4 border-b">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bannedPlayers.map((player, index) => (
                      <tr key={index}>
                        <td className="py-2 px-4 border-b">{player.name}</td>
                        <td className="py-2 px-4 border-b text-xs font-mono">{player.uuid}</td>
                        <td className="py-2 px-4 border-b">{player.reason}</td>
                        <td className="py-2 px-4 border-b">{formatDate(player.expires)}</td>
                        <td className="py-2 px-4 border-b">
                          <button 
                            onClick={() => removeFromList(index, player.name)}
                            className="text-red-600 hover:text-red-800 px-2 py-1 rounded hover:bg-red-50"
                          >
                            Pardon
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <input
                  type="text"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder="Player name"
                  className="border border-gray-300 rounded px-3 py-2 flex-grow"
                  disabled={loading}
                />
                <input
                  type="text"
                  value={newPlayerReason}
                  onChange={(e) => setNewPlayerReason(e.target.value)}
                  placeholder="Reason"
                  className="border border-gray-300 rounded px-3 py-2 flex-grow"
                  disabled={loading}
                />
              </div>
              <div className="flex items-center gap-2">
                <span>Expires:</span>
                <label className="flex items-center mr-4">
                  <input
                    type="radio"
                    checked={newPlayerExpires === 'forever'}
                    onChange={() => setNewPlayerExpires('forever')}
                    className="mr-1"
                    disabled={loading}
                  />
                  Forever
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={newPlayerExpires !== 'forever'}
                    onChange={() => setNewPlayerExpires(new Date().toISOString().split('T')[0])}
                    className="mr-1"
                    disabled={loading}
                  />
                  Date:
                </label>
                <input
                  type="date"
                  value={newPlayerExpires !== 'forever' ? newPlayerExpires : ''}
                  onChange={(e) => setNewPlayerExpires(e.target.value)}
                  disabled={loading || newPlayerExpires === 'forever'}
                  className="border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <button 
                onClick={addToList} 
                disabled={loading || !newPlayerName}
                className="bg-indigo-600 text-white px-4 py-2 rounded disabled:bg-indigo-400 flex items-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Adding...
                  </>
                ) : 'Ban Player'}
              </button>
            </div>
          </div>
        )}

        {activeSubTab === 'banned-ips' && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Banned IPs</h3>
            {bannedIps.length === 0 ? (
              <p className="text-gray-500 mb-4">No banned IPs</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full bg-white border border-gray-200">
                  <thead>
                    <tr>
                      <th className="py-2 px-4 border-b">IP</th>
                      <th className="py-2 px-4 border-b">Reason</th>
                      <th className="py-2 px-4 border-b">Expires</th>
                      <th className="py-2 px-4 border-b">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bannedIps.map((ipEntry, index) => (
                      <tr key={index}>
                        <td className="py-2 px-4 border-b font-mono">{ipEntry.ip}</td>
                        <td className="py-2 px-4 border-b">{ipEntry.reason}</td>
                        <td className="py-2 px-4 border-b">{formatDate(ipEntry.expires)}</td>
                        <td className="py-2 px-4 border-b">
                          <button 
                            onClick={() => removeFromList(index, ipEntry.ip)}
                            className="text-red-600 hover:text-red-800 px-2 py-1 rounded hover:bg-red-50"
                          >
                            Pardon
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4 space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                <input
                  type="text"
                  value={newPlayerIp}
                  onChange={(e) => setNewPlayerIp(e.target.value)}
                  placeholder="IP address"
                  className="border border-gray-300 rounded px-3 py-2 flex-grow"
                  disabled={loading}
                />
                <input
                  type="text"
                  value={newPlayerReason}
                  onChange={(e) => setNewPlayerReason(e.target.value)}
                  placeholder="Reason"
                  className="border border-gray-300 rounded px-3 py-2 flex-grow"
                  disabled={loading}
                />
              </div>
              <div className="flex items-center gap-2">
                <span>Expires:</span>
                <label className="flex items-center mr-4">
                  <input
                    type="radio"
                    checked={newPlayerExpires === 'forever'}
                    onChange={() => setNewPlayerExpires('forever')}
                    className="mr-1"
                    disabled={loading}
                  />
                  Forever
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    checked={newPlayerExpires !== 'forever'}
                    onChange={() => setNewPlayerExpires(new Date().toISOString().split('T')[0])}
                    className="mr-1"
                    disabled={loading}
                  />
                  Date:
                </label>
                <input
                  type="date"
                  value={newPlayerExpires !== 'forever' ? newPlayerExpires : ''}
                  onChange={(e) => setNewPlayerExpires(e.target.value)}
                  disabled={loading || newPlayerExpires === 'forever'}
                  className="border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <button 
                onClick={addToList} 
                disabled={loading || !newPlayerIp}
                className="bg-indigo-600 text-white px-4 py-2 rounded disabled:bg-indigo-400 flex items-center"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Adding...
                  </>
                ) : 'Ban IP'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}