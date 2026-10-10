// Vocabulary trainer: words you add yourselves, asked in both directions
// (German → Japanese romaji and Japanese → German), and words with kanji also
// as "read the kanji". Words can belong to groups (e.g. "Lektion 1", "Monate"),
// and the quiz can be limited to some of them. Word list and groups are shared
// by all profiles; the statistics and settings belong to the active profile.
window.KanaStore.ready.then(() => {
  'use strict';

  const { $, $$, h, pct, setSegmented, focusAnswer, answerField } = window.KanaUtil;
  const { tokenize, normalizeInput } = window.KanaSentences;

  const HISTORY_LEN = 10;
  const DIRS = { dj: 'Deutsch → Japanisch', jd: 'Japanisch → Deutsch', kr: 'Kanji → Lesung' };

  // ---------- Persistence ----------

  const { KanaStore } = window;
  const data = (KanaStore.user.vocab ||= {});
  data.stats ||= {}; // word id → { dj, jd, kr }, each { c, w, h }
  data.settings = { dir: 'both', groups: [], ...(data.settings || {}) };
  const store = { words: KanaStore.words, groups: KanaStore.groups, settings: data.settings };
  const save = () => KanaStore.saveUser();

  const findWord = (id) => store.words.find((w) => w.id === id);

  // ---------- Groups ----------

  const groupById = (id) => store.groups.find((g) => g.id === id);
  const groupByName = (name) => store.groups.find((g) => g.name.toLowerCase() === name.toLowerCase());
  const groupsOf = (word) => (word.groups || []).map(groupById).filter(Boolean);
  const sortedGroups = () => [...store.groups].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }));
  const wordsIn = (id) => store.words.filter((w) => w.groups?.includes(id));
  const cleanName = (s) => (s || '').trim().replace(/\s+/g, ' ').slice(0, 60);

  // Groups chosen for the quiz; none (or only deleted ones) means all words.
  const activeGroups = () => store.settings.groups.filter(groupById);
  function poolWords() {
    const sel = activeGroups();
    return sel.length ? store.words.filter((w) => w.groups?.some((g) => sel.includes(g))) : store.words;
  }

  // ---------- Answer matching ----------

  const splitAlts = (s) => (s || '').split(/[/,;]/).map((x) => x.trim()).filter(Boolean);
  const hasKana = (s) => /[぀-ヿ]/.test(s);
  const hasKanji = (s) => /[㐀-鿿豈-﫿々]/.test(s || '');
  const hasJapanese = (s) => hasKana(s) || hasKanji(s);
  // Written Japanese: spaces, optional parts in [ ] and the 〜 of suffixes do not matter.
  const normWritten = (s) => s.replace(/[\s[\]〜~]/g, '');

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

  // The Japanese word in romaji, kana or – when allowed – kanji.
  function checkJapanese(word, raw, allowKanji) {
    const written = splitAlts(word.kana).concat(allowKanji ? splitAlts(word.kanji) : []);
    if (hasJapanese(raw) && written.some((k) => normWritten(k) === normWritten(raw))) return { ok: true };
    const given = normJp(hasKana(raw) ? kanaToRomaji(raw) || raw : raw);
    return { ok: splitAlts(word.jp).some((alt) => normJp(alt) === given) };
  }

  // Returns { ok, typo } – a single wrong letter in a longer German word still counts.
  function check(word, dir, raw) {
    if (dir === 'dj') return checkJapanese(word, raw, true);
    if (dir === 'kr') return checkJapanese(word, raw, false);
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
  // "Kanji → Lesung" only exists for words that have kanji.
  const cardsOf = (words, dirs) => words.flatMap((word) => dirs.filter((dir) => dir !== 'kr' || word.kanji).map((dir) => ({ word, dir })));

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
    groupsToggle: $('#v-groups-toggle'),
    groupsPanel: $('#v-groups'),
  };

  const inVocabQuiz = () => location.hash === '#vocab';

  function pickNext(cards) {
    quiz.tick++;
    const dueIdx = quiz.retry.findIndex((r) => r.at <= quiz.tick && cards.some((c) => c.word.id === r.id && c.dir === r.dir));
    if (dueIdx >= 0) {
      const r = quiz.retry.splice(dueIdx, 1)[0];
      return cards.find((c) => c.word.id === r.id && c.dir === r.dir);
    }

    // Keep enough candidates that the order does not turn into a fixed rotation.
    const distinct = new Set(cards.map((c) => c.word.id)).size;
    const avoidCount = Math.min(3, Math.floor((distinct - 1) / 2));
    const avoid = new Set(avoidCount > 0 ? quiz.recent.slice(-avoidCount) : []);
    const pool = cards.filter((c) => !avoid.has(c.word.id));
    const weights = pool.map((c) => weightOf(c.word, c.dir));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  function showEmpty(text, link) {
    $('#v-empty-text').textContent = text;
    $('#v-empty-link').hidden = !link;
    $('#v-empty-all').hidden = link || !activeGroups().length;
  }

  function nextQuestion() {
    clearTimeout(quiz.timer);
    $('#vocab-count').textContent = store.words.length;
    renderGroupPicker();
    const pool = poolWords();
    const cards = cardsOf(pool, activeDirs());
    const hasCards = cards.length > 0;
    ui.empty.hidden = hasCards;
    for (const node of [ui.meta, ui.prompt, ui.sub, ui.form, ui.feedback, ui.skip.parentElement]) node.hidden = !hasCards;
    if (!hasCards) {
      quiz.current = null;
      if (!store.words.length) showEmpty('Du hast noch keine eigenen Wörter.', true);
      else if (!pool.length) showEmpty('In den gewählten Gruppen sind keine Wörter.', false);
      else showEmpty('Für „Kanji → Lesung“ braucht es Wörter mit Kanji. Trag sie unter „Wörter verwalten“ im Feld Kanji ein.', false);
      return;
    }

    const card = pickNext(cards);
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
    } else if (dir === 'kr') {
      ui.prompt.textContent = word.kanji;
      ui.prompt.lang = 'ja';
      ui.sub.textContent = '';
      ui.input.placeholder = 'Lesung (Romaji oder Kana) …';
    } else {
      ui.prompt.textContent = word.kanji || word.kana || word.jp;
      ui.prompt.lang = word.kanji || word.kana ? 'ja' : 'de';
      ui.sub.textContent = [word.kanji ? word.kana : '', word.kanji || word.kana ? word.jp : ''].filter(Boolean).join(' · ');
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

  const sol = (text) => (text ? h('span', { class: 'fb-kana-sol', lang: 'ja' }, ` ${text}`) : null);
  function solutionOf(word, dir) {
    if (dir === 'dj') return [h('strong', { class: 'fb-answer' }, word.jp), sol(word.kana), sol(word.kanji)];
    if (dir === 'kr') {
      return [
        word.kana ? h('strong', { class: 'fb-answer', lang: 'ja' }, word.kana) : h('strong', { class: 'fb-answer' }, word.jp),
        word.kana ? h('span', { class: 'fb-note' }, ` ${word.jp}`) : null,
        h('span', { class: 'fb-note' }, ` – ${word.de}`),
      ];
    }
    return [h('strong', { class: 'fb-answer' }, word.de)];
  }

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
      const showSolution =
        result.typo || dir === 'kr' || splitAlts(dir === 'dj' ? word.jp : word.de).length > 1 || (dir === 'dj' && (word.kana || word.kanji));
      lines.push(
        h(
          'div',
          {},
          h('span', { class: 'fb-good' }, result.typo ? '✓ Fast – kleiner Tippfehler: ' : '✓ Richtig'),
          showSolution ? h('span', {}, result.typo ? '' : ' – ', ...solutionOf(word, dir)) : null,
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

    if (result.ok) quiz.timer = setTimeout(nextQuestion, result.typo || word.note || dir === 'kr' ? 2200 : 900);
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

  // ---------- Group picker in the quiz ----------

  function setQuizGroups(ids) {
    store.settings.groups = ids;
    save();
    quiz.current = null;
    nextQuestion();
  }

  function renderGroupPicker() {
    const sel = activeGroups();
    const groups = sortedGroups();
    ui.groupsToggle.hidden = !groups.length;
    if (!groups.length) ui.groupsPanel.hidden = true;
    const label = !sel.length ? 'Alle Wörter' : sel.length === 1 ? groupById(sel[0]).name : `${sel.length} Gruppen`;
    $('#v-groups-label').textContent = label;
    $('#v-groups-count').textContent = poolWords().length;

    const chip = (pressed, onclick, ...content) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(pressed), onclick }, ...content);
    ui.groupsPanel.replaceChildren(
      h(
        'div',
        {},
        h('div', { class: 'settings-head' }, h('span', {}, 'Welche Wörter abfragen?'), h('span', { class: 'sub' }, 'Mehrere Gruppen auswählbar')),
        h(
          'div',
          { class: 'chips' },
          chip(!sel.length, () => setQuizGroups([]), 'Alle Wörter', h('small', {}, store.words.length)),
          groups.map((g) =>
            chip(
              sel.includes(g.id),
              () => setQuizGroups(sel.includes(g.id) ? sel.filter((id) => id !== g.id) : [...sel, g.id]),
              g.name,
              h('small', {}, wordsIn(g.id).length),
            ),
          ),
        ),
      ),
    );
  }

  function toggleGroupPicker(open = ui.groupsPanel.hidden) {
    ui.groupsPanel.hidden = !open;
    ui.groupsToggle.setAttribute('aria-expanded', String(open));
  }

  // ---------- Import format ----------
  //
  // One word per line: Deutsch = Romaji = Kana = Kanji = Notiz. Everything after
  // the kana may also be separated by " · ". "L1" / "Lektion 1" / "Zusatz L1"
  // puts the word into the group "Lektion 1" / "Lektion 1 Zusatz", "#Monate"
  // into the group "Monate". The kanji are recognised by their characters, so a
  // note in fourth place stays a note.

  const LESSON_RE = /^(zusatz\s+)?(?:l|lektion)\s*(\d+)(\s+zusatz)?$/i;
  const KANJI_FIELD_RE = /^[\s0-9０-９　-ヿ㐀-鿿豈-﫿＀-￯[\]〜~]+$/;

  // segments: the parts after the kana. Returns { kanji, note, groupNames }.
  function parseExtras(segments) {
    let kanji = '';
    const notes = [];
    const groupNames = [];
    segments
      .flatMap((s) => s.split(/\s*·\s*/))
      .forEach((seg, i) => {
        seg = seg.trim();
        const lesson = seg.match(LESSON_RE);
        if (!seg) return;
        if (lesson) groupNames.push(`Lektion ${Number(lesson[2])}${lesson[1] || lesson[3] ? ' Zusatz' : ''}`);
        else if (seg.startsWith('#') && cleanName(seg.slice(1))) groupNames.push(cleanName(seg.slice(1)));
        else if (i === 0 && hasKanji(seg) && KANJI_FIELD_RE.test(seg)) kanji = seg;
        else notes.push(seg);
      });
    return { kanji, note: notes.join(' · '), groupNames };
  }

  function parseLine(line) {
    const [de = '', jp = '', kana = '', ...rest] = line.split(/\s*[=\t]\s*/);
    const extras = parseExtras(rest);
    // Kanji written in the kana place (e.g. "Erdbeere = ichigo = 苺").
    if (hasKanji(kana) && !extras.kanji && !rest.length) return { de, jp, kana: '', ...extras, kanji: kana, legacyNote: '' };
    // legacyNote: what the old import kept as note, to recognise words imported before.
    return { de, jp, kana, ...extras, legacyNote: (rest[0] || '').trim() };
  }

  // What a word imported or typed before kanji and groups existed should look like now.
  function upgradeOf(word) {
    if (word.kanji) return null;
    // The old form had one field "Kana / Kanji".
    if (hasKanji(word.kana)) return { id: word.id, kanji: word.kana, kana: '' };
    if (!word.note) return null;
    const { kanji, note, groupNames } = parseExtras([word.note]);
    if (!kanji && !groupNames.length) return null;
    return { id: word.id, kanji, note, groupNames };
  }

  // Creates the named groups that are missing and returns name → id.
  async function groupIds(names) {
    const unique = [...new Set(names.map(cleanName).filter(Boolean))];
    if (unique.some((n) => !groupByName(n))) await KanaStore.ensureGroups(unique);
    return (list) => [...new Set(list.map((n) => groupByName(cleanName(n))?.id).filter(Boolean))];
  }

  // ---------- Word list maintenance ----------

  const form = $('#word-form');
  let editingId = null;
  let formGroups = new Set(); // group ids ticked in the form; they stay for the next word

  const fieldsOf = (src) => ({
    de: (src.de || '').trim(),
    jp: (src.jp || '').trim(),
    kana: (src.kana || '').trim(),
    kanji: (src.kanji || '').trim(),
    note: (src.note || '').trim(),
    groups: src.groups || [],
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

  function renderFormGroups() {
    for (const id of formGroups) if (!groupById(id)) formGroups.delete(id);
    const input = h('input', {
      class: 'group-new',
      placeholder: '+ Neue Gruppe',
      maxlength: '60',
      'aria-label': 'Neue Gruppe anlegen',
      onkeydown: (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault(); // not the word form
        addFormGroup(input);
      },
      onblur: () => addFormGroup(input),
    });
    $('#form-groups').replaceChildren(
      ...sortedGroups().map((g) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chip small',
            'aria-pressed': String(formGroups.has(g.id)),
            onclick: () => {
              if (formGroups.has(g.id)) formGroups.delete(g.id);
              else formGroups.add(g.id);
              renderFormGroups();
            },
          },
          g.name,
        ),
      ),
      input,
    );
  }

  // A group typed in the form; saving the word waits for it.
  let pendingGroup = null;
  function addFormGroup(input) {
    const name = cleanName(input.value);
    if (!name) return;
    input.value = '';
    pendingGroup = (async () => {
      try {
        const ids = await groupIds([name]);
        ids([name]).forEach((id) => formGroups.add(id));
      } catch {
        return;
      } finally {
        pendingGroup = null;
      }
      renderVocabLists();
      if (document.activeElement === document.body) $('.group-new', form)?.focus();
    })();
  }

  function startEdit(word) {
    editingId = word.id;
    for (const key of ['de', 'jp', 'kana', 'kanji', 'note']) form.elements[key].value = word[key] || '';
    formGroups = new Set(word.groups || []);
    $('#word-form-title').textContent = 'Wort bearbeiten';
    $('#word-save').textContent = 'Speichern';
    $('#word-cancel').hidden = false;
    setFormMsg('');
    form.closest('.block').scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.elements.de.focus({ preventScroll: true });
    renderFormGroups();
    renderWords();
  }

  function stopEdit() {
    editingId = null;
    form.reset();
    formGroups = new Set();
    $('#word-form-title').textContent = 'Wort hinzufügen';
    $('#word-save').textContent = 'Hinzufügen';
    $('#word-cancel').hidden = true;
    renderFormGroups();
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

  async function deleteAllWords() {
    const n = store.words.length;
    if (!n) return;
    if (!confirm(`Willst du alle ${n} Wörter löschen?`)) return;
    if (!confirm(`Willst du WIRKLICH alle ${n} Wörter löschen? Sie verschwinden für alle, auch die Statistik dazu. Das kann nicht rückgängig gemacht werden.`)) return;
    try {
      await KanaStore.deleteAllWords();
    } catch {
      return;
    }
    data.stats = {};
    save();
    if (editingId) stopEdit();
    quiz.current = null;
    renderVocabLists();
    KanaStore.toast('Alle Wörter gelöscht');
  }
  $('#delete-all-words').addEventListener('click', deleteAllWords);

  let busy = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    if (pendingGroup) await pendingGroup;
    const fields = fieldsOf({ ...Object.fromEntries(new FormData(form)), groups: [...formGroups] });
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
        if (s && word && (word.kanji || '') !== fields.kanji) delete s.kr;
        save();
        setFormMsg(`„${fields.de}“ gespeichert ✓`, 'ok');
        if (quiz.current?.word.id === editingId) quiz.current = null;
        stopEdit();
      } else {
        await KanaStore.addWords([fields]);
        setFormMsg(`„${fields.de}“ = „${fields.jp}“ hinzugefügt ✓`, 'ok');
        form.reset();
        renderVocabLists();
      }
    } catch (err) {
      setFormMsg(err.message, 'warn');
      renderVocabLists();
    } finally {
      busy = false;
    }
    form.elements.de.focus();
  });
  $('#word-cancel').addEventListener('click', () => {
    setFormMsg('');
    stopEdit();
  });

  // Existing words get what the import knows more about them: groups, missing
  // kana/kanji, and the note without the kanji and lesson the old import left in it.
  function mergeInto(word, fields, legacyNote) {
    const fix = {};
    const groups = [...new Set([...(word.groups || []), ...fields.groups])];
    if (groups.length !== (word.groups || []).length) fix.groups = groups;
    if (!word.kanji && fields.kanji) fix.kanji = fields.kanji;
    if (fields.kana && (!word.kana || (hasKanji(word.kana) && !word.kanji))) fix.kana = fields.kana;
    if (fields.note !== (word.note || '') && (!word.note || word.note === legacyNote)) fix.note = fields.note;
    return Object.keys(fix).length ? { id: word.id, ...fix } : null;
  }

  $('#bulk-add').addEventListener('click', async () => {
    const area = $('#bulk-text');
    const msg = $('#bulk-msg');
    const lines = [];
    const bad = [];
    for (const line of area.value.split('\n')) {
      if (!line.trim()) continue;
      const parsed = parseLine(line);
      if (!parsed.de.trim() || !parsed.jp.trim()) bad.push(line.trim());
      else lines.push(parsed);
    }
    const extra = cleanName($('#bulk-group').value);

    let idsOf;
    try {
      idsOf = await groupIds([extra, ...lines.flatMap((l) => l.groupNames)]);
    } catch (err) {
      msg.textContent = err.message;
      return;
    }

    const fresh = [];
    const fixes = new Map();
    let dupes = 0;
    for (const line of lines) {
      const fields = fieldsOf({ ...line, groups: idsOf([extra, ...line.groupNames]) });
      const same = (f) => normDe(f.de) === normDe(fields.de) && normJp(f.jp) === normJp(fields.jp);
      const twin = fresh.find(same);
      if (twin) {
        twin.groups = [...new Set([...twin.groups, ...fields.groups])];
        dupes++;
        continue;
      }
      const existing = duplicateOf(fields);
      if (existing) {
        const fix = mergeInto({ ...existing, ...fixes.get(existing.id) }, fields, line.legacyNote);
        if (fix) fixes.set(existing.id, { ...fixes.get(existing.id), ...fix });
        else if (!fixes.has(existing.id)) dupes++;
        continue;
      }
      fresh.push(fields);
    }
    try {
      if (fresh.length) await KanaStore.addWords(fresh);
      if (fixes.size) await KanaStore.updateWords([...fixes.values()]);
    } catch (err) {
      msg.textContent = err.message;
      return;
    }
    area.value = bad.join('\n');
    msg.textContent = [
      `${fresh.length} hinzugefügt`,
      fixes.size ? `${fixes.size} ergänzt (Gruppen, Kanji …)` : null,
      dupes ? `${dupes} schon vorhanden` : null,
      bad.length ? (bad.length === 1 ? '1 Zeile ohne „=“ (steht noch im Feld)' : `${bad.length} Zeilen ohne „=“ (stehen noch im Feld)`) : null,
    ]
      .filter(Boolean)
      .join(' · ');
    renderVocabLists();
  });

  // ---------- Upgrade of words from before kanji and groups ----------

  function renderUpgrade() {
    const n = store.words.filter(upgradeOf).length;
    $('#upgrade-banner').hidden = !n;
    $('#upgrade-count').textContent = n === 1 ? '1 Wort hat' : `${n} Wörter haben`;
  }

  $('#upgrade-run').addEventListener('click', async (e) => {
    const fixes = store.words.map(upgradeOf).filter(Boolean);
    if (!fixes.length) return;
    e.currentTarget.disabled = true;
    try {
      const idsOf = await groupIds(fixes.flatMap((f) => f.groupNames || []));
      await KanaStore.updateWords(
        fixes.map(({ groupNames, ...fix }) => {
          const groups = groupNames?.length ? [...new Set([...(findWord(fix.id)?.groups || []), ...idsOf(groupNames)])] : undefined;
          return groups ? { ...fix, groups } : fix;
        }),
      );
      KanaStore.toast(`${fixes.length} Wörter übernommen ✓`);
    } catch {
      // The store already showed the error.
    } finally {
      e.currentTarget.disabled = false;
    }
    renderVocabLists();
  });

  // ---------- Groups ----------

  let confirmDelete = null; // id of the group whose delete options are shown

  async function renameGroup(group) {
    const name = cleanName(prompt('Neuer Name der Gruppe:', group.name));
    if (!name || name === group.name) return;
    try {
      await KanaStore.renameGroup(group.id, name);
    } catch {
      // toast shown by the store
    }
    renderVocabLists();
  }

  async function deleteGroup(group, withWords) {
    const words = wordsIn(group.id);
    if (withWords && !confirm(`Gruppe „${group.name}“ und ihre ${words.length} Wörter wirklich löschen? Die Wörter verschwinden für alle.`)) return;
    try {
      await KanaStore.deleteGroup(group.id, withWords);
    } catch {
      return;
    }
    if (withWords) {
      for (const w of words) delete data.stats[w.id];
      if (words.some((w) => w.id === editingId)) stopEdit();
    }
    store.settings.groups = store.settings.groups.filter((id) => id !== group.id);
    save();
    confirmDelete = null;
    quiz.current = null;
    renderVocabLists();
  }

  function practiceGroup(group) {
    store.settings.groups = [group.id];
    save();
    quiz.current = null;
    location.hash = '#vocab';
  }

  function renderGroups() {
    const groups = sortedGroups();
    $('#groups-count').textContent = groups.length || '';
    if (!groups.length) {
      $('#group-list').replaceChildren(
        h('p', { class: 'empty-note' }, 'Noch keine Gruppen. Leg z. B. „Lektion 1“ oder „Monate“ an – oder importier Wörter mit „L1“ am Zeilenende.'),
      );
      return;
    }
    $('#group-list').replaceChildren(
      ...groups.map((g) => {
        const n = wordsIn(g.id).length;
        const actions =
          confirmDelete === g.id
            ? [
                h('button', { type: 'button', class: 'btn ghost small', onclick: () => deleteGroup(g, false) }, 'Nur Gruppe löschen'),
                n ? h('button', { type: 'button', class: 'btn ghost small danger', onclick: () => deleteGroup(g, true) }, `Mit ${n} Wörtern löschen`) : null,
                h('button', { type: 'button', class: 'link', onclick: () => ((confirmDelete = null), renderGroups()) }, 'Abbrechen'),
              ]
            : [
                h('button', { type: 'button', class: 'btn ghost small', onclick: () => practiceGroup(g), disabled: !n }, 'Üben'),
                h('button', { type: 'button', class: 'btn ghost small', onclick: () => renameGroup(g), 'aria-label': `${g.name} umbenennen` }, h('span', { class: 'lg' }, 'Umbenennen'), icon('edit')),
                h('button', { type: 'button', class: 'btn ghost small danger', onclick: () => ((confirmDelete = g.id), renderGroups()), 'aria-label': `${g.name} löschen` }, h('span', { class: 'lg' }, 'Löschen'), icon('delete')),
              ];
        return h(
          'div',
          { class: `group-row${confirmDelete === g.id ? ' confirming' : ''}` },
          h('div', { class: 'g-main' }, h('strong', {}, g.name), h('span', { class: 'sub' }, n === 1 ? '1 Wort' : `${n} Wörter`)),
          h('div', { class: 'w-actions' }, actions),
        );
      }),
    );
  }

  $('#group-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = e.currentTarget.elements.name;
    const name = cleanName(input.value);
    if (!name) return;
    if (groupByName(name)) {
      KanaStore.toast(`Die Gruppe „${name}“ gibt es schon.`);
      return;
    }
    try {
      await KanaStore.ensureGroups([name]);
    } catch {
      return;
    }
    input.value = '';
    renderVocabLists();
  });

  // ---------- Word list ----------

  $('#word-search').addEventListener('input', () => renderWords());
  $('#word-group-filter').addEventListener('change', () => renderWords());

  function dirBadge(word, dir) {
    const s = statOf(word, dir);
    const label = { dj: 'DE → JP', jd: 'JP → DE', kr: 'Kanji' }[dir];
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

  function renderGroupFilter() {
    const select = $('#word-group-filter');
    const value = select.value;
    select.replaceChildren(
      h('option', { value: '' }, 'Alle Gruppen'),
      h('option', { value: '-' }, 'Ohne Gruppe'),
      ...sortedGroups().map((g) => h('option', { value: g.id }, g.name)),
    );
    select.value = value === '-' || groupById(value) ? value : '';
    select.hidden = !store.groups.length;
    $('#group-names').replaceChildren(...sortedGroups().map((g) => h('option', { value: g.name })));
  }

  // Assign all words currently shown to a group, or take them out of the filtered one.
  function renderBulkGroup(words) {
    const select = $('#word-bulk-group');
    const filter = $('#word-group-filter').value;
    const filtered = !!(filter || $('#word-search').value.trim());
    select.hidden = !store.groups.length || !words.length || !filtered;
    if (select.hidden) return;
    const label = words.length === 1 ? 'dem angezeigten Wort' : `den ${words.length} angezeigten Wörtern`;
    select.replaceChildren(
      h('option', { value: '' }, `Gruppe für ${words.length === 1 ? 'das angezeigte Wort' : `die ${words.length} angezeigten`} …`),
      ...sortedGroups()
        .filter((g) => words.some((w) => !w.groups?.includes(g.id)))
        .map((g) => h('option', { value: `+${g.id}` }, `zu „${g.name}“ hinzufügen`)),
      groupById(filter) ? h('option', { value: `-${filter}` }, `aus „${groupById(filter).name}“ entfernen`) : null,
    );
    select.onchange = async () => {
      const add = select.value.startsWith('+');
      const group = groupById(select.value.slice(1));
      select.value = '';
      if (!group) return;
      if (!confirm(`${label[0].toUpperCase()}${label.slice(1)} die Gruppe „${group.name}“ ${add ? 'hinzufügen' : 'wegnehmen'}?`)) return;
      const list = words
        .filter((w) => add !== !!w.groups?.includes(group.id))
        .map((w) => ({ id: w.id, groups: add ? [...(w.groups || []), group.id] : w.groups.filter((id) => id !== group.id) }));
      try {
        await KanaStore.updateWords(list);
      } catch {
        // toast shown by the store
      }
      renderVocabLists();
    };
  }

  function renderWords() {
    const query = $('#word-search').value.trim().toLowerCase();
    const filter = $('#word-group-filter').value;
    const words = [...store.words]
      .sort((a, b) => b.created - a.created)
      .filter((w) => !filter || (filter === '-' ? !groupsOf(w).length : w.groups?.includes(filter)))
      .filter((w) => !query || [w.de, w.jp, w.kana, w.kanji, w.note, ...groupsOf(w).map((g) => g.name)].some((x) => x && x.toLowerCase().includes(query)));
    $('#words-count').textContent = store.words.length || '';
    $('#delete-all-words').hidden = !store.words.length;
    renderBulkGroup(words);

    if (!store.words.length) {
      $('#word-list').replaceChildren(h('p', { class: 'empty-note' }, 'Noch keine Wörter. Leg oben dein erstes Wort an – z. B. Erdbeere = ichigo.'));
      return;
    }
    if (!words.length) {
      $('#word-list').replaceChildren(h('p', { class: 'empty-note' }, query ? `Nichts gefunden für „${query}“.` : 'Keine Wörter in dieser Auswahl.'));
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
            h(
              'div',
              { class: 'w-jp' },
              h('span', {}, word.jp),
              word.kana ? h('span', { class: 'w-kana', lang: 'ja' }, word.kana) : null,
              word.kanji ? h('span', { class: 'w-kanji', lang: 'ja' }, word.kanji) : null,
            ),
            word.note ? h('div', { class: 'w-note' }, word.note) : null,
            groupsOf(word).length ? h('div', { class: 'w-groups' }, groupsOf(word).map((g) => h('span', { class: 'w-group' }, g.name))) : null,
            word.by ? h('div', { class: 'w-by' }, `von ${word.by}`) : null,
          ),
          h('div', { class: 'w-stats' }, dirBadge(word, 'dj'), dirBadge(word, 'jd'), word.kanji ? dirBadge(word, 'kr') : null),
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

  // Everything on the "Meine Wörter" page that depends on words and groups.
  function renderVocabLists() {
    renderUpgrade();
    renderFormGroups();
    renderGroups();
    renderGroupFilter();
    renderWords();
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
  ui.groupsToggle.addEventListener('click', () => toggleGroupPicker());
  $('#v-empty-all').addEventListener('click', () => setQuizGroups([]));
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
      const current = quiz.current && poolWords().find((w) => w.id === quiz.current.word.id);
      if (!current || (quiz.current.dir === 'kr' && !current.kanji)) nextQuestion();
      else {
        quiz.current.word = current;
        renderGroupPicker();
        focusAnswer(ui.input);
      }
    }
    if (view === 'words') {
      renderVocabLists();
      if (!store.words.length) form.elements.de.focus({ preventScroll: true });
    }
  }
  // Render right away from what we have; the refresh above updates it.
  const showNow = (view) => {
    if (view === 'words') renderVocabLists();
    if (view === 'vocab') renderGroupPicker();
    return show(view);
  };

  window.Vocab = { show: showNow, summary };
});
