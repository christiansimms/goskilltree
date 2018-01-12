// Beautify html.
// Adapted from parse5 serializer.
import * as parse5 from 'parse5';
import {countLines} from "../utils";

const treeAdapter = parse5.treeAdapters.htmlparser2;


let NS = {
  HTML: 'http://www.w3.org/1999/xhtml',
  MATHML: 'http://www.w3.org/1998/Math/MathML',
  SVG: 'http://www.w3.org/2000/svg',
  XLINK: 'http://www.w3.org/1999/xlink',
  XML: 'http://www.w3.org/XML/1998/namespace',
  XMLNS: 'http://www.w3.org/2000/xmlns/'
};

let $ = {
  A: 'a',
  ADDRESS: 'address',
  ANNOTATION_XML: 'annotation-xml',
  APPLET: 'applet',
  AREA: 'area',
  ARTICLE: 'article',
  ASIDE: 'aside',

  B: 'b',
  BASE: 'base',
  BASEFONT: 'basefont',
  BGSOUND: 'bgsound',
  BIG: 'big',
  BLOCKQUOTE: 'blockquote',
  BODY: 'body',
  BR: 'br',
  BUTTON: 'button',

  CAPTION: 'caption',
  CENTER: 'center',
  CODE: 'code',
  COL: 'col',
  COLGROUP: 'colgroup',

  DD: 'dd',
  DESC: 'desc',
  DETAILS: 'details',
  DIALOG: 'dialog',
  DIR: 'dir',
  DIV: 'div',
  DL: 'dl',
  DT: 'dt',

  EM: 'em',
  EMBED: 'embed',

  FIELDSET: 'fieldset',
  FIGCAPTION: 'figcaption',
  FIGURE: 'figure',
  FONT: 'font',
  FOOTER: 'footer',
  FOREIGN_OBJECT: 'foreignObject',
  FORM: 'form',
  FRAME: 'frame',
  FRAMESET: 'frameset',

  H1: 'h1',
  H2: 'h2',
  H3: 'h3',
  H4: 'h4',
  H5: 'h5',
  H6: 'h6',
  HEAD: 'head',
  HEADER: 'header',
  HGROUP: 'hgroup',
  HR: 'hr',
  HTML: 'html',

  I: 'i',
  IMG: 'img',
  IMAGE: 'image',
  INPUT: 'input',
  IFRAME: 'iframe',

  KEYGEN: 'keygen',

  LABEL: 'label',
  LI: 'li',
  LINK: 'link',
  LISTING: 'listing',

  MAIN: 'main',
  MALIGNMARK: 'malignmark',
  MARQUEE: 'marquee',
  MATH: 'math',
  MENU: 'menu',
  MENUITEM: 'menuitem',
  META: 'meta',
  MGLYPH: 'mglyph',
  MI: 'mi',
  MO: 'mo',
  MN: 'mn',
  MS: 'ms',
  MTEXT: 'mtext',

  NAV: 'nav',
  NOBR: 'nobr',
  NOFRAMES: 'noframes',
  NOEMBED: 'noembed',
  NOSCRIPT: 'noscript',

  OBJECT: 'object',
  OL: 'ol',
  OPTGROUP: 'optgroup',
  OPTION: 'option',

  P: 'p',
  PARAM: 'param',
  PLAINTEXT: 'plaintext',
  PRE: 'pre',

  RB: 'rb',
  RP: 'rp',
  RT: 'rt',
  RTC: 'rtc',
  RUBY: 'ruby',

  S: 's',
  SCRIPT: 'script',
  SECTION: 'section',
  SELECT: 'select',
  SOURCE: 'source',
  SMALL: 'small',
  SPAN: 'span',
  STRIKE: 'strike',
  STRONG: 'strong',
  STYLE: 'style',
  SUB: 'sub',
  SUMMARY: 'summary',
  SUP: 'sup',

  TABLE: 'table',
  TBODY: 'tbody',
  TEMPLATE: 'template',
  TEXTAREA: 'textarea',
  TFOOT: 'tfoot',
  TD: 'td',
  TH: 'th',
  THEAD: 'thead',
  TITLE: 'title',
  TR: 'tr',
  TRACK: 'track',
  TT: 'tt',

  U: 'u',
  UL: 'ul',

  SVG: 'svg',

  VAR: 'var',

  WBR: 'wbr',

  XMP: 'xmp'
};


//Escaping regexes
let AMP_REGEX = /&/g,
  NBSP_REGEX = /\u00a0/g,
  DOUBLE_QUOTE_REGEX = /"/g,
  LT_REGEX = /</g,
  GT_REGEX = />/g;

function escapeString(str, attrMode) {
  str = str
    .replace(AMP_REGEX, '&amp;')
    .replace(NBSP_REGEX, '&nbsp;');

  if (attrMode)
    str = str.replace(DOUBLE_QUOTE_REGEX, '&quot;');

  else {
    str = str
      .replace(LT_REGEX, '&lt;')
      .replace(GT_REGEX, '&gt;');
  }

  return str;
}


