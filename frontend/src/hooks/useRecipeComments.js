import { useState, useEffect, useCallback } from 'react';
import { recipesApi } from '../api/client.js';

const PAGE_SIZE = 20;

/**
 * Hook for recipe comment list with pagination.
 *
 * @param {number} recipeId
 * @returns {{
 *   comments: Array,
 *   total: number,
 *   loading: boolean,
 *   hasMore: boolean,
 *   addComment: Function,
 *   deleteComment: Function,
 *   loadMore: Function,
 * }}
 */
export function useRecipeComments(recipeId) {
    const [comments, setComments] = useState([]);
    const [total, setTotal]       = useState(0);
    const [loading, setLoading]   = useState(false);
    const [offset, setOffset]     = useState(0);

    const fetchPage = useCallback(async (pageOffset, reset = false) => {
        if (!recipeId) return;
        setLoading(true);
        try {
            const data = await recipesApi.getComments(recipeId, { limit: PAGE_SIZE, offset: pageOffset });
            setComments(prev => reset ? data.comments : [...prev, ...data.comments]);
            setTotal(data.total);
            setOffset(pageOffset + data.comments.length);
        } catch {
            // silently fail — caller can retry
        } finally {
            setLoading(false);
        }
    }, [recipeId]);

    // Initial load
    useEffect(() => {
        setComments([]);
        setOffset(0);
        setTotal(0);
        fetchPage(0, true);
    }, [recipeId]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadMore = useCallback(() => {
        if (!loading) fetchPage(offset);
    }, [offset, loading, fetchPage]);

    const addComment = useCallback(async (text) => {
        const data = await recipesApi.addComment(recipeId, text);
        setComments(prev => [...prev, data.comment]);
        setTotal(t => t + 1);
        return data.comment;
    }, [recipeId]);

    const deleteComment = useCallback(async (commentId) => {
        await recipesApi.deleteComment(recipeId, commentId);
        setComments(prev => prev.filter(c => c.id !== commentId));
        setTotal(t => Math.max(0, t - 1));
    }, [recipeId]);

    const hasMore = comments.length < total;

    return { comments, total, loading, hasMore, addComment, deleteComment, loadMore };
}
