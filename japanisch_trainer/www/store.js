// Data layer: profiles, the shared vocabulary list and the statistics of the
// active profile. Talks to server.py when the app is served by it (e.g. as a
// Home Assistant app); otherwise everything is kept in this browser.
(() => {
  'use strict';

  const { $, h } = window.KanaUtil;

  const OLD_KANA_KEY = 'kana-trainer:v1';
  const OLD_VOCAB_KEY = 'kana-trainer:vocab:v1';
  const MIGRATED_KEY = 'jt:migrated';

  const local = {
    get(key, fallback) {
      try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    },
  };

  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- Backends ----------

  async function request(method, path, body, keepalive = false) {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      keepalive,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
    return data;
  }

  // Relative paths, so the app also works under the Home Assistant ingress prefix.
  const serverBackend = {
    mode: 'server',
    state: () => request('GET', 'api/state'),
    createProfile: (body) => request('POST', 'api/profiles', body),
    deleteProfile: (id) => request('DELETE', `api/profiles/${id}`),
    getData: (id) => request('GET', `api/profiles/${id}/data`),
    putData: (id, data, keepalive) => request('PUT', `api/profiles/${id}/data`, data, keepalive),
    words: () => request('GET', 'api/words'),
    addWords: (words) => request('POST', 'api/words', { words }),
    updateWord: (id, fields) => request('PUT', `api/words/${id}`, fields),
    deleteWord: (id) => request('DELETE', `api/words/${id}`),
  };

  // Same interface, kept in localStorage – used when no server is running.
  const SHARED_KEY = 'jt:local:shared';
  const userKey = (id) => `jt:local:user:${id}`;
  const loadShared = () => ({ profiles: [], words: [], ...local.get(SHARED_KEY, {}) });
  const localBackend = {
    mode: 'local',
    async state() {
      const shared = loadShared();
      return { me: null, ...shared };
    },
    async createProfile({ name }) {
      const shared = loadShared();
      const profile = { id: newId(), name: name.trim().slice(0, 60), created: Date.now() };
      shared.profiles.push(profile);
      local.set(SHARED_KEY, shared);
      return { profile, profiles: shared.profiles };
    },
    async deleteProfile(id) {
      const shared = loadShared();
      shared.profiles = shared.profiles.filter((p) => p.id !== id);
      local.set(SHARED_KEY, shared);
      try {
        localStorage.removeItem(userKey(id));
      } catch {
        // ignore
      }
      return { profiles: shared.profiles };
    },
    async getData(id) {
      return local.get(userKey(id), {});
    },
    async putData(id, data) {
      if (!local.set(userKey(id), data)) throw new Error('Browser-Speicher nicht verfügbar');
      return { ok: true };
    },
    async words() {
      return { words: loadShared().words };
    },
    async addWords(list) {
      const shared = loadShared();
      const ids = new Set(shared.words.map((w) => w.id));
      const added = list.map((w) => {
        const word = { ...w, id: w.id && !ids.has(w.id) ? w.id : newId(), created: w.created || Date.now() };
        ids.add(word.id);
        shared.words.push(word);
        return word.id;
      });
      local.set(SHARED_KEY, shared);
      return { words: shared.words, added };
    },
    async updateWord(id, fields) {
      const shared = loadShared();
      const word = shared.words.find((w) => w.id === id);
      if (!word) throw new Error('Wort nicht gefunden – wurde es inzwischen gelöscht?');
      Object.assign(word, fields);
      local.set(SHARED_KEY, shared);
      return { words: shared.words };
    },
    async deleteWord(id) {
      const shared = loadShared();
      shared.words = shared.words.filter((w) => w.id !== id);
      local.set(SHARED_KEY, shared);
      return { words: shared.words };
    },
  };

  async function detectBackend() {
    try {
      const state = await serverBackend.state();
      if (Array.isArray(state.profiles)) return { backend: serverBackend, state };
    } catch {
      // No server – fall through to browser storage.
    }
    return { backend: localBackend, state: await localBackend.state() };
  }

  // ---------- State ----------

  const KanaStore = {
    mode: null,
    me: null, // logged-in Home Assistant user, if any
    profile: null,
    profiles: [],
    words: [],
    user: {}, // statistics and settings of the active profile: { kana, vocab }
  };
  let backend = null;

  // The chosen profile is remembered per device and per Home Assistant user, so a
  // shared tablet keeps one choice per login.
  const choiceKey = () => `jt:profile:${KanaStore.me?.id || 'local'}`;

  // ---------- Saving ----------

  let saveTimer = null;
  let dirty = false;

  function saveUser() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 400);
  }

  async function flush(keepalive = false) {
    clearTimeout(saveTimer);
    if (!dirty || !KanaStore.profile) return;
    dirty = false;
    try {
      await backend.putData(KanaStore.profile.id, KanaStore.user, keepalive);
    } catch (e) {
      dirty = true;
      toast(`Speichern fehlgeschlagen: ${e.message}. Ich versuche es gleich noch einmal.`);
      saveTimer = setTimeout(flush, 5000);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
  window.addEventListener('pagehide', () => flush(true));

  // ---------- Words ----------

  function setWords(list) {
    KanaStore.words.splice(0, KanaStore.words.length, ...list);
  }

  async function wordCall(promise) {
    try {
      const res = await promise;
      setWords(res.words);
      return res;
    } catch (e) {
      toast(e.message);
      // Show the current list again, e.g. after somebody else deleted the word.
      refreshWords();
      throw e;
    }
  }

  async function refreshWords() {
    try {
      setWords((await backend.words()).words);
    } catch {
      // Keep the list we have.
    }
  }

  const by = () => KanaStore.profile?.name || '';
  KanaStore.addWords = (list) => wordCall(backend.addWords(list.map((w) => ({ by: by(), ...w }))));
  KanaStore.updateWord = (id, fields) => wordCall(backend.updateWord(id, fields));
  KanaStore.deleteWord = (id) => wordCall(backend.deleteWord(id));
  KanaStore.refreshWords = refreshWords;
  KanaStore.saveUser = saveUser;

  // ---------- Toast ----------

  let toastTimer = null;
  function toast(text) {
    const node = $('#toast');
    node.textContent = text;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (node.hidden = true), 5000);
  }
  KanaStore.toast = toast;

  // ---------- Migration of data from before profiles existed ----------

  async function migrateOldData() {
    if (local.get(MIGRATED_KEY, null)) return;
    const oldKana = local.get(OLD_KANA_KEY, null);
    const oldVocab = local.get(OLD_VOCAB_KEY, null);
    const isEmpty = !KanaStore.user.kana && !KanaStore.user.vocab;
    if (!isEmpty || (!oldKana && !oldVocab?.words?.length)) return;

    if (oldKana) KanaStore.user.kana = oldKana;
    if (oldVocab) {
      const known = new Set(KanaStore.words.map((w) => `${w.de}\u0000${w.jp}`));
      const fresh = (oldVocab.words || []).filter((w) => !known.has(`${w.de}\u0000${w.jp}`));
      if (fresh.length) {
        await KanaStore.addWords(fresh.map(({ id, de, jp, kana, note, created }) => ({ id, de, jp, kana, note, created })));
      }
      KanaStore.user.vocab = {
        settings: oldVocab.settings || {},
        stats: Object.fromEntries((oldVocab.words || []).filter((w) => w.s).map((w) => [w.id, w.s])),
      };
    }
    saveUser();
    await flush();
    local.set(MIGRATED_KEY, KanaStore.profile.id);
    toast(`Deine bisherigen Ergebnisse aus diesem Browser gehören jetzt zu „${KanaStore.profile.name}“.`);
  }

  // ---------- Profile picker ----------

  const dialog = $('#profile-dialog');

  function avatar(name) {
    return h('span', { class: 'avatar', 'aria-hidden': 'true' }, [...name.trim()][0]?.toUpperCase() || '?');
  }

  // Resolves with the chosen profile id. Without a current profile the dialog cannot be closed.
  function pickProfile() {
    return new Promise((resolve) => {
      const blocking = !KanaStore.profile;
      const done = (id) => {
        dialog.close();
        resolve(id);
      };

      const render = () => {
        const { me, profiles } = KanaStore;
        const haMissing = me && !profiles.some((p) => p.id === me.id);
        const input = h('input', { name: 'name', required: true, maxlength: '60', placeholder: 'Name, z. B. Raphael', autocomplete: 'off' });
        const status = h('p', { class: 'sub warn', 'aria-live': 'polite' });

        const create = async (body) => {
          try {
            const res = await backend.createProfile(body);
            KanaStore.profiles = res.profiles;
            done(res.profile.id);
          } catch (e) {
            status.textContent = e.message;
          }
        };

        dialog.replaceChildren(
          h(
            'div',
            { class: 'dialog-body' },
            h('h2', {}, 'Wer übt?'),
            h('p', { class: 'sub' }, 'Jede Person hat ihre eigene Analyse. Die Wörter im Vokabeltrainer teilt ihr euch.'),
            h(
              'div',
              { class: 'profile-list' },
              profiles.map((p) =>
                h(
                  'div',
                  { class: `profile-item${p.id === KanaStore.profile?.id ? ' current' : ''}` },
                  h(
                    'button',
                    { type: 'button', class: 'profile-pick', onclick: () => done(p.id) },
                    avatar(p.name),
                    h('span', {}, p.name, p.ha ? h('small', {}, ' · Home Assistant') : null, p.id === KanaStore.profile?.id ? h('small', {}, ' · aktiv') : null),
                  ),
                  p.id === KanaStore.profile?.id
                    ? null
                    : h(
                        'button',
                        {
                          type: 'button',
                          class: 'link profile-delete',
                          'aria-label': `Profil ${p.name} löschen`,
                          onclick: async () => {
                            if (!confirm(`Profil „${p.name}“ und seine ganze Statistik löschen? Die gemeinsamen Wörter bleiben erhalten.`)) return;
                            KanaStore.profiles = (await backend.deleteProfile(p.id)).profiles;
                            render();
                          },
                        },
                        'löschen',
                      ),
                ),
              ),
              haMissing
                ? h(
                    'button',
                    { type: 'button', class: 'profile-pick ha', onclick: () => create({ ha: true }) },
                    avatar(me.name),
                    h('span', {}, `Ich bin ${me.name}`, h('small', {}, ' · dein Home-Assistant-Benutzer')),
                  )
                : null,
            ),
            h(
              'form',
              {
                class: 'profile-new',
                onsubmit: (e) => {
                  e.preventDefault();
                  if (input.value.trim()) create({ name: input.value });
                },
              },
              h('label', {}, h('span', {}, profiles.length ? 'Neues Profil' : 'Wie heißt du?'), input),
              h('button', { type: 'submit', class: 'btn primary' }, 'Anlegen'),
            ),
            status,
            blocking ? null : h('div', { class: 'dialog-actions' }, h('button', { type: 'button', class: 'btn ghost', onclick: () => done(null) }, 'Abbrechen')),
          ),
        );
        if (!profiles.length) setTimeout(() => input.focus(), 0);
      };

      dialog.oncancel = (e) => {
        if (blocking) e.preventDefault();
        else resolve(null);
      };
      render();
      dialog.showModal();
    });
  }

  async function switchProfile() {
    const id = await pickProfile();
    if (!id || id === KanaStore.profile?.id) return;
    await flush();
    local.set(choiceKey(), id);
    location.reload();
  }

  function renderChip() {
    const chip = $('#profile-chip');
    chip.replaceChildren(avatar(KanaStore.profile.name), h('span', { class: 'chip-name' }, KanaStore.profile.name));
    chip.title = `Profil: ${KanaStore.profile.name} – wechseln`;
    chip.hidden = false;
    chip.onclick = switchProfile;
  }

  // ---------- Boot ----------

  KanaStore.ready = (async () => {
    const { backend: b, state } = await detectBackend();
    backend = b;
    KanaStore.mode = b.mode;
    KanaStore.me = state.me;
    KanaStore.profiles = state.profiles;
    setWords(state.words);

    let id = local.get(choiceKey(), null);
    if (!KanaStore.profiles.some((p) => p.id === id)) {
      id = await pickProfile();
      local.set(choiceKey(), id);
    }
    KanaStore.profile = KanaStore.profiles.find((p) => p.id === id);
    KanaStore.user = await backend.getData(id);
    await migrateOldData();
    renderChip();
  })();

  KanaStore.ready.catch((e) => {
    document.body.prepend(h('p', { class: 'boot-error' }, `Die App konnte nicht starten: ${e.message}`));
  });

  window.KanaStore = KanaStore;
})();
