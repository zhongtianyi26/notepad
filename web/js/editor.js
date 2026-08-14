/* editor.js — 文档正文富文本编辑器（Tiptap + 结构化 JSON）
   ============================================================
   正文 content 存 ProseMirror doc JSON 字符串；旧纯文本数据兼容。
   提供「任务链接」mark：文字可关联看板任务，点击跳转。
   支持选中正文文字 → 弹出「创建任务」按钮 → 建任务后回写链接。
   ============================================================ */

import { Editor, Mark, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

/* —— 自定义「任务链接」mark：关联看板任务 —— */
export const TaskLink = Mark.create({
  name: 'taskLink',
  inclusive: false,
  addAttributes() {
    return {
      cardId: {
        default: null,
        parseHTML: el => el.getAttribute('data-card-id'),
        renderHTML: attrs => ({ 'data-card-id': attrs.cardId }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'a[data-card-id]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes, { href: '#' }), 0];
  },
  addCommands() {
    return {
      setTaskLink: (cardId) => ({ commands }) => commands.setMark(this.name, { cardId }),
      unsetTaskLink: () => ({ commands }) => commands.unsetMark(this.name),
    };
  },
});

let editor = null;
let selectionBtn = null;
let onTaskLinkClick = null;
let onSelectionCreate = null;
let pendingSelection = null;   // { from, to, text } 选中的文字范围

/** 设置任务链接点击回调（由 main.js 注入 openCardModal 跳转） */
export function setTaskLinkClickHandler(fn) { onTaskLinkClick = fn; }

/** 设置「选中文字创建任务」回调（由 main.js 注入，传选中文字） */
export function setSelectionCreateHandler(fn) { onSelectionCreate = fn; }

/** 获取（或懒创建）正文编辑器单例 */
export function ensureEditor() {
  if (editor) return editor;
  const el = document.getElementById('docContent');
  selectionBtn = document.getElementById('selectionCreateBtn');
  editor = new Editor({
    element: el,
    extensions: [StarterKit, TaskLink],
    content: '',
  });

  // 点击任务链接 → 回调跳转看板
  el.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-card-id]');
    if (a && onTaskLinkClick) {
      e.preventDefault();
      onTaskLinkClick(a.getAttribute('data-card-id'));
    }
  });

  // 选区变化 → 决定是否显示「创建任务」浮动按钮
  editor.on('selectionUpdate', ({ editor: ed }) => {
    const { from, to, empty } = ed.state.selection;
    if (empty || from === to) { hideSelectionBtn(); pendingSelection = null; return; }
    const text = ed.state.doc.textBetween(from, to, '\n').trim();
    if (!text) { hideSelectionBtn(); pendingSelection = null; return; }
    pendingSelection = { from, to, text };
    showSelectionBtn(to);
  });

  // 编辑器失焦（点击外部）→ 只隐藏浮动按钮；pendingSelection 保留（可能在创建任务流程中）
  editor.on('blur', () => { hideSelectionBtn(); });

  if (selectionBtn) {
    selectionBtn.addEventListener('mousedown', (e) => e.preventDefault());  // 防止抢焦点丢选区
    selectionBtn.addEventListener('click', () => {
      if (onSelectionCreate && pendingSelection) onSelectionCreate(pendingSelection.text);
      hideSelectionBtn();
    });
  }
  return editor;
}

export function getEditor() { return editor; }

/** 把 content 字符串（doc JSON 或旧纯文本）加载进编辑器 */
export function loadContent(contentString) {
  const ed = ensureEditor();
  ed.commands.setContent(tryParseDoc(contentString));
}

/** 导出编辑器内容为 doc JSON 字符串 */
export function getContentJSON() {
  if (!editor) return '';
  return JSON.stringify(editor.getJSON());
}

/** 编辑器当前是否有非空文本 */
export function isDirty() {
  if (!editor) return false;
  return editor.state.doc.textContent.trim().length > 0;
}

/** 给当前待处理选区打上任务链接 mark（创建任务成功后调用） */
export function applyTaskLinkToSelection(cardId) {
  if (!editor || !pendingSelection) return;
  const { from, to } = pendingSelection;
  editor.chain().setTextSelection({ from, to }).setTaskLink(cardId).run();
  pendingSelection = null;
  hideSelectionBtn();
}

export function destroyEditor() {
  if (editor) { editor.destroy(); editor = null; }
}

/* —— 浮动按钮定位 —— */
function showSelectionBtn(pos) {
  if (!selectionBtn || !editor) return;
  const coords = editor.view.coordsAtPos(pos);
  selectionBtn.style.left = coords.left + 'px';
  selectionBtn.style.top = (coords.top - 44) + 'px';
  selectionBtn.classList.remove('hidden');
}
function hideSelectionBtn() {
  if (selectionBtn) selectionBtn.classList.add('hidden');
}

/* —— 兼容旧纯文本 content —— */
function tryParseDoc(str) {
  if (!str) return { type: 'doc', content: [{ type: 'paragraph' }] };
  try {
    const obj = JSON.parse(str);
    if (obj && obj.type === 'doc' && Array.isArray(obj.content)) return obj;
    return plainTextDoc(str);
  } catch (_) {
    return plainTextDoc(str);
  }
}

function plainTextDoc(text) {
  const paragraphs = String(text).split('\n').map(line => ({
    type: 'paragraph',
    content: line ? [{ type: 'text', text: line }] : [],
  }));
  if (!paragraphs.length) paragraphs.push({ type: 'paragraph' });
  return { type: 'doc', content: paragraphs };
}
