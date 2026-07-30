// components/RichTextEditor.js
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Youtube from '@tiptap/extension-youtube';
import TextStyle from '@tiptap/extension-text-style'; // <-- Fixed import
import FontFamily from '@tiptap/extension-font-family'; // <-- Added
import Underline from '@tiptap/extension-underline'; // <-- Added to keep Word/Docs underlines
import { Extension } from '@tiptap/core'; // <-- Added for custom FontSize
import { useCallback, useState } from 'react';
import { supabase } from '../../../../lib/supabaseClient';

// --- CUSTOM EXTENSIONS TO RETAIN PASTE FORMATTING ---

// 1. Custom Font Size Extension
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return { types: ['textStyle'] };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: element => element.style.fontSize?.replace(/['"]+/g, ''),
            renderHTML: attributes => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize: fontSize => ({ chain }) => chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize: () => ({ chain }) => chain().setMark('textStyle', { fontSize: null }).run(),
    };
  },
});

// 2. Resizable Image (Your existing code)
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: '100%',
        parseHTML: element => element.getAttribute('width') || element.style.width,
        renderHTML: attributes => ({ width: attributes.width }),
      },
      align: {
        default: 'center',
        parseHTML: element => element.getAttribute('data-align') || 'center',
        renderHTML: attributes => ({ 'data-align': attributes.align }),
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    let style = `width: ${HTMLAttributes.width || '100%'}; transition: width 0.2s ease; cursor: pointer; border-radius: 0.75rem;`;
    if (HTMLAttributes['data-align'] === 'left') style += ' float: left; margin: 0.5rem 1.5rem 0.5rem 0; clear: left;';
    else if (HTMLAttributes['data-align'] === 'right') style += ' float: right; margin: 0.5rem 0 0.5rem 1.5rem; clear: right;';
    else style += ' display: block; margin: 1.5rem auto;';
    return ['img', { ...HTMLAttributes, style }];
  }
});

