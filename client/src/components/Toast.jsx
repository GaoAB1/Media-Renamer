import React, { useState } from 'react';

export function toast(type, msg) {
  window.dispatchEvent(new CustomEvent('mr-toast', { detail: { type, msg } }));
}
toast.success = (msg) => toast('success', msg);
toast.error = (msg) => toast('error', msg);

export function ToastHost() {
  const [items, setItems] = useState([]);

  React.useEffect(() => {
    const h = (e) => {
      const id = Date.now() + Math.random();
      setItems(prev => [...prev, { id, ...e.detail }]);
      setTimeout(() => setItems(prev => prev.filter(i => i.id !== id)), 3200);
    };
    window.addEventListener('mr-toast', h);
    return () => window.removeEventListener('mr-toast', h);
  }, []);

  return (
    <div className="toast-wrap">
      {items.map(i => (
        <div key={i.id} className={'toast' + (i.type === 'error' ? ' error' : '')}>{i.msg}</div>
      ))}
    </div>
  );
}
