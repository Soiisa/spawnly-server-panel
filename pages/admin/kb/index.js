import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { PlusIcon, PencilSquareIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';

import ServersHeader from '../../../components/ServersHeader';
import ServersFooter from '../../../components/ServersFooter';
import { getGamesList } from '../../../lib/gamesList';

export default function AdminKBDashboard() {
  const router = useRouter();
  const { t } = useTranslation('common');
  const games = getGamesList(t);

  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Header state
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(0);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newArticle, setNewArticle] = useState({
    title: '',
    slug: '',
    game: 'general',
    language: 'en',
    tags: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      router.push('/login');
      return;
    }
    setUser(session.user);
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits, is_admin')
      .eq('id', session.user.id)
      .single();
      
    if (profile) setCredits(profile.credits);

    if (!profile?.is_admin) {
      router.push('/dashboard');
      return;
    }

    const { data: kbData, error } = await supabase
      .from('kb_articles')
      .select('*')
      .order('updated_at', { ascending: false });

    if (!error && kbData) {
      setArticles(kbData);
    }
    
    setLoading(false);
  };

  const handleCreateArticle = async (e) => {
    e.preventDefault();
    setIsCreating(true);

    const tagsArray = newArticle.tags.split(',').map(tag => tag.trim()).filter(Boolean);

    const { data, error } = await supabase
      .from('kb_articles')
      .insert([{
        title: newArticle.title,
        slug: newArticle.slug || newArticle.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        game: newArticle.game,
        language: newArticle.language,
        tags: tagsArray,
        content: '',
        is_published: false,
        author_id: user.id
      }])
      .select()
      .single();

    setIsCreating(false);

    if (error) {
      alert(`Error creating article: ${error.message}`);
    } else if (data) {
      setIsModalOpen(false);
      router.push(`/admin/kb/edit/${data.id}`);
    }
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Are you sure you want to delete the article: "${title}"? This cannot be undone.`)) return;

    const { error } = await supabase.from('kb_articles').delete().eq('id', id);

    if (error) {
      alert(`Error deleting article: ${error.message}`);
    } else {
      setArticles(articles.filter(article => article.id !== id));
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#0d1117]">
      
      {user ? (
        <ServersHeader user={user} credits={credits} isLoading={false} onLogout={handleLogout} />
      ) : (
        <div className="h-16 w-full bg-[#0d1117] animate-pulse border-b border-slate-800"></div>
      )}

      <main className="flex-grow w-full max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8 text-gray-100 relative">
        
        <div className="sm:flex sm:items-center sm:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Knowledge Base Management</h1>
            <p className="mt-2 text-sm text-gray-400">
              Create, edit, and manage all your guides and tutorials.
            </p>
          </div>
          <div className="mt-4 sm:mt-0">
            <button 
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-md shadow-sm transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
              New Article
            </button>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-800">
              <thead className="bg-gray-800/50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Title</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Game</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Lang</th> {/* <-- NEW */}
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Last Updated</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 bg-gray-900">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-gray-500">Loading articles...</td>
                  </tr>
                ) : articles.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                      No articles found. Click "New Article" to get started!
                    </td>
                  </tr>
                ) : (
                  articles.map((article) => (
                    <tr key={article.id} className="hover:bg-gray-800/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-white">{article.title}</div>
                        <div className="text-xs text-gray-500 truncate max-w-xs">/{article.slug}</div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-800 text-gray-300 uppercase tracking-wider border border-gray-700">
                          {article.game === 'general' ? 'General' : games.find(g => g.id === article.game)?.name || article.game}
                        </span>
                      </td>

                      {/* NEW: LANGUAGE BADGE */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-xs font-bold text-slate-400 uppercase bg-slate-800 border border-slate-700 px-2 py-1 rounded">
                          {article.language}
                        </span>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        {article.is_published ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900/50 text-green-400 border border-green-800">
                            Published
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-900/50 text-yellow-400 border border-yellow-800">
                            Draft
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                        {new Date(article.updated_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-3">
                          <Link href={`/admin/kb/edit/${article.id}`} className="text-indigo-400 hover:text-indigo-300 transition-colors" title="Edit">
                            <PencilSquareIcon className="w-5 h-5" />
                          </Link>
                          <button onClick={() => handleDelete(article.id, article.title)} className="text-red-400 hover:text-red-300 transition-colors" title="Delete">
                            <TrashIcon className="w-5 h-5" />
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
      </main>

      <ServersFooter />

      {/* Creation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-gray-900 border border-gray-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            
            <div className="flex items-center justify-between p-6 border-b border-gray-800">
              <h3 className="text-xl font-bold text-white">Create New Article</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleCreateArticle} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Title</label>
                <input 
                  type="text" 
                  required
                  value={newArticle.title}
                  onChange={(e) => setNewArticle({...newArticle, title: e.target.value})}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md p-2.5 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="e.g., How to install Oxide"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Category / Game</label>
                  <select 
                    value={newArticle.game}
                    onChange={(e) => setNewArticle({...newArticle, game: e.target.value})}
                    className="w-full bg-gray-800 border border-gray-700 rounded-md p-2.5 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
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
                    value={newArticle.language}
                    onChange={(e) => setNewArticle({...newArticle, language: e.target.value})}
                    className="w-full bg-gray-800 border border-gray-700 rounded-md p-2.5 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="en">English</option>
                    <option value="pt">Portuguese</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">URL Slug (Optional)</label>
                <input 
                  type="text" 
                  value={newArticle.slug}
                  onChange={(e) => setNewArticle({...newArticle, slug: e.target.value})}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md p-2.5 text-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="how-to-install-oxide"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Tags (Comma separated)</label>
                <input 
                  type="text" 
                  value={newArticle.tags}
                  onChange={(e) => setNewArticle({...newArticle, tags: e.target.value})}
                  className="w-full bg-gray-800 border border-gray-700 rounded-md p-2.5 text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  placeholder="mods, setup, plugins"
                />
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-gray-800 mt-6">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isCreating || !newArticle.title}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-md shadow-sm transition-colors disabled:opacity-50 flex items-center"
                >
                  {isCreating ? 'Creating...' : 'Create Article'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await serverSideTranslations(locale ?? 'en', ['common', 'dashboard'])),
    },
  };
}