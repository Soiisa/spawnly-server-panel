// pages/dashboard.js

import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { useRouter } from "next/router";
import CreateServerForm from "./CreateServerForm";
import Link from 'next/link';
import ServerStatusIndicator from "../components/ServerStatusIndicator";
import Header from "../components/ServersHeader";
import Footer from "../components/ServersFooter";

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [servers, setServers] = useState([]);
  const [credits, setCredits] = useState(0);
  const [isLoadingServers, setIsLoadingServers] = useState(true);
  const [error, setError] = useState(null);

  // Polling and mounted refs
  const pollingRef = useRef(false);
  const [isPolling, setIsPolling] = useState(false);
  const mountedRef = useRef(false);
  const pollingIntervalRef = useRef(null);
  const realtimeChannelRef = useRef(null);

  const transitionalStates = ['Initializing', 'Starting', 'Stopping', 'Restarting'];

  useEffect(() => {
    mountedRef.current = true;

    const fetchSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      
      if (!data.session) {
        router.push("/login");
      } else {
        setUser(data.session.user);
        await fetchUserCredits(data.session.user.id);
        fetchServers(data.session.user.id);
      }
      setLoading(false);
    };

    fetchSession();

    return () => {
      mountedRef.current = false;
      pollingRef.current = false;
      setIsPolling(false);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      if (realtimeChannelRef.current) {
        // Unsubscribe from each channel individually
        supabase.removeChannel(realtimeChannelRef.current.serverChannel);
        supabase.removeChannel(realtimeChannelRef.current.profileChannel);
        realtimeChannelRef.current = null;
      }
    };
  }, []);

  // Set up real-time subscriptions after user is set
  useEffect(() => {
    if (!user?.id) return;

    // Subscribe to servers table
    const serverChannel = supabase
      .channel(`user-servers-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'servers',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          if (!mountedRef.current) return;
          setServers((prev) =>
            prev.map((s) => (s.id === payload.new.id ? payload.new : s))
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'servers',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          if (!mountedRef.current) return;
          setServers((prev) => [payload.new, ...prev.filter(s => !s.id.startsWith('temp-'))]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'servers',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          if (!mountedRef.current) return;
          setServers((prev) => prev.filter((s) => s.id !== payload.old.id));
        }
      )
      .subscribe();

    // Subscribe to profiles table for credits
    const profileChannel = supabase
      .channel(`user-profile-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`
        },
        (payload) => {
          if (!mountedRef.current) return;
          console.log('Profile updated, new credits:', payload.new.credits);
          setCredits(payload.new.credits || 0);
        }
      )
      .subscribe();

    realtimeChannelRef.current = { serverChannel, profileChannel };

    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current.serverChannel);
        supabase.removeChannel(realtimeChannelRef.current.profileChannel);
        realtimeChannelRef.current = null;
      }
    };
  }, [user?.id]);

  // Start polling if there are transitional servers
  useEffect(() => {
    if (!user?.id || isPolling) return;

    const hasTransitional = servers.some((s) =>
      transitionalStates.includes(s.status)
    );

    if (hasTransitional) {
      startPolling();
    }
  }, [servers, user?.id, isPolling]);

  const setPolling = (val) => {
    pollingRef.current = val;
    if (mountedRef.current) setIsPolling(val);
  };

  const startPolling = () => {
    if (pollingRef.current || !mountedRef.current) return;
    setPolling(true);

    pollingIntervalRef.current = setInterval(async () => {
      if (!mountedRef.current || !pollingRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
        return;
      }

      const transitional = servers.filter(
        (s) => transitionalStates.includes(s.status) && s.hetzner_id
      );

      if (transitional.length === 0) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
        setPolling(false);
        return;
      }

      for (const srv of transitional) {
        try {
          const resp = await fetch(
            `/api/servers/hetzner-status?hetznerId=${encodeURIComponent(srv.hetzner_id)}`
          );
          if (resp.ok) {
            const j = await resp.json();
            const mapped = j.mapped || null;
            
            // Only update if status changed
            if (mapped && mapped !== srv.status) {
              setServers(prev => 
                prev.map(server => 
                  server.id === srv.id ? { ...server, status: mapped } : server
                )
              );
              
              await fetch('/api/servers/set-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverId: srv.id, status: mapped }),
              });
            }
          }
        } catch (e) {
          console.warn(`Polling error for server ${srv.id}:`, e);
        }
      }
    }, 3000);
  };

  const fetchUserCredits = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error('Error fetching credits:', error.message);
        setError('Failed to load credits. Please try again.');
        return;
      }

      if (data) {
        console.log('Fetched credits:', data.credits);
        setCredits(data.credits || 0);
      } else {
        console.warn('No profile data found for user:', userId);
        setError('No profile found. Please contact support.');
      }
    } catch (err) {
      console.error('Unexpected error fetching credits:', err.message);
      setError('Unexpected error loading credits.');
    }
  };

  const fetchServers = async (userId) => {
    setIsLoadingServers(true);
    const { data, error } = await supabase
      .from('servers')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
      
    if (data) {
      setServers(data);
    } else if (error) {
      console.error("Error fetching servers:", error);
      setError("Failed to load servers. Please try again.");
    }
    setIsLoadingServers(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleCreateServer = async (serverData) => {
    if (!user) return;

    const cost = parseFloat(serverData.costPerHour);
    if (credits < cost) {
      alert("You don't have enough credits to create this server");
      return;
    }

    const tempServerId = `temp-${Date.now()}`;
    const optimisticServer = {
      id: tempServerId,
      name: serverData.name,
      game: serverData.game || 'minecraft',
      type: serverData.software || 'paper',
      version: serverData.version || null,
      ram: serverData.ram || 4,
      cost_per_hour: cost,
      status: "Stopped",
      user_id: user.id,
      created_at: new Date().toISOString(),
      hetzner_id: null,
      ipv4: null,
    };

    setServers((prevServers) => [optimisticServer, ...prevServers]);
    setShowModal(false);

    try {
      const resp = await fetch('/api/servers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: serverData.name,
          game: serverData.game || 'minecraft',
          software: serverData.software || 'paper',
          version: serverData.version || null,
          ram: serverData.ram || 4,
          costPerHour: cost,
          userId: user.id,
        }),
      });

      const json = await resp.json();
      if (!resp.ok) {
        console.error('Create API error', json);
        setServers((prevServers) => prevServers.filter((server) => server.id !== tempServerId));
        setError(`Failed to create server: ${json.error || 'unknown'}`);
        alert(`Failed to create server: ${json.error || 'unknown'}`);
        return;
      }

      const newCredits = credits - cost;
      await supabase
        .from('profiles')
        .update({ credits: newCredits })
        .eq('id', user.id);
      setCredits(newCredits);

      // Navigate to the new server's details page
      const newServerId = json.server?.id;
      if (newServerId) {
        router.push(`/server/${newServerId}`);
      } else {
        console.warn('No server ID in response, waiting for realtime update');
        // Fallback: Poll for the server ID
        const waitForServer = async () => {
          for (let i = 0; i < 10; i++) {
            const { data } = await supabase
              .from('servers')
              .select('id')
              .eq('user_id', user.id)
              .eq('name', serverData.name)
              .single();
            if (data?.id && !data.id.startsWith('temp-')) {
              router.push(`/server/${data.id}`);
              return;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          setError('Failed to retrieve new server ID');
          alert('Failed to retrieve new server ID');
        };
        waitForServer();
      }
    } catch (err) {
      console.error('Create error', err);
      setServers((prevServers) => prevServers.filter((server) => server.id !== tempServerId));
      setError('Failed to create server');
      alert('Failed to create server');
    }
  };

  const handleDeleteServer = async (serverId) => {
    if (!confirm('Are you sure you want to delete this server? This will remove the instance and its data.')) return;

    try {
      const resp = await fetch('/api/servers/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, action: 'delete' }),
      });

      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        console.error('Delete API error', j);
        alert('Failed to delete server: ' + (j.error || 'unknown error'));
        return;
      }
    } catch (err) {
      console.error('Delete error', err);
      alert('Failed to delete server');
    }
  };

  const handleStartServer = async (server) => {
    if (!server || typeof server !== 'object' || !server.id) {
      alert('Invalid server data');
      return;
    }
    try {
      if (!server.hetzner_id) {
        console.log('Provisioning and starting server on Hetzner...');
        const provisionRes = await fetch('/api/servers/provision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serverId: server.id }),
        });

        if (!provisionRes.ok) {
          const errText = await provisionRes.text();
          throw new Error(`Provision failed: ${errText}`);
        }
      } else {
        console.log('Starting existing server...');
        const startRes = await fetch('/api/servers/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serverId: server.id, action: 'start' }),
        });

        if (!startRes.ok) {
          const errText = await startRes.text();
          throw new Error(`Start failed: ${errText}`);
        }
      }
      console.log('Server started successfully!');
    } catch (err) {
      console.error('Start API error:', err.message, err.stack);
      alert(`Failed to start server: ${err.message}`);
    }
  };

  const handleStopServer = async (serverId) => {
    try {
      const resp = await fetch('/api/servers/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, action: 'stop' }),
      });

      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        console.error('Stop API error', j);
        alert('Failed to stop server: ' + (j.error || 'unknown error'));
        return;
      }
    } catch (err) {
      console.error('Stop error', err);
      alert('Failed to stop server');
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading dashboard...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg mx-4 md:mx-8 mb-6 flex justify-between items-center">
          <p>{error}</p>
          <button onClick={() => setError(null)} className="text-red-800">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      <Header user={user} credits={credits} onLogout={handleLogout} />

      <main className="p-4 md:p-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Your Game Servers</h1>
            <p className="text-gray-600 mt-1">Create and manage your game servers</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded-lg flex items-center transition"
            disabled={isLoadingServers}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Create Server
          </button>
        </div>

        {isLoadingServers && servers.length === 0 ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          </div>
        ) : servers.length === 0 ? (
          <div className="bg-white rounded-2xl shadow p-8 text-center max-w-2xl mx-auto mt-10">
            <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No servers yet</h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              You haven't created any game servers yet. Click "Create Server" to get started.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-6 rounded-lg"
              disabled={isLoadingServers}
            >
              Create Your First Server
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {servers.map((server) => (
              <div
                key={server.id}
                className="bg-white p-6 rounded-xl shadow hover:shadow-lg transition border-l-4 border-indigo-500"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h2 className="font-bold text-xl text-gray-900 mb-1">{server.name}</h2>
                    <div className="flex items-center">
                      <span className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded mr-2">
                        {server.game.charAt(0).toUpperCase() + server.game.slice(1)}
                      </span>
                      <ServerStatusIndicator server={server} />
                      {server.id.startsWith('temp-') && (
                        <span className="ml-2 text-gray-500 text-xs">Creating...</span>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDeleteServer(server.id)}
                    className="text-gray-400 hover:text-red-500 transition"
                    disabled={server.status === "Initializing" || server.id.startsWith('temp-')}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
                
                <div className="space-y-3 mb-4">
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                      </svg>
                      <span className="text-gray-600">RAM:</span>
                    </div>
                    <span className="font-medium">{server.ram} GB</span>
                  </div>
                  
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-gray-600">Cost:</span>
                    </div>
                    <span className="font-medium">${server.cost_per_hour.toFixed(2)}/hr</span>
                  </div>
                  
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span className="text-gray-600">IP Address:</span>
                    </div>
                    <span className="font-medium text-sm">{server.ipv4 || 'Not assigned'}</span>
                  </div>
                </div>
                
                <div className="flex space-x-2">
                  {server.status === "Stopped" ? (
                    <button 
                      onClick={() => handleStartServer(server)}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg transition flex items-center justify-center"
                      disabled={server.id.startsWith('temp-')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Start Server
                    </button>
                  ) : server.status === "Running" ? (
                    <button 
                      onClick={() => handleStopServer(server.id)}
                      className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white py-2 rounded-lg transition flex items-center justify-center"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                      </svg>
                      Stop Server
                    </button>
                  ) : (
                    <button 
                      disabled
                      className="flex-1 bg-gray-300 text-gray-500 py-2 rounded-lg flex items-center justify-center cursor-not-allowed"
                    >
                      {server.status === "Starting" ? "Starting..." : server.status === "Initializing" ? "Initializing..." : "Stopping..."}
                    </button>
                  )}
                  
                  <Link 
                    href={server.id.startsWith('temp-') ? '#' : `/server/${server.id}`}
                    className={`bg-gray-100 text-gray-800 py-2 px-3 rounded-lg flex items-center justify-center ${server.id.startsWith('temp-') ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-200'}`}
                    onClick={(e) => {
                      if (server.id.startsWith('temp-')) {
                        e.preventDefault();
                        alert('Server is still being created. Please wait a moment.');
                      }
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showModal && (
        <CreateServerForm
          onClose={() => setShowModal(false)}
          onCreate={handleCreateServer}
          credits={credits}
        />
      )}

      <div className="mt-12 px-4 md:px-8">
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl shadow-lg p-6 text-white">
          <h3 className="text-xl font-bold mb-4">Your Server Stats</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-indigo-400 bg-opacity-30 p-4 rounded-xl">
              <p className="text-sm">Total Servers</p>
              <p className="text-2xl font-bold">{servers.length}</p>
            </div>
            <div className="bg-indigo-400 bg-opacity-30 p-4 rounded-xl">
              <p className="text-sm">Active Servers</p>
              <p className="text-2xl font-bold">
                {servers.filter(s => s.status === "Running").length}
              </p>
            </div>
            <div className="bg-indigo-400 bg-opacity-30 p-4 rounded-xl">
              <p className="text-sm">Total RAM</p>
              <p className="text-2xl font-bold">
                {servers.reduce((sum, server) => sum + server.ram, 0)} GB
              </p>
            </div>
            <div className="bg-indigo-400 bg-opacity-30 p-4 rounded-xl">
              <p className="text-sm">Estimated Cost</p>
              <p className="text-2xl font-bold">
                ${servers.reduce((sum, server) => sum + server.cost_per_hour, 0).toFixed(2)}/hr
              </p>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}