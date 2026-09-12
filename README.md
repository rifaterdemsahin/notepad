# Online Notepad

Browser-based rich-text notepad: unique URL per note, cookie-backed index, image insert/save/download, and export to `.txt`, `.pdf`, `.docx`, and PNG.

## Live site

**https://rifaterdemsahin.github.io/notepad/**

Each note has its own address, for example:

`https://rifaterdemsahin.github.io/notepad/#/n/ab12cd34ef56`

## What it does

- **File:** New, Open, import `.txt`, Save, Print, export `.txt` / `.pdf` / `.docx` / image
- **Edit:** Undo, Redo, Cut, Copy, Paste, Select All, Find & Replace
- **Insert:** Links, images, tables, special characters
- **View:** Full screen, word count, dark mode
- **Help:** Keyboard shortcuts and About
- **Images:** Insert from file or paste; double-click an image to save it; toolbar downloads every image in the note
- **Shortcuts:** `Ctrl/Cmd+S` save, `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+F` find, `Ctrl/Cmd+P` print

## Storage

- The **note index**, last opened note, theme, and compact notes live in a **cookie** (`path` scoped to this app).
- **Full document HTML and images** are stored in `localStorage` when they exceed cookie size (~4 KB). Cookies cannot hold photos or long notes.
- Data stays in **this browser**. The unique URL identifies the note; it does not upload content to a server. Opening the same URL on another device starts empty unless that browser already has the cookie/storage.

## Run locally

```bash
python3 -m http.server 8080
```

Then open [http://127.0.0.1:8080/](http://127.0.0.1:8080/) in Google Chrome.
