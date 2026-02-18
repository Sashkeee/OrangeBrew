import { useState, useEffect, useCallback } from 'react';
import { recipesApi } from '../api/client.js';

/**
 * Hook for recipe CRUD operations via REST API.
 *
 * @returns {{ recipes, loading, error, createRecipe, updateRecipe, deleteRecipe, refresh }}
 */
export function useRecipes() {
    const [recipes, setRecipes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const refresh = useCallback(async () => {
        try {
            setLoading(true);
            const data = await recipesApi.getAll();
            setRecipes(data);
            setError(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const createRecipe = useCallback(async (recipe) => {
        try {
            const created = await recipesApi.create(recipe);
            setRecipes(prev => [created, ...prev]);
            return created;
        } catch (e) {
            setError(e.message);
            throw e;
        }
    }, []);

    const updateRecipe = useCallback(async (id, data) => {
        try {
            const updated = await recipesApi.update(id, data);
            setRecipes(prev => prev.map(r => r.id === id ? updated : r));
            return updated;
        } catch (e) {
            setError(e.message);
            throw e;
        }
    }, []);

    const deleteRecipe = useCallback(async (id) => {
        try {
            await recipesApi.delete(id);
            setRecipes(prev => prev.filter(r => r.id !== id));
        } catch (e) {
            setError(e.message);
            throw e;
        }
    }, []);

    return { recipes, loading, error, createRecipe, updateRecipe, deleteRecipe, refresh };
}

/**
 * Hook for a single recipe by ID.
 */
export function useRecipe(id) {
    const [recipe, setRecipe] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!id) return;
        (async () => {
            try {
                setLoading(true);
                const data = await recipesApi.getById(id);
                setRecipe(data);
                setError(null);
            } catch (e) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    return { recipe, loading, error };
}
