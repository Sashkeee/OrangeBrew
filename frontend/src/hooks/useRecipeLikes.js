import { useState, useEffect, useCallback } from 'react';
import { recipesApi } from '../api/client.js';

/**
 * Hook for recipe like functionality.
 * Provides optimistic UI updates on toggle.
 *
 * @param {number} recipeId
 * @returns {{ count: number, isLiked: boolean, toggle: Function, loading: boolean }}
 */
export function useRecipeLikes(recipeId) {
    const [count, setCount]     = useState(0);
    const [isLiked, setIsLiked] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!recipeId) return;
        let cancelled = false;
        recipesApi.getLikes(recipeId)
            .then(data => { if (!cancelled) { setCount(data.count); setIsLiked(data.isLiked); } })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [recipeId]);

    const toggle = useCallback(async () => {
        if (loading) return;

        // Optimistic update
        const wasLiked = isLiked;
        setIsLiked(!wasLiked);
        setCount(c => wasLiked ? Math.max(0, c - 1) : c + 1);

        setLoading(true);
        try {
            const data = await recipesApi.toggleLike(recipeId);
            setCount(data.count);
            setIsLiked(data.liked);
        } catch {
            // Revert on error
            setIsLiked(wasLiked);
            setCount(c => wasLiked ? c + 1 : Math.max(0, c - 1));
        } finally {
            setLoading(false);
        }
    }, [recipeId, isLiked, loading]);

    return { count, isLiked, toggle, loading };
}
