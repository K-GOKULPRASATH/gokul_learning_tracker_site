// Robust Monaco setup + lock handling
(function () {
  function initMonaco() {
    if (typeof require === 'undefined') {
      console.error('Monaco loader missing');
      return;
    }

    require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });

    require(['vs/editor/editor.main'], function () {
      window.setupEditor = function () {
        const host = document.getElementById('editor');
        if (!host) return;

        // dispose previous instance when switching problems
        if (window.editor && typeof window.editor.dispose === 'function') {
          window.editor.dispose();
        }

        window.editor = monaco.editor.create(host, {
          value:
`class Solution {
  public static void main(String[] args) {
    System.out.println("Hello, Gokul!");
  }
}`,
          language: 'java',
          theme: 'vs-dark',
          automaticLayout: true,
          readOnly: !window.IS_OWNER,   // locked until you unlock via brand
          fontSize: 14,
          minimap: { enabled: false }
        });

        // If an overlay exists (locked), block mouse events into Monaco
        const lock = document.getElementById('editorLock');
        host.style.pointerEvents = lock ? 'none' : 'auto';

        const runBtn = document.getElementById('runBtn');
        const outputBox = document.getElementById('outputBox');

        if (runBtn && outputBox) {
          runBtn.onclick = function () {
            if (!window.IS_OWNER) {
              outputBox.textContent = '🔒 Editor locked. Double-click the "Gokul" logo or Ctrl+Click it to unlock (until reload).';
              return;
            }
            const code = editor.getValue();
            // Mock: parse first System.out.println(...) content as output
            const m = code.match(/System\.out\.println\((.*)\);/);
            if (m && m[1]) {
              const msg = m[1].replace(/["']/g, '').trim();
              outputBox.textContent = '✅ Output: ' + msg;
            } else {
              outputBox.textContent = '⚠️ Add System.out.println("text"); to see output.';
            }
          };
        }
      };

      // expose unlock re-apply (called from html script)
      window.unlockEditorNow = function () {
        window.IS_OWNER = true;
        if (typeof window.__applyOwnerState === 'function') window.__applyOwnerState();
      };

      // initial run if #editor already exists (e.g., first render)
      if (document.getElementById('editor')) window.setupEditor();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMonaco);
  } else {
    initMonaco();
  }
})();
