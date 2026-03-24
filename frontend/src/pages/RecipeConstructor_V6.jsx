import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MantineProvider, Container, Title, Paper, TextInput, NumberInput, Button, Group, Stack, Text, ActionIcon, Divider } from '@mantine/core';
import '@mantine/core/styles.css';
import { ArrowLeft, Plus, Trash2, Save, Play } from 'lucide-react';
import { recipesApi, sessionsApi } from '../api/client.js';

export default function RecipeConstructor_V6() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

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
    <MantineProvider defaultColorScheme="dark">
      <div style={{ minHeight: '100vh', backgroundColor: '#1A1B1E', color: '#C1C2C5', paddingBottom: 60 }}>
        <Container size="md" pt="xl">
          
          <Group mb="xl">
            <ActionIcon variant="light" size="lg" onClick={() => navigate('/brewing')}>
              <ArrowLeft size={20} />
            </ActionIcon>
            <Title order={2}>
              Конструктор Рецептов <Text span c="blue" inherit>V6 (Mantine)</Text>
            </Title>
          </Group>

          <Stack gap="lg">
            {/* Basic Info */}
            <Paper shadow="sm" radius="md" p="xl" withBorder>
              <Text size="lg" fw={500} mb="md">Основная информация</Text>
              <Group grow align="flex-start">
                <TextInput label="Название рецепта" placeholder="Beer name" value={recipe.name} onChange={(e) => setRecipe({...recipe, name: e.currentTarget.value})} required />
                <TextInput label="Стиль" placeholder="e.g. Stout" value={recipe.style} onChange={(e) => setRecipe({...recipe, style: e.currentTarget.value})} />
              </Group>
              <Group grow mt="md">
                <NumberInput label="Объем (л)" value={recipe.batch_size} onChange={(val) => setRecipe({...recipe, batch_size: val})} />
                <NumberInput label="Время кипячения (мин)" value={recipe.boil_time} onChange={(val) => setRecipe({...recipe, boil_time: val})} />
              </Group>
            </Paper>

            {/* Mash Steps */}
            <Paper shadow="sm" radius="md" p="xl" withBorder>
              <Group justify="space-between" mb="md">
                <Text size="lg" fw={500}>Затирание</Text>
                <Button variant="light" leftSection={<Plus size={16} />} onClick={addStep}>Добавить шаг</Button>
              </Group>
              <Divider mb="md" />
              
              <Stack>
                {recipe.mash_steps.map((step, idx) => (
                  <Paper key={step.id} bg="dark.6" p="md" radius="sm">
                    <Text size="xs" c="dimmed" mb="xs" fw={700}>ШАГ {idx + 1}</Text>
                    <Group align="flex-end">
                      <TextInput style={{flex: 1}} label="Название" value={step.name} onChange={(e) => updateStep(step.id, 'name', e.currentTarget.value)} />
                      <NumberInput style={{width: 120}} label="Темп (°C)" value={step.temp} onChange={(val) => updateStep(step.id, 'temp', val)} />
                      <NumberInput style={{width: 120}} label="Время (мин)" value={step.duration} onChange={(val) => updateStep(step.id, 'duration', val)} />
                      {recipe.mash_steps.length > 1 && (
                        <ActionIcon color="red" variant="subtle" size="lg" mb={4} onClick={() => removeStep(step.id)}>
                          <Trash2 size={20} />
                        </ActionIcon>
                      )}
                    </Group>
                  </Paper>
                ))}
              </Stack>
            </Paper>

            {/* Actions */}
            <Group grow mt="xl">
              <Button size="lg" variant="default" leftSection={<Save size={20} />} onClick={() => handleSave(false)} loading={saving}>Сохранить</Button>
              <Button size="lg" color="blue" leftSection={<Play size={20} />} onClick={() => handleSave(true)} loading={saving}>В варку</Button>
            </Group>
          </Stack>
          
        </Container>
      </div>
    </MantineProvider>
  );
}
