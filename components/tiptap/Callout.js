import { Node, mergeAttributes } from '@tiptap/core';

// Callout box node: <div data-callout="info|tip|warning|danger">...</div>
// Styling lives in styles/globals.css under .tiptap-content [data-callout]
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      type: {
        default: 'info',
        parseHTML: (element) => element.getAttribute('data-callout') || 'info',
        renderHTML: (attributes) => ({ 'data-callout': attributes.type }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'kb-callout' }), 0];
  },

  addCommands() {
    return {
      setCallout:
        (type = 'info') =>
        ({ commands }) => {
          return commands.wrapIn(this.name, { type });
        },
      unsetCallout:
        () =>
        ({ commands }) => {
          return commands.lift(this.name);
        },
      updateCalloutType:
        (type) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, { type });
        },
    };
  },
});

export default Callout;
