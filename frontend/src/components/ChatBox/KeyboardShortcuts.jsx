import React, { useState, useEffect } from 'react';

const KeyboardShortcuts = ({ darkMode }) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        setShow(true);
      }
      if (e.key === 'Escape') {
        setShow(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!show) return null;

  const shortcuts = [
    { key: 'Enter', desc: 'Send message' },
    { key: 'Shift + Enter', desc: 'New line (in multi-line mode)' },
    { key: 'Ctrl + /', desc: 'Show this help' },
    { key: 'Escape', desc: 'Close dialogs' },
    { key: '@username', desc: 'Mention someone' },
    { key: '**text**', desc: 'Bold text' },
    { key: '*text*', desc: 'Italic text' },
    { key: '`code`', desc: 'Code formatting' }
  ];

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      zIndex: 1500,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }} onClick={() => setShow(false)}>
      <div style={{
        backgroundColor: darkMode ? '#1f2937' : '#ffffff',
        padding: '24px',
        borderRadius: '12px',
        maxWidth: '400px',
        margin: '20px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px 0', color: darkMode ? '#f9fafb' : '#111827' }}>
          Keyboard Shortcuts
        </h3>
        <div style={{ display: 'grid', gap: '8px' }}>
          {shortcuts.map((shortcut, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <code style={{
                backgroundColor: darkMode ? '#374151' : '#f3f4f6',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '12px',
                color: darkMode ? '#e5e7eb' : '#111827'
              }}>
                {shortcut.key}
              </code>
              <span style={{ fontSize: '14px', color: darkMode ? '#d1d5db' : '#6b7280' }}>
                {shortcut.desc}
              </span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: '16px', textAlign: 'center' }}>
          <button
            onClick={() => setShow(false)}
            style={{
              padding: '8px 16px',
              border: 'none',
              backgroundColor: darkMode ? '#0ea5a4' : '#2563eb',
              color: '#ffffff',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcuts;