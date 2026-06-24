'use strict';

/* =========================================================================
   Webtoon Mutalaah — Fasa 1
   Modul Projek & Teks (vanilla JS, tanpa React).
   Routing ringkas berasaskan hash:
     #/                  -> dashboard projek
     #/project/:id       -> detail projek + editor teks
   ========================================================================= */

// ---- Pembina elemen ringkas (selamat: teks melalui textContent) ----------
function el(tag, props, children) {
  const node = document.createElement(tag);
  if (props) {
    for (const key in props) {
      const val = props[key];
      if (val === null || val === undefined) continue;
      if (key === 'class') node.className = val;
      else if (key === 'text') node.textContent = val;
      else if (key === 'value') node.value = val;
      else if (key === 'hidden') node.hidden = !!val;
      else if (key.slice(0, 2) === 'on' && typeof val === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), val);
      } else {
        node.setAttribute(key, val);
      }
    }
  }
  if (children !== null && children !== undefined) {
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
  }
  return node;
}

function byId(id) {
  return document.getElementById(id);
}

// ---- Klien API ------------------------------------------------------------
const api = {
  async req(method, url, body) {
    const opt = { method, headers: { Accept: 'application/json' } };
    if (body !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    const res = await fetch(url, opt);
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      const msg = (data && data.error) || ('Ralat pelayan (' + res.status + ')');
      throw new Error(msg);
    }
    return data;
  },
  listProjects() {
    return this.req('GET', '/api/projects');
  },
  createProject(payload) {
    return this.req('POST', '/api/projects', payload);
  },
  getProject(id) {
    return this.req('GET', '/api/projects/' + id);
  },
  updateProject(id, payload) {
    return this.req('PUT', '/api/projects/' + id, payload);
  },
  deleteProject(id) {
    return this.req('DELETE', '/api/projects/' + id);
  },
  getText(id) {
    return this.req('GET', '/api/projects/' + id + '/text');
  },
  saveText(id, payload) {
    return this.req('PUT', '/api/projects/' + id + '/text', payload);
  },
  listCharacters(id) {
    return this.req('GET', '/api/projects/' + id + '/characters');
  },
  generateCharacters(id) {
    return this.req('POST', '/api/projects/' + id + '/generate-characters', {});
  },
  addCharacter(id, payload) {
    return this.req('POST', '/api/projects/' + id + '/characters', payload);
  },
  updateCharacter(charId, payload) {
    return this.req('PUT', '/api/characters/' + charId, payload);
  },
  deleteCharacter(charId) {
    return this.req('DELETE', '/api/characters/' + charId);
  }
};

// ---- Status ---------------------------------------------------------------
const STATUS_LABELS = {
  draft: 'Draf',
  text_ready: 'Teks sedia',
  character_ready: 'Watak sedia',
  storyboard_ready: 'Papan cerita sedia',
  script_ready: 'Skrip sedia',
  panel_ready: 'Panel sedia',
  image_prompt_ready: 'Prompt sedia',
  image_generated: 'Gambar dijana',
  published: 'Diterbitkan'
};

function statusLabel(s) {
  return STATUS_LABELS[s] || s || '—';
}

function statusPill(s) {
  return el('span', { class: 'status-pill status-pill--' + (s || 'draft'), text: statusLabel(s) });
}

// ---- Label watak ----------------------------------------------------------
const CHAR_TYPE_LABELS = {
  noble_figure_no_face: 'Tokoh mulia (tanpa muka)',
  ordinary_character: 'Watak biasa',
  background_character: 'Watak latar'
};
const FACE_POLICY_LABELS = {
  glowing_light: 'Cahaya bersinar',
  normal: 'Normal'
};

function charTypeLabel(t) {
  return CHAR_TYPE_LABELS[t] || t || '—';
}
function facePolicyLabel(f) {
  return FACE_POLICY_LABELS[f] || f || '—';
}
function charTypeBadge(t) {
  return el('span', { class: 'badge badge--' + (t || 'ordinary_character'), text: charTypeLabel(t) });
}

// ---- Utiliti ---------------------------------------------------------------
function projectTitle(p) {
  return (p && (p.title_ms || p.title_ar)) || 'Tanpa tajuk';
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('ms-MY', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch (e) {
    return String(iso).slice(0, 10);
  }
}

// ---- Toast ----------------------------------------------------------------
let toastTimer = null;
function toast(message, kind) {
  const t = byId('toast');
  if (!t) return;
  t.textContent = message;
  t.className = 'toast toast--' + (kind || 'info');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    t.hidden = true;
  }, 3200);
}

