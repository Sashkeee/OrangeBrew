import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NextUIProvider, Input, Button, Card, CardHeader, CardBody, Divider } from '@nextui-org/react';
import { ArrowLeft, Plus, Trash2, Save, Play } from 'lucide-react';
import { recipesApi, sessionsApi } from '../api/client.js';

export default function RecipeConstructor_V7() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add('tailwind-active');
    return () => document.documentElement.classList.remove('tailwind-active');
  }, []);

  const [recipe, setRecipe] = useState({
    name: '', style: '',
    batch_size: 40, boil_time: 60,
    mash_steps: [{ id: '1', name: 'Пауза осахаривания', temp: 62, duration: 60 }],
    ingredients: [], hop_additions: []
  });

  const addStep = () => setRecipe({ ...recipe, mash_steps: [...recipe.mash_steps, { id: Date.now().toString(), name: '', temp: 72, duration: 15 }] });
  const removeStep = (id) => setRecipe({ ...recipe, mash_steps: recipe.mash_steps.filter(s => s.id !== id) });
  const updateStep = (id, field, value) => setRecipe({ ...recipe, mash_steps: recipe.mash_steps.map(s => s.id === id ? { ...s, [field]: value } : s) });

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
    <NextUIProvider>
      <div className="dark text-foreground bg-background min-h-screen pb-20 pt-8" style={{ fontFamily: "Inter, sans-serif" }}>
        <main className="max-w-4xl mx-auto px-4 flex flex-col gap-6">
          
          <div className="flex items-center gap-4 mb-4">
            <Button isIconOnly variant="flat" onPress={() => navigate('/brewing')}>
              <ArrowLeft size={20} />
            </Button>
            <h1 className="text-2xl font-bold">
              Конструктор Рецептов <span className="text-secondary ml-2 font-mono text-xl bg-secondary/20 px-2 py-1 rounded-md">V7 (NextUI)</span>
            </h1>
          </div>

          <Card className="p-2">
            <CardHeader className="flex gap-3">
              <div className="flex flex-col text-left">
                <p className="text-md font-bold">Основные параметры</p>
                <p className="text-small text-default-500">Базовые настройки будущей варки</p>
              </div>
            </CardHeader>
            <Divider/>
            <CardBody className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Название" variant="bordered" value={recipe.name} onValueChange={(val) => setRecipe({...recipe, name: val})} />
              <Input label="Стиль" variant="bordered" value={recipe.style} onValueChange={(val) => setRecipe({...recipe, style: val})} />
              <Input type="number" label="Объем (л)" variant="bordered" value={recipe.batch_size.toString()} onValueChange={(val) => setRecipe({...recipe, batch_size: Number(val)})} />
              <Input type="number" label="Время кипячения (мин)" variant="bordered" value={recipe.boil_time.toString()} onValueChange={(val) => setRecipe({...recipe, boil_time: Number(val)})} />
            </CardBody>
          </Card>

          <Card className="p-2">
            <CardHeader className="flex justify-between items-center">
              <p className="text-md font-bold">Паузы затирания</p>
              <Button color="primary" variant="flat" startContent={<Plus size={16}/>} onPress={addStep}>Добавить шаг</Button>
            </CardHeader>
            <Divider/>
            <CardBody className="flex flex-col gap-4">
              {recipe.mash_steps.map((step, idx) => (
                <div key={step.id} className="flex gap-4 items-center bg-content2 p-4 rounded-xl relative">
                  <div className="text-xs absolute top-2 left-4 text-default-400 font-bold">ШАГ {idx + 1}</div>
                  <Input className="mt-4 flex-1" label="Название" size="sm" variant="faded" value={step.name} onValueChange={(val) => updateStep(step.id, 'name', val)} />
                  <Input type="number" className="mt-4 w-28" label="Темп (°C)" size="sm" variant="faded" value={step.temp.toString()} onValueChange={(val) => updateStep(step.id, 'temp', Number(val))} />
                  <Input type="number" className="mt-4 w-28" label="Время (мин)" size="sm" variant="faded" value={step.duration.toString()} onValueChange={(val) => updateStep(step.id, 'duration', Number(val))} />
                  
                  {recipe.mash_steps.length > 1 && (
                    <Button isIconOnly color="danger" variant="light" className="mt-4" onPress={() => removeStep(step.id)}>
                      <Trash2 size={20} />
                    </Button>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>

          <div className="flex gap-4 mt-4">
            <Button size="lg" variant="bordered" className="flex-1 font-bold" startContent={<Save size={20} />} onPress={() => handleSave(false)} isLoading={saving}>Сохранить</Button>
            <Button size="lg" color="secondary" className="flex-[2] font-bold" startContent={<Play size={20} />} onPress={() => handleSave(true)} isLoading={saving}>Начать процесс</Button>
          </div>
          
        </main>
      </div>
    </NextUIProvider>
  );
}
