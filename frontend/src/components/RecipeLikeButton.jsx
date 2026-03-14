import React from 'react';
import { motion } from 'framer-motion';
import { Heart } from 'lucide-react';
import { useRecipeLikes } from '../hooks/useRecipeLikes.js';

/**
 * RecipeLikeButton — heart icon with count, animated on click.
 *
 * Props:
 *   recipeId  {number}  — recipe to like/unlike
 *   size      {number}  — icon size (default 18)
 */
export default function RecipeLikeButton({ recipeId, size = 18 }) {
    const { count, isLiked, toggle, loading } = useRecipeLikes(recipeId);

    return (
        <motion.button
            onClick={(e) => { e.stopPropagation(); toggle(); }}
            disabled={loading}
            whileTap={{ scale: 0.85 }}
            title={isLiked ? 'Убрать лайк' : 'Лайкнуть'}
            aria-label={isLiked ? 'Убрать лайк' : 'Лайкнуть'}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                background: 'none',
                border: 'none',
                cursor: loading ? 'default' : 'pointer',
                color: isLiked ? '#e53935' : 'var(--text-secondary)',
                fontSize: '0.85rem',
                padding: '0.3rem 0.5rem',
                borderRadius: '4px',
                transition: 'color 0.15s',
            }}
        >
            <motion.span
                animate={{ scale: isLiked ? [1, 1.4, 1] : 1 }}
                transition={{ duration: 0.25 }}
                style={{ display: 'flex' }}
            >
                <Heart
                    size={size}
                    fill={isLiked ? 'currentColor' : 'none'}
                />
            </motion.span>
            {count > 0 && <span>{count}</span>}
        </motion.button>
    );
}