// ---- Modal ----------------------------------------------------------------
function openModal(card) {
  const root = byId('modal-root');
  root.innerHTML = '';
  const overlay = el('div', {
    class: 'modal-overlay',
    onClick: function (e) {
      if (e.target === overlay) closeModal();
    }
  }, card);
  root.appendChild(overlay);
  root.hidden = false;
  document.body.classList.add('no-scroll');
  const focusable = card.querySelector('input, textarea, button');
  if (focusable) focusable.focus();
}

function closeModal() {
  const root = byId('modal-root');
  root.hidden = true;
  root.innerHTML = '';
  document.body.classList.remove('no-scroll');
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeModal();
});

// ---- Borang cipta / edit projek -------------------------------------------
function openProjectForm(existing) {
  const isEdit = !!existing;

  const titleMs = el('input', {
    class: 'field-input',
    type: 'text',
    id: 'f-title-ms',
    placeholder: 'cth. Kisah Kejujuran',
    value: isEdit ? existing.title_ms || '' : ''
  });
  const titleAr = el('input', {
    class: 'field-input field-input--ar',
    type: 'text',
    id: 'f-title-ar',
    dir: 'rtl',
    lang: 'ar',
    placeholder: 'العنوان بالعربية',
    value: isEdit ? existing.title_ar || '' : ''
  });
  const desc = el('textarea', {
    class: 'field-input',
    id: 'f-desc',
    rows: '3',
    placeholder: 'Penerangan ringkas (pilihan)'
  });
  desc.value = isEdit ? existing.description || '' : '';

  const errLine = el('p', { class: 'form-error', hidden: true });

  const form = el('form', {
    class: 'modal-form',
    onSubmit: async function (e) {
      e.preventDefault();
      const payload = {
        title_ms: titleMs.value.trim(),
        title_ar: titleAr.value.trim(),
        description: desc.value.trim()
      };
      if (!payload.title_ms && !payload.title_ar) {
        errLine.textContent = 'Sila isi sekurang-kurangnya satu tajuk.';
        errLine.hidden = false;
        return;
      }
      const submit = form.querySelector('.btn-primary');
      submit.disabled = true;
      submit.textContent = 'Menyimpan…';
      try {
        if (isEdit) {
          await api.updateProject(existing.id, payload);
          closeModal();
          toast('Projek dikemas kini', 'ok');
          renderDetail(existing.id);
        } else {
          const created = await api.createProject(payload);
          closeModal();
          toast('Projek dicipta', 'ok');
          location.hash = '#/project/' + created.id;
        }
      } catch (err) {
        submit.disabled = false;
        submit.textContent = isEdit ? 'Simpan' : 'Cipta';
        errLine.textContent = err.message;
        errLine.hidden = false;
      }
    }
  }, [
    el('h2', { class: 'modal-title', text: isEdit ? 'Edit projek' : 'Projek baharu' }),
    el('label', { class: 'field' }, [
      el('span', { class: 'field-label', text: 'Tajuk (Melayu)' }),
      titleMs
    ]),
    el('label', { class: 'field' }, [
      el('span', { class: 'field-label', text: 'Tajuk (Arab)' }),
      titleAr
    ]),
    el('label', { class: 'field' }, [
      el('span', { class: 'field-label', text: 'Penerangan' }),
      desc
    ]),
    errLine,
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal, text: 'Batal' }),
      el('button', { class: 'btn btn-primary', type: 'submit', text: isEdit ? 'Simpan' : 'Cipta' })
    ])
  ]);

  openModal(el('div', { class: 'modal-card' }, form));
}

// ---- Pengesahan padam -----------------------------------------------------
function openDeleteConfirm(project) {
  const card = el('div', { class: 'modal-card' }, [
    el('h2', { class: 'modal-title', text: 'Padam projek?' }),
    el('p', { class: 'modal-text' }, [
      'Projek ',
      el('strong', { text: projectTitle(project) }),
      ' dan semua teks berkaitan akan dipadam kekal. Tindakan ini tidak boleh dibatalkan.'
    ]),
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal, text: 'Batal' }),
      el('button', {
        class: 'btn btn-danger',
        type: 'button',
        text: 'Padam',
        onClick: async function (e) {
          const b = e.currentTarget;
          b.disabled = true;
          b.textContent = 'Memadam…';
          try {
            await api.deleteProject(project.id);
            closeModal();
            toast('Projek dipadam', 'ok');
            location.hash = '#/';
          } catch (err) {
            b.disabled = false;
            b.textContent = 'Padam';
            toast(err.message, 'error');
          }
        }
      })
    ])
  ]);
  openModal(card);
}

