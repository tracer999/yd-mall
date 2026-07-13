/* 관리자 페이지 빌더 에디터 (P2, 바닐라 JS)
 * 데이터: #pb-data(JSON) → 섹션 목록 렌더 + 설정폼 + CRUD/순서/발행/롤백 fetch.
 * 편집은 page_section(작업본)을 수정하고, "발행" 시에만 스토어프론트에 반영된다.
 */
(function () {
  'use strict';
  var dataEl = document.getElementById('pb-data');
  if (!dataEl) return;
  var STATE = JSON.parse(dataEl.textContent);
  var PAGE_ID = STATE.pageId;          // 편집 대상 페이지. 모든 요청·미리보기가 이걸 따른다
  var sections = STATE.sections || [];
  var productGroups = STATE.productGroups || [];
  var selectedId = null;

  var listEl = document.getElementById('pb-section-list');
  var settingsEl = document.getElementById('pb-settings');
  var previewEl = document.getElementById('pb-preview');
  var dirtyEl = document.getElementById('pb-dirty');

  // ---------- 유틸 ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function markDirty() { if (dirtyEl) dirtyEl.classList.remove('hidden'); }
  function refreshPreview() {
    // 미리보기도 편집 중인 페이지를 따라간다(홈 고정이 아니다).
    if (previewEl) previewEl.src = '/admin/page-builder/preview?page=' + PAGE_ID + '&t=' + Date.now();
  }
  function toLocalInput(v) {
    if (!v) return '';
    var d = new Date(v);
    if (isNaN(d.getTime())) return '';
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  async function api(url, body) {
    // 편집 대상 페이지를 모든 요청에 실어 보낸다. 빌더가 홈만 다루던 시절에는
    // 서버가 getHomePage() 로 알아서 찾았지만, 이제 랜딩도 편집하므로 명시해야 한다.
    var payload = Object.assign({ page_id: PAGE_ID }, body || {});
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || !data.success) throw new Error(data.message || '요청 실패');
    return data;
  }
  function findSection(id) {
    for (var i = 0; i < sections.length; i++) if (sections[i].id === id) return sections[i];
    return null;
  }

  // ---------- 섹션 목록 렌더 ----------
  function renderList() {
    listEl.innerHTML = '';
    if (!sections.length) {
      listEl.innerHTML = '<p class="text-sm text-gray-400 py-6 text-center border border-dashed border-gray-200 rounded-lg">섹션이 없습니다. 위에서 추가하세요.</p>';
      return;
    }
    sections.forEach(function (s, idx) {
      var row = document.createElement('div');
      row.className = 'pb-row flex items-center gap-2 bg-white border rounded-lg px-3 py-2.5 cursor-pointer ' +
        (s.id === selectedId ? 'border-blue-400 ring-1 ring-blue-300' : 'border-gray-200 hover:border-gray-300') +
        (Number(s.is_active) === 0 ? ' opacity-50' : '');
      row.dataset.id = s.id;

      var badges = '';
      if (s.dataSourceName) badges += '<span class="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 text-indigo-600">' + esc(s.dataSourceName) + '</span>';
      if (Number(s.is_active) === 0) badges += '<span class="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-gray-200 text-gray-600">숨김</span>';
      if (s.isUnknownType) badges += '<span class="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-600">미등록</span>';

      row.innerHTML =
        '<span class="text-xs font-bold text-gray-400 w-5 text-center">' + (idx + 1) + '</span>' +
        '<div class="flex-1 min-w-0">' +
          '<p class="text-sm font-medium text-gray-900 truncate">' + esc(s.title || s.label) + badges + '</p>' +
          '<p class="text-[11px] text-gray-400">' + esc(s.section_type) + '</p>' +
        '</div>' +
        '<div class="flex items-center gap-0.5 flex-shrink-0">' +
          btn('up', 'bi-chevron-up', '위로') +
          btn('down', 'bi-chevron-down', '아래로') +
          btn('dup', 'bi-files', '복제') +
          btn('del', 'bi-trash', '삭제', 'text-red-400 hover:text-red-600') +
        '</div>';
      listEl.appendChild(row);
    });
  }
  function btn(action, icon, title, cls) {
    return '<button type="button" data-action="' + action + '" title="' + title + '" ' +
      'class="pb-act p-1.5 rounded hover:bg-gray-100 ' + (cls || 'text-gray-400 hover:text-gray-700') + '">' +
      '<i class="bi ' + icon + '"></i></button>';
  }

  // ---------- 설정폼 렌더 ----------
  function renderSettings(s) {
    if (!s) {
      settingsEl.innerHTML = '<p class="text-sm text-gray-400 text-center py-8"><i class="bi bi-arrow-left-circle mr-1"></i>왼쪽에서 섹션을 선택하세요.</p>';
      return;
    }
    var html = '<div class="space-y-4">';
    html += '<div><h3 class="text-sm font-bold text-gray-900">' + esc(s.label) + '</h3>' +
            '<p class="text-[11px] text-gray-400">' + esc(s.section_type) + ' · #' + s.id + '</p></div>';

    // 제목
    html += field('제목', '<input type="text" data-f="title" value="' + esc(s.title || '') + '" class="pb-input">');

    // 데이터소스(product_group)
    if (s.dataSource === 'product_group') {
      var opts = '<option value="">— 상품 그룹 선택 —</option>';
      productGroups.forEach(function (g) {
        opts += '<option value="' + g.id + '"' + (Number(s.data_source_id) === Number(g.id) ? ' selected' : '') + '>' +
                esc(g.name) + ' (' + esc(g.group_type) + ')</option>';
      });
      html += field('상품 그룹', '<select data-f="data_source_id" class="pb-input">' + opts + '</select>');
    }

    // config 필드
    (s.fields || []).forEach(function (f) {
      var val = (s.config && s.config[f.key] != null) ? s.config[f.key] : (f.default != null ? f.default : '');
      var input = renderConfigInput(f, val);
      html += field(f.label, input);
    });

    // 노출 대상
    html += '<div class="flex items-center gap-4 pt-1">' +
      checkbox('visible_on_pc', 'PC', Number(s.visible_on_pc) !== 0) +
      checkbox('visible_on_mobile', '모바일', Number(s.visible_on_mobile) !== 0) +
      checkbox('is_active', '활성', Number(s.is_active) !== 0) +
    '</div>';

    // 노출 기간
    html += field('노출 시작', '<input type="datetime-local" data-f="visible_start_at" value="' + toLocalInput(s.visible_start_at) + '" class="pb-input">');
    html += field('노출 종료', '<input type="datetime-local" data-f="visible_end_at" value="' + toLocalInput(s.visible_end_at) + '" class="pb-input">');

    html += '<button id="pb-save-btn" class="w-full inline-flex justify-center items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"><i class="bi bi-check-lg mr-1"></i>설정 저장</button>';
    html += '<p class="text-[11px] text-gray-400 text-center">저장은 작업본에만 반영됩니다. 실서비스 반영은 상단 <b>발행</b>.</p>';
    html += '</div>';
    settingsEl.innerHTML = html;
    document.getElementById('pb-save-btn').addEventListener('click', function () { saveSettings(s.id); });
  }
  function renderConfigInput(f, val) {
    if (f.type === 'number') {
      return '<input type="number" data-c="' + f.key + '" value="' + esc(val) + '" ' +
        (f.min != null ? 'min="' + f.min + '" ' : '') + (f.max != null ? 'max="' + f.max + '" ' : '') + 'class="pb-input">';
    }
    if (f.type === 'select') {
      var options = Array.isArray(f.options) ? f.options : [];
      return '<select data-c="' + f.key + '" class="pb-input">' + options.map(function (opt) {
        var selected = String(val) === String(opt) ? ' selected' : '';
        return '<option value="' + esc(opt) + '"' + selected + '>' + esc(opt) + '</option>';
      }).join('') + '</select>';
    }
    if (f.type === 'textarea') {
      return '<textarea data-c="' + f.key + '" rows="8" class="pb-input">' + esc(val) + '</textarea>';
    }
    if (f.type === 'json') {
      var jsonText = '';
      if (val != null && val !== '') {
        jsonText = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
      }
      return '<textarea data-c="' + f.key + '" data-json="1" rows="10" class="pb-input font-mono text-sm">' + esc(jsonText) + '</textarea>';
    }
    return '<input type="text" data-c="' + f.key + '" value="' + esc(val) + '" class="pb-input">';
  }
  function field(label, input) {
    return '<div><label class="block text-xs font-medium text-gray-600 mb-1">' + label + '</label>' + input + '</div>';
  }
  function checkbox(name, label, checked) {
    return '<label class="inline-flex items-center gap-1.5 text-sm text-gray-700">' +
      '<input type="checkbox" data-chk="' + name + '"' + (checked ? ' checked' : '') + ' class="rounded border-gray-300"> ' + label + '</label>';
  }

  // ---------- 액션 ----------
  function selectSection(id) {
    selectedId = id;
    renderList();
    renderSettings(findSection(id));
  }

  async function saveSettings(id) {
    try {
      var body = { config: {} };
      settingsEl.querySelectorAll('[data-f]').forEach(function (el) { body[el.dataset.f] = el.value; });
      settingsEl.querySelectorAll('[data-c]').forEach(function (el) {
        var v = el.value;
        if (el.dataset.json === '1') {
          if (!v.trim()) {
            body.config[el.dataset.c] = null;
            return;
          }
          try {
            body.config[el.dataset.c] = JSON.parse(v);
          } catch (e) {
            throw new Error('JSON 형식이 올바르지 않습니다: ' + el.dataset.c);
          }
          return;
        }
        body.config[el.dataset.c] = (el.type === 'number' && v !== '') ? Number(v) : v;
      });
      settingsEl.querySelectorAll('[data-chk]').forEach(function (el) { body[el.dataset.chk] = el.checked; });
      await api('/admin/page-builder/sections/' + id + '/update', body);
      // 로컬 상태 갱신
      var s = findSection(id);
      if (s) {
        s.title = body.title; s.config = body.config;
        if (body.data_source_id !== undefined) {
          s.data_source_id = body.data_source_id || null;
          var g = productGroups.filter(function (x) { return Number(x.id) === Number(body.data_source_id); })[0];
          s.dataSourceName = g ? g.name : null;
        }
        s.visible_on_pc = body.visible_on_pc ? 1 : 0;
        s.visible_on_mobile = body.visible_on_mobile ? 1 : 0;
        s.is_active = body.is_active ? 1 : 0;
        s.visible_start_at = body.visible_start_at || null;
        s.visible_end_at = body.visible_end_at || null;
      }
      renderList();
      markDirty();
      refreshPreview();
      toast('저장되었습니다');
    } catch (e) { alert(e.message); }
  }

  async function reorder(id, dir) {
    var idx = sections.findIndex(function (s) { return s.id === id; });
    var target = idx + dir;
    if (target < 0 || target >= sections.length) return;
    var tmp = sections[idx]; sections[idx] = sections[target]; sections[target] = tmp;
    renderList();
    try {
      await api('/admin/page-builder/sections/reorder', { order: sections.map(function (s) { return s.id; }) });
      markDirty();
      refreshPreview();
    } catch (e) { alert(e.message); location.reload(); }
  }

  // ---------- 이벤트 바인딩 ----------
  listEl.addEventListener('click', function (e) {
    var actBtn = e.target.closest('.pb-act');
    var row = e.target.closest('.pb-row');
    if (!row) return;
    var id = Number(row.dataset.id);
    if (actBtn) {
      e.stopPropagation();
      var action = actBtn.dataset.action;
      if (action === 'up') reorder(id, -1);
      else if (action === 'down') reorder(id, 1);
      else if (action === 'dup') api('/admin/page-builder/sections/' + id + '/duplicate', {}).then(function () { location.reload(); }).catch(function (er) { alert(er.message); });
      else if (action === 'del') { if (confirm('이 섹션을 삭제하시겠습니까?')) api('/admin/page-builder/sections/' + id + '/delete', {}).then(function () { location.reload(); }).catch(function (er) { alert(er.message); }); }
      return;
    }
    selectSection(id);
  });

  function addSection(type) {
    return api('/admin/page-builder/sections', { section_type: type })
      .then(function () { location.reload(); })
      .catch(function (e) { alert(e.message); });
  }

  document.getElementById('pb-add-btn').addEventListener('click', function () {
    addSection(document.getElementById('pb-add-type').value);
  });

  // ---------- 섹션 카탈로그 ----------
  var catalogEl = document.getElementById('pb-catalog');
  var catalogBtn = document.getElementById('pb-catalog-btn');
  var catalogLoaded = false;

  function openCatalog() {
    if (!catalogEl) return;
    catalogEl.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    // iframe 18개를 문서 로드 시점에 다 띄우면 에디터 진입이 느려진다 — 열 때 한 번만 로드.
    if (!catalogLoaded) {
      catalogLoaded = true;
      catalogEl.querySelectorAll('.pb-catalog-frame').forEach(function (f) {
        f.src = f.getAttribute('data-src');
      });
    }
  }
  function closeCatalog() {
    if (!catalogEl) return;
    catalogEl.classList.add('hidden');
    document.body.style.overflow = '';
  }

  if (catalogBtn) catalogBtn.addEventListener('click', openCatalog);
  if (catalogEl) {
    document.getElementById('pb-catalog-close').addEventListener('click', closeCatalog);
    catalogEl.addEventListener('click', function (e) {
      if (e.target === catalogEl) closeCatalog(); // 배경 클릭
      var add = e.target.closest('[data-catalog-add]');
      if (add) addSection(add.getAttribute('data-catalog-add'));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !catalogEl.classList.contains('hidden')) closeCatalog();
    });
  }

  document.getElementById('pb-publish-btn').addEventListener('click', function () {
    if (!confirm('현재 작업본을 발행하시겠습니까? 스토어프론트에 즉시 반영됩니다.')) return;
    api('/admin/page-builder/publish', {})
      .then(function (d) { alert('발행 완료 (리비전 #' + d.revisionNo + ')'); location.reload(); })
      .catch(function (e) { alert(e.message); });
  });

  document.getElementById('pb-rollback-btn').addEventListener('click', function () {
    var rid = document.getElementById('pb-revision-select').value;
    if (!rid) { alert('롤백할 리비전을 선택하세요.'); return; }
    if (!confirm('선택한 리비전으로 작업본을 되돌립니다. 계속하시겠습니까?')) return;
    api('/admin/page-builder/revisions/' + rid + '/rollback', {})
      .then(function () { alert('롤백되었습니다. (발행하려면 상단 발행 버튼)'); location.reload(); })
      .catch(function (e) { alert(e.message); });
  });

  document.getElementById('pb-preview-refresh').addEventListener('click', refreshPreview);

  // 페이지 전환 — 편집 상태는 페이지마다 다르므로 통째로 다시 로드한다.
  var pageSel = document.getElementById('pb-page-select');
  if (pageSel) {
    pageSel.addEventListener('change', function () {
      location.href = '/admin/page-builder?page=' + pageSel.value;
    });
  }

  document.querySelectorAll('.pb-device-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.pb-device-btn').forEach(function (x) { x.classList.remove('bg-blue-50', 'text-blue-700'); x.classList.add('text-gray-600'); });
      b.classList.add('bg-blue-50', 'text-blue-700'); b.classList.remove('text-gray-600');
      previewEl.style.width = b.dataset.device === 'mobile' ? '390px' : '100%';
    });
  });

  // 간단 토스트
  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('pb-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pb-toast';
      el.className = 'fixed bottom-6 right-6 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50 transition-opacity';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.opacity = '0'; }, 1800);
  }

  renderList();
})();
