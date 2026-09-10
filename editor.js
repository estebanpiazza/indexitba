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
        <script>(${connectConsole.toString()})(${run});<\/script>
        <style>${css}</style></head><body>${html}
        <script>{ const userScript = document.createElement('script');
        userScript.textContent = ${scriptText};
        document.body.appendChild(userScript); }<\/script></body></html>`;
}

editors.forEach(editor => editor.on('change', () => {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(updatePreview, 350);
}));
document.getElementById('run').addEventListener('click', updatePreview);
document.getElementById('clear-console').addEventListener('click', clearConsole);
updatePreview();
