// Small DOM and input helpers shared by the kana trainer and the vocabulary trainer.
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

  // ---------- Answer fields on phones ----------
  //
  // The on-screen keyboard covers half the screen. While an answer field has the
  // focus on a touch device, body.answering hides everything but the quiz card, so
  // prompt, field and feedback stay above the keyboard. The field never loses the
  // focus between questions, so the keyboard stays open the whole time.

  const coarse = matchMedia('(pointer: coarse)');

  // Focusing from script does not open the keyboard on phones, it would only
  // switch to the compact layout. There we only keep a focus the user gave.
  function focusAnswer(input) {
    if (!coarse.matches || document.activeElement === input) input.focus({ preventScroll: true });
  }

  function setAnswering(on) {
    on = on && coarse.matches;
    if (document.body.classList.contains('answering') === on) return;
    document.body.classList.toggle('answering', on);
    // Start at the top: the card is all that is left, and the browser keeps the field in view.
    if (on) window.scrollTo(0, 0);
  }

  let blurTimer = null;
  const active = () => document.activeElement?.closest?.('.answer input') || null;

  // When the keyboard is closed without leaving the field (Android back button),
  // the viewport grows back: leave the field so the full layout returns.
  const vv = window.visualViewport;
  if (vv) {
    let tallest = vv.height;
    let width = vv.width;
    let shrunk = false;
    vv.addEventListener('resize', () => {
      if (Math.abs(vv.scale - 1) > 0.01) return; // pinch zoom, not the keyboard
      if (vv.width !== width || !document.body.classList.contains('answering')) {
        width = vv.width;
        tallest = vv.height;
        shrunk = false;
        return;
      }
      if (vv.height < tallest - 120) shrunk = true;
      else if (shrunk && vv.height > tallest - 60) active()?.blur();
    });
  }

  // Tapping next to the card leaves the field and brings the settings back.
  document.addEventListener('pointerdown', (e) => {
    if (document.body.classList.contains('answering') && !e.target.closest('.card')) active()?.blur();
  });

  // opts.locked(): the answer has been checked, the field only waits for "next".
  // opts.typeAhead(): typing may start the next question right away (after a correct answer).
  function answerField(card, input, opts) {
    input.addEventListener('focus', () => {
      clearTimeout(blurTimer);
      setAnswering(true);
    });
    input.addEventListener('blur', () => {
      // A short grace period, so moving between questions does not flicker.
      blurTimer = setTimeout(() => setAnswering(!!active()), 120);
    });
    // Buttons in the card must not take the focus away – that would close the keyboard.
    card.addEventListener('mousedown', (e) => {
      if (document.activeElement === input && e.target.closest('button')) e.preventDefault();
    });
    // A read-only field closes the keyboard on some phones, so block typing instead.
    input.addEventListener('beforeinput', (e) => {
      if (!opts.locked()) return;
      if (e.inputType === 'insertText' && opts.typeAhead()) {
        opts.next(); // clears the field; the typed letter then lands in the new one
        return;
      }
      if (e.cancelable) e.preventDefault();
    });
  }

  window.KanaUtil = { $, $$, h, pct, setSegmented, focusAnswer, answerField };
})();
