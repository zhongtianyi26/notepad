/* editor.js — 文档正文富文本编辑器（Tiptap + 结构化 JSON）
   ============================================================
   正文 content 存 ProseMirror doc JSON 字符串；旧纯文本数据兼容。
   提供「任务链接」mark：文字可关联看板任务，点击跳转。
   支持选中正文文字 → 弹出「创建任务」按钮 → 建任务后回写链接。
   ============================================================ */

import { Editor, Mark, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';

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
    return ['a', mergeAttributes(HTMLAttributes), 0];
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
    extensions: [
      StarterKit,
      TaskLink,
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Highlight,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Subscript,
      Superscript,
    ],
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

  // 工具栏
  initToolbar(editor);
  // 更新工具栏激活态
  editor.on('selectionUpdate', updateToolbarState);
  editor.on('transaction', updateToolbarState);

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

/* ============================================================
 *  工具栏
 * ============================================================ */
let toolbarBtns = [];

function initToolbar(editor) {
  const bar = document.getElementById('editorToolbar');
  if (!bar) return;

  const defs = [
    { icon: '↺', title: '撤销', action: () => editor.chain().focus().undo().run(), disabled: () => !editor.can().undo() },
    { icon: '↻', title: '重做', action: () => editor.chain().focus().redo().run(), disabled: () => !editor.can().redo() },
    { sep: true },
    { icon: 'H1', title: '标题 1', action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: () => editor.isActive('heading', { level: 1 }) },
    { icon: 'H2', title: '标题 2', action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: () => editor.isActive('heading', { level: 2 }) },
    { icon: 'H3', title: '标题 3', action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), active: () => editor.isActive('heading', { level: 3 }) },
    { icon: '¶', title: '正文', action: () => editor.chain().focus().setParagraph().run(), active: () => editor.isActive('paragraph') },
    { sep: true },
    { icon: 'B', title: '加粗', bold: true, action: () => editor.chain().focus().toggleBold().run(), active: () => editor.isActive('bold') },
    { icon: 'I', title: '斜体', italic: true, action: () => editor.chain().focus().toggleItalic().run(), active: () => editor.isActive('italic') },
    { icon: 'U', title: '下划线', underline: true, action: () => editor.chain().focus().toggleUnderline().run(), active: () => editor.isActive('underline') },
    { icon: 'S', title: '删除线', strike: true, action: () => editor.chain().focus().toggleStrike().run(), active: () => editor.isActive('strike') },
    { sep: true },
    { icon: '⇤', title: '左对齐', action: () => editor.chain().focus().setTextAlign('left').run(), active: () => editor.isActive({ textAlign: 'left' }) },
    { icon: '≡', title: '居中', action: () => editor.chain().focus().setTextAlign('center').run(), active: () => editor.isActive({ textAlign: 'center' }) },
    { icon: '⇥', title: '右对齐', action: () => editor.chain().focus().setTextAlign('right').run(), active: () => editor.isActive({ textAlign: 'right' }) },
    { sep: true },
    { icon: '•', title: '无序列表', action: () => editor.chain().focus().toggleBulletList().run(), active: () => editor.isActive('bulletList') },
    { icon: '1.', title: '有序列表', action: () => editor.chain().focus().toggleOrderedList().run(), active: () => editor.isActive('orderedList') },
    { icon: '☑', title: '任务清单', action: () => editor.chain().focus().toggleTaskList().run(), active: () => editor.isActive('taskList') },
    { icon: '❝', title: '引用', action: () => editor.chain().focus().toggleBlockquote().run(), active: () => editor.isActive('blockquote') },
    { icon: '{ }', title: '代码块', action: () => editor.chain().focus().toggleCodeBlock().run(), active: () => editor.isActive('codeBlock') },
    { icon: '—', title: '分割线', action: () => editor.chain().focus().setHorizontalRule().run() },
    { sep: true },
    { icon: '🔗', title: '链接', action: () => promptLink(editor), active: () => editor.isActive('link') },
    { icon: '⊞', title: '插入表格', action: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { sep: true },
    { icon: 'x²', title: '上标', action: () => editor.chain().focus().toggleSuperscript().run(), active: () => editor.isActive('superscript') },
    { icon: 'x₂', title: '下标', action: () => editor.chain().focus().toggleSubscript().run(), active: () => editor.isActive('subscript') },
    { icon: '🖍', title: '高亮', action: () => editor.chain().focus().toggleHighlight().run(), active: () => editor.isActive('highlight') },
  ];

  toolbarBtns = [];
  defs.forEach(d => {
    if (d.sep) {
      const s = document.createElement('span');
      s.className = 'tb-sep';
      bar.appendChild(s);
      return;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tb-btn';
    b.title = d.title;
    b.textContent = d.icon;
    if (d.bold) b.style.fontWeight = '700';
    if (d.italic) b.style.fontStyle = 'italic';
    if (d.underline) b.style.textDecoration = 'underline';
    if (d.strike) b.style.textDecoration = 'line-through';
    b.onclick = d.action;
    bar.appendChild(b);
    toolbarBtns.push({ b, active: d.active, disabled: d.disabled });
  });

  // 文字颜色选择器
  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.className = 'tb-color';
  colorInput.title = '文字颜色';
  colorInput.oninput = (e) => editor.chain().focus().setColor(e.target.value).run();
  bar.appendChild(colorInput);
  const uncolor = document.createElement('button');
  uncolor.type = 'button';
  uncolor.className = 'tb-btn tb-black';
  uncolor.title = '设为黑色';
  uncolor.innerHTML = '<span>A</span><span class="tb-blackbar"></span>';
  uncolor.onclick = () => editor.chain().focus().unsetColor().run();
  bar.appendChild(uncolor);

  updateToolbarState();
}

function updateToolbarState() {
  toolbarBtns.forEach(({ b, active, disabled }) => {
    b.classList.toggle('active', !!(active && active()));
    if (disabled) b.disabled = disabled();
  });
}

function promptLink(editor) {
  const prev = editor.getAttributes('link').href;
  const url = window.prompt('输入链接 URL（留空则移除链接）：', prev || 'https://');
  if (url === null) return;
  if (url === '') {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
}

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
