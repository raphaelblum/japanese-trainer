// Small DOM helpers shared by the kana trainer and the vocabulary trainer.
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const h = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'style') node.style.cssText = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    node.append(...children.flat().filter((c) => c != null && c !== false));
    return node;
  };
  const pct = (x) => `${Math.round(x * 100)} %`;
  const setSegmented = (container, value, key = 'script') => {
    $$('button', container).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[key] === value)));
  };

  window.KanaUtil = { $, $$, h, pct, setSegmented };
})();
