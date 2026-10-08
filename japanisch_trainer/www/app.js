window.KanaStore.ready.then(() => {
  'use strict';

  const { GROUPS, ROW_DEFS, KANA, KANA_BY_ID } = window.KanaData;
  const { ITEMS, grade, normalizeInput } = window.KanaSentences;

  const HISTORY_LEN = 10; // answers per kana that drive the weighting
  const SCRIPT_NAMES = { h: 'Hiragana', k: 'Katakana' };
  const LEVEL_NAMES = { 1: 'leicht', 2: 'mittel', 3: 'schwer' };
  const DEFAULT_ROWS = ROW_DEFS.filter((r) => r.group !== 'yoon').map((r) => r.id);
  const WEAK_LIMIT = 12;
  const MODE_HINTS = {
    kana: 'Enter = prüfen / weiter · Falsche Zeichen kommen ein paar Fragen später noch einmal und danach öfter dran.',
    word: 'Lange Vokale ausschreiben: koohii oder kōhī · Fehler zählen auch für die einzelnen Zeichen.',
    sentence: 'Leer- und Satzzeichen sind egal · は als Partikel = wa, を = o, へ = e · Katakana = Sätze mit überwiegend Katakana, Sätze mit nur einzelnen Lehnwörtern gibt es unter „Beide“.',
  };

  const { $, $$, h, pct, setSegmented } = window.KanaUtil;

  // ---------- Persistence ----------

  // The kana statistics of the active profile, kept by store.js.
  function loadStore() {
    const data = (window.KanaStore.user.kana ||= {});
    data.stats ||= {};
    data.days ||= {};
    data.items ||= {}; // per word / sentence: { c, w, last, t }
    data.settings = { mode: 'kana', script: 'h', level: 'all', rows: DEFAULT_ROWS, heatScript: 'h', tableScript: 'h', ...(data.settings || {}) };
    return data;
  }

  const store = loadStore();
  const save = () => window.KanaStore.saveUser();

  const todayKey = (d = new Date()) => d.toLocaleDateString('sv-SE'); // YYYY-MM-DD in local time

  function record(kana, ok, given) {
    const s = (store.stats[kana.id] ||= { c: 0, w: 0, h: [], wa: {}, t: 0 });
    if (ok) s.c++;
    else s.w++;
    s.h.push(ok ? 1 : 0);
    if (s.h.length > HISTORY_LEN) s.h.shift();
    if (!ok && given) s.wa[given] = (s.wa[given] || 0) + 1;
    s.t = Date.now();

    const day = (store.days[todayKey()] ||= { c: 0, w: 0 });
    if (ok) day.c++;
    else day.w++;
    save();
  }

  // ---------- Scoring ----------

  const seen = (s) => s && s.h.length > 0;
  const recentWrong = (s) => s.h.filter((x) => !x).length;
  const recentAccuracy = (s) => 1 - recentWrong(s) / s.h.length;
  // Smoothed so that a single answer does not swing the score to 0 or 1.
  const recentError = (s) => (recentWrong(s) + 0.5) / (s.h.length + 1);

  // Unseen kana get a medium weight so they are introduced steadily.
  // Mastered kana drop to ~0.9, kana you keep missing climb towards ~8.
  function weightOf(kana) {
    const s = store.stats[kana.id];
    if (!seen(s)) return 3;
    return 0.5 + 8 * recentError(s);
  }

  function isSolid(s) {
    return seen(s) && s.h.length >= 3 && s.h.slice(-3).every(Boolean) && recentWrong(s) <= 1;
  }

  function weakKana() {
    return KANA.map((k) => ({ k, s: store.stats[k.id] }))
      .filter(({ s }) => seen(s) && s.h.includes(0))
      .sort((a, b) => recentError(b.s) - recentError(a.s) || b.s.w - a.s.w)
      .slice(0, WEAK_LIMIT);
  }

  // Which kana of the same script would the given (wrong) answer have been?
  function confusedWith(given, script) {
    return KANA.find((k) => k.script === script && k.accept.includes(given));
  }

  function topWrongAnswer(s) {
    const entries = Object.entries(s.wa || {});
    if (!entries.length) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return { answer: entries[0][0], count: entries[0][1] };
  }

  // ---------- Quiz ----------

  const quiz = {
    current: null, // kana object, or a word/sentence item in the other modes
    answered: false,
    recent: [],
    recentItems: [],
    retry: [], // { id, at } – missed kana come back a few questions later
    tick: 0,
    focus: null, // array of kana ids when training problem kana only
    session: { asked: 0, correct: 0, streak: 0, best: 0 },
    timer: null,
  };

  const ui = {
    card: $('#card'),
    meta: $('#card-meta'),
    kana: $('#kana'),
    phrase: $('#phrase'),
    meaning: $('#meaning'),
    form: $('#answer-form'),
    input: $('#answer'),
    submit: $('#submit-btn'),
    feedback: $('#feedback'),
    skip: $('#skip'),
    info: $('#item-info'),
    empty: $('#empty'),
    session: $('#session'),
    settings: $('#settings'),
    toggleSettings: $('#toggle-settings'),
    poolCount: $('#pool-count'),
    focusBanner: $('#focus-banner'),
  };

  function activePool() {
    if (quiz.focus) return quiz.focus.map((id) => KANA_BY_ID[id]);
    const { script, rows } = store.settings;
    const scripts = script === 'hk' ? ['h', 'k'] : [script];
    const rowSet = new Set(rows);
    return KANA.filter((k) => scripts.includes(k.script) && rowSet.has(k.row));
  }

  function pickNext(pool) {
    quiz.tick++;
    const ids = new Set(pool.map((k) => k.id));

    const dueIdx = quiz.retry.findIndex((r) => r.at <= quiz.tick && ids.has(r.id));
    if (dueIdx >= 0) return KANA_BY_ID[quiz.retry.splice(dueIdx, 1)[0].id];

    const avoidCount = pool.length > 6 ? 3 : pool.length > 1 ? 1 : 0;
    const avoid = new Set(avoidCount ? quiz.recent.slice(-avoidCount) : []);
    const candidates = pool.filter((k) => !avoid.has(k.id));
    const weights = candidates.map(weightOf);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  function nextQuestion() {
    clearTimeout(quiz.timer);
    if (store.settings.mode !== 'kana') {
      nextPhrase();
      return;
    }
    ui.phrase.hidden = true;
    ui.meaning.hidden = true;
    const pool = activePool();
    ui.poolCount.textContent = pool.length;

    const hasPool = pool.length > 0;
    ui.empty.hidden = hasPool;
    for (const node of [ui.meta, ui.kana, ui.form, ui.feedback, ui.skip.parentElement]) node.hidden = !hasPool;
    if (!hasPool) {
      quiz.current = null;
      return;
    }

    const kana = pickNext(pool);
    quiz.current = kana;
    quiz.answered = false;
    quiz.recent.push(kana.id);
    if (quiz.recent.length > 6) quiz.recent.shift();

    ui.card.classList.remove('is-correct', 'is-wrong');
    ui.kana.textContent = kana.char;
    ui.kana.classList.toggle('long', kana.char.length > 1);
    ui.kana.classList.remove('pop');
    void ui.kana.offsetWidth; // restart the animation
    ui.kana.classList.add('pop');
    ui.meta.textContent = SCRIPT_NAMES[kana.script];
    resetAnswerUi();
  }

  function resetAnswerUi() {
    ui.input.value = '';
    ui.input.readOnly = false;
    ui.submit.textContent = 'Prüfen';
    ui.feedback.replaceChildren();
    ui.skip.disabled = false;
    ui.info.textContent = '';
    if (!document.hidden && currentView() === 'quiz') ui.input.focus({ preventScroll: true });
  }

  const normalize = (s) => s.trim().toLowerCase().replace(/[\s'’`-]/g, '');

  function shakeInput() {
    ui.input.classList.remove('shake');
    void ui.input.offsetWidth;
    ui.input.classList.add('shake');
    ui.input.focus();
  }

  function countSession(ok) {
    const ss = quiz.session;
    ss.asked++;
    if (ok) {
      ss.correct++;
      ss.streak++;
      ss.best = Math.max(ss.best, ss.streak);
    } else {
      ss.streak = 0;
    }
  }

  function submitAnswer(skipped = false) {
    if (quiz.answered) {
      nextQuestion();
      return;
    }
    if (store.settings.mode !== 'kana') {
      submitPhrase(skipped);
      return;
    }
    const kana = quiz.current;
    if (!kana) return;

    const given = normalize(ui.input.value);
    if (!given && !skipped) {
      shakeInput();
      return;
    }

    const ok = !skipped && kana.accept.includes(given);
    quiz.answered = true;
    record(kana, ok, skipped ? null : given);

    countSession(ok);
    if (!ok && !quiz.retry.some((r) => r.id === kana.id)) {
      quiz.retry.push({ id: kana.id, at: quiz.tick + 3 + Math.floor(Math.random() * 3) });
    }

    ui.input.readOnly = true;
    ui.skip.disabled = true;
    ui.card.classList.add(ok ? 'is-correct' : 'is-wrong');

    if (ok) {
      ui.feedback.replaceChildren(h('span', { class: 'fb-good' }, '✓ Richtig'));
      if (given !== kana.romaji) {
        ui.feedback.append(h('span', { class: 'fb-note' }, ` – üblich geschrieben: ${kana.romaji}`));
      }
      ui.submit.textContent = 'Weiter';
      quiz.timer = setTimeout(nextQuestion, given !== kana.romaji ? 1400 : 750);
    } else {
      const parts = [h('span', { class: 'fb-bad' }, '✗ '), h('strong', { class: 'fb-answer' }, kana.romaji)];
      if (skipped) {
        parts.push(h('span', { class: 'fb-note' }, ' – übersprungen'));
      } else {
        const other = confusedWith(given, kana.script);
        parts.push(h('span', { class: 'fb-note' }, ` – du: „${given}“`));
        if (other) parts.push(h('span', { class: 'fb-note' }, ' wäre '), h('span', { class: 'fb-kana', lang: 'ja' }, other.char));
      }
      ui.feedback.replaceChildren(...parts);
      ui.submit.textContent = 'Weiter';
    }

    const s = store.stats[kana.id];
    ui.info.textContent = `Bisher ${s.c}× richtig · ${s.w}× falsch`;
    renderSession();
  }

  // ---------- Words & sentences ----------

  function phrasePool() {
    const { mode, script, level } = store.settings;
    return ITEMS.filter(
      (it) =>
        it.type === mode &&
        (script === 'hk' || it.script === script) &&
        (mode !== 'sentence' || level === 'all' || String(it.level) === level),
    );
  }

  const kanaTokens = (item) => item.words.flat().filter((t) => t.kanaId);

  // Prefer items that contain your weak kana, and items you got wrong last time.
  function phraseWeight(item) {
    const weights = kanaTokens(item).map((t) => weightOf(KANA_BY_ID[t.kanaId]));
    const avg = weights.reduce((a, b) => a + b, 0) / Math.max(1, weights.length);
    const s = store.items[item.id];
    const itemFactor = !s ? 1.3 : s.last ? 0.6 : 2;
    return (avg + 0.5 * Math.max(0, ...weights)) * itemFactor;
  }

  function nextPhrase() {
    const pool = phrasePool();
    ui.empty.hidden = true;
    for (const node of [ui.meta, ui.phrase, ui.form, ui.feedback, ui.skip.parentElement]) node.hidden = false;
    ui.kana.hidden = true;
    ui.meaning.hidden = true;

    const avoid = new Set(quiz.recentItems.slice(-Math.min(5, pool.length - 1)));
    const candidates = pool.filter((it) => !avoid.has(it.id));
    const weights = candidates.map(phraseWeight);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let item = candidates[candidates.length - 1];
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        item = candidates[i];
        break;
      }
    }

    quiz.current = item;
    quiz.answered = false;
    quiz.recentItems.push(item.id);
    if (quiz.recentItems.length > 8) quiz.recentItems.shift();

    ui.card.classList.remove('is-correct', 'is-wrong');
    ui.phrase.className = `phrase ${item.type}`;
    ui.phrase.textContent = item.text;
    void ui.phrase.offsetWidth;
    ui.phrase.classList.add('pop');
    ui.meta.textContent = item.type === 'word' ? 'Wort' : `Satz · ${LEVEL_NAMES[item.level]}`;
    ui.input.placeholder = item.type === 'word' ? 'Wort in Romaji …' : 'Ganzen Satz in Romaji …';
    resetAnswerUi();
  }

  function submitPhrase(skipped) {
    const item = quiz.current;
    if (!item) return;
    if (!skipped && !normalizeInput(ui.input.value)) {
      shakeInput();
      return;
    }

    const result = skipped ? null : grade(item.words, ui.input.value);
    const ok = !!result?.ok;
    quiz.answered = true;

    // Every kana in the phrase counts towards its own statistics. Skipping says
    // nothing about the individual kana, so it only counts for the phrase itself.
    if (result) {
      for (const r of result.results) {
        if (r.token.kanaId) record(KANA_BY_ID[r.token.kanaId], r.ok, r.ok ? null : r.typed || null);
      }
    }
    const s = (store.items[item.id] ||= { c: 0, w: 0, last: false, t: 0 });
    if (ok) s.c++;
    else s.w++;
    s.last = ok;
    s.t = Date.now();
    save();
    countSession(ok);

    ui.input.readOnly = true;
    ui.skip.disabled = true;
    ui.card.classList.add(ok ? 'is-correct' : 'is-wrong');
    ui.submit.textContent = 'Weiter';

    const byToken = new Map((result?.results || []).map((r) => [r.token, r]));
    const wrongCount = result ? result.results.filter((r) => !r.ok).length : 0;
    const breakdown = h(
      'div',
      { class: 'breakdown' },
      item.words.map((word) =>
        h(
          'span',
          { class: 'bd-word' },
          word.map((t) => {
            if (t.kind === 'punct') return h('span', { class: 'bd-tok punct' }, h('span', { class: 'k', lang: 'ja' }, t.text), h('span', { class: 'r' }, '\u00a0'));
            const r = byToken.get(t);
            const bad = r && !r.ok;
            const tip = bad
              ? `${t.text} = ${t.accept.filter(Boolean).join(' / ')}\ndu: ${r.typed ? `„${r.typed}“` : '(fehlt)'}`
              : null;
            return h(
              'span',
              { class: `bd-tok${bad ? ' bad' : ''}${t.kind === 'particle' ? ' particle' : ''}`, 'data-tip': tip, tabindex: bad ? '0' : null },
              h('span', { class: 'k', lang: 'ja' }, t.text),
              h('span', { class: 'r' }, t.canonical || '\u00a0'),
            );
          }),
        ),
      ),
    );

    const summary = ok
      ? h('div', {}, h('span', { class: 'fb-good' }, '✓ Alles richtig!'))
      : h(
          'div',
          {},
          h('span', { class: 'fb-bad' }, '✗ '),
          h('span', { class: 'fb-note' }, skipped ? 'übersprungen – so wird es gelesen:' : `${wrongCount} ${wrongCount === 1 ? 'Stelle' : 'Stellen'} falsch (rot markiert):`),
        );
    ui.feedback.replaceChildren(summary, breakdown);
    ui.meaning.textContent = `„${item.de}“`;
    ui.meaning.hidden = false;
    ui.info.textContent = `Bisher ${s.c}× richtig · ${s.w}× falsch`;
    renderSession();
  }

  function applyMode() {
    const { mode } = store.settings;
    setSegmented($('#quiz-mode'), mode, 'mode');
    ui.toggleSettings.hidden = mode !== 'kana';
    $('#quiz-level').hidden = mode !== 'sentence';
    setSegmented($('#quiz-level'), store.settings.level, 'level');
    if (mode !== 'kana') toggleSettings(false);
    ui.card.classList.toggle('phrase-mode', mode !== 'kana');
    ui.input.placeholder = 'Romaji eintippen …';
    $('#quiz-hint').textContent = MODE_HINTS[mode];
  }

  function renderSession() {
    const { asked, correct, streak, best } = quiz.session;
    if (!asked) {
      ui.session.replaceChildren();
      return;
    }
    ui.session.replaceChildren(
      h('span', {}, h('b', {}, `${correct}/${asked}`), ' richtig'),
      h('span', {}, h('b', {}, pct(correct / asked))),
      h('span', {}, 'Serie ', h('b', {}, streak)),
      h('span', {}, 'Bestwert ', h('b', {}, best)),
    );
  }

  function setFocus(ids) {
    quiz.focus = ids && ids.length ? ids : null;
    if (quiz.focus && store.settings.mode !== 'kana') {
      store.settings.mode = 'kana';
      save();
      applyMode();
    }
    quiz.retry = [];
    ui.focusBanner.hidden = !quiz.focus;
    if (quiz.focus) $('#focus-count').textContent = quiz.focus.length;
    ui.toggleSettings.disabled = !!quiz.focus;
    $$('#quiz-script button').forEach((b) => (b.disabled = !!quiz.focus));
    if (quiz.focus) toggleSettings(false);
    nextQuestion();
  }

  // ---------- Settings (row selection) ----------

  function rowLabelChar(row, script) {
    const cell = row.cells.find(Boolean);
    return script === 'k' ? cell.kata : cell.hira;
  }

  function renderSettings() {
    const { rows, script } = store.settings;
    const selected = new Set(rows);
    ui.settings.replaceChildren(
      ...GROUPS.map((group) => {
        const groupRows = ROW_DEFS.filter((r) => r.group === group.id);
        const setGroup = (on) => {
          const ids = new Set(store.settings.rows);
          groupRows.forEach((r) => (on ? ids.add(r.id) : ids.delete(r.id)));
          updateRows([...ids]);
        };
        return h(
          'div',
          { class: 'settings-group' },
          h(
            'div',
            { class: 'settings-head' },
            h('span', {}, group.label, h('small', {}, ` ${group.hint}`)),
            h(
              'span',
              { class: 'settings-actions' },
              h('button', { type: 'button', class: 'link', onclick: () => setGroup(true) }, 'alle'),
              h('button', { type: 'button', class: 'link', onclick: () => setGroup(false) }, 'keine'),
            ),
          ),
          h(
            'div',
            { class: 'chips' },
            groupRows.map((row) =>
              h(
                'button',
                {
                  type: 'button',
                  class: 'chip',
                  'aria-pressed': String(selected.has(row.id)),
                  onclick: () => {
                    const ids = new Set(store.settings.rows);
                    ids.has(row.id) ? ids.delete(row.id) : ids.add(row.id);
                    updateRows([...ids]);
                  },
                },
                h('span', { lang: 'ja' }, rowLabelChar(row, script)),
                h('small', {}, row.id),
              ),
            ),
          ),
        );
      }),
    );
  }

  function updateRows(rows) {
    // Keep the canonical row order so the stored list stays stable.
    const set = new Set(rows);
    store.settings.rows = ROW_DEFS.filter((r) => set.has(r.id)).map((r) => r.id);
    save();
    renderSettings();
    const pool = activePool();
    ui.poolCount.textContent = pool.length;
    if (!quiz.current || !pool.includes(quiz.current) || !pool.length) nextQuestion();
  }

  function toggleSettings(force) {
    const open = force ?? ui.settings.hidden;
    ui.settings.hidden = !open;
    ui.toggleSettings.setAttribute('aria-expanded', String(open));
    if (open) renderSettings();
  }

  // ---------- Kana grid (shared by overview and heatmap) ----------

  function heatStyle(acc) {
    return `--acc:${acc.toFixed(3)}`;
  }

  function renderKanaGrid(script, mode) {
    return GROUPS.map((group) => {
      const rows = ROW_DEFS.filter((r) => r.group === group.id);
      return h(
        'div',
        { class: 'grid-section' },
        h('h3', {}, group.label, h('small', {}, ` ${group.hint}`)),
        h(
          'div',
          { class: `kgrid cols-${group.cols.length}` },
          rows.flatMap((row) =>
            row.cells.map((cell) => {
              if (!cell) return h('div', { class: 'cell blank', 'aria-hidden': 'true' });
              if (mode === 'heat') return heatCell(cell, script);
              return tableCell(cell, script);
            }),
          ),
        ),
      );
    });
  }

  function tableCell(cell, script) {
    const main = script === 'k' ? cell.kata : cell.hira;
    const alt = script === 'hk' ? cell.kata : null;
    return h(
      'button',
      {
        type: 'button',
        class: `cell${alt ? ' both' : ''}`,
        'data-tip': cell.accept.length > 1 ? `auch: ${cell.accept.slice(1).join(', ')}` : null,
        onclick: (e) => {
          speak(main);
          e.currentTarget.classList.remove('flash');
          void e.currentTarget.offsetWidth;
          e.currentTarget.classList.add('flash');
        },
      },
      h(
        'span',
        { class: 'ch', lang: 'ja' },
        main,
        alt ? h('span', { class: 'ch-alt' }, alt) : null,
      ),
      h('span', { class: 'ro' }, cell.romaji),
    );
  }

  function heatCell(cell, script) {
    const char = script === 'k' ? cell.kata : cell.hira;
    const s = store.stats[char];
    if (!seen(s)) {
      return h(
        'div',
        { class: 'cell heat unseen', tabindex: '0', 'data-tip': `${char} · ${cell.romaji}\nnoch nicht geübt` },
        h('span', { class: 'ch', lang: 'ja' }, char),
        h('span', { class: 'ro' }, cell.romaji),
      );
    }
    const acc = recentAccuracy(s);
    const wrong = topWrongAnswer(s);
    const tip = [
      `${char} · ${cell.romaji}`,
      `Zuletzt: ${pct(acc)} (${s.h.length - recentWrong(s)}/${s.h.length})`,
      `Gesamt: ${s.c}× richtig, ${s.w}× falsch`,
      wrong ? `Häufigster Fehler: „${wrong.answer}“ (${wrong.count}×)` : null,
    ]
      .filter(Boolean)
      .join('\n');
    return h(
      'div',
      { class: 'cell heat', style: heatStyle(acc), tabindex: '0', 'data-tip': tip },
      h('span', { class: 'ch', lang: 'ja' }, char),
      h('span', { class: 'ro' }, pct(acc)),
    );
  }

  // ---------- Speech ----------

  let jaVoice = null;
  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    jaVoice = speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith('ja')) || null;
    const hint = $('#speak-hint');
    if (hint) hint.textContent = jaVoice ? 'Tippe ein Zeichen an, um es zu hören.' : '';
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
  }
  function speak(text) {
    if (!jaVoice) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = jaVoice;
    u.lang = jaVoice.lang;
    u.rate = 0.8;
    speechSynthesis.speak(u);
  }

  // ---------- Analysis ----------

  function renderStats() {
    const entries = KANA.map((k) => store.stats[k.id]).filter(seen);
    const c = entries.reduce((a, s) => a + s.c, 0);
    const w = entries.reduce((a, s) => a + s.w, 0);
    const solid = entries.filter(isSolid).length;
    const today = store.days[todayKey()] || { c: 0, w: 0 };
    const itemStats = ITEMS.map((it) => store.items[it.id]).filter(Boolean);
    const itemsTried = itemStats.length;
    const itemsSolved = itemStats.filter((s) => s.last).length;

    const kpi = (label, value, sub) =>
      h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, label), h('div', { class: 'kpi-value' }, value), sub ? h('div', { class: 'kpi-sub' }, sub) : null);

    $('#kpis').replaceChildren(
      kpi('Antworten', c + w, `heute ${today.c + today.w}`),
      kpi('Trefferquote', c + w ? pct(c / (c + w)) : '–', today.c + today.w ? `heute ${pct(today.c / (today.c + today.w))}` : 'heute –'),
      kpi('Geübte Zeichen', `${entries.length}`, `von ${KANA.length}`),
      kpi('Sitzen sicher', `${solid}`, 'letzte 3 richtig'),
      kpi('Wörter & Sätze', `${itemsSolved}`, `von ${itemsTried} zuletzt fehlerfrei`),
    );

    // Problem kana
    const weak = weakKana();
    $('#train-weak').disabled = !weak.length;
    $('#train-weak').onclick = () => {
      setFocus(weak.map(({ k }) => k.id));
      location.hash = '#quiz';
    };
    $('#weak-list').replaceChildren(
      ...(weak.length
        ? weak.map(({ k, s }) => {
            const wrong = topWrongAnswer(s);
            const other = wrong && confusedWith(wrong.answer, k.script);
            return h(
              'div',
              { class: 'weak' },
              h('div', { class: 'weak-kana', lang: 'ja' }, k.char),
              h(
                'div',
                { class: 'weak-body' },
                h('div', { class: 'weak-title' }, h('strong', {}, k.romaji), h('span', {}, ` · ${SCRIPT_NAMES[k.script]}`)),
                h(
                  'div',
                  { class: 'dots', 'aria-label': `Letzte ${s.h.length} Antworten: ${s.h.length - recentWrong(s)} richtig` },
                  s.h.map((x) => h('i', { class: x ? 'ok' : 'no' })),
                ),
                h('div', { class: 'weak-sub' }, `${pct(recentAccuracy(s))} zuletzt · ${s.c}✓ ${s.w}✗ gesamt`),
                wrong
                  ? h(
                      'div',
                      { class: 'weak-sub' },
                      `oft getippt: „${wrong.answer}“ ${wrong.count}×`,
                      other ? h('span', {}, ' → das wäre ', h('span', { class: 'fb-kana', lang: 'ja' }, other.char)) : null,
                    )
                  : null,
              ),
            );
          })
        : [h('p', { class: 'empty-note' }, entries.length ? 'Keine Problemzeichen – deine letzten Antworten waren alle richtig. 🎉' : 'Noch keine Daten. Leg im Tab „Üben“ los!')]),
    );

    // Heatmap
    setSegmented($('#heat-script'), store.settings.heatScript);
    $('#heatmap').replaceChildren(...renderKanaGrid(store.settings.heatScript, 'heat'));

    renderDays();
  }

  function renderDays() {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = todayKey(d);
      days.push({ d, key, ...(store.days[key] || { c: 0, w: 0 }) });
    }
    const max = Math.max(1, ...days.map((d) => d.c + d.w));
    const fmt = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
    const fmtLong = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

    $('#days').replaceChildren(
      h(
        'div',
        { class: 'days-plot' },
        days.map((d) => {
          const total = d.c + d.w;
          const tip = total ? `${fmtLong.format(d.d)}\n${d.c} richtig · ${d.w} falsch · ${pct(d.c / total)}` : `${fmtLong.format(d.d)}\nnicht geübt`;
          return h(
            'div',
            { class: 'day', tabindex: '0', 'data-tip': tip },
            h(
              'div',
              { class: 'bar', style: `height:${(total / max) * 100}%` },
              d.w ? h('div', { class: 'seg-bad', style: `flex:${d.w}` }) : null,
              d.c ? h('div', { class: 'seg-good', style: `flex:${d.c}` }) : null,
            ),
          );
        }),
      ),
      h('div', { class: 'days-axis' }, days.map((d) => h('span', {}, fmt.format(d.d).replace('.', '')))),
      h('div', { class: 'days-max' }, `max. ${max} Antworten/Tag`),
    );
  }

  // ---------- Overview ----------

  function renderTable() {
    setSegmented($('#table-script'), store.settings.tableScript);
    $('#table').replaceChildren(...renderKanaGrid(store.settings.tableScript, 'table'));
    pickVoice();
  }

  // ---------- Tooltip ----------

  const tooltip = $('#tooltip');
  function showTip(target) {
    const text = target.dataset.tip;
    if (!text) return;
    tooltip.textContent = text;
    tooltip.hidden = false;
    const r = target.getBoundingClientRect();
    const t = tooltip.getBoundingClientRect();
    const left = Math.min(window.innerWidth - t.width - 8, Math.max(8, r.left + r.width / 2 - t.width / 2));
    const top = r.top - t.height - 8 < 8 ? r.bottom + 8 : r.top - t.height - 8;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }
  const hideTip = () => (tooltip.hidden = true);
  document.addEventListener('pointerover', (e) => {
    const target = e.target.closest('[data-tip]');
    target ? showTip(target) : hideTip();
  });
  document.addEventListener('focusin', (e) => {
    const target = e.target.closest('[data-tip]');
    target ? showTip(target) : hideTip();
  });
  window.addEventListener('scroll', hideTip, { passive: true });

  // ---------- Home ----------

  function renderHome() {
    $('.home-title').textContent = `Hallo ${window.KanaStore.profile.name}, was möchtest du üben?`;
    const entries = KANA.map((k) => store.stats[k.id]).filter(seen);
    const solid = entries.filter(isSolid).length;
    $('#home-kana-stat').textContent = entries.length
      ? `${solid} von ${KANA.length} Zeichen sitzen sicher`
      : 'Noch nicht geübt';
    $('#home-vocab-stat').textContent = window.Vocab.summary();
  }

  // ---------- Routing ----------

  const SECTIONS = {
    home: { views: ['home'], name: 'Japanisch üben', mark: 'かな' },
    kana: { views: ['quiz', 'stats', 'table'], name: 'Kana Trainer', mark: 'かな' },
    vocab: { views: ['vocab', 'words'], name: 'Vokabeltrainer', mark: 'ことば' },
  };
  const VIEWS = Object.values(SECTIONS).flatMap((s) => s.views);
  const currentView = () => {
    const v = location.hash.slice(1);
    return VIEWS.includes(v) ? v : 'home';
  };
  const sectionOf = (view) => Object.keys(SECTIONS).find((key) => SECTIONS[key].views.includes(view));

  function showView() {
    const view = currentView();
    const section = sectionOf(view);
    for (const v of VIEWS) $(`#view-${v}`).hidden = v !== view;
    $$('.tabs').forEach((nav) => (nav.hidden = nav.dataset.section !== section));
    $$('.tabs a').forEach((a) => (a.dataset.view === view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    $('#brand-name').textContent = SECTIONS[section].name;
    $('#brand-mark').textContent = SECTIONS[section].mark;
    $('#brand-mark').classList.toggle('wide', SECTIONS[section].mark.length > 2);
    document.body.dataset.section = section;
    hideTip();
    if (view === 'home') renderHome();
    if (view === 'stats') renderStats();
    if (view === 'table') renderTable();
    if (view === 'quiz') {
      if (!quiz.current) nextQuestion();
      ui.input.focus({ preventScroll: true });
    }
    if (section === 'vocab') window.Vocab.show(view);
    window.scrollTo(0, 0);
  }

  // ---------- Wiring ----------

  ui.form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitAnswer();
  });
  ui.skip.addEventListener('click', () => {
    submitAnswer(true);
    ui.input.focus({ preventScroll: true });
  });
  ui.toggleSettings.addEventListener('click', () => toggleSettings());
  $('#quiz-mode').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    store.settings.mode = btn.dataset.mode;
    save();
    applyMode();
    if (quiz.focus) setFocus(null);
    else nextQuestion();
  });
  $('#focus-end').addEventListener('click', () => setFocus(null));

  $('#quiz-script').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-script]');
    if (!btn) return;
    store.settings.script = btn.dataset.script;
    save();
    setSegmented($('#quiz-script'), store.settings.script);
    if (!ui.settings.hidden) renderSettings();
    quiz.retry = [];
    nextQuestion();
  });
  $('#quiz-level').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-level]');
    if (!btn) return;
    store.settings.level = btn.dataset.level;
    save();
    setSegmented($('#quiz-level'), store.settings.level, 'level');
    nextQuestion();
  });
  $('#heat-script').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-script]');
    if (!btn) return;
    store.settings.heatScript = btn.dataset.script;
    save();
    renderStats();
  });
  $('#table-script').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-script]');
    if (!btn) return;
    store.settings.tableScript = btn.dataset.script;
    save();
    renderTable();
  });
  $('#reset').addEventListener('click', () => {
    if (!confirm(`Wirklich die ganze Kana-Statistik von „${window.KanaStore.profile.name}“ löschen? Das kann nicht rückgängig gemacht werden.`)) return;
    store.stats = {};
    store.days = {};
    store.items = {};
    save();
    setFocus(null);
    renderStats();
  });

  // Enter on the page (e.g. after clicking somewhere) still advances.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && currentView() === 'quiz' && quiz.answered && !ui.form.contains(document.activeElement)) {
      e.preventDefault();
      nextQuestion();
    }
  });

  setSegmented($('#quiz-script'), store.settings.script);
  applyMode();
  window.addEventListener('hashchange', showView);
  nextQuestion();
  showView();
});
