const editors = ['html', 'css', 'js'].map((language, index) => {
    return CodeMirror.fromTextArea(document.getElementById(`${language}-editor`), {
        mode: ['text/html', 'text/css', 'text/javascript'][index],
        theme: 'material-darker',
        lineNumbers: true,
        indentUnit: 2,
        tabSize: 2,
        lineWrapping: true,
        screenReaderLabel: `Código ${['HTML', 'CSS', 'JavaScript'][index]}`,
        extraKeys: index < 2 ? {
            Tab: 'emmetExpandAbbreviation',
            Esc: 'emmetResetAbbreviation',
            Enter: 'emmetInsertLineBreak'
        } : { Tab: 'insertSoftTab' }
    });
});
const previewFrame = document.getElementById('preview-frame');
const consoleOutput = document.getElementById('console-output');
let currentRun = 0;
let updateTimer;
const autoRun = document.getElementById('auto-run');
const runStatus = document.getElementById('run-status');
let pendingChanges = false;
const draftKey = 'indexitba.editor.draft.v1';
const saveStatus = document.getElementById('save-status');

function saveDraft() {
    try {
        const [html, css, js] = editors.map(editor => editor.getValue());
        localStorage.setItem(draftKey, JSON.stringify({ version: 1, html, css, js }));
        saveStatus.textContent = 'Guardado en este navegador';
    } catch {
        saveStatus.textContent = 'No se pudo guardar. Copiá tu código antes de cerrar o recargar.';
    }
}

function restoreDraft() {
    try {
        const stored = localStorage.getItem(draftKey);
        if (stored === null) return false;
        const draft = JSON.parse(stored);
        if (!draft || draft.version !== 1 ||
            !['html', 'css', 'js'].every(language => typeof draft[language] === 'string')) {
            throw new Error('Invalid editor draft');
        }
        ['html', 'css', 'js'].forEach((language, index) => editors[index].setValue(draft[language]));
        saveStatus.textContent = 'Código recuperado de este navegador';
        return true;
    } catch {
        saveStatus.textContent = 'No se pudo recuperar el código guardado en este navegador.';
        return false;
    }
}

function clearConsole() {
    consoleOutput.replaceChildren();
}

// Installed in the preview before any user scripts, including scripts in HTML.
function connectConsole(run) {
    function format(value, seen = new WeakSet(), depth = 0) {
        if (typeof value === 'string') return value;
        if (typeof value === 'bigint') return `${value}n`;
        if (value === null || typeof value !== 'object') return String(value);
        if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
        if (value instanceof Element) return value.outerHTML;
        if (seen.has(value)) return '[Circular]';
        if (depth >= 5) return '[…]';
        seen.add(value);
        try {
            const entries = Object.entries(value).slice(0, 100);
            return Array.isArray(value)
                ? `[${entries.map(([, item]) => format(item, seen, depth + 1)).join(', ')}]`
                : `{${entries.map(([key, item]) => `${key}: ${format(item, seen, depth + 1)}`).join(', ')}}`;
        } finally {
            seen.delete(value);
        }
    }
    function send(level, args) {
        const text = args.map(value => {
            try { return format(value); } catch { return '[No se pudo mostrar el valor]'; }
        }).join(' ').slice(0, 20000);
        parent.postMessage({ source: 'editor-console', run, level, text }, '*');
    }
    for (const level of ['log', 'info', 'warn', 'error', 'debug', 'table']) {
        const original = console[level].bind(console);
        console[level] = (...args) => { send(level, args); original(...args); };
    }
    const originalClear = console.clear.bind(console);
    console.clear = () => { send('clear', []); originalClear(); };
    window.addEventListener('error', event => {
        send('error', [event.error || event.message || 'No se pudo cargar un recurso.']);
    });
    window.addEventListener('unhandledrejection', event => {
        send('error', ['Promesa rechazada:', event.reason]);
    });
}

window.addEventListener('message', event => {
    const data = event.data;
    if (event.source !== previewFrame.contentWindow || !data ||
        data.source !== 'editor-console' || data.run !== currentRun) return;
    if (data.level === 'clear') return clearConsole();
    if (!['log', 'info', 'warn', 'error', 'debug', 'table'].includes(data.level) ||
        typeof data.text !== 'string') return;
    const entry = document.createElement('pre');
    entry.className = `console-entry ${data.level}`;
    entry.textContent = `[${data.level}] ${data.text}`;
    consoleOutput.append(entry);
    if (consoleOutput.childElementCount > 500) consoleOutput.firstElementChild.remove();
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
});

