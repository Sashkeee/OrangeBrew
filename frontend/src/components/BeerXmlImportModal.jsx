import React, { useState, useRef, useCallback } from 'react';
import { Upload, X, CheckCircle, AlertCircle, FileText } from 'lucide-react';
import { beerxmlApi } from '../api/client';

/**
 * BeerXmlImportModal — drag-and-drop BeerXML import dialog.
 *
 * Props:
 *   onClose()           — called when user closes the modal
 *   onImported(recipes) — called after successful import with the list of saved recipes
 */
export default function BeerXmlImportModal({ onClose, onImported }) {
    const [status, setStatus]   = useState('idle');     // 'idle' | 'uploading' | 'success' | 'error'
    const [result, setResult]   = useState(null);       // API response
    const [dragging, setDragging] = useState(false);
    const fileInputRef = useRef(null);

    // ─── File handling ────────────────────────────────────

    const handleFile = useCallback(async (file) => {
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.xml')) {
            setStatus('error');
            setResult({ error: 'Только файлы .xml поддерживаются' });
            return;
        }

        setStatus('uploading');
        setResult(null);

        try {
            const data = await beerxmlApi.import(file);
            setResult(data);
            setStatus(data.imported > 0 ? 'success' : 'error');
            if (data.imported > 0 && onImported) {
                onImported(data.recipes);
            }
        } catch (err) {
            setStatus('error');
            setResult({ error: err.message });
        }
    }, [onImported]);

    // ─── Drag-and-drop ────────────────────────────────────

    const onDragOver  = (e) => { e.preventDefault(); setDragging(true); };
    const onDragLeave = ()  => setDragging(false);
    const onDrop      = (e) => {
        e.preventDefault();
        setDragging(false);
        handleFile(e.dataTransfer.files[0]);
    };

    // ─── Render ───────────────────────────────────────────

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>

                {/* Header */}
                <div className="modal-header">
                    <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Импорт BeerXML</h2>
                    <button className="btn-icon" onClick={onClose} aria-label="Закрыть">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: '1.5rem' }}>

                    {/* Drop zone */}
                    {status !== 'success' && (
                        <div
                            className={`beerxml-dropzone${dragging ? ' dragging' : ''}`}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onDrop={onDrop}
                            onClick={() => fileInputRef.current?.click()}
                            role="button"
                            tabIndex={0}
                            onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
                            aria-label="Перетащите .xml файл или нажмите для выбора"
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xml,application/xml,text/xml"
                                style={{ display: 'none' }}
                                onChange={e => handleFile(e.target.files[0])}
                            />
                            {status === 'uploading' ? (
                                <div className="beerxml-uploading">
                                    <div className="spinner" />
                                    <span>Импортируем...</span>
                                </div>
                            ) : (
                                <>
                                    <Upload size={36} style={{ opacity: 0.5 }} />
                                    <p style={{ margin: '0.75rem 0 0.25rem' }}>
                                        Перетащите <strong>.xml</strong> файл сюда
                                    </p>
                                    <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.6 }}>
                                        или нажмите для выбора (макс. 5 МБ)
                                    </p>
                                </>
                            )}
                        </div>
                    )}

                    {/* Error state */}
                    {status === 'error' && (
                        <div className="beerxml-result error">
                            <AlertCircle size={20} />
                            <div>
                                <strong>Ошибка импорта</strong>
                                <p style={{ margin: '0.25rem 0 0' }}>
                                    {result?.error || 'Неизвестная ошибка'}
                                </p>
                                {result?.errors?.length > 0 && (
                                    <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
                                        {result.errors.map((e, i) => (
                                            <li key={i}><strong>{e.name}</strong>: {e.errors?.join(', ')}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Success state */}
                    {status === 'success' && (
                        <div className="beerxml-result success">
                            <CheckCircle size={20} />
                            <div style={{ flex: 1 }}>
                                <strong>Импортировано {result.imported} рецепт{result.imported === 1 ? '' : 'ов'}</strong>
                                {result.failed > 0 && (
                                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem' }}>
                                        Пропущено: {result.failed}
                                    </p>
                                )}
                                <ul style={{ margin: '0.75rem 0 0', paddingLeft: '1.2rem', lineHeight: 1.7 }}>
                                    {result.recipes.map(r => (
                                        <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <FileText size={14} />
                                            {r.name}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="modal-footer">
                    {status === 'success' ? (
                        <button className="btn btn-primary" onClick={onClose}>
                            Готово
                        </button>
                    ) : (
                        <>
                            {status === 'error' && (
                                <button className="btn btn-secondary" onClick={() => { setStatus('idle'); setResult(null); }}>
                                    Попробовать снова
                                </button>
                            )}
                            <button className="btn btn-secondary" onClick={onClose}>
                                Отмена
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
