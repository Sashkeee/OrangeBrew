import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, CheckCircle, XCircle, Database, ChevronDown, ChevronRight, Lightbulb, Table2, Code2, BookOpen } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { sql, SQLite } from '@codemirror/lang-sql';
import { trainerApi } from '../api/client';

const CATEGORIES = ['all', 'SELECT', 'WHERE', 'ORDER BY', 'COUNT', 'JOIN', 'LEFT JOIN', 'GROUP BY', 'HAVING', 'Subquery', 'CASE', 'Window', 'INSERT', 'UPDATE', 'DELETE'];
const DIFFICULTY_COLORS = { easy: '#4caf50', medium: '#ff9800', hard: '#f44336' };
const DIFFICULTY_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

export default function SqlTrainer() {
    const navigate = useNavigate();

    const [tasks, setTasks] = useState([]);
    const [schema, setSchema] = useState([]);
    const [selectedTask, setSelectedTask] = useState(null);
    const [userQuery, setUserQuery] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [category, setCategory] = useState('all');
    const [showHint, setShowHint] = useState(false);
    const [showSchema, setShowSchema] = useState(false);
    const [showCheatSheet, setShowCheatSheet] = useState(false);
    const [completedTasks, setCompletedTasks] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('trainer_completed') || '[]');
        } catch { return []; }
    });

    useEffect(() => {
        Promise.all([trainerApi.getTasks(), trainerApi.getSchema()])
            .then(([t, s]) => { setTasks(t); setSchema(s); })
            .catch(err => setError(err.message));
    }, []);

    const filteredTasks = category === 'all'
        ? tasks
        : tasks.filter(t => t.category === category);

    const selectTask = useCallback((task) => {
        setSelectedTask(task);
        setUserQuery('');
        setResult(null);
        setShowHint(false);
        setError(null);
    }, []);

    const executeQuery = useCallback(async () => {
        if (!userQuery.trim()) return;
        setLoading(true);
        setError(null);
        try {
            const res = await trainerApi.execute(
                selectedTask?.id ?? null,
                userQuery,
            );
            setResult(res);

            if (res.success && selectedTask && !completedTasks.includes(selectedTask.id)) {
                const updated = [...completedTasks, selectedTask.id];
                setCompletedTasks(updated);
                localStorage.setItem('trainer_completed', JSON.stringify(updated));
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [userQuery, selectedTask, completedTasks]);

    const handleKeyDown = useCallback((e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            executeQuery();
        }
    }, [executeQuery]);

    const completedCount = completedTasks.length;
    const totalCount = tasks.length;

    return (
        <div style={{ padding: '1.5rem 1rem', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header */}
            <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                <button
                    onClick={() => navigate(-1)}
                    style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', padding: '0.5rem' }}
                >
                    <ArrowLeft size={24} />
                </button>
                <div style={{ flex: 1 }}>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Database size={24} /> SQL Trainer
                    </h1>
                    <span style={{ fontSize: '0.85rem', color: '#888' }}>
                        {completedCount}/{totalCount} solved
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={() => { setShowCheatSheet(v => !v); if (!showCheatSheet) setShowSchema(false); }}
                        style={{
                            background: showCheatSheet ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: '#fff',
                            borderRadius: '8px',
                            padding: '0.5rem 1rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: '0.85rem',
                        }}
                    >
                        <BookOpen size={16} /> SQL
                    </button>
                    <button
                        onClick={() => { setShowSchema(v => !v); if (!showSchema) setShowCheatSheet(false); }}
                        style={{
                            background: showSchema ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: '#fff',
                            borderRadius: '8px',
                            padding: '0.5rem 1rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            fontSize: '0.85rem',
                        }}
                    >
                        <Table2 size={16} /> Schema
                    </button>
                </div>
            </header>

            {/* Cheat Sheet Panel */}
            {showCheatSheet && <CheatSheet />}

            {/* Schema Panel */}
            {showSchema && <SchemaPanel schema={schema} />}

            {/* Progress bar */}
            <div style={{
                height: '4px',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '2px',
                marginBottom: '1.5rem',
                overflow: 'hidden',
            }}>
                <div style={{
                    height: '100%',
                    width: totalCount ? `${(completedCount / totalCount) * 100}%` : '0%',
                    background: 'var(--primary-color)',
                    borderRadius: '2px',
                    transition: 'width 0.3s ease',
                }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem' }}>
                {/* Left sidebar — task list */}
                <div>
                    {/* Category filter */}
                    <div style={{ marginBottom: '1rem' }}>
                        <select
                            value={category}
                            onChange={e => setCategory(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.5rem',
                                background: 'rgba(18,18,18,0.8)',
                                color: '#fff',
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderRadius: '8px',
                                fontSize: '0.9rem',
                            }}
                        >
                            {CATEGORIES.map(c => (
                                <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>
                            ))}
                        </select>
                    </div>

                    {/* Tasks */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '70vh', overflowY: 'auto' }}>
                        {filteredTasks.map(task => {
                            const isCompleted = completedTasks.includes(task.id);
                            const isSelected = selectedTask?.id === task.id;
                            return (
                                <button
                                    key={task.id}
                                    onClick={() => selectTask(task)}
                                    style={{
                                        textAlign: 'left',
                                        padding: '0.75rem',
                                        background: isSelected ? 'rgba(255,152,0,0.15)' : 'rgba(18,18,18,0.8)',
                                        border: isSelected ? '1px solid var(--primary-color)' : '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '8px',
                                        color: '#fff',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        transition: 'all 0.2s ease',
                                    }}
                                >
                                    {isCompleted
                                        ? <CheckCircle size={16} color="#4caf50" />
                                        : <span style={{
                                            width: 16, height: 16, borderRadius: '50%',
                                            border: '2px solid rgba(255,255,255,0.3)',
                                            display: 'inline-block', flexShrink: 0,
                                        }} />
                                    }
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {task.id}. {task.title}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', display: 'flex', gap: '0.5rem', marginTop: '2px' }}>
                                            <span style={{ color: DIFFICULTY_COLORS[task.difficulty] }}>
                                                {DIFFICULTY_LABELS[task.difficulty]}
                                            </span>
                                            <span style={{ color: '#666' }}>{task.category}</span>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Right panel — editor & results */}
                <div>
                    {selectedTask ? (
                        <>
                            {/* Task description */}
                            <div style={{
                                padding: '1rem',
                                background: 'rgba(18,18,18,0.8)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '8px',
                                marginBottom: '1rem',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem' }}>
                                        {selectedTask.id}. {selectedTask.title}
                                    </h3>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        background: DIFFICULTY_COLORS[selectedTask.difficulty] + '22',
                                        color: DIFFICULTY_COLORS[selectedTask.difficulty],
                                        border: `1px solid ${DIFFICULTY_COLORS[selectedTask.difficulty]}44`,
                                    }}>
                                        {DIFFICULTY_LABELS[selectedTask.difficulty]}
                                    </span>
                                </div>
                                <div
                                    style={{ fontSize: '0.9rem', color: '#ccc', lineHeight: 1.5 }}
                                    dangerouslySetInnerHTML={{ __html: markdownToHtml(selectedTask.task_markdown) }}
                                />
                                {selectedTask.hint && (
                                    <button
                                        onClick={() => setShowHint(v => !v)}
                                        style={{
                                            marginTop: '0.5rem',
                                            background: 'none',
                                            border: 'none',
                                            color: '#ff9800',
                                            cursor: 'pointer',
                                            fontSize: '0.8rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.3rem',
                                            padding: 0,
                                        }}
                                    >
                                        <Lightbulb size={14} />
                                        {showHint ? 'Hide hint' : 'Show hint'}
                                    </button>
                                )}
                                {showHint && (
                                    <div style={{
                                        marginTop: '0.5rem',
                                        padding: '0.5rem 0.75rem',
                                        background: 'rgba(255,152,0,0.1)',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        color: '#ffb74d',
                                        fontFamily: 'monospace',
                                    }}>
                                        {selectedTask.hint}
                                    </div>
                                )}
                            </div>

                            {/* SQL Editor */}
                            <div style={{
                                borderRadius: '8px',
                                overflow: 'hidden',
                                border: '1px solid rgba(255,255,255,0.1)',
                                marginBottom: '0.75rem',
                            }}
                                onKeyDown={handleKeyDown}
                            >
                                <CodeMirror
                                    value={userQuery}
                                    onChange={setUserQuery}
                                    height="150px"
                                    theme="dark"
                                    extensions={[sql({ dialect: SQLite })]}
                                    placeholder="Write your SQL query here..."
                                    basicSetup={{
                                        lineNumbers: true,
                                        highlightActiveLine: true,
                                        foldGutter: false,
                                    }}
                                />
                            </div>

                            {/* Execute button */}
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
                                <button
                                    onClick={executeQuery}
                                    disabled={loading || !userQuery.trim()}
                                    style={{
                                        padding: '0.6rem 1.5rem',
                                        background: loading ? '#555' : 'var(--primary-color)',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '8px',
                                        cursor: loading ? 'wait' : 'pointer',
                                        fontSize: '0.9rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        fontWeight: 600,
                                    }}
                                >
                                    <Play size={16} /> {loading ? 'Running...' : 'Run'}
                                </button>
                                <span style={{ fontSize: '0.75rem', color: '#666' }}>Ctrl+Enter</span>
                            </div>

                            {/* Error */}
                            {error && (
                                <div style={{
                                    padding: '0.75rem',
                                    background: 'rgba(244,67,54,0.15)',
                                    border: '1px solid rgba(244,67,54,0.3)',
                                    borderRadius: '8px',
                                    color: '#ef5350',
                                    fontSize: '0.85rem',
                                    marginBottom: '1rem',
                                }}>
                                    {error}
                                </div>
                            )}

                            {/* Result */}
                            {result && <ResultPanel result={result} />}
                        </>
                    ) : (
                        /* No task selected — free query mode */
                        <div>
                            <div style={{
                                padding: '1rem',
                                background: 'rgba(18,18,18,0.8)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '8px',
                                marginBottom: '1rem',
                            }}>
                                <h3 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Code2 size={18} /> Free Mode
                                </h3>
                                <p style={{ margin: 0, color: '#888', fontSize: '0.85rem' }}>
                                    Select a task from the left, or write any SQL query below to explore the database.
                                </p>
                            </div>

                            <div style={{
                                borderRadius: '8px',
                                overflow: 'hidden',
                                border: '1px solid rgba(255,255,255,0.1)',
                                marginBottom: '0.75rem',
                            }}
                                onKeyDown={handleKeyDown}
                            >
                                <CodeMirror
                                    value={userQuery}
                                    onChange={setUserQuery}
                                    height="150px"
                                    theme="dark"
                                    extensions={[sql({ dialect: SQLite })]}
                                    placeholder="SELECT * FROM recipes LIMIT 5"
                                    basicSetup={{
                                        lineNumbers: true,
                                        highlightActiveLine: true,
                                        foldGutter: false,
                                    }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1rem' }}>
                                <button
                                    onClick={executeQuery}
                                    disabled={loading || !userQuery.trim()}
                                    style={{
                                        padding: '0.6rem 1.5rem',
                                        background: loading ? '#555' : 'var(--primary-color)',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '8px',
                                        cursor: loading ? 'wait' : 'pointer',
                                        fontSize: '0.9rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        fontWeight: 600,
                                    }}
                                >
                                    <Play size={16} /> {loading ? 'Running...' : 'Run'}
                                </button>
                                <span style={{ fontSize: '0.75rem', color: '#666' }}>Ctrl+Enter</span>
                            </div>

                            {error && (
                                <div style={{
                                    padding: '0.75rem',
                                    background: 'rgba(244,67,54,0.15)',
                                    border: '1px solid rgba(244,67,54,0.3)',
                                    borderRadius: '8px',
                                    color: '#ef5350',
                                    fontSize: '0.85rem',
                                    marginBottom: '1rem',
                                }}>
                                    {error}
                                </div>
                            )}

                            {result && <ResultPanel result={result} />}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Minimal markdown → HTML (bold, code, newlines) ───
function markdownToHtml(md) {
    if (!md) return '';
    return md
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.*?)`/g, '<code style="background:rgba(255,255,255,0.1);padding:1px 4px;border-radius:3px;font-size:0.85em">$1</code>')
        .replace(/\n/g, '<br/>');
}

// ─── SQL Cheat Sheet ──────────────────────────────────────
const CHEAT_SECTIONS = [
    {
        title: 'SELECT — выборка данных',
        items: [
            { sql: 'SELECT * FROM users;', desc: 'Все столбцы из таблицы' },
            { sql: 'SELECT name, abv FROM recipes;', desc: 'Конкретные столбцы' },
            { sql: 'SELECT DISTINCT style FROM recipes;', desc: 'Уникальные значения' },
            { sql: "SELECT name AS recipe_name FROM recipes;", desc: 'Переименование столбца (alias)' },
        ],
    },
    {
        title: 'WHERE — фильтрация',
        items: [
            { sql: 'SELECT * FROM recipes WHERE abv > 5;', desc: 'Сравнение: =, <>, <, >, <=, >=' },
            { sql: "SELECT * FROM recipes WHERE style LIKE '%Stout%';", desc: 'Поиск по подстроке (% — любые символы)' },
            { sql: 'SELECT * FROM recipes WHERE abv BETWEEN 4 AND 6;', desc: 'Диапазон значений' },
            { sql: "SELECT * FROM recipes WHERE style IN ('IPA', 'Pilsner');", desc: 'Одно из списка значений' },
            { sql: 'SELECT * FROM devices WHERE last_seen IS NULL;', desc: 'Проверка на NULL' },
            { sql: "SELECT * FROM recipes WHERE abv > 5 AND is_public = 1;", desc: 'AND / OR — комбинация условий' },
        ],
    },
    {
        title: 'ORDER BY — сортировка',
        items: [
            { sql: 'SELECT * FROM recipes ORDER BY abv;', desc: 'По возрастанию (ASC — по умолчанию)' },
            { sql: 'SELECT * FROM recipes ORDER BY abv DESC;', desc: 'По убыванию' },
            { sql: 'SELECT * FROM recipes ORDER BY style, abv DESC;', desc: 'По нескольким столбцам' },
            { sql: 'SELECT * FROM recipes ORDER BY abv DESC LIMIT 3;', desc: 'Топ-3 результата' },
        ],
    },
    {
        title: 'Агрегатные функции',
        items: [
            { sql: 'SELECT COUNT(*) FROM recipes;', desc: 'Количество строк' },
            { sql: 'SELECT AVG(abv) FROM recipes;', desc: 'Среднее значение' },
            { sql: 'SELECT SUM(likes_count) FROM recipes;', desc: 'Сумма' },
            { sql: 'SELECT MIN(abv), MAX(abv) FROM recipes;', desc: 'Минимум и максимум' },
            { sql: 'SELECT ROUND(AVG(abv), 1) AS avg_abv FROM recipes;', desc: 'Округление' },
        ],
    },
    {
        title: 'GROUP BY + HAVING',
        items: [
            { sql: 'SELECT style, COUNT(*) AS cnt FROM recipes GROUP BY style;', desc: 'Группировка с подсчётом' },
            { sql: 'SELECT style, AVG(abv) FROM recipes GROUP BY style HAVING AVG(abv) > 5;', desc: 'Фильтр по агрегату (HAVING)' },
        ],
    },
    {
        title: 'JOIN — соединение таблиц',
        items: [
            { sql: 'SELECT r.name, u.username\nFROM recipes r\nJOIN users u ON r.user_id = u.id;', desc: 'INNER JOIN — только совпадения' },
            { sql: 'SELECT u.username, COUNT(r.id) AS cnt\nFROM users u\nLEFT JOIN recipes r ON u.id = r.user_id\nGROUP BY u.username;', desc: 'LEFT JOIN — все из левой + совпадения' },
            { sql: 'SELECT u.username, r.name, bs.type\nFROM brew_sessions bs\nJOIN users u ON bs.user_id = u.id\nJOIN recipes r ON bs.recipe_id = r.id;', desc: 'Несколько JOIN подряд' },
        ],
    },
    {
        title: 'INSERT — добавление',
        items: [
            { sql: "INSERT INTO users (username, email)\nVALUES ('john', 'john@mail.com');", desc: 'Добавить одну строку' },
            { sql: "INSERT INTO recipes (name, style, user_id)\nSELECT name || ' (Copy)', style, 3\nFROM recipes WHERE id = 1;", desc: 'INSERT ... SELECT (копирование)' },
        ],
    },
    {
        title: 'UPDATE — изменение',
        items: [
            { sql: "UPDATE users SET email = 'new@mail.com'\nWHERE username = 'john';", desc: 'Обновить конкретную строку' },
            { sql: 'UPDATE recipes SET is_public = 1;', desc: 'Обновить все строки (без WHERE)' },
            { sql: "UPDATE recipes SET abv = ROUND(abv * 1.1, 2)\nWHERE style LIKE '%Stout%';", desc: 'Обновить с вычислением' },
        ],
    },
    {
        title: 'DELETE — удаление',
        items: [
            { sql: "DELETE FROM users WHERE username = 'john';", desc: 'Удалить конкретную строку' },
            { sql: 'DELETE FROM recipes WHERE likes_count = 0;', desc: 'Удалить по условию' },
            { sql: 'DELETE FROM brew_sessions\nWHERE user_id NOT IN (SELECT id FROM users);', desc: 'Удалить с подзапросом' },
        ],
    },
    {
        title: 'Подзапросы и CASE',
        items: [
            { sql: 'SELECT * FROM recipes\nWHERE likes_count > (SELECT AVG(likes_count) FROM recipes);', desc: 'Подзапрос в WHERE' },
            { sql: 'SELECT * FROM users\nWHERE id IN (SELECT user_id FROM recipes);', desc: 'IN с подзапросом' },
            { sql: "SELECT name,\n  CASE\n    WHEN abv < 5 THEN 'Light'\n    WHEN abv < 7 THEN 'Medium'\n    ELSE 'Strong'\n  END AS strength\nFROM recipes;", desc: 'CASE — условные выражения' },
        ],
    },
];

function CheatSheet() {
    return (
        <div style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            background: 'rgba(18,18,18,0.8)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
        }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BookOpen size={16} /> SQL Cheat Sheet
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '0.75rem' }}>
                {CHEAT_SECTIONS.map(section => (
                    <div key={section.title} style={{
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '6px',
                        padding: '0.75rem',
                    }}>
                        <div style={{
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#ff9800',
                            marginBottom: '0.5rem',
                        }}>
                            {section.title}
                        </div>
                        {section.items.map((item, i) => (
                            <div key={i} style={{ marginBottom: i < section.items.length - 1 ? '0.5rem' : 0 }}>
                                <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: '2px' }}>
                                    {item.desc}
                                </div>
                                <pre style={{
                                    margin: 0,
                                    padding: '0.35rem 0.5rem',
                                    background: 'rgba(255,255,255,0.04)',
                                    borderRadius: '4px',
                                    fontSize: '0.75rem',
                                    fontFamily: 'monospace',
                                    color: '#90caf9',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    lineHeight: 1.4,
                                }}>
                                    {item.sql}
                                </pre>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Schema Panel ─────────────────────────────────────────
function SchemaPanel({ schema }) {
    const [expanded, setExpanded] = useState({});
    const toggle = (table) => setExpanded(prev => ({ ...prev, [table]: !prev[table] }));

    return (
        <div style={{
            marginBottom: '1.5rem',
            padding: '1rem',
            background: 'rgba(18,18,18,0.8)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
        }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Table2 size={16} /> Database Schema
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '0.5rem' }}>
                {schema.map(({ table, columns }) => (
                    <div key={table} style={{
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '6px',
                        overflow: 'hidden',
                    }}>
                        <button
                            onClick={() => toggle(table)}
                            style={{
                                width: '100%',
                                padding: '0.5rem 0.75rem',
                                background: 'rgba(255,152,0,0.08)',
                                border: 'none',
                                color: '#ff9800',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem',
                                fontSize: '0.85rem',
                                fontWeight: 600,
                                fontFamily: 'monospace',
                            }}
                        >
                            {expanded[table] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            {table}
                            <span style={{ color: '#666', fontWeight: 400, marginLeft: 'auto' }}>
                                {columns.length} cols
                            </span>
                        </button>
                        {expanded[table] && (
                            <div style={{ padding: '0.25rem 0' }}>
                                {columns.map(col => (
                                    <div key={col.name} style={{
                                        padding: '0.2rem 0.75rem',
                                        fontSize: '0.78rem',
                                        fontFamily: 'monospace',
                                        display: 'flex',
                                        gap: '0.5rem',
                                        color: '#ccc',
                                    }}>
                                        <span style={{ color: col.pk ? '#ff9800' : '#90caf9', minWidth: '100px' }}>
                                            {col.pk ? '* ' : ''}{col.name}
                                        </span>
                                        <span style={{ color: '#666' }}>{col.type || 'TEXT'}</span>
                                        {col.notnull ? <span style={{ color: '#ef5350', fontSize: '0.7rem' }}>NOT NULL</span> : null}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Result Panel ─────────────────────────────────────────
function ResultPanel({ result }) {
    const { success, error: sqlError, userResult, expectedResult } = result;

    return (
        <div>
            {/* Status badge */}
            {success === true && (
                <div style={{
                    padding: '0.6rem 1rem',
                    background: 'rgba(76,175,80,0.15)',
                    border: '1px solid rgba(76,175,80,0.3)',
                    borderRadius: '8px',
                    color: '#66bb6a',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '1rem',
                    fontWeight: 600,
                }}>
                    <CheckCircle size={18} /> Correct!
                </div>
            )}
            {success === false && !sqlError && (
                <div style={{
                    padding: '0.6rem 1rem',
                    background: 'rgba(244,67,54,0.15)',
                    border: '1px solid rgba(244,67,54,0.3)',
                    borderRadius: '8px',
                    color: '#ef5350',
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '1rem',
                    fontWeight: 600,
                }}>
                    <XCircle size={18} /> Wrong answer. Compare your result with the expected one below.
                </div>
            )}

            {/* SQL error */}
            {sqlError && (
                <div style={{
                    padding: '0.75rem',
                    background: 'rgba(244,67,54,0.1)',
                    border: '1px solid rgba(244,67,54,0.3)',
                    borderRadius: '8px',
                    color: '#ef5350',
                    fontSize: '0.85rem',
                    fontFamily: 'monospace',
                    marginBottom: '1rem',
                    wordBreak: 'break-word',
                }}>
                    SQL Error: {sqlError}
                </div>
            )}

            {/* User result table */}
            {userResult && userResult.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#aaa' }}>
                        Your result ({userResult.length} rows)
                    </h4>
                    <ResultTable rows={userResult} />
                </div>
            )}
            {userResult && userResult.length === 0 && !sqlError && (
                <div style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1rem', fontStyle: 'italic' }}>
                    Query returned 0 rows.
                </div>
            )}

            {/* Expected result table (shown only on wrong answer) */}
            {expectedResult && expectedResult.length > 0 && (
                <div>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#aaa' }}>
                        Expected result ({expectedResult.length} rows)
                    </h4>
                    <ResultTable rows={expectedResult} highlight />
                </div>
            )}
        </div>
    );
}

// ─── Generic data table ───────────────────────────────────
function ResultTable({ rows, highlight }) {
    if (!rows || rows.length === 0) return null;
    const keys = Object.keys(rows[0]);

    return (
        <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.8rem',
                fontFamily: 'monospace',
            }}>
                <thead>
                    <tr>
                        {keys.map(k => (
                            <th key={k} style={{
                                padding: '0.5rem 0.75rem',
                                textAlign: 'left',
                                background: highlight ? 'rgba(76,175,80,0.1)' : 'rgba(255,152,0,0.08)',
                                color: highlight ? '#66bb6a' : '#ff9800',
                                borderBottom: '1px solid rgba(255,255,255,0.1)',
                                whiteSpace: 'nowrap',
                            }}>
                                {k}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i} style={{ background: i % 2 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                            {keys.map(k => (
                                <td key={k} style={{
                                    padding: '0.4rem 0.75rem',
                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                    color: '#ddd',
                                    maxWidth: '300px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {row[k] === null ? <span style={{ color: '#666', fontStyle: 'italic' }}>NULL</span> : String(row[k])}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
