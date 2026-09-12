(() => {
  const COOKIE_INDEX = "np_index";
  const COOKIE_THEME = "np_theme";
  const COOKIE_COUNT = "np_count";
  const COOKIE_LAST = "np_last";
  const LS_PREFIX = "np:doc:";
  const COOKIE_DOC_PREFIX = "np_d_";
  const COOKIE_BUDGET = 3500;

  const editor = document.getElementById("editor");
  const titleInput = document.getElementById("doc-title");
  const saveState = document.getElementById("save-state");
  const noteUrlEl = document.getElementById("note-url");
  const wordCountEl = document.getElementById("word-count");
  const modal = document.getElementById("modal");
  const modalTitle = document.getElementById("modal-title");
  const modalBody = document.getElementById("modal-body");
  const toastEl = document.getElementById("toast");
  const fileOpen = document.getElementById("file-open");
  const fileImage = document.getElementById("file-image");

  let noteId = null;
  let saveTimer = null;
  let selectedImage = null;

  function cookiePath() {
    let path = location.pathname.replace(/index\.html$/, "");
    if (!path.endsWith("/")) path += "/";
    return path || "/";
  }

  const Cookie = {
    get(name) {
      const parts = `; ${document.cookie}`.split(`; ${name}=`);
      if (parts.length < 2) return "";
      return decodeURIComponent(parts.pop().split(";").shift() || "");
    },
    set(name, value, days = 365) {
      const maxAge = days * 86400;
      document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=${cookiePath()}; SameSite=Lax`;
    },
    remove(name) {
      document.cookie = `${name}=; max-age=0; path=${cookiePath()}; SameSite=Lax`;
    },
  };

  function toast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => {
      toastEl.hidden = true;
    }, 2200);
  }

  function newId() {
    const bytes = crypto.getRandomValues(new Uint8Array(9));
    return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 12);
  }

  function notePath(id) {
    return `#/n/${id}`;
  }

  function parseIdFromHash() {
    const match = location.hash.match(/^#\/n\/([a-z0-9]{8,32})$/i);
    return match ? match[1] : null;
  }

  function publicUrl(id) {
    return `${location.origin}${location.pathname}${notePath(id)}`;
  }

  function readIndex() {
    try {
      const raw = Cookie.get(COOKIE_INDEX);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeIndex(list) {
    Cookie.set(COOKIE_INDEX, JSON.stringify(list.slice(0, 80)));
  }

  function upsertIndex(meta) {
    const list = readIndex().filter((item) => item.id !== meta.id);
    list.unshift(meta);
    writeIndex(list);
    Cookie.set(COOKIE_LAST, meta.id);
  }

  function loadDoc(id) {
    const fromLs = localStorage.getItem(LS_PREFIX + id);
    if (fromLs) {
      try {
        return JSON.parse(fromLs);
      } catch {
        return { title: "", html: fromLs };
      }
    }
    const fromCookie = Cookie.get(COOKIE_DOC_PREFIX + id);
    if (fromCookie) {
      try {
        return JSON.parse(fromCookie);
      } catch {
        return { title: "", html: fromCookie };
      }
    }
    return null;
  }

  function persistDoc(id, payload) {
    const json = JSON.stringify(payload);
    localStorage.setItem(LS_PREFIX + id, json);
    if (json.length < COOKIE_BUDGET) {
      Cookie.set(COOKIE_DOC_PREFIX + id, json);
    } else {
      Cookie.remove(COOKIE_DOC_PREFIX + id);
      Cookie.set(COOKIE_DOC_PREFIX + id, JSON.stringify({
        title: payload.title,
        html: "",
        overflow: "localStorage",
        savedAt: payload.savedAt,
      }));
    }
  }

  function currentPayload() {
    return {
      title: titleInput.value.trim(),
      html: editor.innerHTML,
      savedAt: Date.now(),
    };
  }

  function applyPayload(payload) {
    titleInput.value = payload?.title || "";
    editor.innerHTML = payload?.html || "";
    selectedImage = null;
    updateCounts();
  }

  function scheduleSave() {
    saveState.textContent = "Saving…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 350);
  }

  function saveNow() {
    if (!noteId) return;
    const payload = currentPayload();
    persistDoc(noteId, payload);
    upsertIndex({
      id: noteId,
      title: payload.title || firstLineTitle() || "Untitled note",
      savedAt: payload.savedAt,
    });
    saveState.textContent = "Saved";
    noteUrlEl.textContent = publicUrl(noteId);
  }

  function firstLineTitle() {
    return (editor.innerText || "").trim().split("\n")[0].slice(0, 60);
  }

  function updateCounts() {
    const text = (editor.innerText || "").replace(/\s+/g, " ").trim();
    const words = text ? text.split(" ").length : 0;
    const chars = (editor.innerText || "").length;
    wordCountEl.textContent = `${words} word${words === 1 ? "" : "s"} · ${chars} character${chars === 1 ? "" : "s"}`;
  }

  function openNote(id, createIfMissing = true) {
    noteId = id;
    history.replaceState(null, "", notePath(id));
    const existing = loadDoc(id);
    if (existing) applyPayload(existing);
    else if (createIfMissing) applyPayload({ title: "", html: "" });
    Cookie.set(COOKIE_LAST, id);
    noteUrlEl.textContent = publicUrl(id);
    saveNow();
    editor.focus();
  }

  function createNote() {
    openNote(newId());
    toast("New note");
  }

  function exec(command, value = null) {
    editor.focus();
    document.execCommand(command, false, value);
    scheduleSave();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function fileBase() {
    const name = (titleInput.value || firstLineTitle() || "note").replace(/[^\w\- ]+/g, "").trim() || "note";
    return name.slice(0, 60);
  }

  function plainText() {
    return editor.innerText.replace(/\n{3,}/g, "\n\n");
  }

  function exportTxt() {
    downloadBlob(new Blob([plainText()], { type: "text/plain;charset=utf-8" }), `${fileBase()}.txt`);
  }

  async function exportPdf() {
    if (!window.html2canvas || !window.jspdf) {
      window.print();
      return;
    }
    toast("Preparing PDF…");
    const canvas = await window.html2canvas(editor, { scale: 2, backgroundColor: getComputedStyle(editor).backgroundColor });
    const img = canvas.toDataURL("image/jpeg", 0.92);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 36;
    const imgW = pageW - margin * 2;
    const imgH = canvas.height * (imgW / canvas.width);
    let heightLeft = imgH;
    let position = margin;
    pdf.addImage(img, "JPEG", margin, position, imgW, imgH);
    heightLeft -= pageH - margin * 2;
    while (heightLeft > 0) {
      position = margin - (imgH - heightLeft);
      pdf.addPage();
      pdf.addImage(img, "JPEG", margin, position, imgW, imgH);
      heightLeft -= pageH - margin * 2;
    }
    pdf.save(`${fileBase()}.pdf`);
  }

  function exportDocx() {
    const html = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${escapeHtml(titleInput.value || "Note")}</title></head><body>${editor.innerHTML}</body></html>`;
    downloadBlob(new Blob(["\ufeff", html], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), `${fileBase()}.docx`);
  }

  async function exportPng() {
    if (!window.html2canvas) {
      toast("Image export is unavailable");
      return;
    }
    const canvas = await window.html2canvas(document.querySelector(".paper"), { scale: 2 });
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${fileBase()}.png`);
    }, "image/png");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function closeMenus() {
    document.querySelectorAll(".menu.open").forEach((el) => el.classList.remove("open"));
  }

  function closeModal() {
    modal.hidden = true;
    modalBody.innerHTML = "";
  }

  function openModal(title, html) {
    closeMenus();
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modal.hidden = false;
    const first = modalBody.querySelector("input, button");
    if (first) first.focus();
  }

  function openNotesList() {
    const items = readIndex();
    if (!items.length) {
      openModal("Open", "<p>No saved notes in this browser yet.</p>");
      return;
    }
    const html = `<div class="note-list">${items.map((item) => {
      const when = item.savedAt ? new Date(item.savedAt).toLocaleString() : "";
      return `<button type="button" data-open-id="${item.id}"><strong>${escapeHtml(item.title || "Untitled note")}</strong><small>${escapeHtml(item.id)} · ${escapeHtml(when)}</small></button>`;
    }).join("")}</div>`;
    openModal("Open", html);
  }

  function insertLink() {
    const existing = document.getSelection()?.toString() || "";
    openModal("Insert link", `
      <div class="field"><label for="link-text">Text</label><input id="link-text" value="${escapeHtml(existing)}" /></div>
      <div class="field"><label for="link-url">URL</label><input id="link-url" placeholder="https://" /></div>
      <div class="row"><button type="button" class="primary" id="link-ok">Insert</button></div>
    `);
  }

  function insertTable() {
    exec("insertHTML", `<table><tbody><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr></tbody></table><p></p>`);
  }

  function specialChars() {
    const chars = ["©", "®", "™", "—", "–", "…", "“", "”", "‘", "’", "€", "£", "¥", "°", "±", "×", "÷", "•", "¶", "§", "¿", "¡", "α", "β", "π", "Ω", "∞", "≈", "≠", "≤", "≥"];
    openModal("Special characters", `<div class="chars">${chars.map((c) => `<button type="button" data-char="${c}">${c}</button>`).join("")}</div>`);
  }

  function findReplace() {
    openModal("Find & replace", `
      <div class="field"><label for="find-q">Find</label><input id="find-q" /></div>
      <div class="field"><label for="find-r">Replace with</label><input id="find-r" /></div>
      <div class="row">
        <button type="button" class="secondary" id="find-next">Find next</button>
        <button type="button" class="secondary" id="find-one">Replace</button>
        <button type="button" class="primary" id="find-all">Replace all</button>
      </div>
      <p id="find-status" class="muted"></p>
    `);
  }

  function highlightNext(query) {
    if (!query) return false;
    const sel = window.getSelection();
    sel.collapse(editor, editor.childNodes.length);
    return document.execCommand("find", false, query) || window.find(query, false, false, true, false, false, false);
  }

  function replaceAll(find, replace) {
    if (!find) return 0;
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let count = 0;
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      if (node.nodeValue.includes(find)) {
        const parts = node.nodeValue.split(find);
        count += parts.length - 1;
        node.nodeValue = parts.join(replace);
      }
    });
    return count;
  }

  function shortcutsModal() {
    const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
    openModal("Keyboard shortcuts", `
      <table class="help-table">
        <tr><td>Save</td><td><span class="kbd">${mod}</span> + <span class="kbd">S</span></td></tr>
        <tr><td>Undo</td><td><span class="kbd">${mod}</span> + <span class="kbd">Z</span></td></tr>
        <tr><td>Redo</td><td><span class="kbd">${mod}</span> + <span class="kbd">Shift</span> + <span class="kbd">Z</span></td></tr>
        <tr><td>Find</td><td><span class="kbd">${mod}</span> + <span class="kbd">F</span></td></tr>
        <tr><td>Print</td><td><span class="kbd">${mod}</span> + <span class="kbd">P</span></td></tr>
        <tr><td>Bold / Italic / Underline</td><td><span class="kbd">${mod}</span> + <span class="kbd">B</span> / <span class="kbd">I</span> / <span class="kbd">U</span></td></tr>
      </table>
    `);
  }

  function aboutModal() {
    openModal("About Online Notepad", `
      <p>A distraction-free browser notepad. Each page has a unique URL such as <code>#/n/${noteId || "id"}</code>.</p>
      <p>Note index and compact notes are stored in a <strong>cookie</strong>. Larger notes and images are stored in <strong>localStorage</strong> because cookies cannot hold pictures or long documents.</p>
      <p>Data stays in this browser. Opening the same unique URL on another device starts an empty note unless that browser already has the cookie/storage for it.</p>
    `);
  }

  function editorImages() {
    return [...editor.querySelectorAll("img")];
  }

  function downloadImages() {
    const images = editorImages();
    if (!images.length) {
      toast("No images in this note");
      return;
    }
    images.forEach((img, index) => {
      const src = img.getAttribute("src") || "";
      if (src.startsWith("data:")) {
        const match = src.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
        const ext = (match?.[1] || "image/png").split("/")[1].replace("jpeg", "jpg");
        const a = document.createElement("a");
        a.href = src;
        a.download = `${fileBase()}-image-${index + 1}.${ext}`;
        a.click();
      } else {
        const a = document.createElement("a");
        a.href = src;
        a.download = `${fileBase()}-image-${index + 1}`;
        a.target = "_blank";
        a.click();
      }
    });
    toast(`Downloading ${images.length} image${images.length === 1 ? "" : "s"}`);
  }

  function saveSelectedImage() {
    const img = selectedImage || editorImages().at(-1);
    if (!img) {
      toast("Select an image first");
      return;
    }
    const src = img.getAttribute("src") || "";
    const a = document.createElement("a");
    a.href = src;
    a.download = `${fileBase()}-image.png`;
    a.click();
  }

  async function pasteFromClipboard() {
    editor.focus();
    if (navigator.clipboard?.read) {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith("image/"));
          if (imageType) {
            const blob = await item.getType(imageType);
            insertImageBlob(blob);
            return;
          }
          if (item.types.includes("text/html")) {
            const blob = await item.getType("text/html");
            exec("insertHTML", await blob.text());
            return;
          }
          if (item.types.includes("text/plain")) {
            const blob = await item.getType("text/plain");
            exec("insertText", await blob.text());
            return;
          }
        }
      } catch {
        document.execCommand("paste");
      }
    } else {
      document.execCommand("paste");
    }
  }

  function insertImageBlob(blob) {
    const reader = new FileReader();
    reader.onload = () => {
      exec("insertHTML", `<img src="${reader.result}" alt="Inserted image" />`);
    };
    reader.readAsDataURL(blob);
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    Cookie.set(COOKIE_THEME, theme);
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(next);
  }

  function toggleCount() {
    const on = !wordCountEl.classList.contains("count-on");
    wordCountEl.classList.toggle("count-on", on);
    wordCountEl.classList.toggle("count-off", !on);
    Cookie.set(COOKIE_COUNT, on ? "on" : "off");
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }

  const actions = {
    new: createNote,
    open: openNotesList,
    "import-txt": () => fileOpen.click(),
    save: () => {
      saveNow();
      exportTxt();
      toast("Saved and downloaded");
    },
    "export-txt": exportTxt,
    "export-pdf": () => exportPdf().catch(() => window.print()),
    "export-docx": exportDocx,
    "export-png": () => exportPng().catch(() => toast("Could not export image")),
    print: () => window.print(),
    undo: () => exec("undo"),
    redo: () => exec("redo"),
    cut: () => exec("cut"),
    copy: () => exec("copy"),
    paste: () => pasteFromClipboard(),
    "select-all": () => exec("selectAll"),
    find: findReplace,
    link: insertLink,
    image: () => fileImage.click(),
    table: insertTable,
    special: specialChars,
    fullscreen: () => toggleFullscreen().catch(() => toast("Fullscreen blocked")),
    "toggle-count": toggleCount,
    theme: toggleTheme,
    shortcuts: shortcutsModal,
    about: aboutModal,
    "download-images": downloadImages,
    "close-modal": closeModal,
  };

  document.addEventListener("click", (event) => {
    const menuBtn = event.target.closest(".menu-btn");
    if (menuBtn) {
      const menu = menuBtn.parentElement;
      const wasOpen = menu.classList.contains("open");
      closeMenus();
      if (!wasOpen) menu.classList.add("open");
      return;
    }
    if (!event.target.closest(".menu")) closeMenus();

    const actionBtn = event.target.closest("[data-action]");
    if (actionBtn) {
      const name = actionBtn.dataset.action;
      if (actions[name]) actions[name]();
    }

    const cmdBtn = event.target.closest("[data-cmd]");
    if (cmdBtn) exec(cmdBtn.dataset.cmd);

    const openId = event.target.closest("[data-open-id]")?.dataset.openId;
    if (openId) {
      closeModal();
      openNote(openId);
    }

    const char = event.target.closest("[data-char]")?.dataset.char;
    if (char) {
      exec("insertText", char);
      closeModal();
    }

    if (event.target === modal) closeModal();

    if (event.target.closest("#editor img")) {
      editor.querySelectorAll("img.selected").forEach((img) => img.classList.remove("selected"));
      selectedImage = event.target.closest("img");
      selectedImage.classList.add("selected");
    } else if (!event.target.closest("[data-action='download-images']")) {
      editor.querySelectorAll("img.selected").forEach((img) => img.classList.remove("selected"));
      if (!event.target.closest("#editor")) selectedImage = null;
    }
  });

  document.getElementById("copy-link").addEventListener("click", async () => {
    const url = publicUrl(noteId);
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      toast(url);
    }
  });

  document.getElementById("text-color").addEventListener("input", (event) => exec("foreColor", event.target.value));
  document.getElementById("hilite-color").addEventListener("input", (event) => {
    exec("hiliteColor", event.target.value);
    exec("backColor", event.target.value);
  });
  document.getElementById("font-family").addEventListener("change", (event) => exec("fontName", event.target.value));
  document.getElementById("font-size").addEventListener("change", (event) => exec("fontSize", event.target.value));

  editor.addEventListener("input", () => {
    updateCounts();
    scheduleSave();
  });
  titleInput.addEventListener("input", scheduleSave);

  editor.addEventListener("dblclick", (event) => {
    if (event.target.closest("img")) saveSelectedImage();
  });

  editor.addEventListener("paste", (event) => {
    const file = [...(event.clipboardData?.items || [])].find((item) => item.type.startsWith("image/"));
    if (file) {
      event.preventDefault();
      insertImageBlob(file.getAsFile());
    }
  });

  fileOpen.addEventListener("change", async () => {
    const file = fileOpen.files?.[0];
    fileOpen.value = "";
    if (!file) return;
    const text = await file.text();
    if (file.name.endsWith(".html")) editor.innerHTML = text;
    else exec("insertText", text);
    if (!titleInput.value) titleInput.value = file.name.replace(/\.txt$|\.html$/i, "");
    scheduleSave();
  });

  fileImage.addEventListener("change", () => {
    const file = fileImage.files?.[0];
    fileImage.value = "";
    if (file) insertImageBlob(file);
  });

  modalBody.addEventListener("click", (event) => {
    if (event.target.id === "link-ok") {
      const text = document.getElementById("link-text").value || document.getElementById("link-url").value;
      const href = document.getElementById("link-url").value;
      if (href) exec("insertHTML", `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`);
      closeModal();
    }
    if (event.target.id === "find-next") {
      const q = document.getElementById("find-q").value;
      document.getElementById("find-status").textContent = highlightNext(q) ? "Found" : "No match";
    }
    if (event.target.id === "find-one") {
      const q = document.getElementById("find-q").value;
      const r = document.getElementById("find-r").value;
      if (highlightNext(q)) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        sel.getRangeAt(0).deleteContents();
        sel.getRangeAt(0).insertNode(document.createTextNode(r));
        scheduleSave();
      }
    }
    if (event.target.id === "find-all") {
      const n = replaceAll(document.getElementById("find-q").value, document.getElementById("find-r").value);
      document.getElementById("find-status").textContent = `Replaced ${n}`;
      scheduleSave();
    }
  });

  document.addEventListener("keydown", (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === "Escape") {
      closeMenus();
      closeModal();
    }
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (key === "s") {
      event.preventDefault();
      saveNow();
      toast("Saved");
    }
    if (key === "f") {
      event.preventDefault();
      findReplace();
    }
    if (key === "n" && event.shiftKey) {
      event.preventDefault();
      createNote();
    }
  });

  window.addEventListener("hashchange", () => {
    const id = parseIdFromHash();
    if (id && id !== noteId) openNote(id);
  });

  window.addEventListener("beforeunload", saveNow);

  (function boot() {
    const theme = Cookie.get(COOKIE_THEME) || "light";
    setTheme(theme);
    const count = Cookie.get(COOKIE_COUNT) !== "off";
    wordCountEl.classList.toggle("count-on", count);
    wordCountEl.classList.toggle("count-off", !count);

    const fromUrl = parseIdFromHash();
    const last = Cookie.get(COOKIE_LAST);
    if (fromUrl) openNote(fromUrl);
    else if (last) openNote(last);
    else createNote();
  })();
})();
