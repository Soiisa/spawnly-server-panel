import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../../../lib/supabaseClient';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import Link from 'next/link';
import { 
  ArrowLeftIcon, 
  Cog8ToothIcon, 
  CloudArrowUpIcon,
  CheckCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

import RichTextEditor from '../../../../components/RichTextEditor';
import { getGamesList } from '../../../../lib/gamesList'; 

export default function EditArticle() {
  const router = useRouter();
  const { id } = router.query;
  const { t } = useTranslation('common'); 
  const games = getGamesList(t); 
  
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [user, setUser] = useState(null);
  
  // Modal State
  const [showSettings, setShowSettings] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    game: 'general',
    language: 'en',
    tags: '', 
    content: '',
    is_published: false
  });

  useEffect(() => {
    if (!router.isReady || !id) return;

    const fetchArticleData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUser(session.user);
      
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', session.user.id).single();
      if (!profile?.is_admin) {
        router.push('/dashboard');
        return;
      }

      const { data: article, error } = await supabase.from('kb_articles').select('*').eq('id', id).single();

      if (error || !article) {
        alert('Article not found.');
        router.push('/admin/kb');
        return;
      }

      setFormData({
        title: article.title || '',
        slug: article.slug || '',
        game: article.game || 'general',
        language: article.language || 'en',
        tags: article.tags ? article.tags.join(', ') : '', 
        content: article.content || '',
        is_published: article.is_published
      });

      setLastSaved(new Date(article.updated_at));
      setFetching(false);
    };

    fetchArticleData();
  }, [router.isReady, id]);

  const handleUpdate = async (publishState) => {
    setLoading(true);
    const tagsArray = formData.tags.split(',').map(tag => tag.trim()).filter(Boolean);
    const timestamp = new Date().toISOString();

    const { error } = await supabase
      .from('kb_articles')
      .update({
        title: formData.title,
        slug: formData.slug || formData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        game: formData.game,
        language: formData.language,
        tags: tagsArray,
        content: formData.content,
        is_published: publishState,
        updated_at: timestamp
      })
      .eq('id', id);

    setLoading(false);

    if (error) {
      alert(`Error saving document: ${error.message}`);
    } else {
      setFormData(prev => ({ ...prev, is_published: publishState }));
      setLastSaved(new Date(timestamp));
      setShowSettings(false);
    }
  };

  if (fetching) {
    return <div className="h-screen w-screen bg-[#05070a] flex items-center justify-center text-gray-400">Loading document...</div>;
  }

  return (
    // FULL SCREEN LAYOUT
    <div className="flex flex-col h-screen overflow-hidden bg-[#05070a]">
      
      {/* WORD-LIKE TOP NAVIGATION BAR */}
      <header className="h-16 shrink-0 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 z-20">
        
        {/* Left: Back Button & Document Title */}
        <div className="flex items-center gap-4 flex-1">
          <Link 
            href="/admin/kb" 
            className="p-2 rounded-full text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          
          {/* Seamless Title Input */}
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({...formData, title: e.target.value})}
            className="bg-transparent border-none text-xl font-bold text-white placeholder-gray-600 focus:ring-0 p-0 w-full max-w-lg truncate hover:bg-gray-800 focus:bg-gray-800 rounded px-2 py-1 transition-colors"
            placeholder="Document Title..."
          />
        </div>

        {/* Right: Status & Actions */}
        <div className="flex items-center gap-3 shrink-0">
          
          <div className="hidden md:flex flex-col items-end mr-4">
            <span className={`text-xs font-semibold uppercase tracking-wider ${formData.is_published ? 'text-green-500' : 'text-yellow-500'}`}>
              {formData.is_published ? 'Live (Published)' : 'Draft Mode'}
            </span>
            {lastSaved && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <CheckCircleIcon className="w-3 h-3" /> Saved {lastSaved.toLocaleTimeString()}
              </span>
            )}
          </div>

          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 hover:text-white rounded-md transition-colors border border-gray-700"
          >
            <Cog8ToothIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Page Setup</span>
          </button>

          <div className="h-6 w-px bg-gray-700 mx-1"></div>

          <button
            onClick={() => handleUpdate(formData.is_published)}
            disabled={loading || !formData.title}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-md shadow-sm transition-colors"
          >
            <CloudArrowUpIcon className="w-4 h-4" />
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </header>

      {/* DOCUMENT EDITOR CANVAS */}
      {/* We pass the remaining height down to the RichTextEditor */}
      <div className="flex-grow overflow-hidden relative">
        <RichTextEditor 
          content={formData.content} 
          onChange={(html) => setFormData({...formData, content: html})} 
        />
      </div>

      {/* PAGE SETUP MODAL */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            
            <div className="flex items-center justify-between p-5 border-b border-gray-800 bg-gray-800/50">
              <h3 className="text-lg font-bold text-white">Document Settings</h3>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white transition-colors">
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">URL Slug</label>
                <input 
                  type="text" 
                  value={formData.slug}
                  onChange={(e) => setFormData({...formData, slug: e.target.value})}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md p-2.5 text-gray-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="auto-generated-if-empty"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Category / Game</label>
                  <select 
                    value={formData.game}
                    onChange={(e) => setFormData({...formData, game: e.target.value})}
                    className="w-full bg-gray-800 border border-gray-700 rounded-md p-2.5 text-white focus:border-indigo-500"
                  >
                    <option value="general">General (Website/Panel)</option>
                    {games.map(game => (
                      <option key={game.id} value={game.id}>{game.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Language</label>
                  <select 
                    value={formData.language}
                    onChange={(e) => setFormData({...formData, language: e.target.value})}
                    className="w-full bg-gray-800 border border-gray-700 rounded-md p-2.5 text-white focus:border-indigo-500"
                  >
                    <option value="en">English (en)</option>
                    <option value="pt">Portuguese (pt)</option>
                    <option value="es">Spanish (es)</option>
                    <option value="fr">French (fr)</option>
                    <option value="de">German (de)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Tags (Comma separated)</label>
                <input 
                  type="text" 
                  value={formData.tags}
                  onChange={(e) => setFormData({...formData, tags: e.target.value})}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md p-2.5 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="mods, plugins, setup"
                />
              </div>
            </div>

            <div className="p-5 border-t border-gray-800 bg-gray-800/30 flex justify-between items-center">
              <button 
                onClick={() => handleUpdate(!formData.is_published)}
                disabled={loading}
                className={`text-sm font-medium px-4 py-2 rounded-md border transition-colors ${
                  formData.is_published 
                    ? 'text-yellow-500 border-yellow-700/50 hover:bg-yellow-900/30' 
                    : 'text-green-400 border-green-700/50 hover:bg-green-900/30'
                }`}
              >
                {formData.is_published ? 'Unpublish (Switch to Draft)' : 'Publish to Live Site'}
              </button>

              <button 
                onClick={() => setShowSettings(false)}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-md shadow-sm transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export async function getServerSideProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale ?? 'en', ['common', 'dashboard'])),
    },
  };
}