// ---- Kad projek -----------------------------------------------------------
function projectCard(p) {
  return el('a', { class: 'card', href: '#/project/' + p.id }, [
    el('div', { class: 'card-top' }, [
      el('h3', { class: 'card-title', text: projectTitle(p) }),
      statusPill(p.status)
    ]),
    p.title_ar ? el('p', { class: 'card-ar', lang: 'ar', dir: 'rtl', text: p.title_ar }) : null,
    p.description ? el('p', { class: 'card-desc', text: p.description }) : null,
    el('p', { class: 'card-meta', text: 'Dikemas kini ' + formatDate(p.updated_at) })
  ]);
}

function emptyState() {
  return el('div', { class: 'empty' }, [
    el('p', { class: 'empty-ar', lang: 'ar', dir: 'rtl', text: 'ابدأ هنا' }),
    el('p', { class: 'empty-title', text: 'Belum ada projek' }),
    el('p', { class: 'empty-text', text: 'Cipta projek pertama untuk mula memasukkan teks Mutalaah.' }),
    el('button', { class: 'btn btn-primary', type: 'button', onClick: function () { openProjectForm(null); }, text: '+ Projek baharu' })
  ]);
}

// ---- Paparan: Dashboard ---------------------------------------------------
async function renderDashboard() {
  const view = byId('view');
  view.innerHTML = '';

  view.appendChild(el('div', { class: 'page-head' }, [
    el('h1', { class: 'page-title', text: 'Projek' }),
    el('button', { class: 'btn btn-primary', type: 'button', onClick: function () { openProjectForm(null); }, text: '+ Projek baharu' })
  ]));

  const listWrap = el('div', { class: 'list' }, el('p', { class: 'muted', text: 'Memuatkan…' }));
  view.appendChild(listWrap);

  try {
    const projects = await api.listProjects();
    listWrap.innerHTML = '';
    if (!projects.length) {
      listWrap.appendChild(emptyState());
      return;
    }
    projects.forEach(function (p) {
      listWrap.appendChild(projectCard(p));
    });
  } catch (err) {
    listWrap.innerHTML = '';
    listWrap.appendChild(el('p', { class: 'error-text', text: 'Gagal memuatkan projek: ' + err.message }));
  }
}

// ---- Paparan: Detail (tab TEKS / WATAK) ----------------------------------
async function renderDetail(id) {
  const view = byId('view');
  view.innerHTML = '';
  view.appendChild(el('p', { class: 'muted', text: 'Memuatkan…' }));

  let project;
  try {
    project = await api.getProject(id);
  } catch (err) {
    view.innerHTML = '';
    view.appendChild(el('a', { class: 'back-link', href: '#/', text: '← Semua projek' }));
    view.appendChild(el('p', { class: 'error-text', text: 'Tidak dapat membuka projek: ' + err.message }));
    return;
  }

  view.innerHTML = '';
  view.appendChild(el('a', { class: 'back-link', href: '#/', text: '← Semua projek' }));

  const statusWrap = el('span', { class: 'detail-status' }, statusPill(project.status));
  function updateStatus(s) {
    statusWrap.innerHTML = '';
    statusWrap.appendChild(statusPill(s));
  }

  view.appendChild(el('div', { class: 'detail-head' }, [
    el('div', { class: 'detail-head-row' }, [
      el('div', { class: 'detail-titles' }, [
        el('h1', { class: 'detail-title', text: projectTitle(project) }),
        project.title_ar ? el('p', { class: 'detail-ar', lang: 'ar', dir: 'rtl', text: project.title_ar }) : null,
        statusWrap
      ]),
      el('div', { class: 'detail-actions' }, [
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: function () { openProjectForm(project); }, text: 'Edit' }),
        el('button', { class: 'btn btn-danger btn-sm', type: 'button', onClick: function () { openDeleteConfirm(project); }, text: 'Padam' })
      ])
    ]),
    project.description ? el('p', { class: 'detail-desc', text: project.description }) : null
  ]));

  // Tab bar: TEKS | WATAK
  const tabTeks = el('button', { class: 'tab is-active', type: 'button', text: 'Teks' });
  const tabWatak = el('button', { class: 'tab', type: 'button', text: 'Watak' });
  const content = el('div', { class: 'tab-content' });

  function setTab(name) {
    if (name === 'watak') {
      tabWatak.className = 'tab is-active';
      tabTeks.className = 'tab';
      renderCharacterTab(id, content, updateStatus);
    } else {
      tabTeks.className = 'tab is-active';
      tabWatak.className = 'tab';
      renderTextTab(id, content, updateStatus);
    }
  }
  tabTeks.addEventListener('click', function () { setTab('teks'); });
  tabWatak.addEventListener('click', function () { setTab('watak'); });

  view.appendChild(el('div', { class: 'tabs' }, [tabTeks, tabWatak]));
  view.appendChild(content);
  setTab('teks');
}

