// 공통 숫자 입력 포맷터
// data-number-format="thousands" 가 지정된 input에 대해
// - 입력 시 숫자만 허용
// - 천단위 구분기호(,) 자동 추가
// - 폼 전송 직전에 구분기호 제거 후 순수 숫자로 전송
(function () {
  function formatThousands(value) {
    if (value == null) return '';
    var digits = String(value).replace(/[^0-9]/g, '');
    if (!digits) return '';
    return Number(digits).toLocaleString('ko-KR');
  }

  function unformat(value) {
    if (value == null) return '';
    return String(value).replace(/[^0-9]/g, '');
  }

  function attachFormatter(input) {
    if (!input || input.__numberFormatBound) return;
    input.__numberFormatBound = true;

    // 기본 우측 정렬
    if (!input.classList.contains('text-right')) {
      input.classList.add('text-right');
    }

    // 초기 값 포맷팅
    if (input.value) {
      input.value = formatThousands(input.value);
    }

    input.addEventListener('input', function (e) {
      var caretAtEnd = (this.selectionStart === this.value.length);
      var raw = unformat(this.value);
      this.value = raw ? formatThousands(raw) : '';
      // 간단하게: 커서를 끝으로 이동 (관리자 폼 용도이므로 충분)
      if (caretAtEnd) {
        this.selectionStart = this.selectionEnd = this.value.length;
      }
    });

    // 포커스 시 전체 선택 (빠른 수정용)
    input.addEventListener('focus', function () {
      var self = this;
      setTimeout(function () {
        try {
          self.select();
        } catch (_) {}
      }, 0);
    });
  }

  function init() {
    var inputs = document.querySelectorAll('input[data-number-format="thousands"]');
    inputs.forEach(attachFormatter);

    // 모든 폼 전송 전에 포맷된 숫자를 원복
    document.querySelectorAll('form').forEach(function (form) {
      if (form.__numberFormatSubmitBound) return;
      form.__numberFormatSubmitBound = true;
      form.addEventListener('submit', function () {
        var formattedInputs = form.querySelectorAll('input[data-number-format="thousands"]');
        formattedInputs.forEach(function (inp) {
          inp.value = unformat(inp.value);
        });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