export default function RichTextEditor({ content, onChange }) {
  const [isUploading, setIsUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      FontFamily, // Fixes missing font families on paste
      FontSize,   // Fixes missing font sizes on paste
      Underline,  // Fixes missing underlines on paste
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      ResizableImage,
      Link.configure({ 
        openOnClick: false,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer', class: 'text-indigo-400 underline hover:text-indigo-300 transition-colors' }
      }),
      Youtube.configure({
        controls: true,
        nocookie: true,
        allowFullscreen: true,
        HTMLAttributes: {
          class: 'w-full aspect-video rounded-xl shadow-lg my-8 border border-gray-800 bg-black'
        }
      }),
    ],
    content: content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-indigo max-w-none focus:outline-none prose-img:shadow-lg prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-700',
      },
    },
  });

  // --- HANDLERS ---
  const handleImageUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file || !editor) return;
    setIsUploading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/kb/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        editor.chain().focus().setImage({ src: data.url, width: '100%', align: 'center' }).run();
      } else {
        alert('Upload failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      alert('Upload error: ' + error.message);
    } finally {
      setIsUploading(false);
      event.target.value = ''; 
    }
  }, [editor]);

  const setLink = useCallback(() => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Enter link URL:', previousUrl || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const setVideo = useCallback(() => {
    const url = window.prompt('Enter YouTube URL:');
    if (url) {
      editor.chain().focus().setYoutubeVideo({ src: url }).run();
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="flex flex-col h-full w-full bg-[#05070a]">
      
      {/* THE RIBBON */}
      <div className="shrink-0 w-full flex flex-wrap items-center gap-1.5 p-2 bg-gray-800 border-b border-gray-700 shadow-sm z-10 px-4">
        
        {/* History */}
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-30 transition-colors" title="Undo"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></button>
          <button type="button" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-30 transition-colors" title="Redo"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" /></svg></button>
        </div>
        <div className="h-5 w-px bg-gray-700 mx-1"></div>

        {/* Typography */}
        <div className="flex items-center gap-2">
          <select onChange={(e) => editor.chain().focus().setFontFamily(e.target.value).run()} value={editor.getAttributes('textStyle').fontFamily || ''} className="bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded px-2 py-1 focus:ring-indigo-500 focus:border-indigo-500">
            <option value="">Default Font</option>
            <option value="Arial">Arial</option>
            <option value="Courier New">Courier New</option>
            <option value="Georgia">Georgia</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Verdana">Verdana</option>
          </select>
          <select onChange={(e) => editor.chain().focus().setFontSize(e.target.value).run()} value={editor.getAttributes('textStyle').fontSize || ''} className="bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded px-2 py-1 w-20 focus:ring-indigo-500 focus:border-indigo-500">
            <option value="">Size</option>
            <option value="12px">12px</option>
            <option value="14px">14px</option>
            <option value="16px">16px</option>
            <option value="20px">20px</option>
            <option value="24px">24px</option>
            <option value="36px">36px</option>
          </select>
        </div>
        <div className="h-5 w-px bg-gray-700 mx-1"></div>

        {/* Basic Formatting & Clear */}
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={`px-2 py-1 text-sm font-bold rounded transition-colors ${editor.isActive('bold') ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}>B</button>
          <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={`px-2 py-1 text-sm italic font-serif rounded transition-colors ${editor.isActive('italic') ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}>I</button>
          <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={`px-2 py-1 text-sm underline rounded transition-colors ${editor.isActive('underline') ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}>U</button>
          <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={`px-2 py-1 text-sm line-through rounded transition-colors ${editor.isActive('strike') ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}>S</button>
          <button type="button" onClick={() => editor.chain().focus().unsetAllMarks().run()} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors ml-1" title="Clear Formatting"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></button>
        </div>
        <div className="h-5 w-px bg-gray-700 mx-1"></div>

        {/* Alignment */}
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => editor.chain().focus().setTextAlign('left').run()} className={`p-1.5 rounded transition-colors ${editor.isActive({ textAlign: 'left' }) ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h10M4 18h16" /></svg></button>
          <button type="button" onClick={() => editor.chain().focus().setTextAlign('center').run()} className={`p-1.5 rounded transition-colors ${editor.isActive({ textAlign: 'center' }) ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M7 12h10M4 18h16" /></svg></button>
        </div>
        <div className="h-5 w-px bg-gray-700 mx-1"></div>

        {/* Elements (Link, Quote, Code, Rule) */}
        <div className="flex items-center gap-1">
          <button type="button" onClick={setLink} className={`p-1.5 rounded transition-colors ${editor.isActive('link') ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`} title="Link"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg></button>
          <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={`p-1.5 rounded transition-colors ${editor.isActive('blockquote') ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`} title="Quote"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" /></svg></button>
          <button type="button" onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={`p-1.5 rounded transition-colors ${editor.isActive('codeBlock') ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'}`} title="Code"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg></button>
          <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} className="p-1.5 text-gray-300 hover:bg-gray-700 hover:text-white rounded transition-colors" title="Divider"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14" /></svg></button>
        </div>

        <div className="flex-1" />
        
        {/* Dynamic Image Sizing Toolbar */}
        {editor.isActive('image') && (
          <div className="flex items-center gap-3 bg-indigo-900/40 px-3 py-1 rounded border border-indigo-700/50 mr-2 animate-fade-in">
            <div className="flex items-center gap-1 border-r border-indigo-700/50 pr-3">
              <span className="text-xs font-semibold text-indigo-300 mr-1 hidden sm:inline">Wrap:</span>
              <button onClick={() => editor.chain().focus().updateAttributes('image', { align: 'left' }).run()} className={`p-1 rounded transition-colors ${editor.getAttributes('image').align === 'left' ? 'bg-indigo-600 text-white' : 'text-indigo-300 hover:bg-indigo-800'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h8M4 10h8M4 14h8M4 18h16M16 6l4 4-4 4" /></svg></button>
              <button onClick={() => editor.chain().focus().updateAttributes('image', { align: 'center' }).run()} className={`p-1 rounded transition-colors ${editor.getAttributes('image').align === 'center' ? 'bg-indigo-600 text-white' : 'text-indigo-300 hover:bg-indigo-800'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M7 12h10M4 18h16" /></svg></button>
              <button onClick={() => editor.chain().focus().updateAttributes('image', { align: 'right' }).run()} className={`p-1 rounded transition-colors ${editor.getAttributes('image').align === 'right' ? 'bg-indigo-600 text-white' : 'text-indigo-300 hover:bg-indigo-800'}`}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6h8M12 10h8M12 14h8M4 18h16M8 6L4 10l4 4" /></svg></button>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold text-indigo-300 mr-1 hidden sm:inline">Size:</span>
              {['25%', '50%', '75%', '100%'].map(size => (
                <button key={size} onClick={() => editor.chain().focus().updateAttributes('image', { width: size }).run()} className={`text-xs px-2 py-1 rounded transition-colors ${editor.getAttributes('image').width === size ? 'bg-indigo-600 text-white shadow-sm' : 'text-indigo-300 hover:bg-indigo-800'}`}>{size}</button>
              ))}
            </div>
          </div>
        )}
        
        {/* Insert Video Button */}
        <button type="button" onClick={setVideo} className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-md text-gray-300 hover:bg-gray-700 hover:text-white transition-colors border border-transparent hover:border-gray-600" title="Embed YouTube Video">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          <span className="hidden sm:inline">Video</span>
        </button>

        {/* Insert Image Button */}
        <input type="file" id="kb-image-upload" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={isUploading} />
        <label htmlFor="kb-image-upload" className={`flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-md cursor-pointer transition-colors shadow-sm ml-1 ${isUploading ? 'bg-gray-700 text-gray-500' : 'bg-white text-gray-900 hover:bg-gray-200'}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          {isUploading ? 'Uploading...' : 'Image'}
        </label>
      </div>

      {/* THE APP BACKDROP */}
      <div className="flex-grow overflow-y-auto bg-[#05070a] p-4 sm:p-8 lg:p-12 cursor-text" onClick={() => editor.commands.focus()}>
        <div className="mx-auto w-full max-w-4xl bg-gray-900 shadow-2xl ring-1 ring-gray-800 rounded-sm min-h-[1056px] p-8 sm:p-12 md:p-16 mb-20 cursor-text" onClick={(e) => e.stopPropagation()}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
