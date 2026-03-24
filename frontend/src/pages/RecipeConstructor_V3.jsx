import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Container,
  Typography,
  TextField,
  Button,
  Card,
  CardContent,
  CardHeader,
  IconButton,
  Grid,
  Divider,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Paper,
  ThemeProvider,
  createTheme,
  CssBaseline,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  PlayArrow as PlayArrowIcon,
  Save as SaveIcon,
  Science as ScienceIcon,
  Thermostat as ThermostatIcon,
  WaterDrop as WaterDropIcon,
  AccessTime as AccessTimeIcon,
  LocalFlorist as HopIcon,
  Grain as MaltIcon,
  ColorLens as ColorIcon,
} from '@mui/icons-material';

import { recipesApi, sessionsApi } from '../api/client.js';
import { DEFAULT_HOPS, DEFAULT_MALTS, DEFAULT_YEASTS, getIngredientsFromStorage } from '../utils/ingredients';

// --- CUSTOM THEME (Material Design 3 - Orange Brew flavor) ---
const theme = createTheme({
  palette: {
    mode: 'light', // The user didn't specify dark mode for V3, let's use a standard Material light theme with orange accent
    primary: {
      main: '#ff9800',
      contrastText: '#fff',
    },
    secondary: {
      main: '#2196f3',
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 700,
    },
    h6: {
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0px 4px 20px rgba(0, 0, 0, 0.05)',
          marginBottom: '24px',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
  },
});

const RecipeConstructor_V3 = () => {
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

  const [recipe, setRecipe] = useState({
    name: '', style: '', notes: '',
    og: 0, fg: 0, ibu: 0, abv: 0,
    batch_size: 40, boil_time: 60,
    mash_steps: [{ id: '1', name: 'Пауза осахаривания', temp: 62, duration: 60 }],
    ingredients: [],
    hop_additions: [],
  });

  // --- CALCULATIONS ---
  const stats = useMemo(() => {
    const totalMalt = recipe.ingredients
      .filter(i => i.type === 'Солод')
      .reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);

    const totalWater = recipe.ingredients
      .filter(i => i.type === 'Вода')
      .reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);

    const hydroModule = totalMalt > 0 ? (totalWater / totalMalt).toFixed(2) : 0;

    let mcu = 0;
    recipe.ingredients.filter(i => i.type === 'Солод').forEach(ing => {
      const amount = parseFloat(ing.amount) || 0;
      const maltData = dictionary.malt.find(m => m.name === ing.name);
      if (maltData) {
        const colors = maltData.color.match(/[\d.]+/g);
        const avgEbc = colors ? colors.reduce((s, c) => s + parseFloat(c), 0) / colors.length : 0;
        mcu += (amount * avgEbc);
      }
    });
    const ebc = recipe.batch_size > 0 ? (2.93 * Math.pow(mcu / recipe.batch_size, 0.69)).toFixed(1) : 0;

    let totalIbu = 0;
    const vol = recipe.batch_size || 1;
    recipe.hop_additions.forEach(hop => {
      const amount = parseFloat(hop.amount) || 0;
      const time = parseInt(hop.time) || 0;
      const hopData = dictionary.hop.find(h => h.name === hop.name);
      if (hopData) {
        const alphaStr = hopData.alpha.match(/[\d.]+/g);
        const alpha = alphaStr ? (alphaStr.reduce((s, a) => s + parseFloat(a), 0) / alphaStr.length) / 100 : 0.05;
        const bignessFactor = 1.65 * Math.pow(0.000125, 0.05);
        const timeFactor = (1 - Math.exp(-0.04 * time)) / 4.15;
        let utilization = bignessFactor * timeFactor;
        if (time === 0) utilization = 0.05;
        totalIbu += (amount * alpha * utilization * 1000) / vol;
      }
    });

    return {
      malt: totalMalt.toFixed(2),
      water: totalWater.toFixed(1),
      ratio: hydroModule,
      color: ebc,
      ibu: totalIbu.toFixed(0)
    };
  }, [recipe, dictionary]);

  // Actions
  const addStep = () => setRecipe({ ...recipe, mash_steps: [...recipe.mash_steps, { id: Date.now().toString(), name: 'Новая пауза', temp: 72, duration: 15 }] });
  const removeStep = (id) => recipe.mash_steps.length > 1 && setRecipe({ ...recipe, mash_steps: recipe.mash_steps.filter(s => s.id !== id) });
  const updateStep = (id, field, value) => setRecipe({ ...recipe, mash_steps: recipe.mash_steps.map(s => s.id === id ? { ...s, [field]: value } : s) });

  const addIngredient = () => setRecipe({ ...recipe, ingredients: [...recipe.ingredients, { id: Date.now().toString(), name: '', amount: '', unit: 'кг', type: 'Солод' }] });
  const removeIngredient = (id) => setRecipe({ ...recipe, ingredients: recipe.ingredients.filter(i => i.id !== id) });
  const updateIngredient = (id, field, value) => setRecipe({
    ...recipe,
    ingredients: recipe.ingredients.map(i => {
      if (i.id === id) {
        const updated = { ...i, [field]: value };
        if (field === 'type' && value === 'Вода') updated.unit = 'л';
        else if (field === 'type' && value !== 'Вода' && i.unit === 'л') updated.unit = 'кг';
        return updated;
      }
      return i;
    })
  });

  const addHop = () => setRecipe({ ...recipe, hop_additions: [...recipe.hop_additions, { id: Date.now().toString(), name: '', amount: 10, time: 10 }] });
  const removeHop = (id) => setRecipe({ ...recipe, hop_additions: recipe.hop_additions.filter(h => h.id !== id) });
  const updateHop = (id, field, value) => setRecipe({ ...recipe, hop_additions: recipe.hop_additions.map(h => h.id === id ? { ...h, [field]: value } : h) });

  const validateRecipe = () => {
    if (!recipe.name.trim()) { alert('Введите название рецепта'); return false; }
    return true;
  };

  const handleSave = async (start = false) => {
    if (!validateRecipe()) return;
    try {
      setSaving(true);
      const created = await recipesApi.create(recipe);
      localStorage.setItem('currentRecipe', JSON.stringify({ ...created, steps: recipe.mash_steps }));
      if (start) {
        const session = await sessionsApi.create({ recipe_id: created.id, type: 'brewing', status: 'active' });
        navigate(`/brewing/mash/${session.id}`);
      } else {
        navigate('/brewing/recipes');
      }
    } catch (e) { alert('Ошибка: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', pb: 10, pt: 4 }}>
        <Container maxWidth="md">
          
          {/* Header */}
          <Box display="flex" alignItems="center" mb={4}>
            <IconButton onClick={() => navigate('/brewing')} sx={{ mr: 2, bgcolor: 'background.paper', boxShadow: 1 }}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h4" component="h1" color="text.primary">
              Конструктор Рецептов 
              <Typography variant="h4" component="span" color="primary" ml={1}>
                V3
              </Typography>
            </Typography>
          </Box>

          {/* 1. Basic Parameters */}
          <Card>
            <CardHeader 
              title="Параметры" 
              avatar={<ScienceIcon color="primary" />}
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <TextField 
                    fullWidth 
                    label="Название рецепта *" 
                    variant="outlined" 
                    value={recipe.name} 
                    onChange={(e) => setRecipe({ ...recipe, name: e.target.value })}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField 
                    fullWidth 
                    label="Стиль" 
                    variant="outlined" 
                    value={recipe.style} 
                    onChange={(e) => setRecipe({ ...recipe, style: e.target.value })}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField 
                    fullWidth 
                    type="number"
                    label="Объем (л)" 
                    variant="outlined" 
                    value={recipe.batch_size} 
                    onChange={(e) => setRecipe({ ...recipe, batch_size: parseFloat(e.target.value) || 0 })}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField 
                    fullWidth 
                    type="number"
                    label="Кип. (мин)" 
                    variant="outlined" 
                    value={recipe.boil_time} 
                    onChange={(e) => setRecipe({ ...recipe, boil_time: parseInt(e.target.value) || 0 })}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* 2. Mash Steps */}
          <Card>
            <CardHeader 
              title="Затирание" 
              avatar={<ThermostatIcon color="primary" />}
              titleTypographyProps={{ variant: 'h6' }}
              action={<Button variant="outlined" startIcon={<AddIcon />} onClick={addStep}>Шаг</Button>}
            />
            <Divider />
            <CardContent>
              {recipe.mash_steps.map((step, idx) => (
                <Paper key={step.id} variant="outlined" sx={{ p: 2, mb: 2, position: 'relative' }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>ШАГ {idx + 1}</Typography>
                  {recipe.mash_steps.length > 1 && (
                    <IconButton size="small" color="error" onClick={() => removeStep(step.id)} sx={{ position: 'absolute', top: 8, right: 8 }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                  <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={12} sm={6}>
                      <TextField fullWidth label="Название паузы" variant="standard" value={step.name} onChange={(e) => updateStep(step.id, 'name', e.target.value)} />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <TextField fullWidth type="number" label="Температура (°C)" variant="standard" value={step.temp} onChange={(e) => updateStep(step.id, 'temp', parseInt(e.target.value))} />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <TextField fullWidth type="number" label="Время (мин)" variant="standard" value={step.duration} onChange={(e) => updateStep(step.id, 'duration', parseInt(e.target.value))} />
                    </Grid>
                  </Grid>
                </Paper>
              ))}
            </CardContent>
          </Card>

          {/* 3. Ingredients */}
          <Card>
            <CardHeader 
              title="Ингредиенты" 
              avatar={<WaterDropIcon color="primary" />}
              titleTypographyProps={{ variant: 'h6' }}
              action={<Button variant="outlined" startIcon={<AddIcon />} onClick={addIngredient}>Добавить</Button>}
            />
            <Divider />
            <CardContent>
              {recipe.ingredients.map((ing) => (
                <Box key={ing.id} sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                  <FormControl sx={{ minWidth: 120 }}>
                    <InputLabel>Тип</InputLabel>
                    <Select value={ing.type} label="Тип" onChange={(e) => updateIngredient(ing.id, 'type', e.target.value)}>
                      {['Солод', 'Хмель', 'Дрожжи', 'Вода', 'Добавка'].map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                    </Select>
                  </FormControl>

                  <FormControl sx={{ flexGrow: 1, minWidth: 200 }}>
                    {['Солод', 'Хмель', 'Дрожжи'].includes(ing.type) ? (
                      <React.Fragment>
                        <InputLabel>Наименование</InputLabel>
                        <Select value={ing.name} label="Наименование" onChange={(e) => updateIngredient(ing.id, 'name', e.target.value)}>
                          <MenuItem value=""><em>Выбрать...</em></MenuItem>
                          {dictionary[ing.type === 'Солод' ? 'malt' : ing.type === 'Хмель' ? 'hop' : 'yeast'].map(i => <MenuItem key={i.id} value={i.name}>{i.name}</MenuItem>)}
                        </Select>
                      </React.Fragment>
                    ) : (
                      <TextField label={ing.type === 'Вода' ? 'Покупная' : 'Название'} value={ing.name} onChange={(e) => updateIngredient(ing.id, 'name', e.target.value)} />
                    )}
                  </FormControl>

                  <TextField sx={{ width: 100 }} type="number" label="Кол-во" value={ing.amount} onChange={(e) => updateIngredient(ing.id, 'amount', parseFloat(e.target.value) || '')} />
                  
                  <FormControl sx={{ width: 80 }}>
                    <InputLabel>Ед.</InputLabel>
                    <Select value={ing.unit} label="Ед." onChange={(e) => updateIngredient(ing.id, 'unit', e.target.value)}>
                      {['кг', 'г', 'л', 'шт'].map(u => <MenuItem key={u} value={u}>{u}</MenuItem>)}
                    </Select>
                  </FormControl>

                  <IconButton color="error" onClick={() => removeIngredient(ing.id)}>
                    <DeleteIcon />
                  </IconButton>
                </Box>
              ))}
            </CardContent>
          </Card>

          {/* 4. Hops Schedule */}
          <Card>
            <CardHeader 
              title="График хмеля" 
              avatar={<AccessTimeIcon color="primary" />}
              titleTypographyProps={{ variant: 'h6' }}
              action={<Button variant="outlined" startIcon={<AddIcon />} onClick={addHop}>Хмель</Button>}
            />
            <Divider />
            <CardContent>
              {recipe.hop_additions.map((hop) => (
                <Box key={hop.id} sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
                  <FormControl sx={{ flexGrow: 1 }}>
                    <InputLabel>Сорт хмеля</InputLabel>
                    <Select value={hop.name} label="Сорт хмеля" onChange={(e) => updateHop(hop.id, 'name', e.target.value)}>
                      <MenuItem value=""><em>Выбрать...</em></MenuItem>
                      {dictionary.hop.map(h => <MenuItem key={h.id} value={h.name}>{h.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <TextField sx={{ width: 120 }} type="number" label="Вес (г)" value={hop.amount} onChange={(e) => updateHop(hop.id, 'amount', parseFloat(e.target.value) || 0)} />
                  <TextField sx={{ width: 120 }} type="number" label="Время (мин)" value={hop.time} onChange={(e) => updateHop(hop.id, 'time', parseInt(e.target.value) || 0)} />
                  <IconButton color="error" onClick={() => removeHop(hop.id)}>
                    <DeleteIcon />
                  </IconButton>
                </Box>
              ))}
            </CardContent>
          </Card>

          {/* Quick Analytics Summary */}
          <Paper sx={{ p: 3, mb: 4, bgcolor: 'primary.light', color: 'primary.contrastText' }}>
            <Typography variant="h6" gutterBottom><ScienceIcon sx={{ verticalAlign: 'middle', mr: 1 }} /> Сводка рецепта</Typography>
            <Grid container spacing={2}>
              <Grid item xs={6} sm={2}><Typography variant="body2" color="inherit" sx={{ opacity: 0.8 }}>Всего воды</Typography><Typography variant="h6">{stats.water} л</Typography></Grid>
              <Grid item xs={6} sm={2}><Typography variant="body2" color="inherit" sx={{ opacity: 0.8 }}>Солод</Typography><Typography variant="h6">{stats.malt} кг</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="body2" color="inherit" sx={{ opacity: 0.8 }}>Г/Модуль</Typography><Typography variant="h6">{stats.ratio} л/кг</Typography></Grid>
              <Grid item xs={6} sm={2}><Typography variant="body2" color="inherit" sx={{ opacity: 0.8 }}>Цвет</Typography><Typography variant="h6">{stats.color} EBC</Typography></Grid>
              <Grid item xs={6} sm={3}><Typography variant="body2" color="inherit" sx={{ opacity: 0.8 }}>Горечь</Typography><Typography variant="h6">{stats.ibu} IBU</Typography></Grid>
            </Grid>
          </Paper>

          {/* Bottom Actions */}
          <Box display="flex" gap={2} mt={4}>
            <Button 
              variant="outlined" 
              size="large" 
              startIcon={<SaveIcon />}
              onClick={() => handleSave(false)} 
              disabled={saving}
              sx={{ flex: 1 }}
            >
              СОХРАНИТЬ
            </Button>
            <Button 
              variant="contained" 
              size="large" 
              startIcon={<PlayArrowIcon />}
              onClick={() => handleSave(true)} 
              disabled={saving}
              sx={{ flex: 2 }}
            >
              НАЧАТЬ ВАРКУ
            </Button>
          </Box>
          <Button 
            fullWidth 
            color="error" 
            sx={{ mt: 2 }}
            onClick={() => navigate('/brewing')}
          >
            ОТМЕНИТЬ
          </Button>

        </Container>
      </Box>
    </ThemeProvider>
  );
};

export default RecipeConstructor_V3;