//noinspection JSUnusedLocalSymbols
export function doctype_serializeContent(name, publicId, systemId) {
  // crs: skipped those weird id things.
  return '!DOCTYPE ' + name;
}

class Serializer {
  private html;

  constructor(public ast) {
  }

  // Top-level interface.
  serialize() {
    this.html = '';
    if (this.ast.type === 'root') {
      // Do its children.
      this._serializeChildNodes(this.ast, 0);
    } else {
      // Do the node itself. It might be an element, or text.
      this._serializeNode(this.ast, 0);
    }
    return this.html;
  }

  _serializeNode(currentNode, indent) {
    if (treeAdapter.isElementNode(currentNode))
      this._serializeElement(currentNode, indent);

    else if (treeAdapter.isTextNode(currentNode))
      this._serializeTextNode(currentNode);

    else if (treeAdapter.isCommentNode(currentNode))
      this._serializeCommentNode(currentNode);

    else if (treeAdapter.isDocumentTypeNode(currentNode))
      this._serializeDocumentTypeNode(currentNode);
  }

  //Internals
  _serializeChildNodes(parentNode, indent) {
    let childNodes = treeAdapter.getChildNodes(parentNode);

    if (childNodes) {
      for (let i = 0, cnLength = childNodes.length; i < cnLength; i++) {
        let currentNode = childNodes[i];
        this._serializeNode(currentNode, indent);
      }
    }
  }

  // crs: add indent.
  _addIndent(indent) {
    this.html += '  '.repeat(indent);
  }

  _serializeElement(node, indent) {
    let tn = treeAdapter.getTagName(node),
      ns = treeAdapter.getNamespaceURI(node);

    if (indent > 0 || tn === $.HTML || tn === $.HEAD || tn === $.BODY) {  // html node is at indent 0
      this.html += '\n';
    }
    let doIndent = true; //(tn !== $.HEAD) && (tn !== $.BODY);
    if (doIndent) {
      this._addIndent(indent);
    }
    let preNumLines = countLines(this.html);
    this.html += '<' + tn;
    this._serializeAttributes(node);
    this.html += '>';

    if (tn !== $.AREA && tn !== $.BASE && tn !== $.BASEFONT && tn !== $.BGSOUND && tn !== $.BR && tn !== $.BR &&
      tn !== $.COL && tn !== $.EMBED && tn !== $.FRAME && tn !== $.HR && tn !== $.IMG && tn !== $.INPUT &&
      tn !== $.KEYGEN && tn !== $.LINK && tn !== $.MENUITEM && tn !== $.META && tn !== $.PARAM && tn !== $.SOURCE &&
      tn !== $.TRACK && tn !== $.WBR) {

      let childNodesHolder = /*tn === $.TEMPLATE && ns === NS.HTML ?
        treeAdapter.getTemplateContent(node) :   crs: stop doing this template DOM stuff */
        node;

      let newIndent = indent;
      if (tn === $.HTML) {
        // Don't indent children of html: head + body.
      } else {
        newIndent = indent + 1;
      }
      this._serializeChildNodes(childNodesHolder, newIndent);

      let postNumLines = countLines(this.html);
      if (postNumLines > preNumLines) {
        this.html += '\n';
        if (doIndent) {
          this._addIndent(indent);
        }
      }

      this.html += '</' + tn + '>';
    }
  }

  _serializeAttributes(node) {
    let attrs = treeAdapter.getAttrList(node);

    for (let i = 0, attrsLength = attrs.length; i < attrsLength; i++) {
      let attr = attrs[i],
        value = escapeString(attr.value, true);

      this.html += ' ';

      if (!attr.namespace)
        this.html += attr.name;

      else if (attr.namespace === NS.XML)
        this.html += 'xml:' + attr.name;

      else if (attr.namespace === NS.XMLNS) {
        if (attr.name !== 'xmlns')
          this.html += 'xmlns:';

        this.html += attr.name;
      }

      else if (attr.namespace === NS.XLINK)
        this.html += 'xlink:' + attr.name;

      else
        this.html += attr.namespace + ':' + attr.name;

      this.html += '="' + value + '"';
    }
  }

  _serializeTextNode(node) {
    let content = treeAdapter.getTextNodeContent(node),
      parent = treeAdapter.getParentNode(node),
      parentTn = void 0;

    if (parent && treeAdapter.isElementNode(parent))
      parentTn = treeAdapter.getTagName(parent);

    if (parentTn === $.STYLE || parentTn === $.SCRIPT || parentTn === $.XMP || parentTn === $.IFRAME ||
      parentTn === $.NOEMBED || parentTn === $.NOFRAMES || parentTn === $.PLAINTEXT || parentTn === $.NOSCRIPT)

      this.html += content;

    else
      this.html += escapeString(content, false);
  }

  _serializeCommentNode(node) {
    this.html += '<!--' + treeAdapter.getCommentNodeContent(node) + '-->';
  }

  _serializeDocumentTypeNode(node) {
    let name = treeAdapter.getDocumentTypeNodeName(node);

    this.html += '<' + doctype_serializeContent(name, null, null) + '>';
  }


}

export function serialize(ast) {
  let s = new Serializer(ast);
  return s.serialize();
}
