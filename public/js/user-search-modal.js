/**
 * 회원 검색 모달 - data-user-search-modal 속성이 있는 컨테이너 초기화
 * data-modal-id, data-input-name, data-display-el-id 필요
 * data-multi-select="true" 시 다중 선택 모드 (체크박스, 선택 완료 버튼)
 */
(function() {
  function initModal(container) {
    var mid = container.getAttribute('data-modal-id') || 'userSearchModal';
    var inputName = container.getAttribute('data-input-name') || 'user_id';
    var displayElId = container.getAttribute('data-display-el-id') || 'selectedUserDisplay';
    var multiSelect = container.getAttribute('data-multi-select') === 'true';
    var hiddenWrapId = container.getAttribute('data-hidden-wrap-id') || (mid + '-hiddenWrap');

    var modal = document.getElementById(mid);
    var searchInput = document.getElementById(mid + '-searchInput');
    var searchBtn = document.getElementById(mid + '-searchBtn');
    var resultList = document.getElementById(mid + '-resultList');
    var emptyMsg = document.getElementById(mid + '-emptyMsg');
    var selectedIds = [];

    function openModal() {
      if (modal) {
        modal.classList.remove('hidden');
        if (searchInput) searchInput.value = '';
        if (resultList) {
          resultList.classList.add('hidden');
          resultList.innerHTML = '';
        }
        if (emptyMsg) {
          emptyMsg.classList.remove('hidden');
          emptyMsg.textContent = '검색어를 입력하고 검색하세요.';
        }
        if (multiSelect) {
          var jsonEl = document.getElementById(mid + '-selectedJson');
          try {
            selectedIds = jsonEl && jsonEl.value ? JSON.parse(jsonEl.value) : [];
          } catch (_) { selectedIds = []; }
          var confirmArea = document.getElementById(mid + '-confirmArea');
          if (confirmArea) confirmArea.classList.toggle('hidden', selectedIds.length === 0);
          updateHiddenInputs();
          renderDisplay(selectedIds);
        } else {
          selectedIds = [];
        }
        setTimeout(function() { if (searchInput) searchInput.focus(); }, 100);
      }
    }

    function closeModal() {
      if (modal) modal.classList.add('hidden');
    }

    function removeUserById(id) {
      selectedIds = selectedIds.filter(function(x) { return Number(x.id) !== Number(id); });
      updateHiddenInputs();
      renderDisplay(selectedIds);
      var confirmArea = document.getElementById(mid + '-confirmArea');
      if (confirmArea) confirmArea.classList.toggle('hidden', selectedIds.length === 0);
      var jsonEl = document.getElementById(mid + '-selectedJson');
      if (jsonEl) jsonEl.value = JSON.stringify(selectedIds);
    }

    function renderDisplay(users) {
      var displayEl = document.getElementById(displayElId);
      if (!displayEl) return;
      if (!users || users.length === 0) {
        displayEl.innerHTML = '';
        displayEl.classList.add('hidden');
        return;
      }
      if (multiSelect) window.removeSelectedUser = removeUserById;
      var items = users.map(function(u) {
        var removeBtn = multiSelect
          ? ' <button type="button" class="ml-1 text-gray-400 hover:text-red-600 p-0.5 rounded hover:bg-red-50" onclick="window.removeSelectedUser && window.removeSelectedUser(' + u.id + ')" aria-label="제거"><i class="bi bi-x-lg text-xs"></i></button>'
          : '';
        return '<span class="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-sm text-gray-700">' +
          'ID ' + u.id + ' | ' + (u.name || '-') + ' | ' + (u.phone || '-') + removeBtn +
          '</span>';
      }).join(' ');
      displayEl.innerHTML = items + ' <button type="button" class="text-blue-600 hover:text-blue-800 text-sm ml-2" onclick="window.openUserSearchModal && window.openUserSearchModal()">변경</button>';
      displayEl.classList.remove('hidden');
    }

    function selectUser(user) {
      if (multiSelect) {
        var idx = selectedIds.findIndex(function(x) { return x.id === user.id; });
        if (idx >= 0) return;
        selectedIds.push(user);
        updateHiddenInputs();
        renderDisplay(selectedIds);
        var confirmArea = document.getElementById(mid + '-confirmArea');
        if (confirmArea) confirmArea.classList.remove('hidden');
        if (typeof window.onUserSelect === 'function') window.onUserSelect(user);
      } else {
        var input = document.querySelector('input[name="' + inputName + '"]');
        var displayEl = document.getElementById(displayElId);
        if (input) input.value = user.id;
        if (displayEl) {
          displayEl.innerHTML = '<span class="text-gray-900 font-medium">ID ' + user.id + ' | ' + (user.name || '-') + ' | ' + (user.phone || '-') + '</span> ' +
            '<button type="button" class="text-blue-600 hover:text-blue-800 text-sm ml-2" onclick="window.openUserSearchModal && window.openUserSearchModal()">변경</button>';
          displayEl.classList.remove('hidden');
        }
        closeModal();
        if (typeof window.onUserSelect === 'function') window.onUserSelect(user);
      }
    }

    function toggleUser(user, checked) {
      if (checked) {
        if (selectedIds.findIndex(function(x) { return x.id === user.id; }) < 0) selectedIds.push(user);
      } else {
        selectedIds = selectedIds.filter(function(x) { return x.id !== user.id; });
      }
      updateHiddenInputs();
      renderDisplay(selectedIds);
      var confirmArea = document.getElementById(mid + '-confirmArea');
      if (confirmArea) confirmArea.classList.toggle('hidden', selectedIds.length === 0);
    }

    function updateHiddenInputs() {
      var wrap = document.getElementById(hiddenWrapId);
      if (!wrap) return;
      wrap.innerHTML = '';
      selectedIds.forEach(function(u) {
        var inp = document.createElement('input');
        inp.type = 'hidden';
        inp.name = inputName + '[]';
        inp.value = u.id;
        wrap.appendChild(inp);
      });
    }

    function confirmMultiSelect() {
      updateHiddenInputs();
      renderDisplay(selectedIds);
      var jsonEl = document.getElementById(mid + '-selectedJson');
      if (jsonEl) jsonEl.value = JSON.stringify(selectedIds);
      closeModal();
      if (typeof window.onUserSelect === 'function') window.onUserSelect(selectedIds);
    }

    function doSearch() {
      var q = (searchInput && searchInput.value || '').trim();
      if (!q) {
        if (emptyMsg) {
          emptyMsg.classList.remove('hidden');
          emptyMsg.textContent = '검색어를 입력하세요.';
        }
        if (resultList) resultList.classList.add('hidden');
        return;
      }
      if (emptyMsg) {
        emptyMsg.textContent = '검색 중...';
        emptyMsg.classList.remove('hidden');
      }
      if (resultList) resultList.classList.add('hidden');

      fetch('/admin/users/search?q=' + encodeURIComponent(q))
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (emptyMsg) emptyMsg.classList.add('hidden');
          if (resultList) {
            resultList.classList.remove('hidden');
            resultList.innerHTML = '';
            if (!data.users || data.users.length === 0) {
              resultList.innerHTML = '<li class="p-4 text-center text-gray-500" style="font-size: 14px;">검색 결과가 없습니다.</li>';
            } else {
              data.users.forEach(function(u) {
                var birthStr = u.birthdate ? new Date(u.birthdate).toISOString().slice(0, 10) : '-';
                var loginType = u.google_id ? '구글' : (u.kakao_id ? '카카오' : '-');
                var profileIcon = u.google_id ? 'bi-google' : (u.kakao_id ? 'bi-chat-dots-fill' : '');
                var orderCount = u.order_count != null ? Number(u.order_count) : 0;
                var totalPay = u.total_payment != null ? Number(u.total_payment).toLocaleString() : '0';
                var points = u.points_balance != null ? Number(u.points_balance).toLocaleString() : '0';
                var pictureUrl = (u.picture && u.picture.trim()) ? u.picture : '';
                var imgHtml = pictureUrl
                  ? '<img src="' + pictureUrl.replace(/"/g, '&quot;') + '" alt="" class="w-10 h-10 rounded-full object-cover flex-shrink-0 bg-gray-100">'
                  : (profileIcon ? '<div class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"><i class="bi ' + profileIcon + ' text-lg text-gray-500"></i></div>' : '<div class="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0"><i class="bi bi-person text-gray-500"></i></div>');
                var li = document.createElement('li');
                li.className = 'px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-100 last:border-0';
                li.innerHTML = '<div class="flex items-start gap-3">' +
                  imgHtml +
                  '<div class="min-w-0 flex-1" style="font-size: 14px;">' +
                  '<div class="font-medium text-gray-900 truncate" style="font-size: 15px;">ID <strong>' + u.id + '</strong> · ' + (u.email || '-') + '</div>' +
                  '<div class="text-gray-500 mt-1" style="font-size: 14px;">' + (u.name || '-') + ' | ' + (u.phone || '-') + ' | ' + birthStr + '</div>' +
                  '<div class="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-gray-600" style="font-size: 14px;">' +
                  (profileIcon ? '<span><i class="bi ' + profileIcon + ' mr-1 text-gray-500"></i>' + loginType + '</span>' : '<span>연동: ' + loginType + '</span>') +
                  '<span>주문 ' + orderCount + '건</span>' +
                  '<span>총결제 ' + totalPay + '원</span>' +
                  '<span>포인트 ' + points + 'P</span>' +
                  '</div></div>' +
                  (multiSelect ? '<input type="checkbox" class="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-5 w-5 flex-shrink-0" data-user-id="' + u.id + '"' + (selectedIds.some(function(x) { return x.id === u.id; }) ? ' checked' : '') + '>' : '<i class="bi bi-chevron-right text-gray-400 flex-shrink-0 mt-1" style="font-size: 14px;"></i>') +
                  '</div>';
                if (multiSelect) {
                  li.querySelector('input[type="checkbox"]').addEventListener('change', function(e) {
                    e.stopPropagation();
                    toggleUser(u, this.checked);
                  });
                  li.addEventListener('click', function(e) {
                    if (!e.target.matches('input[type="checkbox"]')) {
                      var cb = li.querySelector('input[type="checkbox"]');
                      cb.checked = !cb.checked;
                      toggleUser(u, cb.checked);
                    }
                  });
                } else {
                  li.addEventListener('click', function() { selectUser(u); });
                }
                resultList.appendChild(li);
              });
            }
          }
        })
        .catch(function(err) {
          if (emptyMsg) {
            emptyMsg.classList.remove('hidden');
            emptyMsg.textContent = '검색 중 오류가 발생했습니다.';
          }
          if (resultList) resultList.classList.add('hidden');
        });
    }

    if (searchBtn) searchBtn.addEventListener('click', doSearch);
    if (searchInput) searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
    });

    var closeBtns = modal.querySelectorAll('[data-modal-close="' + mid + '"]');
    closeBtns.forEach(function(btn) { btn.addEventListener('click', closeModal); });
    var overlay = modal.querySelector('.modal-overlay');
    if (overlay) overlay.addEventListener('click', closeModal);
    if (multiSelect && container) {
      container.addEventListener('confirm-multi-select', confirmMultiSelect);
    }

    window.openUserSearchModal = openModal;
  }

  function runInit() {
    document.querySelectorAll('[data-user-search-modal]').forEach(initModal);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInit);
  } else {
    runInit();
  }
})();