// ---- Tab: Teks (editor tiga panel — fungsi Fasa 1) -----------------------
async function renderTextTab(id, container, updateStatus) {
  container.innerHTML = '';
  container.appendChild(el('p', { class: 'muted', text: 'Memuatkan teks…' }));

  let text;
  try {
    text = await api.getText(id);
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(el('p', { class: 'error-text', text: 'Gagal memuatkan teks: ' + err.message }));
    return;
  }
  container.innerHTML = '';

  const arInput = el('textarea', { class: 'editor-input editor-input--ar', dir: 'rtl', lang: 'ar', rows: '8', placeholder: 'الصق نص المطالعة العربي هنا…' });
  arInput.value = text.original_ar || '';
  const msInput = el('textarea', { class: 'editor-input', rows: '6', placeholder: 'Terjemahan Melayu…' });
  msInput.value = text.translation_ms || '';
  const notesInput = el('textarea', { class: 'editor-input', rows: '4', placeholder: 'Nota, kosa kata, atau nilai pengajaran…' });
  notesInput.value = text.notes || '';
  const saveBtn = el('button', { class: 'btn btn-primary', type: 'submit', text: 'Simpan teks' });

  const editor = el('form', {
    class: 'editor',
    onSubmit: async function (e) {
      e.preventDefault();
      saveBtn.disabled = true;
      saveBtn.textContent = 'Menyimpan…';
      try {
        const result = await api.saveText(id, { original_ar: arInput.value, translation_ms: msInput.value, notes: notesInput.value });
        if (result && result.project) updateStatus(result.project.status);
        toast('Teks disimpan', 'ok');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Simpan teks';
      }
    }
  }, [
    el('div', { class: 'panel-block' }, [
      el('div', { class: 'panel-label' }, [
        el('span', { class: 'panel-label-ms', text: 'Teks Arab asal' }),
        el('span', { class: 'panel-hint', text: 'Mengisi ruangan ini → status “Teks sedia”' })
      ]),
      arInput
    ]),
    el('div', { class: 'panel-block' }, [
      el('div', { class: 'panel-label' }, [el('span', { class: 'panel-label-ms', text: 'Terjemahan Melayu' })]),
      msInput
    ]),
    el('div', { class: 'panel-block' }, [
      el('div', { class: 'panel-label' }, [el('span', { class: 'panel-label-ms', text: 'Nota / kosa kata / nilai pengajaran' })]),
      notesInput
    ]),
    el('div', { class: 'editor-actions' }, saveBtn)
  ]);

  container.appendChild(editor);
}

// ---- Tab: Watak -----------------------------------------------------------
async function renderCharacterTab(id, container, updateStatus) {
  container.innerHTML = '';
  container.appendChild(el('p', { class: 'muted', text: 'Memuatkan watak…' }));

  let chars;
  try {
    chars = await api.listCharacters(id);
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(el('p', { class: 'error-text', text: 'Gagal memuatkan watak: ' + err.message }));
    return;
  }
  container.innerHTML = '';

  function reload() { renderCharacterTab(id, container, updateStatus); }

  const genBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Jana watak' });
  genBtn.addEventListener('click', async function () {
    genBtn.disabled = true;
    genBtn.textContent = 'Menjana…';
    try {
      const r = await api.generateCharacters(id);
      if (r && r.project) updateStatus(r.project.status);
      const made = (r && r.created) ? r.created.length : 0;
      const detected = (r && r.detected) || 0;
      if (detected === 0) toast('Tiada watak dikenali daripada teks', 'info');
      else toast(made > 0 ? ('Dijana ' + made + ' watak baharu') : 'Semua watak sudah wujud', 'ok');
      reload();
    } catch (err) {
      genBtn.disabled = false;
      genBtn.textContent = 'Jana watak';
      toast(err.message, 'error');
    }
  });

  const addBtn = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Tambah watak' });
  addBtn.addEventListener('click', function () { openCharacterForm(id, null, updateStatus, reload); });

  container.appendChild(el('div', { class: 'char-toolbar' }, [genBtn, addBtn]));

  if (!chars.length) {
    container.appendChild(el('div', { class: 'empty' }, [
      el('p', { class: 'empty-ar', lang: 'ar', dir: 'rtl', text: 'لا شخصيات بعد' }),
      el('p', { class: 'empty-title', text: 'Belum ada watak' }),
      el('p', { class: 'empty-text', text: 'Tekan “Jana watak” untuk mengekstrak watak daripada teks Arab, atau tambah secara manual.' })
    ]));
    return;
  }

  const list = el('div', { class: 'char-list' });
  chars.forEach(function (c) { list.appendChild(characterCard(c, updateStatus, reload)); });
  container.appendChild(list);
}