function updatePreview() {
    clearTimeout(updateTimer);
    clearConsole();
    const run = ++currentRun;
    const [html, css, js] = editors.map(editor => editor.getValue());
    // Literal closing script tags in user code must not break the bridge.
    const scriptText = JSON.stringify(js).replace(/</g, '\\u003c');
    previewFrame.srcdoc = `<!DOCTYPE html><html><head><meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <script>(${connectConsole.toString()})(${run});<\/script>
        <style>${css}</style></head><body>${html}
        <script>{ const userScript = document.createElement('script');
        userScript.textContent = ${scriptText};
        document.body.appendChild(userScript); }<\/script></body></html>`;
    pendingChanges = false;
    runStatus.textContent = 'Ejecutado';
}

function schedulePreview() {
    clearTimeout(updateTimer);
    if (!autoRun.checked || !pendingChanges) return;
    updateTimer = setTimeout(() => {
        // Keep form values and focus intact while the user interacts with the preview.
        if (document.activeElement === previewFrame) {
            runStatus.textContent = 'Cambios pendientes · presioná Run para aplicarlos';
            return;
        }
        updatePreview();
    }, 700);
}
// Restore before subscribing, so loading a draft never overwrites it with partial values.
const restoredDraft = restoreDraft();
editors.forEach(editor => editor.on('change', () => {
    // Save synchronously: even an immediate refresh must retain the latest edit.
    saveDraft();
    pendingChanges = true;
    runStatus.textContent = 'Cambios sin ejecutar';
    schedulePreview();
}));
autoRun.addEventListener('change', schedulePreview);
document.getElementById('run').addEventListener('click', updatePreview);
document.getElementById('clear-console').addEventListener('click', clearConsole);
document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        updatePreview();
    }
});

const panels = [...document.querySelectorAll('[data-label]')];
const toggles = [...document.querySelectorAll('[data-panel]')];
const layout = document.querySelector('.container');
function refreshLayout() {
    const codeVisible = panels.slice(0, 3).some(panel => !panel.hidden);
    const outputVisible = panels.slice(3).some(panel => !panel.hidden);
    document.querySelector('.editors').hidden = !codeVisible;
    document.querySelector('.output').hidden = !outputVisible;
    layout.classList.toggle('single-column', !codeVisible || !outputVisible);
    document.querySelector('.empty-layout').hidden = codeVisible || outputVisible;
    requestAnimationFrame(() => editors.forEach(editor => editor.refresh()));
}
toggles.forEach(toggle => toggle.addEventListener('change', () => {
    document.getElementById(toggle.dataset.panel).hidden = !toggle.checked;
    refreshLayout();
}));
panels.forEach(panel => {
    const actions = document.createElement('span');
    actions.className = 'panel-actions';
    const shrink = document.createElement('button');
    shrink.type = 'button';
    shrink.textContent = 'Achicar';
    shrink.setAttribute('aria-label', `Achicar ${panel.dataset.label}`);
    shrink.setAttribute('aria-pressed', 'false');
    shrink.addEventListener('click', () => {
        const compact = panel.classList.toggle('compact');
        shrink.textContent = compact ? 'Ampliar' : 'Achicar';
        shrink.setAttribute('aria-label', `${compact ? 'Ampliar' : 'Achicar'} ${panel.dataset.label}`);
        shrink.setAttribute('aria-pressed', String(compact));
        refreshLayout();
    });
    const hide = document.createElement('button');
    hide.type = 'button';
    hide.textContent = 'Ocultar';
    hide.setAttribute('aria-label', `Ocultar ${panel.dataset.label}`);
    hide.addEventListener('click', () => {
        const toggle = toggles.find(input => input.dataset.panel === panel.id);
        toggle.checked = false;
        panel.hidden = true;
        toggle.focus();
        refreshLayout();
    });
    actions.append(shrink, hide);
    panel.querySelector('.editor-header, .toolbar').append(actions);
});
const codeWidth = document.getElementById('code-width');
codeWidth.addEventListener('input', () => {
    layout.style.setProperty('--code-width', `${codeWidth.value}fr`);
    layout.style.setProperty('--output-width', `${100 - codeWidth.value}fr`);
    refreshLayout();
});
document.getElementById('reset-layout').addEventListener('click', () => {
    toggles.forEach(toggle => { toggle.checked = true; });
    panels.forEach(panel => {
        panel.hidden = false;
        panel.classList.remove('compact');
        const shrink = panel.querySelector('.panel-actions button');
        shrink.textContent = 'Achicar';
        shrink.setAttribute('aria-label', `Achicar ${panel.dataset.label}`);
        shrink.setAttribute('aria-pressed', 'false');
    });
    codeWidth.value = 50;
    layout.style.removeProperty('--code-width');
    layout.style.removeProperty('--output-width');
    refreshLayout();
});
if (restoredDraft) {
    pendingChanges = true;
    runStatus.textContent = 'Código recuperado · presioná Run para ejecutarlo';
} else {
    updatePreview();
}
