import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { recipesApi, sessionsApi } from '../api/client.js';
import { DEFAULT_HOPS, DEFAULT_MALTS, DEFAULT_YEASTS, getIngredientsFromStorage } from '../utils/ingredients';
import { ArrowLeft, Plus, Play, Save, Trash2, Beaker, Thermometer, Droplets, Clock } from 'lucide-react';

export default function RecipeConstructor_V4() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [dictionary, setDictionary] = useState({ malt: [], hop: [], yeast: [] });

  useEffect(() => {
    const custom = getIngredientsFromStorage();
    setDictionary({
      malt: [...DEFAULT_MALTS, ...custom.malt],
      hop: [...DEFAULT_HOPS, ...custom.hop],
      yeast: [...DEFAULT_YEASTS, ...custom.yeast]
    });
  }, []);

  useEffect(() => {
    document.documentElement.classList.add('tailwind-active');
    return () => document.documentElement.classList.remove('tailwind-active');
  }, []);

  const [recipe, setRecipe] = useState({
    name: '', style: '', notes: '',
    og: 0, fg: 0, ibu: 0, abv: 0,
    batch_size: 40, boil_time: 60,
    mash_steps: [{ id: '1', name: 'Пауза осахаривания', temp: 62, duration: 60 }],
    ingredients: [],
    hop_additions: [],
  });

  const stats = useMemo(() => {
    // Basic stats calculation (same as before)
    const totalMalt = recipe.ingredients.filter(i => i.type === 'Солод').reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
    const totalWater = recipe.ingredients.filter(i => i.type === 'Вода').reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
    return {
      malt: totalMalt.toFixed(2),
      water: totalWater.toFixed(1),
      ratio: totalMalt > 0 ? (totalWater / totalMalt).toFixed(2) : 0,
      color: 'N/A',
      ibu: 'N/A'
    };
  }, [recipe]);

  // Actions
  const addStep = () => setRecipe({ ...recipe, mash_steps: [...recipe.mash_steps, { id: Date.now().toString(), name: 'Новая пауза', temp: 72, duration: 15 }] });
  const removeStep = (id) => recipe.mash_steps.length > 1 && setRecipe({ ...recipe, mash_steps: recipe.mash_steps.filter(s => s.id !== id) });
  const updateStep = (id, field, value) => setRecipe({ ...recipe, mash_steps: recipe.mash_steps.map(s => s.id === id ? { ...s, [field]: value } : s) });
  
  const addIngredient = () => setRecipe({ ...recipe, ingredients: [...recipe.ingredients, { id: Date.now().toString(), name: '', amount: '', unit: 'кг', type: 'Солод' }] });
  const removeIngredient = (id) => setRecipe({ ...recipe, ingredients: recipe.ingredients.filter(i => i.id !== id) });
  const updateIngredient = (id, field, value) => setRecipe({ ...recipe, ingredients: recipe.ingredients.map(i => i.id === id ? { ...i, [field]: value } : i) });

  const addHop = () => setRecipe({ ...recipe, hop_additions: [...recipe.hop_additions, { id: Date.now().toString(), name: '', amount: 10, time: 10 }] });
  const removeHop = (id) => setRecipe({ ...recipe, hop_additions: recipe.hop_additions.filter(h => h.id !== id) });
  const updateHop = (id, field, value) => setRecipe({ ...recipe, hop_additions: recipe.hop_additions.map(h => h.id === id ? { ...h, [field]: value } : h) });

  const handleSave = async (start = false) => {
    if (!recipe.name.trim()) return alert('Введите название рецепта');
    try {
      setSaving(true);
      const created = await recipesApi.create(recipe);
      localStorage.setItem('currentRecipe', JSON.stringify({ ...created, steps: recipe.mash_steps }));
      if (start) {
        const session = await sessionsApi.create({ recipe_id: created.id, type: 'brewing', status: 'active' });
        navigate(`/brewing/mash/${session.id}`);
      } else navigate('/brewing/recipes');
    } catch (e) { alert('Ошибка: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 pt-8 font-sans">
      <div className="max-w-4xl mx-auto px-4 space-y-6">
        
        {/* Header */}
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate('/brewing')} className="p-2 bg-white border border-slate-200 rounded-md shadow-sm hover:bg-slate-100 transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Конструктор Рецептов <span className="text-blue-600 bg-blue-100 px-2 py-0.5 rounded-md text-xl ml-2 tracking-normal">V4 (shadcn/ui style)</span>
          </h1>
        </div>

        {/* Card: Basic Info */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center space-x-2">
            <Beaker className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold">Базовые параметры</h2>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Название</label>
              <input type="text" className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" value={recipe.name} onChange={(e) => setRecipe({...recipe, name: e.target.value})} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium leading-none">Стиль</label>
              <input type="text" className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white" value={recipe.style} onChange={(e) => setRecipe({...recipe, style: e.target.value})} />
            </div>
          </div>
        </div>

        {/* Card: Mash Steps */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Thermometer className="w-5 h-5 text-orange-500" />
              <h2 className="text-lg font-semibold">Затирание</h2>
            </div>
            <button onClick={addStep} className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-white transition-colors hover:bg-slate-100 hover:text-slate-900 h-9 px-3 border border-slate-200">
              <Plus className="w-4 h-4 mr-2" /> Добавить
            </button>
          </div>
          <div className="p-6 space-y-4">
            {recipe.mash_steps.map((step, idx) => (
              <div key={step.id} className="flex flex-col sm:flex-row gap-4 items-end bg-slate-50 p-4 rounded-lg border border-slate-100 relative">
                <div className="w-full sm:w-1/2 space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Шаг {idx + 1}</label>
                  <input type="text" className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" value={step.name} onChange={e => updateStep(step.id, 'name', e.target.value)} />
                </div>
                <div className="w-full sm:w-1/4 space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 tracking-wider">Темп. (°C)</label>
                  <input type="number" className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" value={step.temp} onChange={e => updateStep(step.id, 'temp', e.target.value)} />
                </div>
                <div className="w-full sm:w-1/4 space-y-1.5">
                  <label className="text-xs font-semibold text-slate-500 tracking-wider">Время (мин)</label>
                  <input type="number" className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm" value={step.duration} onChange={e => updateStep(step.id, 'duration', e.target.value)} />
                </div>
                {recipe.mash_steps.length > 1 && (
                  <button onClick={() => removeStep(step.id)} className="absolute -top-3 -right-3 p-1.5 bg-red-100 text-red-600 rounded-full hover:bg-red-200 transition-colors shadow-sm">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4 pt-4">
          <button disabled={saving} onClick={() => handleSave(false)} className="inline-flex flex-1 items-center justify-center rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-slate-200 bg-white hover:bg-slate-100 hover:text-slate-900 h-11 px-8">
            <Save className="mr-2 h-4 w-4" /> Сохранить
          </button>
          <button disabled={saving} onClick={() => handleSave(true)} className="inline-flex flex-[2] items-center justify-center rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-slate-900 text-slate-50 hover:bg-slate-900/90 h-11 px-8">
            <Play className="mr-2 h-4 w-4" /> Начать Варку
          </button>
        </div>

      </div>
    </div>
  );
}
