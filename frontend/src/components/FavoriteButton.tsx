import { useState } from 'react';
import { Heart } from 'lucide-react';
import { toggleFavorite } from '@/lib/api';
import { useTranslation } from '@/i18n';

interface FavoriteButtonProps {
  docId: number;
  favorited?: boolean;
  onToggle?: (favorited: boolean) => void;
}

export function FavoriteButton({ docId, favorited = false, onToggle }: FavoriteButtonProps) {
  const { t } = useTranslation();
  const [isFavorited, setIsFavorited] = useState(favorited);
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent row click
    if (loading) return;
    setLoading(true);
    try {
      const result = await toggleFavorite(docId);
      setIsFavorited(result.favorited);
      onToggle?.(result.favorited);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="p-1 rounded hover:bg-zinc-800 transition-colors"
      title={isFavorited ? t('favorites.remove') : t('favorites.add')}
    >
      <Heart
        size={16}
        className={isFavorited ? 'fill-red-500 text-red-500' : 'text-zinc-500 hover:text-zinc-300'}
      />
    </button>
  );
}
