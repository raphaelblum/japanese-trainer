// Vocabulary trainer: words you add yourselves, asked in both directions
// (German → Japanese romaji and Japanese → German). The word list is shared by
// all profiles; the statistics and settings belong to the active profile.
window.KanaStore.ready.then(() => {
  'use strict';

  const { $, $$, h, pct, setSegmented, focusAnswer, answerField } = window.KanaUtil;
  const { tokenize, normalizeInput } = window.KanaSentences;

  const HISTORY_LEN = 10;
  const DIRS = { dj: 'Deutsch → Japanisch', jd: 'Japanisch → Deutsch' };

  // ---------- Persistence ----------

  const { KanaStore } = window;
  const data = (KanaStore.user.vocab ||= {});
  data.stats ||= {}; // word id → { dj, jd }, each { c, w, h }
  data.settings = { dir: 'both', ...(data.settings || {}) };
  const store = { words: KanaStore.words, settings: data.settings };
  const save = () => KanaStore.saveUser();

  const findWord = (id) => store.words.find((w) => w.id === id);

  // ---------- Answer matching ----------

  const splitAlts = (s) => s.split(/[/,;]/).map((x) => x.trim()).filter(Boolean);
  const hasKana = (s) => /[぀-ヿ]/.test(s);

  // German: case, umlaut spelling, articles, punctuation and "(…)" hints do not matter.
  function normDe(s) {
    return s
      .toLowerCase()
      .normalize('NFC')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/ß/g, 'ss')
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/[.,!?;:"'„“”‚‘’«»…-]/g, ' ')
      .trim()
      .replace(/^(der|die|das|den|dem|des|ein|eine|einen|einem|sich)\s+/, '')
      .replace(/\s+/g, '');
  }

  // Romaji: long vowels may be written oo, ou or ō; separators do not matter.
  const normJp = (s) => normalizeInput(s).replace(/ou/g, 'oo');

  // Typed kana (e.g. with a Japanese keyboard) is read back to romaji.
  function kanaToRomaji(s) {
    try {
      return tokenize(s.replace(/\s+/g, ''))
        .flat()
        .filter((t) => t.kind !== 'punct')
        .map((t) => t.canonical)
        .join('');
    } catch {
      return null;
    }
  }

  function levenshtein(a, b) {
    const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let diag = prev[0];
      prev[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = prev[j];
        prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
        diag = tmp;
      }
    }
    return prev[b.length];
  }

  // Returns { ok, typo } – a single wrong letter in a longer German word still counts.
  function check(word, dir, raw) {
    if (dir === 'dj') {
      if (hasKana(raw) && word.kana && splitAlts(word.kana).some((k) => k.replace(/\s+/g, '') === raw.replace(/\s+/g, ''))) {
        return { ok: true };
      }
      const given = normJp(hasKana(raw) ? kanaToRomaji(raw) || raw : raw);
      return { ok: splitAlts(word.jp).some((alt) => normJp(alt) === given) };
    }
    const given = normDe(raw);
    const alts = splitAlts(word.de).map(normDe);
    if (alts.includes(given)) return { ok: true };
    const typo = alts.some((alt) => alt.length >= 5 && levenshtein(alt, given) === 1);
    return { ok: typo, typo };
  }

  // ---------- Scoring ----------

  const statOf = (word, dir) => data.stats[word.id]?.[dir];
  const seen = (s) => s && s.h.length > 0;
  const recentWrong = (s) => s.h.filter((x) => !x).length;
  const recentError = (s) => (recentWrong(s) + 0.5) / (s.h.length + 1);
  const isSolid = (s) => seen(s) && s.h.length >= 2 && s.h.slice(-2).every(Boolean);

  function weightOf(word, dir) {
    const s = statOf(word, dir);
    if (!seen(s)) return 3;
    return 0.5 + 8 * recentError(s);
  }

  function record(word, dir, ok) {
    const s = ((data.stats[word.id] ||= {})[dir] ||= { c: 0, w: 0, h: [] });
    if (ok) s.c++;
    else s.w++;
    s.h.push(ok ? 1 : 0);
    if (s.h.length > HISTORY_LEN) s.h.shift();
    save();
  }

  const activeDirs = () => (store.settings.dir === 'both' ? ['dj', 'jd'] : [store.settings.dir]);

  function summary() {
    const n = store.words.length;
    if (!n) return 'Noch keine Wörter angelegt';
    const solid = store.words.filter((w) => isSolid(statOf(w, 'dj')) && isSolid(statOf(w, 'jd'))).length;
    return `${n} ${n === 1 ? 'Wort' : 'Wörter'} · ${solid} sitzen in beide Richtungen`;
  }

  // ---------- Quiz ----------

  const quiz = {
    current: null, // { word, dir }
    answered: false,
    lastOk: false,
    recent: [],
    retry: [], // { id, dir, at }
    tick: 0,
    session: { asked: 0, correct: 0, streak: 0, best: 0 },
    timer: null,
  };

  const ui = {
    card: $('#vcard'),
    meta: $('#v-meta'),
    prompt: $('#v-prompt'),
    sub: $('#v-sub'),
    form: $('#v-form'),
    input: $('#v-answer'),
    submit: $('#v-submit'),
    feedback: $('#v-feedback'),
    skip: $('#v-skip'),
    info: $('#v-info'),
    empty: $('#v-empty'),
    session: $('#v-session'),
  };

  const inVocabQuiz = () => location.hash === '#vocab';

  function pickNext() {
    quiz.tick++;
    const dirs = activeDirs();
    const dueIdx = quiz.retry.findIndex((r) => r.at <= quiz.tick && dirs.includes(r.dir) && findWord(r.id));
    if (dueIdx >= 0) {
      const r = quiz.retry.splice(dueIdx, 1)[0];
      return { word: findWord(r.id), dir: r.dir };
    }

    // Keep enough candidates that the order does not turn into a fixed rotation.
    const avoidCount = Math.min(3, Math.floor((store.words.length - 1) / 2));
    const avoid = new Set(avoidCount > 0 ? quiz.recent.slice(-avoidCount) : []);
    const cards = store.words.filter((w) => !avoid.has(w.id)).flatMap((word) => dirs.map((dir) => ({ word, dir })));
    const weights = cards.map((c) => weightOf(c.word, c.dir));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < cards.length; i++) {
      r -= weights[i];
      if (r <= 0) return cards[i];
    }
    return cards[cards.length - 1];
  }

  function nextQuestion() {
    clearTimeout(quiz.timer);
    $('#vocab-count').textContent = store.words.length;
    const hasWords = store.words.length > 0;
    ui.empty.hidden = hasWords;
    for (const node of [ui.meta, ui.prompt, ui.sub, ui.form, ui.feedback, ui.skip.parentElement]) node.hidden = !hasWords;
    if (!hasWords) {
      quiz.current = null;
      return;
    }

    const card = pickNext();
    quiz.current = card;
    quiz.answered = false;
    quiz.recent.push(card.word.id);
    if (quiz.recent.length > 6) quiz.recent.shift();

    const { word, dir } = card;
    ui.card.classList.remove('is-correct', 'is-wrong');
    ui.meta.textContent = DIRS[dir];
    if (dir === 'dj') {
      ui.prompt.textContent = word.de;
      ui.prompt.lang = 'de';
      ui.sub.textContent = '';
      ui.input.placeholder = 'Auf Japanisch (Romaji) …';
    } else {
      ui.prompt.textContent = word.kana || word.jp;
      ui.prompt.lang = word.kana ? 'ja' : 'de';
      ui.sub.textContent = word.kana ? word.jp : '';
      ui.input.placeholder = 'Auf Deutsch …';
    }
    ui.prompt.classList.toggle('long', ui.prompt.textContent.length > 14);
    ui.prompt.classList.remove('pop');
    void ui.prompt.offsetWidth; // restart the animation
    ui.prompt.classList.add('pop');

    ui.input.value = '';
    ui.input.removeAttribute('aria-readonly');
    ui.submit.textContent = 'Prüfen';
    ui.feedback.replaceChildren();
    ui.skip.disabled = false;
    ui.info.textContent = '';
    if (!document.hidden && inVocabQuiz()) focusAnswer(ui.input);
  }

  function countSession(ok, delta = 1) {
    const ss = quiz.session;
    ss.asked += delta;
    if (ok) {
      ss.correct++;
      ss.streak++;
      ss.best = Math.max(ss.best, ss.streak);
    } else {
      ss.streak = 0;
    }
  }

  const solutionOf = (word, dir) =>
    dir === 'dj'
      ? [h('strong', { class: 'fb-answer' }, word.jp), word.kana ? h('span', { class: 'fb-kana-sol', lang: 'ja' }, ` ${word.kana}`) : null]
      : [h('strong', { class: 'fb-answer' }, word.de)];

  function submitAnswer(skipped = false) {
    if (quiz.answered) {
      nextQuestion();
      return;
    }
    const card = quiz.current;
    if (!card) return;
    const raw = ui.input.value.trim();
    if (!raw && !skipped) {
      ui.input.classList.remove('shake');
      void ui.input.offsetWidth;
      ui.input.classList.add('shake');
      ui.input.focus();
      return;
    }

    const { word, dir } = card;
    const result = skipped ? { ok: false } : check(word, dir, raw);
    quiz.answered = true;
    quiz.lastOk = result.ok;
    record(word, dir, result.ok);
    countSession(result.ok);
    if (!result.ok && !quiz.retry.some((r) => r.id === word.id && r.dir === dir)) {
      quiz.retry.push({ id: word.id, dir, at: quiz.tick + 3 + Math.floor(Math.random() * 3) });
    }

    ui.input.setAttribute('aria-readonly', 'true');
    ui.skip.disabled = true;
    ui.submit.textContent = 'Weiter';
    ui.card.classList.add(result.ok ? 'is-correct' : 'is-wrong');

    const lines = [];
    if (result.ok) {
      lines.push(
        h(
          'div',
          {},
          h('span', { class: 'fb-good' }, result.typo ? '✓ Fast – kleiner Tippfehler: ' : '✓ Richtig'),
          result.typo || splitAlts(dir === 'dj' ? word.jp : word.de).length > 1 || (dir === 'dj' && word.kana)
            ? h('span', {}, result.typo ? '' : ' – ', ...solutionOf(word, dir))
            : null,
        ),
      );
    } else {
      lines.push(
        h(
          'div',
          {},
          h('span', { class: 'fb-bad' }, '✗ '),
          ...solutionOf(word, dir),
          h('span', { class: 'fb-note' }, skipped ? ' – übersprungen' : ` – du: „${raw}“`),
        ),
      );
      if (!skipped) {
        lines.push(h('button', { type: 'button', class: 'link override', onclick: overrule }, 'Ich hatte doch recht'));
      }
    }
    if (word.note) lines.push(h('div', { class: 'v-note' }, word.note));
    ui.feedback.replaceChildren(...lines);

    const s = statOf(word, dir);
    ui.info.textContent = `Bisher ${s.c}× richtig · ${s.w}× falsch`;
    renderSession();

    if (result.ok) quiz.timer = setTimeout(nextQuestion, result.typo || word.note ? 2200 : 900);
  }

  // The answer was right in substance (a synonym, another spelling): count it as correct.
  function overrule() {
    const card = quiz.current;
    if (!card || !quiz.answered || quiz.lastOk) return;
    const s = statOf(card.word, card.dir);
    s.w--;
    s.c++;
    s.h[s.h.length - 1] = 1;
    save();
    quiz.lastOk = true;
    quiz.retry = quiz.retry.filter((r) => !(r.id === card.word.id && r.dir === card.dir));
    countSession(true, 0);
    ui.card.classList.replace('is-wrong', 'is-correct');
    const mark = $('.fb-bad', ui.feedback);
    if (mark) {
      mark.className = 'fb-good';
      mark.textContent = '✓ ';
    }
    $('.override', ui.feedback)?.replaceWith(h('div', { class: 'fb-note' }, 'Als richtig gezählt.'));
    ui.info.textContent = `Bisher ${s.c}× richtig · ${s.w}× falsch`;
    renderSession();
    // Back to the field: Enter continues, and on phones the keyboard stays open.
    focusAnswer(ui.input);
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

  // ---------- Word list maintenance ----------

  const form = $('#word-form');
  let editingId = null;

  const fieldsOf = (src) => ({
    de: (src.de || '').trim(),
    jp: (src.jp || '').trim(),
    kana: (src.kana || '').trim(),
    note: (src.note || '').trim(),
  });

  function duplicateOf(fields, exceptId = null) {
    const de = normDe(fields.de);
    const jp = normJp(fields.jp);
    return store.words.find((w) => w.id !== exceptId && normDe(w.de) === de && normJp(w.jp) === jp);
  }

  function setFormMsg(text, kind = '') {
    const msg = $('#word-form-msg');
    msg.textContent = text;
    msg.className = `sub ${kind}`;
  }

  function startEdit(word) {
    editingId = word.id;
    for (const key of ['de', 'jp', 'kana', 'note']) form.elements[key].value = word[key] || '';
    $('#word-form-title').textContent = 'Wort bearbeiten';
    $('#word-save').textContent = 'Speichern';
    $('#word-cancel').hidden = false;
    setFormMsg('');
    form.closest('.block').scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.elements.de.focus({ preventScroll: true });
    renderWords();
  }

  function stopEdit() {
    editingId = null;
    form.reset();
    $('#word-form-title').textContent = 'Wort hinzufügen';
    $('#word-save').textContent = 'Hinzufügen';
    $('#word-cancel').hidden = true;
    renderWords();
  }

  async function deleteWord(word) {
    const others = word.by && word.by !== KanaStore.profile.name ? ` Es wurde von ${word.by} angelegt.` : '';
    if (!confirm(`„${word.de}“ = „${word.jp}“ wirklich löschen? Das Wort verschwindet für alle.${others}`)) return;
    try {
      await KanaStore.deleteWord(word.id);
    } catch {
      return;
    }
    delete data.stats[word.id];
    save();
    if (editingId === word.id) stopEdit();
    if (quiz.current?.word.id === word.id) quiz.current = null;
    renderWords();
  }

  let busy = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    const fields = fieldsOf(Object.fromEntries(new FormData(form)));
    if (!fields.de || !fields.jp) return;
    const dup = duplicateOf(fields, editingId);
    if (dup) {
      setFormMsg(`„${dup.de}“ = „${dup.jp}“ gibt es schon.`, 'warn');
      return;
    }
    busy = true;
    try {
      if (editingId) {
        const word = findWord(editingId);
        await KanaStore.updateWord(editingId, fields);
        // A changed answer makes your old history meaningless for that direction.
        const s = data.stats[editingId];
        if (s && word && normJp(word.jp) !== normJp(fields.jp)) delete s.dj;
        if (s && word && normDe(word.de) !== normDe(fields.de)) delete s.jd;
        save();
        setFormMsg(`„${fields.de}“ gespeichert ✓`, 'ok');
        if (quiz.current?.word.id === editingId) quiz.current = null;
        stopEdit();
      } else {
        await KanaStore.addWords([fields]);
        setFormMsg(`„${fields.de}“ = „${fields.jp}“ hinzugefügt ✓`, 'ok');
        form.reset();
        renderWords();
      }
    } catch (err) {
      setFormMsg(err.message, 'warn');
      renderWords();
    } finally {
      busy = false;
    }
    form.elements.de.focus();
  });
  $('#word-cancel').addEventListener('click', () => {
    setFormMsg('');
    stopEdit();
  });

  $('#bulk-add').addEventListener('click', async () => {
    const area = $('#bulk-text');
    const fresh = [];
    let dupes = 0;
    const bad = [];
    for (const line of area.value.split('\n')) {
      if (!line.trim()) continue;
      const [de, jp, kana, note] = line.split(/\s*[=\t]\s*/);
      const fields = fieldsOf({ de, jp, kana, note });
      if (!fields.de || !fields.jp) {
        bad.push(line.trim());
        continue;
      }
      if (duplicateOf(fields) || fresh.some((f) => normDe(f.de) === normDe(fields.de) && normJp(f.jp) === normJp(fields.jp))) {
        dupes++;
        continue;
      }
      fresh.push(fields);
    }
    if (fresh.length) {
      try {
        await KanaStore.addWords(fresh);
      } catch (err) {
        $('#bulk-msg').textContent = err.message;
        return;
      }
    }
    area.value = bad.join('\n');
    $('#bulk-msg').textContent = [
      `${fresh.length} hinzugefügt`,
      dupes ? `${dupes} schon vorhanden` : null,
      bad.length ? (bad.length === 1 ? '1 Zeile ohne „=“ (steht noch im Feld)' : `${bad.length} Zeilen ohne „=“ (stehen noch im Feld)`) : null,
    ]
      .filter(Boolean)
      .join(' · ');
    renderWords();
  });

  $('#word-search').addEventListener('input', () => renderWords());

  function dirBadge(word, dir) {
    const s = statOf(word, dir);
    const label = dir === 'dj' ? 'DE → JP' : 'JP → DE';
    if (!seen(s)) return h('span', { class: 'w-dir unseen' }, label, h('small', {}, 'neu'));
    const acc = 1 - recentWrong(s) / s.h.length;
    return h(
      'span',
      { class: 'w-dir', 'data-tip': `${DIRS[dir]}\nZuletzt: ${pct(acc)} (${s.h.length - recentWrong(s)}/${s.h.length})\nGesamt: ${s.c}× richtig, ${s.w}× falsch`, tabindex: '0' },
      label,
      h('span', { class: 'dots' }, s.h.slice(-5).map((x) => h('i', { class: x ? 'ok' : 'no' }))),
    );
  }

  // Feather-style line icons for the narrow layout, where the button labels do not fit.
  const ICONS = {
    edit: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
    delete: 'M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
  };
  function icon(name) {
    const node = h('span', { class: 'sm icon', 'aria-hidden': 'true' });
    node.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[name]}"/></svg>`;
    return node;
  }

  function renderWords() {
    const query = $('#word-search').value.trim().toLowerCase();
    const words = [...store.words]
      .sort((a, b) => b.created - a.created)
      .filter((w) => !query || [w.de, w.jp, w.kana, w.note].some((x) => x && x.toLowerCase().includes(query)));
    $('#words-count').textContent = store.words.length || '';

    if (!store.words.length) {
      $('#word-list').replaceChildren(h('p', { class: 'empty-note' }, 'Noch keine Wörter. Leg oben dein erstes Wort an – z. B. Erdbeere = ichigo.'));
      return;
    }
    if (!words.length) {
      $('#word-list').replaceChildren(h('p', { class: 'empty-note' }, `Nichts gefunden für „${query}“.`));
      return;
    }
    $('#word-list').replaceChildren(
      ...words.map((word) =>
        h(
          'div',
          { class: `word-row${word.id === editingId ? ' editing' : ''}` },
          h(
            'div',
            { class: 'w-main' },
            h('div', { class: 'w-de' }, word.de),
            h('div', { class: 'w-jp' }, h('span', {}, word.jp), word.kana ? h('span', { class: 'w-kana', lang: 'ja' }, word.kana) : null),
            word.note ? h('div', { class: 'w-note' }, word.note) : null,
            word.by ? h('div', { class: 'w-by' }, `von ${word.by}`) : null,
          ),
          h('div', { class: 'w-stats' }, dirBadge(word, 'dj'), dirBadge(word, 'jd')),
          h(
            'div',
            { class: 'w-actions' },
            h('button', { type: 'button', class: 'btn ghost small', onclick: () => startEdit(word), 'aria-label': `${word.de} bearbeiten` }, h('span', { class: 'lg' }, 'Bearbeiten'), icon('edit')),
            h('button', { type: 'button', class: 'btn ghost small danger', onclick: () => deleteWord(word), 'aria-label': `${word.de} löschen` }, h('span', { class: 'lg' }, 'Löschen'), icon('delete')),
          ),
        ),
      ),
    );
  }

  // ---------- Wiring ----------

  ui.form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitAnswer();
  });
  ui.skip.addEventListener('click', () => {
    submitAnswer(true);
    focusAnswer(ui.input);
  });
  answerField(ui.card, ui.input, { locked: () => quiz.answered, typeAhead: () => quiz.lastOk, next: nextQuestion });
  $('#vocab-dir').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-dir]');
    if (!btn) return;
    store.settings.dir = btn.dataset.dir;
    save();
    setSegmented($('#vocab-dir'), store.settings.dir, 'dir');
    nextQuestion();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && inVocabQuiz() && quiz.answered && !ui.form.contains(document.activeElement) && !e.target.closest('button')) {
      e.preventDefault();
      nextQuestion();
    }
  });

  setSegmented($('#vocab-dir'), store.settings.dir, 'dir');

  async function show(view) {
    // Pick up words the other person added in the meantime.
    await KanaStore.refreshWords();
    if (location.hash.slice(1) !== view) return;
    if (view === 'vocab') {
      $('#vocab-count').textContent = store.words.length;
      const current = quiz.current && findWord(quiz.current.word.id);
      if (!current) nextQuestion();
      else {
        quiz.current.word = current;
        focusAnswer(ui.input);
      }
    }
    if (view === 'words') {
      renderWords();
      if (!store.words.length) form.elements.de.focus({ preventScroll: true });
    }
  }
  // Render right away from what we have; the refresh above updates it.
  const showNow = (view) => {
    if (view === 'words') renderWords();
    return show(view);
  };

  window.Vocab = { show: showNow, summary };
});
