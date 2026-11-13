// BookEditor: chapter editor state. Collapsible editor per chapter, beats
// appended as accepted. Pure state, no DOM, shared by the UI component.

export class BookEditor {
  constructor({ bookId }) {
    this.bookId = bookId;
    this.chapters = new Map(); // chapterId -> { text, beats: [{ index, text, status, checks }] }
    this.collapsed = new Set();
    this.openChapterId = null;
  }

  ensureChapter(chapterId) {
    if (!this.chapters.has(chapterId)) {
      this.chapters.set(chapterId, { text: '', beats: [] });
    }
    return this.chapters.get(chapterId);
  }

  appendBeat(chapterId, text, { checks = null, beatIndex = null } = {}) {
    const ch = this.ensureChapter(chapterId);
    const index = beatIndex ?? ch.beats.length;
    ch.beats.push({ index, text, status: 'accepted', checks });
    ch.text = ch.text ? `${ch.text} ${text}` : text;
    return index;
  }

  setText(chapterId, text) {
    const ch = this.ensureChapter(chapterId);
    ch.text = text;
  }

  toggleCollapsed(chapterId) {
    if (this.collapsed.has(chapterId)) this.collapsed.delete(chapterId);
    else this.collapsed.add(chapterId);
    this.openChapterId = chapterId;
  }

  getChapter(chapterId) { return this.chapters.get(chapterId) ?? null; }
  wordCount(chapterId) {
    const ch = this.getChapter(chapterId);
    return ch ? ch.text.split(/\s+/).filter(Boolean).length : 0;
  }
}
