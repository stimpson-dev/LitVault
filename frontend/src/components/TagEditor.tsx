import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { getDocumentTags, addDocumentTag, removeDocumentTag } from '@/lib/api';
import type { TagItem } from '@/lib/types';

interface Props {
  docId: number;
}

export function TagEditor({ docId }: Props) {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [newTag, setNewTag] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchTags = () => {
    setLoading(true);
    getDocumentTags(docId)
      .then((data) => setTags(data))
      .catch(() => setTags([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTags();
  }, [docId]);

  const handleAdd = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const name = newTag.trim();
    if (!name) return;
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) return;
    try {
      await addDocumentTag(docId, name);
      setNewTag('');
      fetchTags();
    } catch {
      // silently fail
    }
  };

  const handleRemove = async (tagId: number) => {
    try {
      await removeDocumentTag(docId, tagId);
      fetchTags();
    } catch {
      // silently fail
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {loading && tags.length === 0 ? null : (
          tags.map((tag) => (
            <span
              key={tag.id}
              className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${
                tag.source === 'ai' ? 'bg-zinc-700 text-zinc-200' : 'bg-blue-700 text-white'
              }`}
            >
              {tag.source === 'ai' && (
                <span className="text-zinc-400 text-[10px] font-medium">AI</span>
              )}
              {tag.name}
              <button
                onClick={() => handleRemove(tag.id)}
                className="hover:text-white cursor-pointer"
                aria-label={`Tag ${tag.name} entfernen`}
              >
                <X size={10} />
              </button>
            </span>
          ))
        )}
        <input
          type="text"
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={handleAdd}
          placeholder="Tag hinzufügen..."
          className="text-sm bg-zinc-800 border-none rounded px-2 py-1 text-zinc-200 placeholder-zinc-500 outline-none"
        />
      </div>
    </div>
  );
}