function characterCard(c, updateStatus, reload) {
  return el('div', { class: 'char-card' }, [
    el('div', { class: 'char-top' }, [
      el('div', { class: 'char-names' }, [
        c.name_ar ? el('p', { class: 'char-ar', lang: 'ar', dir: 'rtl', text: c.name_ar }) : null,
        el('p', { class: 'char-ms', text: c.name_ms || '—' })
      ]),
      charTypeBadge(c.character_type)
    ]),
    el('p', { class: 'char-code', text: c.character_code || '—' }),
    c.role ? el('p', { class: 'char-role', text: c.role }) : null,
    el('div', { class: 'char-chips' }, [
      el('span', { class: 'chip chip--' + (c.face_policy || 'normal'), text: 'Muka: ' + facePolicyLabel(c.face_policy) })
    ]),
    el('div', { class: 'char-actions' }, [
      el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: function () { openCharacterForm(c.project_id, c, updateStatus, reload); }, text: 'Edit' }),
      el('button', { class: 'btn btn-danger btn-sm', type: 'button', onClick: function () { openCharacterDelete(c, updateStatus, reload); }, text: 'Padam' })
    ])
  ]);
}

// ---- Borang watak (tambah / edit) ----------------------------------------
function openCharacterForm(projectId, existing, updateStatus, reload) {
  const isEdit = !!existing;

  const nameAr = el('input', { class: 'field-input field-input--ar', type: 'text', dir: 'rtl', lang: 'ar', placeholder: 'الاسم بالعربية', value: isEdit ? (existing.name_ar || '') : '' });
  const nameMs = el('input', { class: 'field-input', type: 'text', placeholder: 'cth. Nabi Musa', value: isEdit ? (existing.name_ms || '') : '' });
  const role = el('input', { class: 'field-input', type: 'text', placeholder: 'Peranan dalam cerita', value: isEdit ? (existing.role || '') : '' });
  const notes = el('textarea', { class: 'field-input', rows: '2', placeholder: 'Nota penampilan (pilihan)' });
  notes.value = isEdit ? (existing.appearance_notes || '') : '';
  const dna = el('textarea', { class: 'field-input field-input--mono', rows: '4', placeholder: '{ "gender": "male", "age": "adult" }' });
  dna.value = (isEdit && existing.visual_dna) ? JSON.stringify(existing.visual_dna, null, 2) : '';

  let typeSelect = null;
  if (!isEdit) {
    typeSelect = el('select', { class: 'field-input' }, [
      el('option', { value: 'ordinary_character' }, 'Watak biasa'),
      el('option', { value: 'noble_figure_no_face' }, 'Tokoh mulia (tanpa muka)'),
      el('option', { value: 'background_character' }, 'Watak latar')
    ]);
  }

  const errLine = el('p', { class: 'form-error', hidden: true });

  const fields = [el('h2', { class: 'modal-title', text: isEdit ? 'Edit watak' : 'Tambah watak' })];
  if (isEdit) {
    fields.push(el('div', { class: 'locked-row' }, [
      el('span', { class: 'locked-label', text: 'Character code (tetap)' }),
      el('span', { class: 'locked-value', text: existing.character_code || '—' })
    ]));
    fields.push(el('div', { class: 'locked-row' }, [
      el('span', { class: 'locked-label', text: 'Jenis' }),
      charTypeBadge(existing.character_type)
    ]));
  }
  fields.push(el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Nama (Arab)' }), nameAr]));
  fields.push(el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Nama (Melayu)' }), nameMs]));
  if (!isEdit) fields.push(el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Jenis watak' }), typeSelect]));
  fields.push(el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Peranan' }), role]));
  fields.push(el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Nota penampilan' }), notes]));
  fields.push(el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Visual DNA (JSON)' }), dna]));
  fields.push(errLine);
  fields.push(el('div', { class: 'modal-actions' }, [
    el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal, text: 'Batal' }),
    el('button', { class: 'btn btn-primary', type: 'submit', text: isEdit ? 'Simpan' : 'Tambah' })
  ]));

  const form = el('form', {
    class: 'modal-form',
    onSubmit: async function (e) {
      e.preventDefault();
      const nAr = nameAr.value.trim();
      const nMs = nameMs.value.trim();
      if (!nAr && !nMs) { errLine.textContent = 'Sila isi sekurang-kurangnya satu nama.'; errLine.hidden = false; return; }
      let dnaVal = {};
      const dnaText = dna.value.trim();
      if (dnaText) {
        try {
          dnaVal = JSON.parse(dnaText);
          if (!dnaVal || typeof dnaVal !== 'object' || Array.isArray(dnaVal)) throw new Error('x');
        } catch (_) {
          errLine.textContent = 'Visual DNA mesti objek JSON yang sah.';
          errLine.hidden = false;
          return;
        }
      }
      const submit = form.querySelector('.btn-primary');
      submit.disabled = true;
      submit.textContent = 'Menyimpan…';
      try {
        if (isEdit) {
          await api.updateCharacter(existing.id, { name_ar: nAr, name_ms: nMs, role: role.value.trim(), appearance_notes: notes.value.trim(), visual_dna: dnaVal });
          toast('Watak dikemas kini', 'ok');
        } else {
          const r = await api.addCharacter(projectId, { name_ar: nAr, name_ms: nMs, character_type: typeSelect.value, role: role.value.trim(), appearance_notes: notes.value.trim(), visual_dna: dnaVal });
          if (r && r.project) updateStatus(r.project.status);
          toast('Watak ditambah', 'ok');
        }
        closeModal();
        reload();
      } catch (err) {
        submit.disabled = false;
        submit.textContent = isEdit ? 'Simpan' : 'Tambah';
        errLine.textContent = err.message;
        errLine.hidden = false;
      }
    }
  }, fields);

  openModal(el('div', { class: 'modal-card' }, form));
}

function openCharacterDelete(c, updateStatus, reload) {
  const card = el('div', { class: 'modal-card' }, [
    el('h2', { class: 'modal-title', text: 'Padam watak?' }),
    el('p', { class: 'modal-text' }, [
      'Watak ',
      el('strong', { text: c.name_ms || c.name_ar || c.character_code }),
      ' akan dipadam. Tindakan ini tidak boleh dibatalkan.'
    ]),
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal, text: 'Batal' }),
      el('button', {
        class: 'btn btn-danger', type: 'button', text: 'Padam',
        onClick: async function (e) {
          const b = e.currentTarget;
          b.disabled = true;
          b.textContent = 'Memadam…';
          try {
            const r = await api.deleteCharacter(c.id);
            if (r && r.project) updateStatus(r.project.status);
            closeModal();
            toast('Watak dipadam', 'ok');
            reload();
          } catch (err) {
            b.disabled = false;
            b.textContent = 'Padam';
            toast(err.message, 'error');
          }
        }
      })
    ])
  ]);
  openModal(card);
}

// ---- Router ---------------------------------------------------------------
function parseHash() {
  const h = location.hash.replace(/^#/, '');
  const m = h.match(/^\/project\/(\d+)$/);
  if (m) return { view: 'detail', id: Number(m[1]) };
  return { view: 'dashboard' };
}

function render() {
  const route = parseHash();
  closeModal();
  window.scrollTo(0, 0);
  if (route.view === 'detail') {
    renderDetail(route.id);
  } else {
    renderDashboard();
  }
}

window.addEventListener('hashchange', render);

// ---- Health (penunjuk kecil di bar atas) ----------------------------------
async function checkHealth() {
  const node = byId('health');
  if (!node) return;
  try {
    const res = await fetch('/api/health', { headers: { Accept: 'application/json' } });
    const data = await res.json();
    if (res.ok && data && data.ok) {
      node.className = 'health health--ok';
      node.title = 'API aktif';
      return;
    }
    throw new Error('not ok');
  } catch (e) {
    node.className = 'health health--error';
    node.title = 'API tidak dapat dihubungi';
  }
}

// ---- Mula -----------------------------------------------------------------
render();
checkHealth();
